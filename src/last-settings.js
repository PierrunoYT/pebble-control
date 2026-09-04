// Automatically keeps the most recently applied speaker settings next to the
// app's other per-user data. Capture and apply are injected for hardware-free
// tests and to keep disk persistence separate from device access.

const fs = require('node:fs');
const path = require('node:path');

function createStore({ directory, capture, apply, delay = 500, onError = () => {} }) {
  const filePath = path.join(directory, 'last-settings.json');
  let timer = null;
  let dirty = false;
  let pending = Promise.resolve();

  function read() {
    try {
      const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return snapshot && snapshot.version === 1 ? snapshot : null;
    } catch (error) {
      return null;
    }
  }

  function save() {
    clearTimeout(timer);
    timer = null;
    dirty = false;
    pending = pending.catch(() => {}).then(async () => {
      const snapshot = await capture();
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
      return snapshot;
    });
    return pending;
  }

  function schedule() {
    clearTimeout(timer);
    dirty = true;
    timer = setTimeout(() => {
      timer = null;
      save().catch(onError);
    }, delay);
  }

  async function restore() {
    const snapshot = read();
    return snapshot ? apply(snapshot) : null;
  }

  function flush() {
    return dirty ? save() : pending;
  }

  return { read, save, schedule, restore, flush, filePath };
}

module.exports = { createStore };
