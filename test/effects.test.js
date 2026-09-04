const test = require('node:test');
const assert = require('node:assert/strict');
const { EFFECTS, CONTEXTS, MASTER_KEY, parseValue, toPercent, contextFor, keyList } = require('../src/effects');

test('parses bridge values into booleans and numbers', () => {
  assert.equal(parseValue('bool:true'), true);
  assert.equal(parseValue('bool:false'), false);
  assert.equal(parseValue('float:0.67'), 0.67);
  assert.equal(parseValue('uint:3'), 3);
  assert.equal(parseValue('empty'), null);
  assert.equal(parseValue(undefined), null);
});

test('scales stored levels to percentages by each effect range', () => {
  assert.equal(toPercent(0.67, EFFECTS.surround.level.max), 67);
  assert.equal(toPercent(50, EFFECTS.bass.level.max), 50);
  assert.equal(toPercent(1.5, 1), 100);
  assert.equal(toPercent(null, 1), null);
});

test('maps outputs to Creative context GUIDs', () => {
  assert.equal(contextFor('speakers'), CONTEXTS.speakers);
  assert.equal(contextFor('headphones'), CONTEXTS.headphones);
  assert.equal(contextFor('anything else'), CONTEXTS.speakers);
});

test('asks the bridge for the master key and every effect key', () => {
  const keys = keyList();
  assert.equal(keys[0].guid, MASTER_KEY.guid);
  assert.ok(keys.some((k) => k.name === 'smartVolume.mode'));
  assert.equal(keys.length, 1 + Object.keys(EFFECTS).length * 2 + 1);
  keys.forEach((k) => assert.match(k.guid, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/));
});
