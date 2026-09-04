// Named profiles: a saved snapshot of every setting the app controls, kept as
// profiles.json in the user data folder. The store is independent of how a
// snapshot is captured or applied, so it can be tested without hardware.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_PROFILES = 24;
const MAX_NAME = 40;

function createStore({ directory, capture, apply }) {
  const filePath = path.join(directory, 'profiles.json');

  function read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return Array.isArray(parsed) ? parsed.filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string' && p.snapshot) : [];
    } catch (error) {
      return [];
    }
  }

  function write(profiles) {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(profiles, null, 2));
  }

  function summary(profile) {
    return { id: profile.id, name: profile.name, savedAt: profile.savedAt, summary: profile.summary || '' };
  }

  function cleanName(name) {
    const trimmed = String(name || '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME);
    if (!trimmed) throw new RangeError('A profile needs a name');
    return trimmed;
  }

  return {
    list: () => read().map(summary),

    async save(name) {
      const profiles = read();
      const cleaned = cleanName(name);
      const snapshot = await capture();
      const existing = profiles.find((p) => p.name.toLowerCase() === cleaned.toLowerCase());
      const profile = {
        id: existing ? existing.id : crypto.randomUUID(),
        name: cleaned,
        savedAt: new Date().toISOString(),
        summary: describe(snapshot),
        snapshot
      };
      const next = existing ? profiles.map((p) => (p.id === existing.id ? profile : p)) : [...profiles, profile];
      if (next.length > MAX_PROFILES) throw new RangeError(`At most ${MAX_PROFILES} profiles can be kept`);
      write(next);
      return next.map(summary);
    },

    async apply(id) {
      const profile = read().find((p) => p.id === id);
      if (!profile) throw new TypeError('Unknown profile');
      return apply(profile.snapshot);
    },

    remove(id) {
      const next = read().filter((p) => p.id !== id);
      write(next);
      return next.map(summary);
    }
  };
}

// One line describing what a snapshot contains, shown under the profile name.
function describe(snapshot) {
  const parts = [];
  if (snapshot.lighting && snapshot.lighting.connected) {
    parts.push(`${snapshot.lighting.modeName || 'Lighting'} on slot ${snapshot.lighting.activeIndex}`);
  }
  if (snapshot.outputTarget === 4) parts.push('Headphones');
  else if (snapshot.outputTarget === 2) parts.push('Speakers');
  const speakers = snapshot.effects && snapshot.effects.speakers;
  if (speakers && speakers.connected) {
    const on = Object.entries(speakers.effects).filter(([, e]) => e.enabled).map(([id]) => id);
    parts.push(speakers.master && on.length ? `${on.length} effect${on.length === 1 ? '' : 's'}` : 'effects off');
  }
  const eq = snapshot.eq && snapshot.eq.speakers;
  if (eq && eq.connected) parts.push(eq.enabled ? 'EQ on' : 'EQ off');
  return parts.join(', ');
}

module.exports = { createStore, describe, MAX_PROFILES, MAX_NAME };
