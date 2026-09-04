// Turns a keyboard event into an Electron accelerator string such as
// "Control+Alt+Up". Loaded by the renderer as a plain script and by the tests
// as a module, so it must not touch the DOM or Node globals.
(function attach(root) {
  const KEY_NAMES = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    ' ': 'Space',
    Escape: 'Esc',
    Enter: 'Return',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Tab: 'Tab',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Insert: 'Insert',
    '+': 'Plus',
    AudioVolumeUp: 'VolumeUp',
    AudioVolumeDown: 'VolumeDown',
    AudioVolumeMute: 'VolumeMute',
    MediaPlayPause: 'MediaPlayPause'
  };
  const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph']);

  // Returns null while only modifiers are held or when no modifier is used at
  // all, since a bare key would swallow ordinary typing system-wide.
  function acceleratorFromEvent(event) {
    if (MODIFIER_KEYS.has(event.key)) return null;
    const parts = [];
    if (event.ctrlKey) parts.push('Control');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Super');
    const named = KEY_NAMES[event.key];
    let key = named;
    if (!key) {
      if (/^F([1-9]|1[0-9]|2[0-4])$/.test(event.key)) key = event.key;
      else if (event.key.length === 1) key = event.key.toUpperCase();
      else return null;
    }
    const isMedia = /^(VolumeUp|VolumeDown|VolumeMute|MediaPlayPause)$/.test(key);
    if (parts.length === 0 && !isMedia) return null;
    return [...parts, key].join('+');
  }

  // Human-friendly rendering of an accelerator for display.
  function describeAccelerator(accelerator) {
    return String(accelerator || '')
      .replace(/Control/g, 'Ctrl')
      .replace(/Super/g, 'Win')
      .replace(/\+/g, ' + ');
  }

  const api = { acceleratorFromEvent, describeAccelerator };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PebbleAccelerator = api;
})(typeof window !== 'undefined' ? window : globalThis);
