const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close:    () => ipcRenderer.send('window-close'),

  // Data
  getBlockedCount:      () => ipcRenderer.invoke('get-blocked-count'),
  getWebviewPreloadPath: () => ipcRenderer.invoke('get-webview-preload-path'),
  openDownload:         (filePath) => ipcRenderer.invoke('open-download', filePath),
  showDownloadInFolder: (filePath) => ipcRenderer.invoke('show-download-in-folder', filePath),
  onDownloadEvent:      (listener) => {
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on('download-event', wrapped);
    return () => ipcRenderer.removeListener('download-event', wrapped);
  },
});
