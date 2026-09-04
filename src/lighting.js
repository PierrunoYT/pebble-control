const HID = require('node-hid');

const DEVICE = Object.freeze({
  vendorId: 0x041e,
  productId: 0x329a,
  usagePage: 0xff01,
  usage: 1,
  reportId: 0x03
});

const COMMAND = Object.freeze({ acknowledge: 0x02, outputTarget: 0x2c, ledControl: 0x3a });

// SpeakerOutputTargetSelectionControl masks. The Pebble X Plus reports 2 and 4.
const OUTPUT_TARGETS = Object.freeze({ 2: 'Speakers', 4: 'Headphones' });
const OUTPUT_OPERATION = Object.freeze({ set: 0x00, get: 0x01, getSupported: 0x02 });
const OPERATION = Object.freeze({
  getInfo: 0x20,
  getSupportedModes: 0x21,
  getSupportedCustomization: 0x22,
  setEnabled: 0x25,
  getEnabled: 0x26,
  setBrightness: 0x27,
  getBrightness: 0x28,
  setMode: 0x29,
  getMode: 0x2a,
  setCustomization: 0x2b,
  getCustomization: 0x2c,
  setActiveIndex: 0x2d,
  getActiveIndex: 0x2e
});

// Customization types from Creative's LEDControlV2 feature. The speaker only
// accepts customization reads and writes for the active slot.
const CUSTOMIZATION = Object.freeze({ color: 1, color2: 2, speed: 3, direction: 4 });

const MODES = Object.freeze({
  0x01: 'Cycle',
  0x03: 'Static',
  0x04: 'Wave',
  0x07: 'Morph',
  0x08: 'Aurora',
  0x09: 'Glowing',
  0x0a: 'Peak Meter',
  0x0b: 'Chasers'
});

// Effect speed in milliseconds. The firmware only accepts these seven values.
const SPEED_PRESETS = Object.freeze([6000, 4000, 2500, 1333, 750, 375, 250]);

const RESPONSE_TIMEOUT_MS = 1500;

function findDevice() {
  return HID.devices(DEVICE.vendorId, DEVICE.productId).find((candidate) => (
    candidate.usagePage === DEVICE.usagePage
    && candidate.usage === DEVICE.usage
  ));
}

function encode(payload, command = COMMAND.ledControl) {
  return [
    DEVICE.reportId,
    0x6a,
    command,
    payload.length & 0xff,
    payload.length >> 8,
    ...payload
  ];
}

function parse(report) {
  if (report.length < 5 || report[0] !== DEVICE.reportId || report[1] !== 0x6a) return null;
  const length = report[3] | (report[4] << 8);
  if (report.length < 5 + length) return null;
  return { command: report[2], payload: report.slice(5, 5 + length) };
}

function waitFor(device, predicate) {
  const deadline = Date.now() + RESPONSE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const report = device.readTimeout(Math.min(150, deadline - Date.now()));
    if (!report.length) continue;
    const response = parse(report);
    if (response && predicate(response)) return response.payload;
  }
  throw new Error('The speaker did not respond');
}

function isRejection(response, operation, command) {
  return response.command === COMMAND.acknowledge
    && response.payload[0] === command
    && response.payload[2] === operation
    && response.payload[1] !== 0;
}

function query(device, payload, command = COMMAND.ledControl) {
  device.write(encode(payload, command));
  const operation = payload[0];
  // LED replies echo the slot and, for customization reads, the type byte.
  // Matching on both keeps pushed reports from being taken as the reply.
  const echoed = command === COMMAND.ledControl ? payload.slice(1, 3) : [];
  const response = waitFor(device, (candidate) => (
    isRejection(candidate, operation, command) || (
      candidate.command === command
      && candidate.payload[0] === operation
      && echoed.every((value, offset) => candidate.payload[offset + 1] === value)
    )
  ));
  if (response[0] === command && response[2] === operation && response.length === 3) {
    throw new Error(`The speaker rejected the query (0x${response[1].toString(16)})`);
  }
  return response;
}

function update(device, payload, command = COMMAND.ledControl) {
  device.write(encode(payload, command));
  const operation = payload[0];
  const acknowledgement = waitFor(device, (response) => (
    response.command === COMMAND.acknowledge
    && response.payload[0] === command
    && response.payload[2] === operation
  ));
  if (acknowledgement[1] !== 0) {
    throw new Error(`The speaker rejected the command (0x${acknowledgement[1].toString(16)})`);
  }
}

function maskFromPayload(payload, offset) {
  return (payload[offset] | (payload[offset + 1] << 8) | (payload[offset + 2] << 16) | (payload[offset + 3] << 24)) >>> 0;
}

// Reads the current output target mask and the masks the speaker supports.
function readOutputTargets(device) {
  try {
    const current = query(device, [OUTPUT_OPERATION.get], COMMAND.outputTarget);
    const supported = query(device, [OUTPUT_OPERATION.getSupported], COMMAND.outputTarget);
    const count = supported[1] & 0x7f;
    const outputTargets = [];
    for (let i = 0; i < count && 2 + i * 4 + 4 <= supported.length; i += 1) {
      const mask = maskFromPayload(supported, 2 + i * 4);
      if (Object.hasOwn(OUTPUT_TARGETS, mask)) outputTargets.push(mask);
    }
    return { outputTarget: maskFromPayload(current, 1), outputTargets };
  } catch (error) {
    return { outputTarget: null, outputTargets: [] };
  }
}

// Color lists are 4-byte little-endian ARGB words: [alpha, blue, green, red].
function colorsFromPayload(payload) {
  const colors = [];
  for (let offset = 4; offset + 4 <= payload.length; offset += 4) {
    const [, blue, green, red] = payload.slice(offset, offset + 4);
    colors.push(`#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('')}`);
  }
  return colors;
}

// Reads a colour list (type 1, or type 2 for Morph's second colour). Effects
// without that list reject the query, which yields an empty array.
function readColors(device, activeIndex, type = CUSTOMIZATION.color) {
  try {
    return colorsFromPayload(query(device, [OPERATION.getCustomization, activeIndex, type]));
  } catch (error) {
    return [];
  }
}

// Reads which direction axes and bouncing an effect accepts, or null when the
// effect has no direction. The capability record is a bitmask: bit 0 left and
// right, bit 1 up and down, bit 2 bouncing.
function readDirectionSupport(device, mode) {
  try {
    const payload = query(device, [OPERATION.getSupportedCustomization, mode]);
    let offset = 3;
    for (let i = 0; i < payload[2] && offset + 2 <= payload.length; i += 1) {
      const [type, length] = payload.slice(offset, offset + 2);
      if (type === CUSTOMIZATION.direction && length >= 1) {
        const mask = payload[offset + 2];
        return { leftRight: (mask & 1) !== 0, upDown: (mask & 2) !== 0, bouncing: (mask & 4) !== 0 };
      }
      offset += 2 + length;
    }
  } catch (error) {
    // Fall through: the effect reports no customizations.
  }
  return null;
}

// Parses one 0x22 reply into the customization types the mode accepts.
function parseCapabilities(payload) {
  const capabilities = { colors: false, colors2: false, speed: false, direction: null };
  let offset = 3;
  for (let i = 0; i < payload[2] && offset + 2 <= payload.length; i += 1) {
    const [type, length] = payload.slice(offset, offset + 2);
    if (type === CUSTOMIZATION.color) capabilities.colors = true;
    if (type === CUSTOMIZATION.color2) capabilities.colors2 = true;
    if (type === CUSTOMIZATION.speed) capabilities.speed = true;
    if (type === CUSTOMIZATION.direction && length >= 1) {
      const mask = payload[offset + 2];
      capabilities.direction = { leftRight: (mask & 1) !== 0, upDown: (mask & 2) !== 0, bouncing: (mask & 4) !== 0 };
    }
    offset += 2 + length;
  }
  return capabilities;
}

// Capability records never change for a given firmware, so they are read once
// per connection and reused by every state poll.
let capabilityCache = null;

function readCapabilities(device, supportedModes) {
  if (capabilityCache) return capabilityCache;
  const capabilities = {};
  supportedModes.forEach((mode) => {
    try {
      capabilities[mode] = parseCapabilities(query(device, [OPERATION.getSupportedCustomization, mode]));
    } catch (error) {
      capabilities[mode] = { colors: false, colors2: false, speed: false, direction: null };
    }
  });
  capabilityCache = capabilities;
  return capabilities;
}

// Returns { direction, bouncing } for the active effect, or null.
function readDirection(device, activeIndex) {
  try {
    const payload = query(device, [OPERATION.getCustomization, activeIndex, CUSTOMIZATION.direction]);
    return { direction: payload[3], bouncing: payload[4] === 1 };
  } catch (error) {
    return null;
  }
}

// Returns the effect speed in milliseconds, or null when the effect has none.
function readSpeed(device, activeIndex) {
  try {
    const payload = query(device, [OPERATION.getCustomization, activeIndex, CUSTOMIZATION.speed]);
    return payload[3] | (payload[4] << 8);
  } catch (error) {
    return null;
  }
}

function colorToBytes(color) {
  if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) {
    throw new TypeError('Color must use #RRGGBB format');
  }
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return [0xff, blue, green, red];
}

function openDevice() {
  const descriptor = findDevice();
  if (!descriptor) throw new Error('Creative Pebble X Plus lighting interface not found');
  return new HID.HID(descriptor.path);
}

let operationQueue = Promise.resolve();

function withDevice(action) {
  const next = operationQueue.catch(() => {}).then(() => {
    const device = openDevice();
    try {
      return action(device);
    } finally {
      device.close();
    }
  });
  operationQueue = next;
  return next;
}

async function getState() {
  if (!findDevice()) {
    capabilityCache = null;
    return { connected: false, deviceName: 'Creative Pebble X Plus' };
  }

  return withDevice(readState);
}

// The speaker stores five lighting slots. Each holds its own effect and
// customizations; the active one is what the LEDs show. Slot 0 acknowledges
// an activation request but never becomes active, so only 1 to 4 are offered.
const SLOT_COUNT = 5;
const FIRST_SELECTABLE_SLOT = 1;

function readSlots(device) {
  const slots = [];
  for (let index = FIRST_SELECTABLE_SLOT; index < SLOT_COUNT; index += 1) {
    try {
      slots.push({ index, mode: query(device, [OPERATION.getMode, index])[2] });
    } catch (error) {
      break;
    }
  }
  return slots;
}

function readState(device) {
  const supportedModes = query(device, [OPERATION.getSupportedModes]).slice(3)
    .filter((mode) => Object.hasOwn(MODES, mode));
  const enabled = query(device, [OPERATION.getEnabled])[1] === 1;
  const brightness = query(device, [OPERATION.getBrightness])[1];
  const activeIndex = query(device, [OPERATION.getActiveIndex])[1];
  const mode = query(device, [OPERATION.getMode, activeIndex])[2];
  const colors = readColors(device, activeIndex);
  const colors2 = readColors(device, activeIndex, CUSTOMIZATION.color2);
  const speed = readSpeed(device, activeIndex);
  const direction = readDirection(device, activeIndex);
  const directionSupport = direction ? readDirectionSupport(device, mode) : null;
  const capabilities = readCapabilities(device, supportedModes);
  const slots = readSlots(device);
  const output = readOutputTargets(device);

  return {
    ...output,
    outputTargetNames: OUTPUT_TARGETS,
    connected: true,
    deviceName: 'Creative Pebble X Plus',
    enabled,
    brightness,
    activeIndex,
    slots,
    mode,
    color: colors[0] || '#ffffff',
    colors,
    colors2,
    speed,
    speeds: SPEED_PRESETS,
    direction,
    directionSupport,
    supportedModes,
    modes: MODES,
    capabilities
  };
}

// Makes another slot live and returns the full state, since everything the
// panel shows belongs to the active slot.
function setActiveSlot(requestedIndex) {
  const index = Number(requestedIndex);
  if (!Number.isInteger(index) || index < FIRST_SELECTABLE_SLOT || index >= SLOT_COUNT) {
    throw new RangeError(`Slot must be an integer from ${FIRST_SELECTABLE_SLOT} to ${SLOT_COUNT - 1}`);
  }
  return withDevice((device) => {
    update(device, [OPERATION.setActiveIndex, index]);
    if (query(device, [OPERATION.getActiveIndex])[1] !== index) {
      throw new Error('The speaker did not switch to that slot');
    }
    return readState(device);
  });
}

function setEnabled(enabled) {
  if (typeof enabled !== 'boolean') throw new TypeError('Lighting state must be a boolean');
  return withDevice((device) => {
    update(device, [OPERATION.setEnabled, enabled ? 1 : 0]);
    return enabled;
  });
}

function setBrightness(requestedBrightness) {
  const brightness = Math.round(Number(requestedBrightness));
  if (!Number.isFinite(brightness) || brightness < 0 || brightness > 255) {
    throw new RangeError('Brightness must be an integer from 0 to 255');
  }
  return withDevice((device) => {
    update(device, [OPERATION.setBrightness, brightness]);
    return brightness;
  });
}

function setMode(requestedMode) {
  const mode = Number(requestedMode);
  if (!Number.isInteger(mode) || !Object.hasOwn(MODES, mode)) {
    throw new TypeError('Unsupported lighting mode');
  }
  return withDevice((device) => {
    const supportedModes = query(device, [OPERATION.getSupportedModes]).slice(3);
    if (!supportedModes.includes(mode)) throw new TypeError('This speaker does not support that lighting mode');
    const activeIndex = query(device, [OPERATION.getActiveIndex])[1];
    update(device, [OPERATION.setMode, activeIndex, mode]);
    const colors = readColors(device, activeIndex);
    const direction = readDirection(device, activeIndex);
    return {
      mode,
      colors,
      colors2: readColors(device, activeIndex, CUSTOMIZATION.color2),
      color: colors[0] || '#ffffff',
      speed: readSpeed(device, activeIndex),
      direction,
      directionSupport: direction ? readDirectionSupport(device, mode) : null
    };
  });
}

// Sets the active effect's direction. Directions are 1 left to right,
// 2 right to left, 3 top to bottom, 4 bottom to top. With bouncing on the
// firmware ignores the direction byte and reports the effect's default.
function setDirection(requested) {
  const direction = Number(requested?.direction);
  const bouncing = Boolean(requested?.bouncing);
  if (![1, 2, 3, 4].includes(direction)) throw new TypeError('Direction must be 1 to 4');
  return withDevice((device) => {
    const activeIndex = query(device, [OPERATION.getActiveIndex])[1];
    const mode = query(device, [OPERATION.getMode, activeIndex])[2];
    const support = readDirectionSupport(device, mode);
    if (!support) throw new TypeError('The active lighting effect has no direction');
    const axisAllowed = direction <= 2 ? support.leftRight : support.upDown;
    if (!axisAllowed || (bouncing && !support.bouncing)) {
      throw new TypeError('The active lighting effect does not support that direction');
    }
    update(device, [OPERATION.setCustomization, activeIndex, CUSTOMIZATION.direction, direction, bouncing ? 1 : 0]);
    return { direction: readDirection(device, activeIndex), directionSupport: support, mode };
  });
}

// Sets the active effect's speed to one of the firmware presets.
function setSpeed(requestedSpeed) {
  const speed = Number(requestedSpeed);
  if (!SPEED_PRESETS.includes(speed)) throw new RangeError('Speed must be one of the firmware presets');
  return withDevice((device) => {
    const activeIndex = query(device, [OPERATION.getActiveIndex])[1];
    const mode = query(device, [OPERATION.getMode, activeIndex])[2];
    if (readSpeed(device, activeIndex) === null) throw new TypeError('The active lighting effect has no speed');
    update(device, [OPERATION.setCustomization, activeIndex, CUSTOMIZATION.speed, speed & 0xff, speed >> 8]);
    return { speed, mode };
  });
}

function writeColors(device, activeIndex, colors, type = CUSTOMIZATION.color) {
  const current = readColors(device, activeIndex, type);
  if (current.length === 0) throw new TypeError('The active lighting effect has no adjustable colors');
  if (colors.length !== current.length) {
    throw new RangeError(`The active lighting effect needs exactly ${current.length} colors`);
  }
  // Payload: starting group ID (1), then one little-endian RGBA word per group.
  update(device, [OPERATION.setCustomization, activeIndex, type, 1, ...colors.flatMap(colorToBytes)]);
  return colors.map((color) => color.toLowerCase());
}

function validateColorList(requestedColors) {
  if (!Array.isArray(requestedColors) || requestedColors.length === 0 || requestedColors.length > 16) {
    throw new TypeError('Colors must be a non-empty array');
  }
  requestedColors.forEach(colorToBytes);
}

// Replaces the color list of the active effect. Static, Glowing, Wave, and Peak
// Meter hold five gradient stops; Morph and Chasers hold one color.
function setColors(requestedColors) {
  validateColorList(requestedColors);
  return withDevice((device) => {
    const activeIndex = query(device, [OPERATION.getActiveIndex])[1];
    const mode = query(device, [OPERATION.getMode, activeIndex])[2];
    return { colors: writeColors(device, activeIndex, requestedColors), mode };
  });
}

// Replaces Morph's second color, the one it fades to.
function setColors2(requestedColors) {
  validateColorList(requestedColors);
  return withDevice((device) => {
    const activeIndex = query(device, [OPERATION.getActiveIndex])[1];
    const mode = query(device, [OPERATION.getMode, activeIndex])[2];
    return { colors2: writeColors(device, activeIndex, requestedColors, CUSTOMIZATION.color2), mode };
  });
}

// Switches to Static and fills every gradient stop with one color.
function setColor(color) {
  colorToBytes(color);
  return withDevice((device) => {
    const activeIndex = query(device, [OPERATION.getActiveIndex])[1];
    const previousMode = query(device, [OPERATION.getMode, activeIndex])[2];
    if (previousMode !== 0x03) update(device, [OPERATION.setMode, activeIndex, 0x03]);
    try {
      const stops = readColors(device, activeIndex).length || 5;
      const colors = writeColors(device, activeIndex, Array(stops).fill(color));
      return { color: colors[0], colors, mode: 0x03 };
    } catch (error) {
      if (previousMode !== 0x03) update(device, [OPERATION.setMode, activeIndex, previousMode]);
      throw error;
    }
  });
}

// Routes audio to the speakers (2) or the headphone jack (4).
function setOutputTarget(requestedTarget) {
  const target = Number(requestedTarget);
  if (!Number.isInteger(target) || !Object.hasOwn(OUTPUT_TARGETS, target)) {
    throw new TypeError('Unsupported output target');
  }
  return withDevice((device) => {
    const { outputTargets } = readOutputTargets(device);
    if (!outputTargets.includes(target)) throw new TypeError('This speaker does not support that output');
    const mask = [target & 0xff, (target >> 8) & 0xff, (target >> 16) & 0xff, (target >> 24) & 0xff];
    update(device, [OUTPUT_OPERATION.set, ...mask], COMMAND.outputTarget);
    return { outputTarget: target, outputTargets };
  });
}

module.exports = {
  getState,
  setEnabled,
  setBrightness,
  setMode,
  setColor,
  setColors,
  setColors2,
  setSpeed,
  setDirection,
  setActiveSlot,
  setOutputTarget
};
