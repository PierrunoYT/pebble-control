// Captures and restores everything a profile covers: the lighting slot and
// its settings, the output target, and the Acoustic Engine and equalizer for
// both outputs. Each part is optional so a profile saved with the speaker
// present still applies what it can when parts are missing.

const lighting = require('./lighting');
const effects = require('./effects');

const OUTPUTS = ['speakers', 'headphones'];

async function safe(promise) {
  try {
    return await promise;
  } catch (error) {
    return null;
  }
}

async function captureSnapshot() {
  const light = await safe(lighting.getState());
  const snapshot = { version: 1, lighting: null, outputTarget: null, effects: {}, eq: {} };
  if (light && light.connected) {
    snapshot.lighting = {
      connected: true,
      activeIndex: light.activeIndex,
      modeName: light.modes ? light.modes[light.mode] : undefined,
      enabled: light.enabled,
      brightness: light.brightness,
      mode: light.mode,
      colors: light.colors,
      colors2: light.colors2,
      speed: light.speed,
      direction: light.direction
    };
    snapshot.outputTarget = light.outputTarget;
  }
  for (const output of OUTPUTS) {
    const fx = await safe(effects.getState(output));
    if (fx && fx.connected) {
      snapshot.effects[output] = {
        connected: true,
        master: fx.master,
        effects: Object.fromEntries(Object.entries(fx.effects).map(([id, e]) => [id, {
          enabled: e.enabled, level: e.level, mode: e.mode, crossover: e.crossover
        }]))
      };
    }
    const eq = await safe(effects.getEqState(output));
    if (eq && eq.connected) {
      snapshot.eq[output] = { connected: true, enabled: eq.enabled, preamp: eq.preamp, gains: eq.gains };
    }
  }
  return snapshot;
}

// Applies a snapshot and reports which parts could not be applied.
async function applySnapshot(snapshot) {
  const skipped = [];
  const light = snapshot.lighting;
  if (light && light.connected) {
    try {
      if (Number.isInteger(light.activeIndex) && light.activeIndex >= 1) await lighting.setActiveSlot(light.activeIndex);
      const current = await lighting.setMode(light.mode);
      if (Array.isArray(light.colors) && light.colors.length === current.colors.length && light.colors.length) await lighting.setColors(light.colors);
      if (Array.isArray(light.colors2) && light.colors2.length === current.colors2.length && light.colors2.length) await lighting.setColors2(light.colors2);
      if (Number.isInteger(light.speed) && current.speed !== null) await lighting.setSpeed(light.speed);
      if (light.direction && current.direction) await lighting.setDirection(light.direction);
      if (Number.isInteger(light.brightness)) await lighting.setBrightness(light.brightness);
      if (typeof light.enabled === 'boolean') await lighting.setEnabled(light.enabled);
    } catch (error) {
      skipped.push('lighting');
    }
  }
  if (snapshot.outputTarget) {
    try {
      await lighting.setOutputTarget(snapshot.outputTarget);
    } catch (error) {
      skipped.push('output');
    }
  }
  for (const output of OUTPUTS) {
    const fx = snapshot.effects && snapshot.effects[output];
    if (fx && fx.connected) {
      try {
        for (const [id, e] of Object.entries(fx.effects)) {
          const changes = { enabled: e.enabled };
          if (Number.isFinite(e.level)) changes.level = e.level;
          if (e.mode) changes.mode = e.mode;
          if (Number.isFinite(e.crossover)) changes.crossover = e.crossover;
          await effects.setEffect(id, changes, output);
        }
      } catch (error) {
        skipped.push(`${output} effects`);
      }
    }
    const eq = snapshot.eq && snapshot.eq[output];
    if (eq && eq.connected) {
      try {
        await effects.setEq({ gains: eq.gains, preamp: eq.preamp, enabled: eq.enabled }, output);
      } catch (error) {
        skipped.push(`${output} equalizer`);
      }
    }
    // The master goes last so enabling effects above does not leave it on
    // when the profile had processing off.
    if (fx && fx.connected) {
      try {
        await effects.setMaster(fx.master, output);
      } catch (error) {
        skipped.push(`${output} master`);
      }
    }
  }
  return { applied: true, skipped };
}

module.exports = { captureSnapshot, applySnapshot };
