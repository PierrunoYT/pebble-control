const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const effects = require('../src/effects');

test('reads a Creative microphone profile and names it from its id', () => {
  const file = path.join(os.tmpdir(), `pebble-mic-${process.pid}.json`);
  fs.writeFileSync(file, `﻿${JSON.stringify({
    Id: 'VoiceClarity', Order: 122,
    Settings: [{ Type: 'Common', PreAmp: 0, Bands: effects.EQ_BANDS.map((Frequency, i) => ({ Frequency, Value: i })) }]
  })}`);
  try {
    const profile = effects.readMicProfile(file);
    assert.equal(profile.id, 'mic:VoiceClarity');
    assert.equal(profile.name, 'Voice Clarity');
    assert.deepEqual(profile.gains, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  } finally {
    fs.unlinkSync(file);
  }
});

test('custom sound modes persist in the data folder and list before Creative modes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pebble-modes-'));
  effects.init(dir);
  assert.deepEqual(effects.loadCustomSoundModes(), []);
  fs.writeFileSync(path.join(dir, 'custom-sound-modes.json'), JSON.stringify([
    { id: 'custom:1', name: 'Podcast', output: 'speakers', effects: { dialogPlus: { enabled: true, level: 60 } }, eq: { enabled: false, preamp: 0, gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } },
    { id: 'custom:2', name: 'Late', output: 'headphones', effects: {}, eq: { enabled: false } },
    { broken: true }
  ]));
  effects.init(dir);
  const modes = effects.loadSoundModes('speakers');
  assert.equal(modes[0].id, 'custom:1');
  assert.equal(modes[0].custom, true);
  assert.ok(modes.every((mode, index) => index === 0 || !mode.custom || mode.output === 'speakers'));
  assert.ok(!modes.some((mode) => mode.id === 'custom:2'));
});

test('matches custom modes by their inline gains', () => {
  const mode = { id: 'custom:x', effects: { surround: { enabled: false, level: 1 } }, eq: { enabled: true, gains: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] } };
  const live = { effects: { surround: { enabled: false, level: 50 } } };
  const eqValues = { enable: 'bool:true' };
  mode.eq.gains.forEach((gain, index) => { eqValues[`gain${index}`] = `float:${gain}`; });
  assert.equal(effects.matchSoundMode(live, eqValues, [mode], []), 'custom:x');
});
