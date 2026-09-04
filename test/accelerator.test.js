const test = require('node:test');
const assert = require('node:assert/strict');
const { acceleratorFromEvent, describeAccelerator } = require('../src/accelerator');

const event = (key, mods = {}) => ({ key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

test('builds accelerators from modifier combinations', () => {
  assert.equal(acceleratorFromEvent(event('ArrowUp', { ctrlKey: true, altKey: true })), 'Control+Alt+Up');
  assert.equal(acceleratorFromEvent(event('m', { ctrlKey: true, shiftKey: true })), 'Control+Shift+M');
  assert.equal(acceleratorFromEvent(event('F9', { metaKey: true })), 'Super+F9');
  assert.equal(acceleratorFromEvent(event(' ', { altKey: true })), 'Alt+Space');
});

test('rejects bare keys and lone modifiers', () => {
  assert.equal(acceleratorFromEvent(event('m')), null);
  assert.equal(acceleratorFromEvent(event('Control', { ctrlKey: true })), null);
  assert.equal(acceleratorFromEvent(event('Unidentified', { ctrlKey: true })), null);
});

test('accepts media keys on their own', () => {
  assert.equal(acceleratorFromEvent(event('AudioVolumeMute')), 'VolumeMute');
  assert.equal(acceleratorFromEvent(event('AudioVolumeUp')), 'VolumeUp');
});

test('describes accelerators for display', () => {
  assert.equal(describeAccelerator('Control+Alt+Up'), 'Ctrl + Alt + Up');
  assert.equal(describeAccelerator('Super+F9'), 'Win + F9');
  assert.equal(describeAccelerator(undefined), '');
});
