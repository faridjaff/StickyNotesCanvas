const { app, BrowserWindow, ipcMain, Menu, dialog, net, protocol, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const {
  load: loadNotes, save: saveNotes,
  saveImage, sweepOrphanImages, IMAGE_FILE_RE,
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
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
