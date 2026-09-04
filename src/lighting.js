const HID = require('node-hid');

const DEVICE = Object.freeze({
  vendorId: 0x041e,
  productId: 0x329a,
  usagePage: 0xff01,
  usage: 1,
  reportId: 0x03
});

const COMMAND = Object.freeze({ acknowledge: 0x02, ledControl: 0x3a });
const OPERATION = Object.freeze({
  getInfo: 0x20,
  getSupportedModes: 0x21,
  setEnabled: 0x25,
  getEnabled: 0x26,
  setBrightness: 0x27,
  getBrightness: 0x28,
  setMode: 0x29,
  getMode: 0x2a,
  setCustomization: 0x2b,
  getCustomization: 0x2c,
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

const RESPONSE_TIMEOUT_MS = 1500;

function findDevice() {
  return HID.devices(DEVICE.vendorId, DEVICE.productId).find((candidate) => (
    candidate.usagePage === DEVICE.usagePage
    && candidate.usage === DEVICE.usage
  ));
}

function encode(payload) {
  return [
    DEVICE.reportId,
    0x6a,
    COMMAND.ledControl,
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

function isRejection(response, operation) {
  return response.command === COMMAND.acknowledge
    && response.payload[0] === COMMAND.ledControl
    && response.payload[2] === operation
    && response.payload[1] !== 0;
}

function query(device, payload) {
  device.write(encode(payload));
  const operation = payload[0];
  const index = payload.length > 1 ? payload[1] : null;
  const response = waitFor(device, (candidate) => (
    isRejection(candidate, operation) || (
      candidate.command === COMMAND.ledControl
      && candidate.payload[0] === operation
      && (index === null || candidate.payload[1] === index)
    )
  ));
  if (response[0] === COMMAND.ledControl && response[2] === operation && response.length === 3) {
    throw new Error(`The speaker rejected the lighting query (0x${response[1].toString(16)})`);
  }
  return response;
}

function update(device, payload) {
  device.write(encode(payload));
  const operation = payload[0];
  const acknowledgement = waitFor(device, (response) => (
    response.command === COMMAND.acknowledge
    && response.payload[0] === COMMAND.ledControl
    && response.payload[2] === operation
  ));
  if (acknowledgement[1] !== 0) {
    throw new Error(`The speaker rejected the lighting command (0x${acknowledgement[1].toString(16)})`);
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

function readColors(device, activeIndex) {
  try {
    return colorsFromPayload(query(device, [OPERATION.getCustomization, activeIndex, CUSTOMIZATION.color]));
  } catch (error) {
    // Cycle and Aurora carry no color list; the speaker rejects the query.
    return [];
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
    return { connected: false, deviceName: 'Creative Pebble X Plus' };
  }

  return withDevice((device) => {
    const supportedModes = query(device, [OPERATION.getSupportedModes]).slice(3)
      .filter((mode) => Object.hasOwn(MODES, mode));
    const enabled = query(device, [OPERATION.getEnabled])[1] === 1;
    const brightness = query(device, [OPERATION.getBrightness])[1];
    const activeIndex = query(device, [OPERATION.getActiveIndex])[1];
    const mode = query(device, [OPERATION.getMode, activeIndex])[2];
    const colors = readColors(device, activeIndex);

    return {
      connected: true,
      deviceName: 'Creative Pebble X Plus',
      enabled,
      brightness,
      activeIndex,
      mode,
      color: colors[0] || '#ffffff',
      colors,
      supportedModes,
      modes: MODES
    };
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
    return { mode, colors, color: colors[0] || '#ffffff' };
  });
}

function writeColors(device, activeIndex, colors) {
  const current = readColors(device, activeIndex);
  if (current.length === 0) throw new TypeError('The active lighting effect has no adjustable colors');
  if (colors.length !== current.length) {
    throw new RangeError(`The active lighting effect needs exactly ${current.length} colors`);
  }
  // Payload: starting group ID (1), then one little-endian RGBA word per group.
  update(device, [OPERATION.setCustomization, activeIndex, CUSTOMIZATION.color, 1, ...colors.flatMap(colorToBytes)]);
  return colors.map((color) => color.toLowerCase());
}

// Replaces the color list of the active effect. Static, Glowing, Wave, and Peak
// Meter hold five gradient stops; Morph and Chasers hold one color.
function setColors(requestedColors) {
  if (!Array.isArray(requestedColors) || requestedColors.length === 0 || requestedColors.length > 16) {
    throw new TypeError('Colors must be a non-empty array');
  }
  requestedColors.forEach(colorToBytes);
  return withDevice((device) => {
    const activeIndex = query(device, [OPERATION.getActiveIndex])[1];
    const mode = query(device, [OPERATION.getMode, activeIndex])[2];
    return { colors: writeColors(device, activeIndex, requestedColors), mode };
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

module.exports = { getState, setEnabled, setBrightness, setMode, setColor, setColors };
