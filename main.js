const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { setupAdBlock, getBlockedCount } = require('./adblock');

// Spoof a real Chrome UA — Electron's default UA gets blocked by YouTube/Google
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
app.userAgentFallback = CHROME_UA;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 500,
    frame: false,
    backgroundColor: '#0d0d14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
    },
  });

  // Set the Chrome UA for all session requests (webviews included)
  // Using setUserAgent() is the correct API — avoids onBeforeSendHeaders
  // callback-not-called bugs that cause ERR_FAILED.
  session.defaultSession.setUserAgent(CHROME_UA);

  // Setup ad & redirect blocking on the default session
  setupAdBlock(session.defaultSession);

  // Block popup windows spawned from webview pages at session level
  session.defaultSession.on('will-create-window', (e) => {
    e.preventDefault();
  });

  mainWindow.loadFile('index.html');
}

// ─── Window control IPC ───────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());

// ─── Data IPC ─────────────────────────────────────────────────────────────────
ipcMain.handle('get-blocked-count', () => getBlockedCount());
ipcMain.handle('get-webview-preload-path', () =>
  // pathToFileURL correctly encodes spaces (%20) and adds the third slash
  // needed for Windows absolute paths: file:///d:/path%20with%20spaces/...
  pathToFileURL(path.join(__dirname, 'webview-preload.js')).href
);

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});