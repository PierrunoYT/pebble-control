// Persistent app settings, stored as JSON in Electron's per-user data folder.
// Only known keys are accepted so a corrupt or hand-edited file cannot inject
// anything unexpected into the main process.

const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = Object.freeze({
  startInTray: false,
  shortcuts: Object.freeze({
    volumeUp: 'Control+Alt+Up',
    volumeDown: 'Control+Alt+Down',
    mute: 'Control+Alt+M'
  })
});

let filePath = null;
let cache = null;

function init(directory) {
  filePath = path.join(directory, 'settings.json');
  cache = null;
}

function load() {
  if (cache) return cache;
  let stored = {};
  try {
    stored = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    stored = {};
  }
  cache = {
    startInTray: Boolean(stored.startInTray),
    shortcuts: { ...DEFAULTS.shortcuts, ...pickStrings(stored.shortcuts, Object.keys(DEFAULTS.shortcuts)) }
  };
  return cache;
}

function pickStrings(source, keys) {
  const result = {};
  if (!source || typeof source !== 'object') return result;
  keys.forEach((key) => {
    if (typeof source[key] === 'string' && source[key].length > 0 && source[key].length < 64) result[key] = source[key];
  });
  return result;
}

function save(changes) {
  const current = load();
  const next = {
    startInTray: changes.startInTray === undefined ? current.startInTray : Boolean(changes.startInTray),
    shortcuts: { ...current.shortcuts, ...pickStrings(changes.shortcuts, Object.keys(DEFAULTS.shortcuts)) }
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2));
  cache = next;
  return next;
}

module.exports = { init, load, save, DEFAULTS };
