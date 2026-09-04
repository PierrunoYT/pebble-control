const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../src/last-settings');

function scratch(overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pebble-last-settings-'));
  const applied = [];
  const snapshot = { version: 1, lighting: { connected: true, mode: 7 }, effects: {}, eq: {} };
  const store = createStore({
    directory,
    capture: overrides.capture || (async () => snapshot),
    apply: async (value) => { applied.push(value); return { applied: true, skipped: [] }; },
    delay: overrides.delay ?? 5
  });
  return { directory, store, applied, snapshot };
}

test('saves and restores the last snapshot', async () => {
  const { directory, store, applied, snapshot } = scratch();
  await store.save();
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'last-settings.json'), 'utf8')), snapshot);
  await store.restore();
  assert.deepEqual(applied, [snapshot]);
});

test('ignores missing, corrupt, and unsupported snapshots', async () => {
  const { directory, store, applied } = scratch();
  assert.equal(await store.restore(), null);
  fs.writeFileSync(path.join(directory, 'last-settings.json'), '{broken');
  assert.equal(await store.restore(), null);
  fs.writeFileSync(path.join(directory, 'last-settings.json'), JSON.stringify({ version: 99 }));
  assert.equal(await store.restore(), null);
  assert.deepEqual(applied, []);
});

test('debounces scheduled saves', async () => {
  let captures = 0;
  const { store } = scratch({ capture: async () => { captures += 1; return { version: 1 }; } });
  store.schedule();
  store.schedule();
  store.schedule();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(captures, 1);
});

test('flushes a pending save without waiting for the debounce', async () => {
  let captures = 0;
  const { store } = scratch({ capture: async () => { captures += 1; return { version: 1 }; }, delay: 1000 });
  store.schedule();
  await store.flush();
  assert.equal(captures, 1);
});
