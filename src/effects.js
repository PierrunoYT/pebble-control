// Creative Acoustic Engine control. The effects run in Creative's audio driver
// on the PC, and Creative App configures them through Windows' per-endpoint
// system-effects user store, so this module does the same through the audio
// bridge. Property keys and context GUIDs come from Creative App's own
// libraries; see docs/DEVELOPMENT.md.

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
    level: { guid: 'dd527e35-21a5-4ca6-ab90-8ad464fb55e3', pid: 0, max: 100 }
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

function keyList() {
  const keys = [{ name: MASTER_KEY.name, guid: MASTER_KEY.guid, pid: MASTER_KEY.pid }];
  Object.entries(EFFECTS).forEach(([id, effect]) => {
    keys.push({ name: `${id}.enable`, guid: effect.enable.guid, pid: effect.enable.pid });
    keys.push({ name: `${id}.level`, guid: effect.level.guid, pid: effect.level.pid });
    if (effect.mode) keys.push({ name: `${id}.mode`, guid: effect.mode.guid, pid: effect.mode.pid });
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
  const { values } = await bridgeCall({ op: 'effects-get', id: device.id, context: contextFor(output), keys: keyList() });
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
  });
  const master = parseValue(values.master);
  return {
    connected: Object.keys(effects).length > 0,
    output,
    endpoint: device.name,
    master: Boolean(master),
    effects
  };
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
  if (changes.enabled !== undefined) {
    const enabled = Boolean(changes.enabled);
    await write(device, context, effect.enable, 'bool', enabled ? 1 : 0);
    if (enabled) await write(device, context, MASTER_KEY, 'bool', 1);
  }
  return getState(output);
}

module.exports = { getState, setEffect, setMaster, EFFECTS, CONTEXTS, MASTER_KEY, parseValue, toPercent, contextFor, keyList };
