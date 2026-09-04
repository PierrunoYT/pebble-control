const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EQ_BANDS, EQ_KEYS, eqKeyList, matchPreset, clampGain, readCreativePreset, BUILT_IN_PRESETS } = require('../src/effects');

test('requests enable, preamp, and one gain key per band', () => {
  const keys = eqKeyList();
  assert.equal(keys.length, 2 + EQ_BANDS.length);
  assert.equal(keys[0].guid, EQ_KEYS.enable.guid);
  assert.deepEqual(keys.slice(2).map((k) => k.pid), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.ok(keys.slice(2).every((k) => k.guid === EQ_KEYS.gainGuid));
});

test('clamps and snaps gains to the half-decibel grid', () => {
  assert.equal(clampGain(3.26), 3.5);
  assert.equal(clampGain(-20), -12);
  assert.equal(clampGain(20), 12);
  assert.throws(() => clampGain('loud'), RangeError);
});

test('matches stored gains to a preset or reports custom', () => {
  const presets = BUILT_IN_PRESETS;
  assert.equal(matchPreset([3, 5, 3, -1, -1, 0, 0, 0, 0, 0], presets), 'bass-boost');
  assert.equal(matchPreset([0, 0, 0, 0, 0, 0, 0, 0, 0, 0], presets), 'flat');
  assert.equal(matchPreset([1, 0, 0, 0, 0, 0, 0, 0, 0, 0], presets), 'custom');
});

test('reads a Creative preset file for the requested output', () => {
  const file = path.join(os.tmpdir(), `pebble-eq-${process.pid}.json`);
  const bands = (values) => values.map((Value, i) => ({ Frequency: EQ_BANDS[i], Value }));
  fs.writeFileSync(file, `﻿${JSON.stringify({
    DisplayName: 'Gaming', Order: 50,
    Settings: [
      { Type: 'Speaker', PreAmp: 0, Bands: bands([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) },
      { Type: 'Headphone', PreAmp: -1, Bands: bands([3, 4, -1, -2, 0, 2, 2, -5, 2, 0]) }
    ]
  })}`);
  try {
    const speakers = readCreativePreset(file, 'speakers');
    const headphones = readCreativePreset(file, 'headphones');
    assert.equal(speakers.name, 'Gaming');
    assert.deepEqual(speakers.gains, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert.deepEqual(headphones.gains, [3, 4, -1, -2, 0, 2, 2, -5, 2, 0]);
    assert.equal(headphones.preamp, -1);
    assert.equal(speakers.id, headphones.id);
  } finally {
    fs.unlinkSync(file);
  }
  assert.equal(readCreativePreset(path.join(os.tmpdir(), 'missing.json'), 'speakers'), null);
});
