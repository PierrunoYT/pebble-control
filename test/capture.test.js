const test = require('node:test');
const assert = require('node:assert/strict');
const { pickPebbleDevice, formatLabel, formatKey, FORMAT_CANDIDATES } = require('../src/capture');

test('picks the Pebble microphone by interface or friendly name', () => {
  const devices = [
    { id: 'a', name: 'Mikrofon', interface: 'G733 Gaming Headset' },
    { id: 'b', name: 'Mikrofon (Creative Pebble X Plus)', interface: '' },
    { id: 'c', name: 'Microphone', interface: 'Realtek USB2.0 Audio' }
  ];
  assert.equal(pickPebbleDevice(devices).id, 'b');
  assert.equal(pickPebbleDevice([{ id: 'd', name: 'Mikrofon', interface: 'Creative Pebble Pro' }]).id, 'd');
  assert.equal(pickPebbleDevice(devices.filter((d) => d.id !== 'b')), null);
});

test('labels and keys formats the way the UI expects', () => {
  const format = { bits: 16, rate: 48000, channels: 1 };
  assert.equal(formatLabel(format), '16 bit, 48000 Hz, mono');
  assert.equal(formatLabel({ ...format, channels: 2 }), '16 bit, 48000 Hz, stereo');
  assert.equal(formatKey(format), '16/48000/1');
});

test('probes the same format set Creative App offers', () => {
  assert.ok(FORMAT_CANDIDATES.some((f) => f.bits === 16 && f.rate === 48000 && f.channels === 1));
  assert.ok(FORMAT_CANDIDATES.every((f) => [16, 24].includes(f.bits) && [1, 2].includes(f.channels)));
});
