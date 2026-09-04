const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pebble', {
  getAudioState: () => ipcRenderer.invoke('audio:get-state'),
  setVolume: (volume) => ipcRenderer.invoke('audio:set-volume', volume),
  setMuted: (muted) => ipcRenderer.invoke('audio:set-muted', muted),
  getLaunchAtLogin: () => ipcRenderer.invoke('app:get-launch-at-login'),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke('app:set-launch-at-login', enabled),
  getLightingState: () => ipcRenderer.invoke('lighting:get-state'),
  setLightingEnabled: (enabled) => ipcRenderer.invoke('lighting:set-enabled', enabled),
  setLightingBrightness: (brightness) => ipcRenderer.invoke('lighting:set-brightness', brightness),
  setLightingMode: (mode) => ipcRenderer.invoke('lighting:set-mode', mode),
  setLightingColor: (color) => ipcRenderer.invoke('lighting:set-color', color),
  setLightingColors: (colors) => ipcRenderer.invoke('lighting:set-colors', colors),
  setLightingColors2: (colors) => ipcRenderer.invoke('lighting:set-colors2', colors),
  setLightingSpeed: (speed) => ipcRenderer.invoke('lighting:set-speed', speed),
  setLightingDirection: (direction) => ipcRenderer.invoke('lighting:set-direction', direction),
  setLightingSlot: (index) => ipcRenderer.invoke('lighting:set-active-slot', index),
  setOutputTarget: (target) => ipcRenderer.invoke('device:set-output-target', target),
  getDeviceInfo: () => ipcRenderer.invoke('device:get-info'),
  openLink: (url) => ipcRenderer.invoke('device:open-link', url),
  getMicState: () => ipcRenderer.invoke('mic:get-state'),
  setMicVolume: (volume) => ipcRenderer.invoke('mic:set-volume', volume),
  setMicMuted: (muted) => ipcRenderer.invoke('mic:set-muted', muted),
  setMicDefault: () => ipcRenderer.invoke('mic:set-default'),
  setMicFormat: (key) => ipcRenderer.invoke('mic:set-format', key),
  onLightingPresence: (callback) => {
    ipcRenderer.on('lighting:presence', (_event, connected) => callback(Boolean(connected)));
  },
  onAudioChanged: (callback) => {
    ipcRenderer.on('audio:changed', () => callback());
  }
});
