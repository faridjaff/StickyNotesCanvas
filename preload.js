const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stickyAPI', {
  load:       () => ipcRenderer.invoke('notes:load'),
  save:       (data) => ipcRenderer.invoke('notes:save', data),
  exportFile: (data) => ipcRenderer.invoke('notes:export', data),
  importFile: () => ipcRenderer.invoke('notes:import'),

  // Version of the running Electron build, captured at preload time so the
  // renderer can synchronously compare to the latest GitHub release tag.
  appVersion: ipcRenderer.sendSync('app:version-sync'),
  // Whether the running app is the snap build. snapd sets SNAP_NAME inside
  // the sandbox; nothing else does. Used to: skip the daily update check
  // (snap auto-refresh handles it), and surface a snap-friendly upgrade
  // hint when the user explicitly checks for updates.
  isSnap: !!process.env.SNAP_NAME,
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
});
