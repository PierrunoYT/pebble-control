const path = require('node:path');
const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } = require('electron');
const loudness = require('loudness');
const lighting = require('./lighting');

let mainWindow;
let tray;
let quitting = false;

function showWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// The tray menu reflects live state, so it is rebuilt each time it opens.
async function buildTrayMenu() {
  const [muted, lightingState] = await Promise.all([
    loudness.getMuted().catch(() => null),
    lighting.getState().catch(() => ({ connected: false }))
  ]);
  const template = [
    { label: 'Show Pebble Control', click: showWindow },
    { type: 'separator' },
    {
      label: muted ? 'Unmute' : 'Mute',
      enabled: muted !== null,
      click: () => loudness.setMuted(!muted).catch(() => {})
    },
    {
      label: lightingState.enabled ? 'Lighting off' : 'Lighting on',
      enabled: Boolean(lightingState.connected),
      click: () => lighting.setEnabled(!lightingState.enabled).catch(() => {})
    },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } }
  ];
  return Menu.buildFromTemplate(template);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('Pebble Control');
  tray.on('click', showWindow);
  tray.on('right-click', async () => {
    tray.popUpContextMenu(await buildTrayMenu());
  });
}

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

  // Closing the window keeps the app in the tray; Quit in the tray menu exits.
  mainWindow.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
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
ipcMain.handle('lighting:set-active-slot', (_event, index) => lighting.setActiveSlot(index));
ipcMain.handle('device:set-output-target', (_event, target) => lighting.setOutputTarget(target));

// Tells every window when the speaker is plugged in or removed so the lighting
// panel can refresh at once instead of waiting for its next poll.
function watchSpeakerPresence() {
  lighting.watchPresence((connected) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send('lighting:presence', connected);
    });
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  watchSpeakerPresence();
  app.on('activate', showWindow);
});

app.on('before-quit', () => { quitting = true; });

app.on('window-all-closed', () => {
  // Windows are hidden rather than closed while the tray is present, so this
  // only fires on the way out.
  if (process.platform !== 'darwin' && quitting) app.quit();
});
