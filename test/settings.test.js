const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const settings = require('../src/settings');

function scratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pebble-settings-'));
  settings.init(dir);
  return dir;
}

test('returns defaults when no file exists', () => {
  scratch();
  const loaded = settings.load();
  assert.equal(loaded.startInTray, false);
  assert.equal(loaded.shortcuts.mute, 'Control+Alt+M');
});

test('persists known keys and reloads them', () => {
  const dir = scratch();
  settings.save({ startInTray: true, shortcuts: { mute: 'Control+Shift+M' } });
  settings.init(dir);
  const loaded = settings.load();
  assert.equal(loaded.startInTray, true);
  assert.equal(loaded.shortcuts.mute, 'Control+Shift+M');
  assert.equal(loaded.shortcuts.volumeUp, 'Control+Alt+Up');
});

test('ignores unknown keys and bad types', () => {
  const dir = scratch();
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ startInTray: 'yes', shortcuts: { mute: 42, evil: 'x' }, other: true }));
  settings.init(dir);
  const loaded = settings.load();
  assert.equal(loaded.startInTray, true);
  assert.equal(loaded.shortcuts.mute, 'Control+Alt+M');
  assert.equal('evil' in loaded.shortcuts, false);
  assert.equal('other' in loaded, false);
});

test('survives a corrupt file', () => {
  const dir = scratch();
  fs.writeFileSync(path.join(dir, 'settings.json'), '{not json');
  settings.init(dir);
  assert.equal(settings.load().startInTray, false);
});
