// Creative Acoustic Engine control. The effects run in Creative's audio driver
// on the PC, and Creative App configures them through Windows' per-endpoint
// system-effects user store, so this module does the same through the audio
// bridge. Property keys and context GUIDs come from Creative App's own
// libraries; see docs/DEVELOPMENT.md.

const fs = require('node:fs');
const path = require('node:path');
const { bridgeCall } = require('./capture');

// One context per output path. Creative App shows them as its Speakers and
// Headphones tabs; the driver applies whichever matches the active output.
const CONTEXTS = Object.freeze({
  speakers: '852311bc-1afb-454e-92ca-c35252cacaaf',
  headphones: '3f5f306b-a033-4f19-843d-1c44a736ff4d'
});

const MASTER_KEY = Object.freeze({ name: 'master', guid: '3c14eccc-4a1f-47f7-91dd-bf45af920a4d', pid: 0, type: 'bool' });

// Levels are floats. Bass strength runs 0 to 100; the others run 0 to 1.
const EFFECTS = Object.freeze({
  surround: {
    label: 'Surround',
    description: 'Creates a wider sound stage by placing virtual speakers around you.',
    enable: { guid: '5b4777a4-8ad4-4d34-893a-df34da0e56ca', pid: 0 },
    level: { guid: 'a5a78ea4-c156-4db7-85aa-81cff1c3f192', pid: 0, max: 1 }
  },
  crystalizer: {
    label: 'Crystalizer',
    description: 'Restores detail that compression takes out of music and film audio.',
    enable: { guid: '3cd83c04-868f-4f08-8d75-b4625ffe3b31', pid: 0 },
    level: { guid: '0f03f0bb-72c7-4ec1-8422-7b8d7410694a', pid: 0, max: 1 }
  },
  bass: {
    label: 'Bass',
    description: 'Fills in low frequencies for a fuller sound from small speakers.',
    enable: { guid: 'f67cf426-f8cb-4a40-bdac-580802e3e193', pid: 0 },
    level: { guid: 'dd527e35-21a5-4ca6-ab90-8ad464fb55e3', pid: 0, max: 100 },
    // Crossover frequency in Hz; the key has one slot per output path.
    crossover: { guid: '3f23dbc5-12d1-4d62-89ed-bc458337e0fc', pids: { speakers: 0, headphones: 2 }, min: 40, max: 200, step: 10 }
  },
  smartVolume: {
    label: 'Smart Volume',
    description: 'Evens out sudden loudness changes by adjusting playback automatically.',
    enable: { guid: '9ad782d7-f46e-465c-8df5-3cda75424987', pid: 0 },
    level: { guid: '80b0c7bb-0989-434e-af5b-fb9020f471b3', pid: 0, max: 1 },
    mode: { guid: 'e6ec3743-ddd2-4817-8466-b433761dcf9d', pid: 0, values: { normal: 0, loud: 1, night: 2 } }
  },
  dialogPlus: {
    label: 'Dialog+',
    description: 'Lifts voices in music and film so speech stays clear.',
    enable: { guid: 'ea3137f9-be10-4eaa-8fce-a36988bca7dd', pid: 0 },
    level: { guid: 'a79717e9-81cf-4272-adc6-d12b69b389a0', pid: 0, max: 1 }
  }
});

function crossoverKey(effect, output) {
  return { guid: effect.crossover.guid, pid: effect.crossover.pids[output === 'headphones' ? 'headphones' : 'speakers'] };
}

function keyList(output = 'speakers') {
  const keys = [{ name: MASTER_KEY.name, guid: MASTER_KEY.guid, pid: MASTER_KEY.pid }];
  Object.entries(EFFECTS).forEach(([id, effect]) => {
    keys.push({ name: `${id}.enable`, guid: effect.enable.guid, pid: effect.enable.pid });
    keys.push({ name: `${id}.level`, guid: effect.level.guid, pid: effect.level.pid });
    if (effect.mode) keys.push({ name: `${id}.mode`, guid: effect.mode.guid, pid: effect.mode.pid });
    if (effect.crossover) keys.push({ name: `${id}.crossover`, ...crossoverKey(effect, output) });
  });
  return keys;
}

function parseValue(raw) {
  if (typeof raw !== 'string' || raw === 'empty') return null;
  const [type, text] = raw.split(':');
  if (type === 'bool') return text === 'true';
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function contextFor(output) {
  return output === 'headphones' ? CONTEXTS.headphones : CONTEXTS.speakers;
}

function isPebbleRender(device) {
  return /pebble/i.test(device.name) || /pebble/i.test(device.interface);
}

async function pebbleRenderDevice() {
  const { devices } = await bridgeCall({ op: 'list-render' });
  return devices.find(isPebbleRender) || null;
}

// Converts a stored level to the 0 to 100 percentage the UI shows.
function toPercent(value, max) {
  if (value === null) return null;
  return Math.round(Math.min(Math.max(value / max, 0), 1) * 100);
}

async function getState(output = 'speakers') {
  const device = await pebbleRenderDevice();
  if (!device) return { connected: false };
  const { values } = await bridgeCall({ op: 'effects-get', id: device.id, context: contextFor(output), keys: keyList(output) });
  const effects = {};
  Object.entries(EFFECTS).forEach(([id, effect]) => {
    const enabled = parseValue(values[`${id}.enable`]);
    const level = parseValue(values[`${id}.level`]);
    if (enabled === null && level === null) return;
    effects[id] = {
      label: effect.label,
      description: effect.description,
      enabled: Boolean(enabled),
      level: toPercent(level, effect.level.max)
    };
    if (effect.mode) {
      const mode = parseValue(values[`${id}.mode`]);
      const name = Object.entries(effect.mode.values).find(([, number]) => number === mode);
      effects[id].mode = name ? name[0] : 'normal';
      effects[id].modes = Object.keys(effect.mode.values);
    }
    if (effect.crossover) {
      const crossover = parseValue(values[`${id}.crossover`]);
      effects[id].crossover = crossover === null ? null : Math.round(crossover);
      effects[id].crossoverRange = { min: effect.crossover.min, max: effect.crossover.max, step: effect.crossover.step };
    }
  });
  const master = parseValue(values.master);
  const state = {
    connected: Object.keys(effects).length > 0,
    output,
    endpoint: device.name,
    master: Boolean(master),
    effects
  };
  if (state.connected) {
    const modes = loadSoundModes(output);
    state.soundModes = modes.map(({ id, name }) => ({ id, name }));
    state.soundMode = matchSoundMode(state, await readEqValues(device, output), modes, loadPresets(output));
  }
  return state;
}

async function write(device, context, key, type, value) {
  await bridgeCall({ op: 'effects-set', id: device.id, context, guid: key.guid, pid: key.pid, type, value });
}

async function setMaster(enabled, output = 'speakers') {
  const device = await pebbleRenderDevice();
  if (!device) throw new Error('The Pebble speaker output is not present');
  await write(device, contextFor(output), MASTER_KEY, 'bool', enabled ? 1 : 0);
  return getState(output);
}

// Applies any of enabled, level (0 to 100), and mode for one effect. Enabling
// an effect also turns the Acoustic Engine master on, as Creative App does.
async function setEffect(id, changes, output = 'speakers') {
  const effect = EFFECTS[id];
  if (!effect) throw new TypeError('Unknown effect');
  const device = await pebbleRenderDevice();
  if (!device) throw new Error('The Pebble speaker output is not present');
  const context = contextFor(output);

  if (changes.level !== undefined) {
    const percent = Number(changes.level);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new RangeError('Level must be 0 to 100');
    await write(device, context, effect.level, 'float', (percent / 100) * effect.level.max);
  }
  if (changes.mode !== undefined) {
    if (!effect.mode || !Object.hasOwn(effect.mode.values, changes.mode)) throw new TypeError('Unsupported mode');
    await write(device, context, effect.mode, 'float', effect.mode.values[changes.mode]);
  }
  if (changes.crossover !== undefined) {
    if (!effect.crossover) throw new TypeError('This effect has no crossover');
    const hz = Number(changes.crossover);
    if (!Number.isFinite(hz) || hz < effect.crossover.min || hz > effect.crossover.max) {
      throw new RangeError(`Crossover must be ${effect.crossover.min} to ${effect.crossover.max} Hz`);
    }
    await write(device, context, crossoverKey(effect, output), 'float', Math.round(hz));
  }
  if (changes.enabled !== undefined) {
    const enabled = Boolean(changes.enabled);
    await write(device, context, effect.enable, 'bool', enabled ? 1 : 0);
    if (enabled) await write(device, context, MASTER_KEY, 'bool', 1);
  }
  return getState(output);
}

// Graphic equalizer: ten bands in dB plus a preamp, in the same store.
const EQ_BANDS = Object.freeze([31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]);
const EQ_KEYS = Object.freeze({
  enable: { guid: '9a9d0cb2-4dc9-494c-8210-9848ae1aa629', pid: 0 },
  preamp: { guid: 'ddcf8d90-de27-4de4-af57-088b8ad78fdf', pid: 0 },
  gainGuid: '2b88c76d-d07c-4e97-8922-1bac9f6d5935'
});
const EQ_GAIN_RANGE = Object.freeze({ min: -12, max: 12, step: 0.5 });

// Creative App keeps its factory presets as JSON next to its product data.
// They are read when present so every preset the user knows is available;
// otherwise a few generic curves are offered.
const CREATIVE_EQ_PRESET_DIR = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Creative', 'CreativeApp', 'Product', 'MF0495', 'Presets', 'EQ');
const BUILT_IN_PRESETS = Object.freeze([
  { id: 'flat', name: 'Flat', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'bass-boost', name: 'Bass Boost', gains: [3, 5, 3, -1, -1, 0, 0, 0, 0, 0] },
  { id: 'treble-boost', name: 'Treble Boost', gains: [0, 0, 0, 0, 0, 0, 1, 2, 3, 4] },
  { id: 'vocal', name: 'Vocal', gains: [-2, -1, 0, 1, 3, 3, 2, 1, 0, -1] }
]);

let presetCache = null;

function readCreativePreset(file, output) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    const wanted = output === 'headphones' ? 'Headphone' : 'Speaker';
    const settings = (data.Settings || []).find((entry) => entry.Type === wanted) || data.Settings?.[0];
    if (!settings || !Array.isArray(settings.Bands) || settings.Bands.length !== EQ_BANDS.length) return null;
    return {
      id: `creative:${path.basename(file, '.json')}`,
      creativeId: data.Id || null,
      name: data.DisplayName || data.Name || path.basename(file, '.json'),
      order: Number(data.Order) || 0,
      preamp: Number(settings.PreAmp) || 0,
      gains: settings.Bands.map((band) => Number(band.Value) || 0)
    };
  } catch (error) {
    return null;
  }
}

function loadPresets(output) {
  if (presetCache && presetCache.output === output) return presetCache.presets;
  let presets = [];
  try {
    presets = fs.readdirSync(CREATIVE_EQ_PRESET_DIR)
      .filter((file) => file.endsWith('.json'))
      .map((file) => readCreativePreset(path.join(CREATIVE_EQ_PRESET_DIR, file), output))
      .filter(Boolean)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  } catch (error) {
    presets = [];
  }
  if (presets.length === 0) presets = BUILT_IN_PRESETS.map((preset) => ({ ...preset, preamp: 0 }));
  presetCache = { output, presets };
  return presets;
}

function eqKeyList() {
  const keys = [
    { name: 'enable', guid: EQ_KEYS.enable.guid, pid: EQ_KEYS.enable.pid },
    { name: 'preamp', guid: EQ_KEYS.preamp.guid, pid: EQ_KEYS.preamp.pid }
  ];
  EQ_BANDS.forEach((_, index) => keys.push({ name: `gain${index}`, guid: EQ_KEYS.gainGuid, pid: index }));
  return keys;
}

// Several Creative presets share a curve (Gaming is flat for speakers), so a
// preset named Flat wins ties and otherwise the first match in list order.
function matchPreset(gains, presets) {
  const matches = presets.filter((preset) => preset.gains.every((gain, index) => Math.abs(gain - gains[index]) < 0.01));
  if (matches.length === 0) return 'custom';
  const flat = matches.find((preset) => /^flat$/i.test(preset.name));
  return (flat || matches[0]).id;
}

async function readEqValues(device, output) {
  const { values } = await bridgeCall({ op: 'effects-get', id: device.id, context: contextFor(output), keys: eqKeyList() });
  return values;
}

async function getEqState(output = 'speakers') {
  const device = await pebbleRenderDevice();
  if (!device) return { connected: false };
  const values = await readEqValues(device, output);
  const gains = EQ_BANDS.map((_, index) => parseValue(values[`gain${index}`]));
  if (gains.every((gain) => gain === null)) return { connected: false };
  const presets = loadPresets(output);
  const resolved = gains.map((gain) => gain ?? 0);
  return {
    connected: true,
    output,
    enabled: Boolean(parseValue(values.enable)),
    preamp: parseValue(values.preamp) ?? 0,
    bands: EQ_BANDS,
    gains: resolved,
    range: EQ_GAIN_RANGE,
    preset: matchPreset(resolved, presets),
    presets: presets.map(({ id, name }) => ({ id, name }))
  };
}

function clampGain(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new RangeError('Gain must be a number');
  return Math.min(EQ_GAIN_RANGE.max, Math.max(EQ_GAIN_RANGE.min, Math.round(number / EQ_GAIN_RANGE.step) * EQ_GAIN_RANGE.step));
}

// Applies any of enabled, preamp, gains (ten dB values), or preset (an id
// from the preset list). Enabling also turns the Acoustic Engine master on.
async function setEq(changes, output = 'speakers') {
  const device = await pebbleRenderDevice();
  if (!device) throw new Error('The Pebble speaker output is not present');
  const context = contextFor(output);
  let gains = changes.gains;
  let preamp = changes.preamp;

  if (changes.preset !== undefined) {
    const preset = loadPresets(output).find((candidate) => candidate.id === changes.preset);
    if (!preset) throw new TypeError('Unknown equalizer preset');
    gains = preset.gains;
    preamp = preset.preamp;
  }
  if (gains !== undefined) {
    if (!Array.isArray(gains) || gains.length !== EQ_BANDS.length) throw new RangeError(`Gains must have ${EQ_BANDS.length} values`);
    const clamped = gains.map(clampGain);
    for (let index = 0; index < clamped.length; index += 1) {
      await write(device, context, { guid: EQ_KEYS.gainGuid, pid: index }, 'float', clamped[index]);
    }
  }
  if (preamp !== undefined) await write(device, context, EQ_KEYS.preamp, 'float', clampGain(preamp));
  if (changes.enabled !== undefined) {
    const enabled = Boolean(changes.enabled);
    await write(device, context, EQ_KEYS.enable, 'bool', enabled ? 1 : 0);
    if (enabled) await write(device, context, MASTER_KEY, 'bool', 1);
  }
  return getEqState(output);
}

// Sound modes: Creative App's bundles of effect and equalizer settings, one
// file per mode with Speaker and Headphone sections, next to the EQ presets.
const CREATIVE_SOUND_MODE_DIR = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Creative', 'CreativeApp', 'Product', 'MF0495', 'SoundMode');

let soundModeCache = null;

function readSoundMode(file, output) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    const wanted = output === 'headphones' ? 'Headphone' : 'Speaker';
    const s = (data.Settings || []).find((entry) => entry.Type === wanted) || data.Settings?.[0];
    if (!s) return null;
    const block = (name) => s[name] || {};
    return {
      id: `creative:${path.basename(file, '.json')}`,
      name: data.DisplayName || data.ShortName || data.Name || path.basename(file, '.json'),
      order: Number(data.Order) || 0,
      effects: {
        surround: { enabled: Boolean(block('Surround').Enable), level: toPercent(Number(block('Surround').Level) || 0, 1) },
        crystalizer: { enabled: Boolean(block('Crystalizer').Enable), level: toPercent(Number(block('Crystalizer').Level) || 0, 1) },
        bass: { enabled: Boolean(block('Bass').Enable), level: toPercent(Number(block('Bass').Level) || 0, 100), crossover: Number(block('Bass').XOver) || null },
        smartVolume: {
          enabled: Boolean(block('SVM').Enable),
          level: toPercent(Number(block('SVM').Level) || 0, 1),
          mode: ['normal', 'loud', 'night'][Number(block('SVM').Mode)] || 'normal'
        },
        dialogPlus: { enabled: Boolean(block('DialogPlus').Enable), level: toPercent(Number(block('DialogPlus').Level) || 0, 1) }
      },
      eq: { enabled: Boolean(block('GraphicEQ').Enable), presetId: block('GraphicEQ').PresetId || null }
    };
  } catch (error) {
    return null;
  }
}

function loadSoundModes(output) {
  if (soundModeCache && soundModeCache.output === output) return soundModeCache.modes;
  let modes = [];
  try {
    modes = fs.readdirSync(CREATIVE_SOUND_MODE_DIR)
      .filter((file) => file.endsWith('.json'))
      .map((file) => readSoundMode(path.join(CREATIVE_SOUND_MODE_DIR, file), output))
      .filter(Boolean)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  } catch (error) {
    modes = [];
  }
  soundModeCache = { output, modes };
  return modes;
}

function eqPresetForMode(mode, presets) {
  return presets.find((preset) => preset.creativeId && preset.creativeId === mode.eq.presetId) || null;
}

// Reports which sound mode the live settings equal, or "custom".
function matchSoundMode(effectsState, eqValues, modes, presets) {
  const eqEnabled = Boolean(parseValue(eqValues.enable));
  const gains = EQ_BANDS.map((_, index) => parseValue(eqValues[`gain${index}`]) ?? 0);
  const sameEffect = (live, wanted) => live && live.enabled === wanted.enabled
    && (!wanted.enabled || live.level === wanted.level)
    && (wanted.mode === undefined || !wanted.enabled || live.mode === wanted.mode);
  const match = modes.find((mode) => {
    if (!Object.entries(mode.effects).every(([id, wanted]) => sameEffect(effectsState.effects[id], wanted))) return false;
    if (eqEnabled !== mode.eq.enabled) return false;
    if (!eqEnabled) return true;
    const preset = eqPresetForMode(mode, presets);
    return Boolean(preset) && preset.gains.every((gain, index) => Math.abs(gain - gains[index]) < 0.01);
  });
  return match ? match.id : 'custom';
}

// Applies a Creative sound mode: every effect, the equalizer, and the master.
async function applySoundMode(id, output = 'speakers') {
  const mode = loadSoundModes(output).find((candidate) => candidate.id === id);
  if (!mode) throw new TypeError('Unknown sound mode');
  const device = await pebbleRenderDevice();
  if (!device) throw new Error('The Pebble speaker output is not present');
  const context = contextFor(output);
  for (const [effectId, wanted] of Object.entries(mode.effects)) {
    const effect = EFFECTS[effectId];
    await write(device, context, effect.level, 'float', (wanted.level / 100) * effect.level.max);
    if (effect.mode && wanted.mode) await write(device, context, effect.mode, 'float', effect.mode.values[wanted.mode]);
    if (effect.crossover && wanted.crossover) await write(device, context, crossoverKey(effect, output), 'float', wanted.crossover);
    await write(device, context, effect.enable, 'bool', wanted.enabled ? 1 : 0);
  }
  const preset = eqPresetForMode(mode, loadPresets(output));
  if (preset) {
    for (let index = 0; index < preset.gains.length; index += 1) {
      await write(device, context, { guid: EQ_KEYS.gainGuid, pid: index }, 'float', clampGain(preset.gains[index]));
    }
    await write(device, context, EQ_KEYS.preamp, 'float', clampGain(preset.preamp));
  }
  await write(device, context, EQ_KEYS.enable, 'bool', mode.eq.enabled ? 1 : 0);
  await write(device, context, MASTER_KEY, 'bool', 1);
  return { effects: await getState(output), eq: await getEqState(output) };
}

module.exports = {
  getState,
  setEffect,
  setMaster,
  getEqState,
  setEq,
  applySoundMode,
  loadSoundModes,
  readSoundMode,
  matchSoundMode,
  EFFECTS,
  CONTEXTS,
  MASTER_KEY,
  EQ_BANDS,
  EQ_KEYS,
  EQ_GAIN_RANGE,
  BUILT_IN_PRESETS,
  parseValue,
  toPercent,
  contextFor,
  keyList,
  eqKeyList,
  matchPreset,
  clampGain,
  readCreativePreset
};
