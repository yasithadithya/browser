const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close:    () => ipcRenderer.send('window-close'),

  // Data
  getBlockedCount:      () => ipcRenderer.invoke('get-blocked-count'),
  getWebviewPreloadPath: () => ipcRenderer.invoke('get-webview-preload-path'),
});
