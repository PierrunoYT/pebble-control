const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore, describe } = require('../src/profiles');

const sample = {
  lighting: { connected: true, activeIndex: 2, modeName: 'Wave' },
  outputTarget: 4,
  effects: { speakers: { connected: true, master: true, effects: { surround: { enabled: true }, bass: { enabled: false } } } },
  eq: { speakers: { connected: true, enabled: true } }
};

function store(overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pebble-profiles-'));
  const applied = [];
  const s = createStore({
    directory,
    capture: overrides.capture || (async () => sample),
    apply: async (snapshot) => { applied.push(snapshot); return { applied: true, skipped: [] }; }
  });
  return { s, applied, directory };
}

test('saves, lists, applies, and deletes profiles', async () => {
  const { s, applied } = store();
  assert.deepEqual(s.list(), []);
  const after = await s.save('  Night   listening ');
  assert.equal(after.length, 1);
  assert.equal(after[0].name, 'Night listening');
  assert.match(after[0].summary, /Wave on slot 2, Headphones, 1 effect, EQ on/);
  await s.apply(after[0].id);
  assert.equal(applied.length, 1);
  assert.equal(applied[0].outputTarget, 4);
  assert.deepEqual(s.remove(after[0].id), []);
});

test('replaces a profile saved under the same name', async () => {
  const { s } = store();
  const first = await s.save('Desk');
  const second = await s.save('desk');
  assert.equal(second.length, 1);
  assert.equal(second[0].id, first[0].id);
});

test('rejects empty names and unknown ids', async () => {
  const { s } = store();
  await assert.rejects(() => s.save('   '), RangeError);
  await assert.rejects(() => s.apply('nope'), TypeError);
});

test('survives a corrupt profiles file', async () => {
  const { s, directory } = store();
  fs.writeFileSync(path.join(directory, 'profiles.json'), '[{broken');
  assert.deepEqual(s.list(), []);
  const saved = await s.save('Fresh');
  assert.equal(saved.length, 1);
});

test('describes snapshots with missing parts', () => {
  assert.equal(describe({ effects: {}, eq: {} }), '');
  assert.equal(describe({ outputTarget: 2, effects: { speakers: { connected: true, master: false, effects: {} } }, eq: {} }), 'Speakers, effects off');
});
