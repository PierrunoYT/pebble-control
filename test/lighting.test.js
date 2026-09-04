const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { createFakeHid, RAINBOW } = require('./fake-hid');

const LIGHTING_PATH = path.join(__dirname, '..', 'src', 'lighting.js');

// Loads a fresh copy of the lighting module bound to a fresh fake speaker.
function loadLighting(options) {
  const fake = createFakeHid(options);
  const originalLoad = Module._load;
  Module._load = function load(request, ...rest) {
    if (request === 'node-hid') return fake;
    return originalLoad.call(this, request, ...rest);
  };
  delete require.cache[LIGHTING_PATH];
  try {
    return { lighting: require(LIGHTING_PATH), fake };
  } finally {
    Module._load = originalLoad;
  }
}

test('reports disconnected without touching the device when absent', async () => {
  const { lighting, fake } = loadLighting({ present: false });
  const state = await lighting.getState();
  assert.equal(state.connected, false);
  assert.equal(fake.writes.length, 0);
  assert.equal(lighting.isConnected(), false);
});

test('frames LED reports with the report ID, magic byte, command, and length', async () => {
  const { lighting, fake } = loadLighting();
  await lighting.setBrightness(128);
  const report = fake.writes.find((w) => w[5] === 0x27);
  assert.deepEqual(report, [0x03, 0x6a, 0x3a, 0x02, 0x00, 0x27, 128]);
  assert.equal(fake.speaker.state.brightness, 128);
});

test('decodes the colour list as RGB from little-endian RGBA words', async () => {
  const { lighting } = loadLighting();
  const state = await lighting.getState();
  assert.deepEqual(state.colors, ['#ff0000', '#ff5f00', '#ffff00', '#00ff00', '#0000ff']);
  assert.equal(state.color, '#ff0000');
  assert.equal(state.mode, 0x03);
});

test('treats a rejected customization query as an empty list, not a timeout', async () => {
  const { lighting } = loadLighting();
  const started = Date.now();
  const state = await lighting.getState();
  assert.deepEqual(state.colors2, []);
  assert.equal(state.speed, null);
  assert.equal(state.direction, null);
  assert.ok(Date.now() - started < 500, 'rejections must resolve immediately');
});

test('writes colours with the starting group ID and validates the count', async () => {
  const { lighting, fake } = loadLighting();
  await assert.rejects(() => lighting.setColors(['#112233']), /exactly 5 colors/);
  const result = await lighting.setColors(['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#000000']);
  assert.equal(result.colors.length, 5);
  const write = fake.writes.find((w) => w[5] === 0x2b);
  assert.deepEqual(write.slice(5, 13), [0x2b, 1, 1, 1, 0xff, 0x00, 0x00, 0xff]);
  assert.deepEqual(fake.speaker.state.colors.slice(0, 4), [0xff, 0x00, 0x00, 0xff]);
});

test('rejects malformed colour strings before touching the device', async () => {
  const { lighting, fake } = loadLighting();
  assert.throws(() => lighting.setColors(['red']), /#RRGGBB/);
  assert.throws(() => lighting.setColor('#12345'), /#RRGGBB/);
  assert.equal(fake.writes.length, 0);
});

test('validates speed against the presets and the active effect', async () => {
  const { lighting } = loadLighting();
  assert.throws(() => lighting.setSpeed(1000), /firmware presets/);
  // Static has no speed, so the fake speaker rejects the read and the write is never sent.
  await assert.rejects(() => lighting.setSpeed(2500), /has no speed/);
  await lighting.setMode(0x04);
  const result = await lighting.setSpeed(750);
  assert.equal(result.speed, 750);
});

test('surfaces a rejected write as an error with the status code', async () => {
  const { lighting, fake } = loadLighting();
  const original = fake.speaker.handle;
  fake.speaker.handle = (report) => (report[5] === 0x25
    ? [[0x03, 0x6a, 0x02, 0x03, 0x00, 0x3a, 0x83, 0x25]]
    : original(report));
  await assert.rejects(() => lighting.setEnabled(true), /rejected the command \(0x83\)/);
});

test('setMode returns the new effect with its colours, speed, and direction', async () => {
  const { lighting } = loadLighting();
  const result = await lighting.setMode(0x04);
  assert.equal(result.mode, 0x04);
  assert.equal(result.colors.length, 5);
  assert.equal(result.speed, 2500);
  assert.deepEqual(result.direction, { direction: 3, bouncing: false });
  assert.deepEqual(result.directionSupport, { leftRight: true, upDown: true, bouncing: true });
});

test('ignores pushed reports that follow a mode change', async () => {
  const { lighting } = loadLighting();
  // The fake pushes a colour report after the ack; the speed read must not take it.
  await lighting.setMode(0x04);
  const state = await lighting.getState();
  assert.equal(state.speed, 2500);
  assert.equal(state.colors.length, 5);
});

test('parses capability records for every supported mode', async () => {
  const { lighting } = loadLighting();
  const state = await lighting.getState();
  assert.deepEqual(state.capabilities[0x03], { colors: true, colors2: false, speed: false, direction: null });
  assert.equal(state.capabilities[0x04].speed, true);
  assert.deepEqual(state.capabilities[0x04].direction, { leftRight: true, upDown: true, bouncing: true });
});

test('lists slots 1 to 4 and switches between them', async () => {
  const { lighting, fake } = loadLighting();
  const state = await lighting.getState();
  assert.deepEqual(state.slots.map((s) => s.index), [1, 2, 3, 4]);
  assert.throws(() => lighting.setActiveSlot(0), /from 1 to 4/);
  const result = await lighting.setActiveSlot(2);
  assert.equal(result.activeIndex, 2);
  assert.equal(fake.speaker.state.activeIndex, 2);
});

test('reads and sets the output target using the 0x2c command', async () => {
  const { lighting, fake } = loadLighting();
  const state = await lighting.getState();
  assert.equal(state.outputTarget, 2);
  assert.deepEqual(state.outputTargets, [2, 4]);
  const result = await lighting.setOutputTarget(4);
  assert.equal(result.outputTarget, 4);
  const write = fake.writes.find((w) => w[2] === 0x2c && w[5] === 0);
  assert.deepEqual(write, [0x03, 0x6a, 0x2c, 0x05, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
  assert.throws(() => lighting.setOutputTarget(1), /Unsupported output target/);
});

test('times out with a clear error when the speaker never answers', async () => {
  const { lighting, fake } = loadLighting();
  fake.speaker.handle = () => [];
  await assert.rejects(() => lighting.setEnabled(true), /did not respond/);
});
