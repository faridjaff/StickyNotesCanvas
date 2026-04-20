const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { load: loadNotes, save: saveNotes } = require('./storage.js');

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
const windowPath  = () => path.join(userDataDir(), 'window.json');

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
          label: 'Export Notes…',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => mainWindow?.webContents.send('menu:export'),
        },
        {
          label: 'Import Notes…',
          accelerator: 'CmdOrCtrl+O',
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

ipcMain.handle('notes:export', async (_e, data) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Sticky Notes',
    defaultPath: 'sticky-notes-export.json',
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

ipcMain.handle('notes:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Sticky Notes',
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
