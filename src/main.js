const path = require('node:path');
const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, globalShortcut, shell } = require('electron');
const loudness = require('loudness');
const lighting = require('./lighting');
const capture = require('./capture');
const deviceInfo = require('./device-info');
const effects = require('./effects');
const settings = require('./settings');

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

function createWindow({ hidden = false } = {}) {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 760,
    minHeight: 620,
    show: !hidden,
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

ipcMain.handle('app:get-settings', () => settings.load());
ipcMain.handle('app:set-settings', (_event, changes) => settings.save(changes || {}));

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

ipcMain.handle('device:get-info', () => deviceInfo.getInfo());
ipcMain.handle('device:open-link', (_event, url) => {
  // Only the fixed Creative support links may be opened from the renderer.
  if (!deviceInfo.isAllowedLink(url)) throw new TypeError('Link not allowed');
  return shell.openExternal(url);
});

ipcMain.handle('effects:get-state', (_event, output) => effects.getState(output));
ipcMain.handle('effects:set', (_event, id, changes, output) => effects.setEffect(id, changes || {}, output));
ipcMain.handle('effects:set-master', (_event, enabled, output) => effects.setMaster(Boolean(enabled), output));
ipcMain.handle('effects:apply-sound-mode', (_event, id, output) => effects.applySoundMode(id, output));
ipcMain.handle('eq:get-state', (_event, output) => effects.getEqState(output));
ipcMain.handle('eq:set', (_event, changes, output) => effects.setEq(changes || {}, output));

ipcMain.handle('mic:get-state', () => capture.getState());
ipcMain.handle('mic:set-volume', (_event, volume) => capture.setVolume(volume));
ipcMain.handle('mic:set-muted', (_event, muted) => capture.setMuted(muted));
ipcMain.handle('mic:set-default', () => capture.setDefault());
ipcMain.handle('mic:set-format', (_event, key) => capture.setFormat(key));

function broadcast(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => window.webContents.send(channel, payload));
}

// Global shortcuts work while the window is hidden in the tray. Each one
// changes Windows audio and then tells the renderer to refresh its display.
// The key combinations come from settings; these are the actions.
const SHORTCUT_ACTIONS = Object.freeze({
  volumeUp: {
    label: 'Volume up',
    run: async () => {
      const volume = Math.min(100, (await loudness.getVolume()) + 5);
      await loudness.setVolume(volume);
      if (await loudness.getMuted()) await loudness.setMuted(false);
    }
  },
  volumeDown: {
    label: 'Volume down',
    run: async () => {
      await loudness.setVolume(Math.max(0, (await loudness.getVolume()) - 5));
    }
  },
  mute: {
    label: 'Toggle mute',
    run: async () => {
      await loudness.setMuted(!(await loudness.getMuted()));
    }
  }
});

let shortcutStatus = {};

// Registers every shortcut from settings, releasing any previous set first, and
// records which ones Windows granted. A combination held by another app fails
// registration without affecting the rest.
function registerShortcuts() {
  globalShortcut.unregisterAll();
  const { shortcuts } = settings.load();
  shortcutStatus = {};
  Object.entries(SHORTCUT_ACTIONS).forEach(([id, action]) => {
    const accelerator = shortcuts[id];
    let registered = false;
    try {
      registered = globalShortcut.register(accelerator, () => {
        action.run().then(() => broadcast('audio:changed')).catch(() => {});
      });
    } catch (error) {
      registered = false;
    }
    if (!registered) console.warn(`Shortcut ${accelerator} for ${id} could not be registered`);
    shortcutStatus[id] = { label: action.label, accelerator, registered };
  });
  return shortcutStatus;
}

ipcMain.handle('app:get-shortcuts', () => shortcutStatus);
ipcMain.handle('app:set-shortcuts', (_event, changes) => {
  const wanted = {};
  Object.keys(SHORTCUT_ACTIONS).forEach((id) => {
    const value = changes && changes[id];
    if (typeof value === 'string' && /^[A-Za-z0-9+]{1,60}$/.test(value)) wanted[id] = value;
  });
  settings.save({ shortcuts: wanted });
  return registerShortcuts();
});
ipcMain.handle('app:reset-shortcuts', () => {
  settings.save({ shortcuts: { ...settings.DEFAULTS.shortcuts } });
  return registerShortcuts();
});

// Tells every window when the speaker is plugged in or removed so the lighting
// panel can refresh at once instead of waiting for its next poll.
function watchSpeakerPresence() {
  lighting.watchPresence((connected) => broadcast('lighting:presence', connected));
}

app.whenReady().then(() => {
  settings.init(app.getPath('userData'));
  // With "Start in tray" on, the window is created but stays hidden until the
  // tray icon is clicked; the tray must exist first so the app stays reachable.
  createTray();
  createWindow({ hidden: settings.load().startInTray });
  registerShortcuts();
  watchSpeakerPresence();
  app.on('activate', showWindow);
});

app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  capture.stop();
});

app.on('window-all-closed', () => {
  // Windows are hidden rather than closed while the tray is present, so this
  // only fires on the way out.
  if (process.platform !== 'darwin' && quitting) app.quit();
});
