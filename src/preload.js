const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pebble', {
  getAudioState: () => ipcRenderer.invoke('audio:get-state'),
  setVolume: (volume) => ipcRenderer.invoke('audio:set-volume', volume),
  setMuted: (muted) => ipcRenderer.invoke('audio:set-muted', muted),
  getLaunchAtLogin: () => ipcRenderer.invoke('app:get-launch-at-login'),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke('app:set-launch-at-login', enabled)
});
