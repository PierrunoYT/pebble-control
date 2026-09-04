const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const loudness = require('loudness');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 760,
    minHeight: 620,
    backgroundColor: '#11120f',
    title: 'Pebble Control',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

ipcMain.handle('audio:get-state', async () => ({
  volume: await loudness.getVolume(),
  muted: await loudness.getMuted()
}));

ipcMain.handle('audio:set-volume', async (_event, requestedVolume) => {
  const volume = Math.min(100, Math.max(0, Math.round(Number(requestedVolume))));
  if (!Number.isFinite(volume)) throw new TypeError('Volume must be a number');
  await loudness.setVolume(volume);
  return volume;
});

ipcMain.handle('audio:set-muted', async (_event, muted) => {
  await loudness.setMuted(Boolean(muted));
  return Boolean(muted);
});

ipcMain.handle('app:get-launch-at-login', () => app.getLoginItemSettings().openAtLogin);

ipcMain.handle('app:set-launch-at-login', (_event, enabled) => {
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled) });
  return app.getLoginItemSettings().openAtLogin;
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
