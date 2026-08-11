const { app, BrowserWindow, clipboard, ipcMain, Menu, dialog, net, protocol, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const {
  load: loadNotes, save: saveNotes,
  saveImage, saveImageFromFile, sweepOrphanImages, IMAGE_FILE_RE,
} = require('./storage.js');

// E2E test hook: when STICKY_USER_DATA is set, store all app data (notes.json,
// window.json, the Chromium profile) under that directory instead of the real
// user profile. Must run before app ready — everything below resolves paths
// through app.getPath('userData'). Tests point this at a throwaway tmp dir so
// they can seed known notes and never touch real user data.
if (process.env.STICKY_USER_DATA) {
  app.setPath('userData', process.env.STICKY_USER_DATA);
}

// Synchronous IPC for the preload script to fetch the running app's version
// at load time, so the renderer can compare it to whatever the GitHub
// Releases API reports as the latest tag.
ipcMain.on('app:version-sync', (e) => { e.returnValue = app.getVersion(); });

// Open external URLs (e.g. the release download link) in the user's default
// browser instead of inside the Electron BrowserWindow.
ipcMain.handle('shell:open-external', async (_e, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return { ok: false };
  try { await shell.openExternal(url); return { ok: true }; }
  catch (err) { return { ok: false, error: err.message }; }
});

const userDataDir = () => app.getPath('userData');
const notesPath   = () => path.join(userDataDir(), 'notes.json');

// Is this a genuine first install? The renderer uses it to tell a fresh
// install (stay quiet) apart from an upgrade by someone whose previous
// version never recorded a version number — everyone coming from 1.8.0 or
// earlier is in that state, since the recording only began in 2.0.0.
// Answered when the preload asks (after the legacy-userData migration, and
// before the renderer can save anything), then cached so later windows agree.
let firstRunFlag = null;
ipcMain.on('app:first-run-sync', (e) => {
  if (firstRunFlag === null) firstRunFlag = !fs.existsSync(notesPath());
  e.returnValue = firstRunFlag;
});
const windowPath  = () => path.join(userDataDir(), 'window.json');
const imagesDir   = () => path.join(userDataDir(), 'images');

// One-time migration: until v1.2.3 the package was named "sticky-notes" and
// userData lived at ~/.config/sticky-notes/. v1.3.0 renamed the package to
// "sticky-notes-canvas" (so the snap name could match what's available on
// the Snap Store) which moved userData to ~/.config/sticky-notes-canvas/.
// On first launch of the new build, if there's no notes.json in the new
// path but the old one exists, copy notes.json + window.json over so
// existing deb users don't lose their data on upgrade. Snap installs are
// sandboxed and won't see the old path either way (no migration needed).
function migrateLegacyUserData() {
  try {
    const newDir = userDataDir();
    const newNotes = path.join(newDir, 'notes.json');
    if (fs.existsSync(newNotes)) return;  // new path already populated, nothing to do
    const legacyDir = path.join(path.dirname(newDir), 'sticky-notes');
    const legacyNotes = path.join(legacyDir, 'notes.json');
    if (!fs.existsSync(legacyNotes)) return;  // no legacy data either, fresh install
    fs.mkdirSync(newDir, { recursive: true });
    fs.copyFileSync(legacyNotes, newNotes);
    const legacyWin = path.join(legacyDir, 'window.json');
    if (fs.existsSync(legacyWin)) {
      fs.copyFileSync(legacyWin, path.join(newDir, 'window.json'));
    }
    console.log(`[main] migrated userData from ${legacyDir} → ${newDir}`);
  } catch (err) {
    console.warn('[main] userData migration failed:', err.message);
  }
}

let mainWindow = null;
let pendingSave = null;
let isQuitting  = false;

function loadBounds() {
  try {
    if (fs.existsSync(windowPath())) {
      return JSON.parse(fs.readFileSync(windowPath(), 'utf8'));
    }
  } catch {}
  return { width: 1920, height: 1080 };
}

function saveBounds(b) {
  try {
    fs.mkdirSync(path.dirname(windowPath()), { recursive: true });
    fs.writeFileSync(windowPath(), JSON.stringify(b));
  } catch (err) {
    console.warn('[main] failed to save window bounds:', err.message);
  }
}

// Linux/Windows draw the application menu as a bar inside the window; macOS
// puts it in the system menu bar, where it belongs and where hiding it isn't
// possible (or wanted). Everything the app itself offers is reachable from
// the page — top chrome, status bar, note context menus, Preferences — so
// that in-window bar is dead chrome (#42).
const HIDE_MENU_BAR = process.platform !== 'darwin';

function createWindow() {
  const bounds = loadBounds();
  mainWindow = new BrowserWindow({
    width:  bounds.width  ?? 1920,
    height: bounds.height ?? 1080,
    x: bounds.x,
    y: bounds.y,
    minWidth:  800,
    minHeight: 600,
    backgroundColor: '#14181d',
    title: 'Sticky Notes',
    icon: path.join(__dirname, 'build', 'icon.png'),
    // Hidden, not removed: Alt still summons it for the one-off items that
    // live nowhere else (Reload, Toggle DevTools, Full screen).
    autoHideMenuBar: HIDE_MENU_BAR,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // autoHideMenuBar alone leaves the bar showing on some window managers
  // until the first Alt; this starts it hidden everywhere.
  if (HIDE_MENU_BAR) mainWindow.setMenuBarVisibility(false);

  // The user can pin the bar open from Preferences; the renderer tells us
  // whenever that preference loads or changes. macOS has no in-window bar.
  ipcMain.removeHandler('window:menu-bar');
  ipcMain.handle('window:menu-bar', (_e, show) => {
    if (!HIDE_MENU_BAR || !mainWindow) return { ok: false };
    mainWindow.setAutoHideMenuBar(!show);
    mainWindow.setMenuBarVisibility(!!show);
    return { ok: true };
  });

  mainWindow.loadFile('index.html');

  // Note bodies can contain web links; the renderer opens them via the
  // shell:open-external IPC. These guards make the window itself inert:
  // no click, middle-click, or URL drag-drop may navigate it or spawn a
  // child window — http(s) attempts are routed to the default browser.
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', () => {
    if (mainWindow) saveBounds(mainWindow.getBounds());
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// The application menu stays registered even though its bar is hidden in the
// window (see HIDE_MENU_BAR). Setting it is what gives the app its keyboard
// layer: the Ctrl/Cmd+, accelerator, and — the part that is easy to miss —
// the Edit roles, which are how Electron wires Ctrl+C/V/X/A and undo/redo to
// the focused text field. Menu.setApplicationMenu(null) would take the bar
// away and those shortcuts with it.
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const prefsItem = {
    label: 'Preferences…',
    accelerator: 'CmdOrCtrl+,',
    click: () => mainWindow?.webContents.send('menu:preferences'),
  };
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        prefsItem,
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        ...(isMac ? [] : [prefsItem, { type: 'separator' }]),
        {
          label: 'Import notes from image using your AI…',
          click: () => mainWindow?.webContents.send('menu:importHelp'),
        },
        { type: 'separator' },
        {
          label: 'Save backup…',
          click: () => mainWindow?.webContents.send('menu:export'),
        },
        {
          label: 'Restore backup…',
          click: () => mainWindow?.webContents.send('menu:import'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut'  }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
    ]},
    { label: 'View', submenu: [
      { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ]},
    { role: 'help', submenu: [
      // "Check for Updates…" is hidden under snap/flatpak — those channels
      // get updates via their store (snapd, flatpak software center) and
      // shouldn't surface a redundant in-app update button.
      ...(process.env.SNAP_NAME || process.env.FLATPAK_ID ? [] : [
        {
          label: 'Check for Updates…',
          click: () => mainWindow?.webContents.send('menu:checkUpdates'),
        },
        { type: 'separator' },
      ]),
      {
        label: 'About',
        click: () => mainWindow?.webContents.send('menu:about'),
      },
    ]},
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('notes:load', async () => {
  return loadNotes(notesPath());
});

ipcMain.handle('notes:save', async (_e, data) => {
  pendingSave = { data };
  try {
    saveNotes(notesPath(), data);
    pendingSave = null;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// A picture pasted into a note body: the renderer sends the raw bytes +
// mime type, storage.js writes them content-hashed under userData/images/,
// and the resolved sticky-image:// reference goes back into the markdown.
ipcMain.handle('images:save', async (_e, bytes, mime) => {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
    return { ok: false, error: 'invalid image data' };
  }
  try {
    const name = saveImage(imagesDir(), Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), mime);
    return { ok: true, ref: `sticky-image://${name}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Save whatever image is on the system clipboard right now. The renderer's
// own paste path reads the clipboard File, whose backing temp file is
// unreadable inside the flatpak sandbox ("NotFoundError" on arrayBuffer), so
// the renderer asks for this instead and only falls back to its File when
// the clipboard holds no image. Read here, in the main process, straight
// from the OS clipboard — no temp file involved. Everything is re-encoded to
// PNG, which is what nativeImage gives us (an animated GIF loses animation).
ipcMain.handle('images:save-clipboard', async () => {
  try {
    const img = clipboard.readImage();
    if (!img || img.isEmpty()) return { ok: false, error: 'no image on the clipboard' };
    const name = saveImage(imagesDir(), img.toPNG(), 'image/png');
    return { ok: true, ref: `sticky-image://${name}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// The one place a picture that lives on disk gets stored, shared by the two
// file routes below. Reading happens here, in main, because that is where
// the flatpak portals' file access lands: a path handed over by a drag-and-
// drop has been rewritten by the document portal to /run/user/<uid>/doc/…,
// and a file picked through the file-chooser portal is granted to this
// process — the app itself has no filesystem permission at all.
function storeImageFile(filePath) {
  if (typeof filePath !== 'string' || !filePath) return { ok: false, error: 'no file path' };
  try {
    return { ok: true, ref: `sticky-image://${saveImageFromFile(imagesDir(), filePath)}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// An image file dropped onto a note. The renderer resolves the File to a
// path with webUtils.getPathForFile (Electron 32 removed File.path) and
// sends it here; if the drop carries no usable path it falls back to
// reading the File's own bytes and the images:save handler above.
ipcMain.handle('images:save-file', async (_e, filePath) => storeImageFile(filePath));

// Context-menu "Insert image…": one round trip — main opens the picker
// (the file-chooser portal under flatpak), reads the chosen picture, stores
// it, and returns the reference the note body embeds.
ipcMain.handle('images:pick', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Insert image',
    buttonLabel: 'Insert',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths || !filePaths.length) return { ok: false, canceled: true };
  return storeImageFile(filePaths[0]);
});

ipcMain.handle('notes:export', async (_e, data) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save backup',
    defaultPath: 'notes-backup.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Context-menu "Download": save one note's content as a markdown file. The
// renderer supplies both the suggested filename (derived from the note's
// title / first line, already sanitized) and the full file content.
ipcMain.handle('notes:export-markdown', async (_e, payload) => {
  const { filename, content } = payload || {};
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Download note',
    defaultPath: typeof filename === 'string' && filename ? filename : 'note.md',
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  try {
    fs.writeFileSync(filePath, typeof content === 'string' ? content : '', 'utf8');
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('notes:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Restore backup',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths?.length) return { ok: false, canceled: true };
  try {
    const raw = fs.readFileSync(filePaths[0], 'utf8');
    return { ok: true, data: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

app.whenReady().then(() => {
  // Run any one-time migrations before anything reads notes.json.
  migrateLegacyUserData();

  // Serve pasted note images over the app-private sticky-image:// scheme.
  // mdToHtml only emits <img> tags for this exact reference shape, and this
  // handler only serves hash-named files out of userData/images/ — no path
  // traversal, no arbitrary file reads reachable from note content.
  protocol.handle('sticky-image', (request) => {
    let name = '';
    try { name = new URL(request.url).hostname; } catch {}
    const file = path.join(imagesDir(), name);
    if (!IMAGE_FILE_RE.test(name) || !fs.existsSync(file)) {
      return new Response('not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(file).toString());
  });

  // Deleting a note (or undoing an image paste) leaves its image files
  // behind; sweep them now, before any renderer exists — the only moment
  // an image can't be mid-paste.
  try {
    const removed = sweepOrphanImages(imagesDir(), notesPath());
    if (removed.length) console.log(`[main] removed ${removed.length} orphan image(s)`);
  } catch (err) {
    console.warn('[main] orphan image sweep failed:', err.message);
  }

  // On macOS in dev mode (`npm start`), Electron shows its default icon in the
  // dock because there's no .app bundle with an Info.plist. Packaged .dmg builds
  // get the correct icon automatically from electron-builder. This closes the
  // gap during development.
  if (process.platform === 'darwin' && app.dock) {
    try { app.dock.setIcon(path.join(__dirname, 'build', 'icon.png')); } catch {}
  }
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (isQuitting) return;
  isQuitting = true;
  if (pendingSave) {
    try {
      saveNotes(notesPath(), pendingSave.data);
    } catch (err) {
      console.warn('[main] final save failed:', err.message);
    }
  }
});
