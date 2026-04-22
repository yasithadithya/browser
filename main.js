const { app, BrowserWindow, session, ipcMain, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { setupAdBlock, getBlockedCount } = require('./adblock');

// Spoof a real Chrome UA — Electron's default UA gets blocked by YouTube/Google
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
app.userAgentFallback = CHROME_UA;

let mainWindow;

/**
 * Send an IPC message from the main process to the renderer window.
 *
 * If a main window exists and is not destroyed, forwards `payload` on `channel` to its webContents; otherwise does nothing.
 * @param {string} channel - The IPC channel name to send the message on.
 * @param {*} payload - The value to send to the renderer.
 */
function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

/**
 * Registers a download handler on the given Electron session and forwards download lifecycle events to the renderer via the `download-event` channel.
 *
 * It emits an initial payload when a download starts and subsequent updates for progress and completion. Payload fields include `id`, `fileName`, `filePath`, `url`, `totalBytes`, `receivedBytes`, and `state`. When an update reports `state === 'progressing'` but the item is paused, `state` is normalized to `'paused'`.
 *
 * @param {Electron.Session} targetSession - The Electron session to attach the `will-download` listener to.
 */
function setupDownloads(targetSession) {
  targetSession.on('will-download', (event, item) => {
    const filePath = item.getSavePath();
    const basePayload = {
      id: item.getStartTime().toString(),
      fileName: item.getFilename(),
      filePath,
      url: item.getURL(),
      totalBytes: item.getTotalBytes(),
      receivedBytes: 0,
      state: 'started',
    };

    sendToRenderer('download-event', basePayload);

    item.on('updated', (_evt, state) => {
      sendToRenderer('download-event', {
        ...basePayload,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        state: state === 'progressing' && item.isPaused() ? 'paused' : state,
      });
    });

    item.once('done', (_evt, state) => {
      sendToRenderer('download-event', {
        ...basePayload,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        state,
      });
    });
  });
}

/**
 * Creates the main application window, configures the default session, and loads the UI.
 *
 * Creates a frameless BrowserWindow with a dark background, fixed minimum size, and web
 * preferences that enable an isolated preload script and webviews. Sets the Chrome user
 * agent on the default session, enables ad/redirect blocking and download handling for
 * that session, prevents popups created by webview pages, and loads index.html into the window.
 */
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
  setupDownloads(session.defaultSession);

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
ipcMain.handle('open-download', async (_event, filePath) => {
  if (!filePath) return false;
  const result = await shell.openPath(filePath);
  return result === '';
});
ipcMain.handle('show-download-in-folder', (_event, filePath) => {
  if (!filePath) return false;
  return shell.showItemInFolder(filePath);
});

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
