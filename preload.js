const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: p => ipcRenderer.invoke('set-settings', p),
  settingsOpen: o => ipcRenderer.send('settings-open', o),
  resize: h => ipcRenderer.send('resize', h),
  mediaControl: (action, position) => ipcRenderer.invoke('media-control', action, position),
  userActive: () => ipcRenderer.send('user-active'),
  hide: () => ipcRenderer.send('hide'),
  openSettings: () => ipcRenderer.send('open-settings-window'),
  onTrack: cb => ipcRenderer.on('track', (_, t) => cb(t)),
  onSettings: cb => ipcRenderer.on('settings', (_, s) => cb(s)),
  onOpenSettings: cb => ipcRenderer.on('open-settings', () => cb())
});
