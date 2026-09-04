const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readSoundMode, matchSoundMode, keyList } = require('../src/effects');

function writeMode(file) {
  fs.writeFileSync(file, JSON.stringify({
    DisplayName: 'Movies', Order: 70,
    Settings: [
      { Type: 'Headphone', Surround: { Enable: true, Level: 0.67 }, Crystalizer: { Enable: true, Level: 0.65 }, Bass: { Enable: false, Level: 50, XOver: 80 }, SVM: { Enable: true, Level: 0.4, Mode: 0 }, DialogPlus: { Enable: false, Level: 0.5 }, GraphicEQ: { Enable: true, PresetId: 'eq-4' } },
      { Type: 'Speaker', Surround: { Enable: true, Level: 0.67 }, Crystalizer: { Enable: true, Level: 0.5 }, Bass: { Enable: false, Level: 50, XOver: 80 }, SVM: { Enable: false, Level: 0.74, Mode: 2 }, DialogPlus: { Enable: false, Level: 0.5 }, GraphicEQ: { Enable: false, PresetId: 'eq-4' } }
    ]
  }));
}

test('reads the speaker or headphone section of a sound mode', () => {
  const file = path.join(os.tmpdir(), `pebble-mode-${process.pid}.json`);
  writeMode(file);
  try {
    const speakers = readSoundMode(file, 'speakers');
    const headphones = readSoundMode(file, 'headphones');
    assert.equal(speakers.name, 'Movies');
    assert.deepEqual(speakers.effects.crystalizer, { enabled: true, level: 50 });
    assert.equal(headphones.effects.crystalizer.level, 65);
    assert.equal(speakers.effects.smartVolume.mode, 'night');
    assert.equal(speakers.effects.bass.crossover, 80);
    assert.deepEqual(speakers.eq, { enabled: false, presetId: 'eq-4' });
    assert.equal(headphones.eq.enabled, true);
  } finally {
    fs.unlinkSync(file);
  }
});

test('matches live settings to a sound mode, including its equalizer preset', () => {
  const mode = {
    id: 'creative:Movies',
    effects: {
      surround: { enabled: true, level: 67 },
      crystalizer: { enabled: false, level: 50 },
      bass: { enabled: false, level: 50, crossover: 80 },
      smartVolume: { enabled: false, level: 74, mode: 'normal' },
      dialogPlus: { enabled: false, level: 50 }
    },
    eq: { enabled: true, presetId: 'eq-4' }
  };
  const live = {
    effects: {
      surround: { enabled: true, level: 67 },
      crystalizer: { enabled: false, level: 10 },
      bass: { enabled: false, level: 50 },
      smartVolume: { enabled: false, level: 74, mode: 'loud' },
      dialogPlus: { enabled: false, level: 50 }
    }
  };
  const presets = [{ id: 'creative:Movies', creativeId: 'eq-4', gains: [4, 3, -2, -2, 2, 2, 1, 0, 1, 2] }];
  const eqValues = { enable: 'bool:true' };
  presets[0].gains.forEach((gain, index) => { eqValues[`gain${index}`] = `float:${gain}`; });
  assert.equal(matchSoundMode(live, eqValues, [mode], presets), 'creative:Movies');
  assert.equal(matchSoundMode(live, { ...eqValues, gain0: 'float:0' }, [mode], presets), 'custom');
  assert.equal(matchSoundMode({ effects: { ...live.effects, surround: { enabled: false, level: 67 } } }, eqValues, [mode], presets), 'custom');
});

test('reads the crossover slot that matches the output', () => {
  const speakers = keyList('speakers').find((k) => k.name === 'bass.crossover');
  const headphones = keyList('headphones').find((k) => k.name === 'bass.crossover');
  assert.equal(speakers.pid, 0);
  assert.equal(headphones.pid, 2);
  assert.equal(speakers.guid, headphones.guid);
});
