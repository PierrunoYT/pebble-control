const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const loudness = require('loudness');
const lighting = require('./lighting');

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

ipcMain.handle('lighting:get-state', () => lighting.getState());
ipcMain.handle('lighting:set-enabled', (_event, enabled) => lighting.setEnabled(enabled));
ipcMain.handle('lighting:set-brightness', (_event, brightness) => lighting.setBrightness(brightness));
ipcMain.handle('lighting:set-mode', (_event, mode) => lighting.setMode(mode));
ipcMain.handle('lighting:set-color', (_event, color) => lighting.setColor(color));
ipcMain.handle('lighting:set-colors', (_event, colors) => lighting.setColors(colors));
ipcMain.handle('lighting:set-colors2', (_event, colors) => lighting.setColors2(colors));
ipcMain.handle('lighting:set-speed', (_event, speed) => lighting.setSpeed(speed));
ipcMain.handle('lighting:set-direction', (_event, direction) => lighting.setDirection(direction));
ipcMain.handle('device:set-output-target', (_event, target) => lighting.setOutputTarget(target));

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
