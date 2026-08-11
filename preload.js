const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('stickyAPI', {
  load:       () => ipcRenderer.invoke('notes:load'),
  save:       (data) => ipcRenderer.invoke('notes:save', data),
  exportFile: (data) => ipcRenderer.invoke('notes:export', data),
  importFile: () => ipcRenderer.invoke('notes:import'),
  // Context-menu "Download": save a single note as a markdown file via the
  // OS save dialog. payload = { filename, content }.
  exportMarkdown: (payload) => ipcRenderer.invoke('notes:export-markdown', payload),
  // Store a pasted picture (raw bytes + mime type) under userData/images/.
  // Resolves { ok, ref } where ref is the sticky-image:// URL that note
  // markdown embeds as ![](ref) and mdToHtml renders as an <img>.
  saveImage: (bytes, mime) => ipcRenderer.invoke('images:save', bytes, mime),
  // Save the clipboard's image without touching the renderer's File object,
  // which is unreadable in the flatpak sandbox. Preferred paste path.
  saveClipboardImage: () => ipcRenderer.invoke('images:save-clipboard'),
  // Store an image FILE by path: main reads it and returns { ok, ref }.
  // Preferred route for a file dropped on a note — under flatpak the path
  // is the document-portal one the drop was rewritten to, which main may
  // read even though the app has no filesystem permission of its own.
  saveImageFile: (filePath) => ipcRenderer.invoke('images:save-file', filePath),
  // Absolute path behind a dropped File. Electron 32 removed File.path;
  // webUtils.getPathForFile replaces it and must be called here, in the
  // preload — '' when the drop carries no real path, which tells the
  // renderer to fall back to reading the File's bytes itself.
  pathForFile: (file) => {
    try { return webUtils.getPathForFile(file) || ''; } catch { return ''; }
  },
  // Context-menu "Insert image…": main opens the image picker (the
  // file-chooser portal under flatpak), reads and stores the chosen file,
  // and resolves { ok, ref } / { ok:false, canceled:true }.
  pickImage: () => ipcRenderer.invoke('images:pick'),
  // Pin the menu bar open, or return it to Alt-summoned (#42).
  setMenuBarVisible: (show) => ipcRenderer.invoke('window:menu-bar', !!show),

  // Version of the running Electron build, captured at preload time so the
  // renderer can synchronously compare to the latest GitHub release tag.
  appVersion: ipcRenderer.sendSync('app:version-sync'),
  // True only on a genuine first install (no notes.json yet). Lets the
  // renderer skip the what's-new note for new users while still showing it
  // to anyone upgrading from a version that never recorded one.
  isFirstRun: ipcRenderer.sendSync('app:first-run-sync'),
  // Whether the running app is the snap build. snapd sets SNAP_NAME inside
  // the sandbox; nothing else does. Used to: skip the daily update check
  // (snap auto-refresh handles it), and surface a snap-friendly upgrade
  // hint when the user explicitly checks for updates.
  isSnap: !!process.env.SNAP_NAME,
  // Whether the running app is the flatpak build. flatpak-portal/bwrap sets
  // FLATPAK_ID to the app-id inside the sandbox. Used to: skip the daily
  // update check (flatpak handles updates via the software center), and
  // surface a flatpak-friendly upgrade hint on explicit force-check.
  isFlatpak: !!process.env.FLATPAK_ID,
  // Open https URLs in the user's default browser. Used by the update banner.
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  onMenuCheckUpdates: (cb) => {
    const wrapped = () => cb();
    ipcRenderer.on('menu:checkUpdates', wrapped);
    return () => ipcRenderer.removeListener('menu:checkUpdates', wrapped);
  },
  onMenuAbout: (cb) => {
    const wrapped = () => cb();
    ipcRenderer.on('menu:about', wrapped);
    return () => ipcRenderer.removeListener('menu:about', wrapped);
  },
  onMenuExport: (cb) => {
    const wrapped = (_event, ...args) => cb(...args);
    ipcRenderer.on('menu:export', wrapped);
    return () => ipcRenderer.removeListener('menu:export', wrapped);
  },
  onMenuImport: (cb) => {
    const wrapped = (_event, ...args) => cb(...args);
    ipcRenderer.on('menu:import', wrapped);
    return () => ipcRenderer.removeListener('menu:import', wrapped);
  },
  onMenuPreferences: (cb) => {
    const wrapped = (_event, ...args) => cb(...args);
    ipcRenderer.on('menu:preferences', wrapped);
    return () => ipcRenderer.removeListener('menu:preferences', wrapped);
  },
  onMenuImportHelp: (cb) => {
    const wrapped = () => cb();
    ipcRenderer.on('menu:importHelp', wrapped);
    return () => ipcRenderer.removeListener('menu:importHelp', wrapped);
  },
});
