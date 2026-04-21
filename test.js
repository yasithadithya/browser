const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => {
  const win = new BrowserWindow({width: 800, height: 600, webPreferences: {nodeIntegration: true}});
  win.loadFile('index.html');
  win.webContents.on('did-finish-load', async () => {
    // wait a bit for renderer.js to execute
    setTimeout(async () => {
      const rects = await win.webContents.executeJavaScript(`
        (() => {
          const wv = document.querySelector('webview');
          const nt = document.getElementById('newtab-page');
          const wvs = document.getElementById('webviews');
          return {
            wv: wv ? wv.getBoundingClientRect() : null,
            nt: nt ? nt.getBoundingClientRect() : null,
            wvs: wvs ? wvs.getBoundingClientRect() : null,
            ntActive: nt ? nt.classList.contains('active') : false,
            wvDisplay: wv ? wv.style.display : null
          };
        })()
      `);
      console.log(JSON.stringify(rects, null, 2));
      app.quit();
    }, 2000);
  });
});
