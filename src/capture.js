// Microphone control for the Pebble X Plus capture endpoint. Windows Core
// Audio is reached through src/audio-bridge.ps1, a long-lived PowerShell
// child that answers JSON commands line by line.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');

const BRIDGE_PATH = path.join(__dirname, 'audio-bridge.ps1');
const REQUEST_TIMEOUT_MS = 8000;

// The formats Creative App offers; the bridge reports which ones the endpoint accepts.
const FORMAT_CANDIDATES = Object.freeze([
  { bits: 16, rate: 44100, channels: 1 },
  { bits: 16, rate: 48000, channels: 1 },
  { bits: 24, rate: 44100, channels: 1 },
  { bits: 24, rate: 48000, channels: 1 },
  { bits: 24, rate: 96000, channels: 1 },
  { bits: 16, rate: 44100, channels: 2 },
  { bits: 16, rate: 48000, channels: 2 },
  { bits: 24, rate: 48000, channels: 2 },
  { bits: 24, rate: 96000, channels: 2 }
]);

let bridge = null;

function startBridge() {
  // The script travels inside app.asar, which PowerShell cannot open, so a
  // copy is written next to the user's temp files and run from there.
  const scriptPath = path.join(os.tmpdir(), 'pebble-control-audio-bridge.ps1');
  fs.writeFileSync(scriptPath, fs.readFileSync(BRIDGE_PATH, 'utf8'));
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  });
  const pending = new Map();
  let seq = 0;
  let ready = false;
  const readyWaiters = [];

  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      return;
    }
    if (message.ready) {
      ready = true;
      readyWaiters.splice(0).forEach((resolve) => resolve());
      return;
    }
    const entry = pending.get(message.seq);
    if (!entry) return;
    pending.delete(message.seq);
    clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error(message.error));
    else entry.resolve(message.result);
  });

  child.on('exit', () => {
    pending.forEach((entry) => {
      clearTimeout(entry.timer);
      entry.reject(new Error('The audio bridge stopped'));
    });
    pending.clear();
    if (bridge && bridge.child === child) bridge = null;
  });
  child.stderr.on('data', () => {});

  function send(request) {
    return new Promise((resolve, reject) => {
      const id = seq += 1;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('The audio bridge did not answer'));
      }, REQUEST_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ ...request, seq: id })}\n`);
    });
  }

  function whenReady() {
    return ready ? Promise.resolve() : new Promise((resolve) => readyWaiters.push(resolve));
  }

  return { child, send, whenReady, stop: () => child.kill() };
}

async function call(request) {
  if (!bridge) bridge = startBridge();
  await bridge.whenReady();
  return bridge.send(request);
}

function stop() {
  if (bridge) bridge.stop();
  bridge = null;
}

// Picks the Pebble's microphone from the capture endpoints, if present.
function pickPebbleDevice(devices) {
  return devices.find((device) => /pebble/i.test(device.interface) || /pebble/i.test(device.name)) || null;
}

function formatLabel(format) {
  const channels = format.channels === 1 ? 'mono' : 'stereo';
  return `${format.bits} bit, ${format.rate} Hz, ${channels}`;
}

function formatKey(format) {
  return `${format.bits}/${format.rate}/${format.channels}`;
}

let formatCache = new Map();

async function getState() {
  const { devices } = await call({ op: 'list' });
  const device = pickPebbleDevice(devices);
  if (!device) return { connected: false };
  const state = await call({ op: 'state', id: device.id });
  if (!formatCache.has(device.id)) {
    const { formats } = await call({ op: 'formats', id: device.id, candidates: FORMAT_CANDIDATES });
    formatCache.set(device.id, formats.map((format) => ({ ...format, key: formatKey(format), label: formatLabel(format) })));
  }
  return {
    connected: true,
    id: device.id,
    name: device.name,
    isDefault: device.isDefault,
    volume: state.volume,
    muted: state.muted,
    format: { ...state.format, key: formatKey(state.format), label: formatLabel(state.format) },
    formats: formatCache.get(device.id)
  };
}

async function pebbleDevice() {
  const { devices } = await call({ op: 'list' });
  const device = pickPebbleDevice(devices);
  if (!device) throw new Error('The Pebble microphone is not connected');
  return device;
}

async function setVolume(requestedVolume) {
  const volume = Math.round(Number(requestedVolume));
  if (!Number.isFinite(volume) || volume < 0 || volume > 100) throw new RangeError('Volume must be 0 to 100');
  const device = await pebbleDevice();
  await call({ op: 'set-volume', id: device.id, volume });
  return volume;
}

async function setMuted(muted) {
  const device = await pebbleDevice();
  await call({ op: 'set-mute', id: device.id, muted: Boolean(muted) });
  return Boolean(muted);
}

async function setDefault() {
  const device = await pebbleDevice();
  await call({ op: 'set-default', id: device.id });
  return true;
}

async function setFormat(requestedKey) {
  const device = await pebbleDevice();
  const formats = formatCache.get(device.id) || [];
  const format = formats.find((candidate) => candidate.key === requestedKey);
  if (!format) throw new TypeError('Unsupported microphone format');
  await call({ op: 'set-format', id: device.id, bits: format.bits, rate: format.rate, channels: format.channels });
  return format;
}

module.exports = {
  getState, setVolume, setMuted, setDefault, setFormat, stop, pickPebbleDevice, formatLabel, formatKey, FORMAT_CANDIDATES, bridgeCall: call
};
