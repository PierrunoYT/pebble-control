// A scripted stand-in for node-hid. It records every report the module writes
// and answers from a handler that mirrors the Pebble X Plus firmware closely
// enough to exercise encoding, parsing, and rejection handling.

const REPORT_ID = 0x03;
const MAGIC = 0x6a;
const ACK = 0x02;
const LED = 0x3a;
const OUTPUT = 0x2c;

function frame(command, payload) {
  return [REPORT_ID, MAGIC, command, payload.length & 0xff, payload.length >> 8, ...payload];
}

function ack(command, status, operation) {
  return frame(ACK, [command, status, operation]);
}

// Little-endian RGBA words as the speaker sends them: alpha, blue, green, red.
const RAINBOW = [
  0xff, 0x00, 0x00, 0xff,
  0xff, 0x00, 0x5f, 0xff,
  0xff, 0x00, 0xff, 0xff,
  0xff, 0x00, 0xff, 0x00,
  0xff, 0xff, 0x00, 0x00
];

function createSpeaker() {
  const state = {
    enabled: 1,
    brightness: 0xff,
    activeIndex: 1,
    modes: { 0: 0x0b, 1: 0x03, 2: 0x08, 3: 0x0a, 4: 0x09 },
    colors: [...RAINBOW],
    colors2: [],
    speed: 2500,
    direction: null,
    outputTarget: 2,
    supportedSpeeds: [6000, 4000, 2500, 1333, 750, 375, 250]
  };

  function customization(type) {
    if (state.modes[state.activeIndex] === 0x03) {
      if (type === 1) return [1, ...state.colors];
      return null;
    }
    if (state.modes[state.activeIndex] === 0x04) {
      if (type === 1) return [1, ...state.colors];
      if (type === 3) return [state.speed & 0xff, state.speed >> 8];
      if (type === 4) return [3, 0];
      return null;
    }
    return null;
  }

  function handle(report) {
    const command = report[2];
    const payload = report.slice(5, 5 + (report[3] | (report[4] << 8)));
    const op = payload[0];

    if (command === OUTPUT) {
      if (op === 1) return [frame(OUTPUT, [1, state.outputTarget, 0, 0, 0])];
      if (op === 2) return [frame(OUTPUT, [2, 0x82, 2, 0, 0, 0, 4, 0, 0, 0])];
      if (op === 0) {
        const mask = payload[1];
        if (mask !== 2 && mask !== 4) return [ack(OUTPUT, 0x81, 0)];
        state.outputTarget = mask;
        return [ack(OUTPUT, 0, 0)];
      }
      return [];
    }

    if (command !== LED) return [];
    switch (op) {
      case 0x21: return [frame(LED, [0x21, 0x08, 0x00, 0x0b, 0x08, 0x0a, 0x09, 0x04, 0x01, 0x03, 0x07])];
      case 0x22: {
        const mode = payload[1];
        if (mode === 0x03) return [frame(LED, [0x22, 3, 1, 1, 4, 8, 8, 8, 8])];
        if (mode === 0x04) return [frame(LED, [0x22, 4, 3, 1, 4, 8, 8, 8, 8, 3, 7, 2, 0x70, 0x17, 0xfa, 0, 1, 0, 4, 1, 7])];
        return [frame(LED, [0x22, mode, 0])];
      }
      case 0x25: state.enabled = payload[1]; return [ack(LED, 0, op)];
      case 0x26: return [frame(LED, [0x26, state.enabled])];
      case 0x27: state.brightness = payload[1]; return [ack(LED, 0, op)];
      case 0x28: return [frame(LED, [0x28, state.brightness])];
      case 0x29: {
        state.modes[payload[1]] = payload[2];
        // The real speaker pushes the new slot's reports after the ack.
        return [ack(LED, 0, op), frame(LED, [0x2a, payload[1], payload[2]]), frame(LED, [0x2c, payload[1], 1, 1, ...state.colors])];
      }
      case 0x2a: return [frame(LED, [0x2a, payload[1], state.modes[payload[1]]])];
      case 0x2b: {
        const [, index, type, ...value] = payload;
        if (index !== state.activeIndex) return [ack(LED, 0x83, op)];
        if (type === 1) {
          if (value.length - 1 !== state.colors.length) return [ack(LED, 0x83, op)];
          state.colors = value.slice(1);
          return [ack(LED, 0, op)];
        }
        if (type === 3) {
          const speed = value[0] | (value[1] << 8);
          if (!state.supportedSpeeds.includes(speed) || state.modes[index] === 0x03) return [ack(LED, 0x83, op)];
          state.speed = speed;
          return [ack(LED, 0, op)];
        }
        return [ack(LED, 0x83, op)];
      }
      case 0x2c: {
        const value = customization(payload[2]);
        if (!value || payload[1] !== state.activeIndex) return [ack(LED, 0x83, op)];
        return [frame(LED, [0x2c, payload[1], payload[2], ...value])];
      }
      case 0x2d: state.activeIndex = payload[1]; return [ack(LED, 0, op)];
      case 0x2e: return [frame(LED, [0x2e, state.activeIndex])];
      default: return [];
    }
  }

  return { state, handle };
}

function createFakeHid({ present = true } = {}) {
  const speaker = createSpeaker();
  const writes = [];
  const descriptor = { path: 'fake', vendorId: 0x041e, productId: 0x329a, usagePage: 0xff01, usage: 1 };

  class HID {
    constructor(path) {
      this.path = path;
      this.queue = [];
      this.closed = false;
    }

    write(report) {
      writes.push([...report]);
      this.queue.push(...speaker.handle(report));
      return report.length;
    }

    readTimeout() {
      return this.queue.length ? this.queue.shift() : [];
    }

    close() { this.closed = true; }
  }

  return {
    devices: () => (present ? [descriptor] : []),
    HID,
    writes,
    speaker,
    setPresent(value) { present = value; }
  };
}

module.exports = { createFakeHid, frame, ack, RAINBOW };
