const volumeSlider = document.querySelector('#volumeSlider');
const volumeValue = document.querySelector('#volumeValue');
const muteButton = document.querySelector('#muteButton');
const launchToggle = document.querySelector('#launchToggle');
const syncStatus = document.querySelector('#syncStatus');
const deviceStatus = document.querySelector('#deviceStatus');
const deviceName = document.querySelector('#deviceName');
const outputDetail = document.querySelector('#outputDetail');
const outputLabel = document.querySelector('#outputLabel');
const presets = [...document.querySelectorAll('.preset')];
const lightingCard = document.querySelector('#lightingCard');
const lightingControls = document.querySelector('#lightingControls');
const lightingToggle = document.querySelector('#lightingToggle');
const lightingStatus = document.querySelector('#lightingStatus');
const lightingMode = document.querySelector('#lightingMode');
const lightingSpeed = document.querySelector('#lightingSpeed');
const lightingSpeedField = document.querySelector('#lightingSpeedField');
const lightingDirection = document.querySelector('#lightingDirection');
const lightingDirectionField = document.querySelector('#lightingDirectionField');

const DIRECTION_LABELS = { 1: 'Left to right', 2: 'Right to left', 3: 'Top to bottom', 4: 'Bottom to top' };
const lightingSlots = document.querySelector('#lightingSlots');
const lightingColors = document.querySelector('#lightingColors');
const lightingColors2 = document.querySelector('#lightingColors2');
const lightingColorsTitle = document.querySelector('#lightingColorsTitle');
const lightingColorsHint = document.querySelector('#lightingColorsHint');
const lightingMatchColors = document.querySelector('#lightingMatchColors');
const outputTarget = document.querySelector('#outputTarget');
const outputTargetButtons = [...outputTarget.querySelectorAll('button')];
const lightingBrightness = document.querySelector('#lightingBrightness');
const lightingBrightnessValue = document.querySelector('#lightingBrightnessValue');

let state = { volume: 50, muted: false };
let volumeTimer;
let isAdjusting = false;
let lightingState = { connected: false, enabled: false, brightness: 255, mode: 11, color: '#ffffff', colors: [], colors2: [] };
let colorTimer;
let lastColorEdit = 0;
let brightnessTimer;
let isAdjustingLighting = false;

function render(nextState) {
  state = { ...state, ...nextState };
  volumeSlider.value = state.volume;
  volumeSlider.style.setProperty('--volume', `${state.volume}%`);
  volumeValue.textContent = state.volume;
  muteButton.setAttribute('aria-pressed', String(state.muted));
  muteButton.setAttribute('aria-label', state.muted ? 'Unmute audio' : 'Mute audio');

  presets.forEach((preset) => {
    preset.classList.toggle('active', Number(preset.dataset.volume) === state.volume && !state.muted);
  });
}

function renderLighting(nextState) {
  lightingState = { ...lightingState, ...nextState };
  const connected = Boolean(lightingState.connected);
  lightingCard.classList.toggle('disconnected', !connected);
  lightingControls.disabled = !connected;
  lightingToggle.disabled = !connected;
  lightingToggle.checked = connected && lightingState.enabled;
  renderSlots(connected);
  renderModeOptions();
  lightingMode.value = String(lightingState.mode);
  const hasSpeed = Number.isInteger(lightingState.speed);
  lightingSpeedField.classList.toggle('unsupported', !hasSpeed);
  lightingSpeed.disabled = !hasSpeed;
  lightingSpeed.setAttribute('aria-disabled', String(!hasSpeed));
  if (hasSpeed) lightingSpeed.value = String(lightingState.speed);
  renderDirection();
  renderColorStops(
    Array.isArray(lightingState.colors) ? lightingState.colors : [],
    Array.isArray(lightingState.colors2) ? lightingState.colors2 : []
  );
  renderOutputTarget(connected);
  lightingBrightness.value = lightingState.brightness;
  lightingBrightness.style.setProperty('--volume', `${(lightingState.brightness / 255) * 100}%`);
  lightingBrightnessValue.textContent = lightingState.brightness;
}

// One button per lighting slot, showing the effect stored in it.
function renderSlots(connected) {
  const slots = Array.isArray(lightingState.slots) ? lightingState.slots : [];
  lightingSlots.hidden = !connected || slots.length < 2;
  const names = lightingState.modes || {};
  const buttons = [...lightingSlots.querySelectorAll('button')];
  if (buttons.length !== slots.length) {
    lightingSlots.replaceChildren(...slots.map((slot) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.index = String(slot.index);
      button.append(document.createElement('small'), document.createElement('strong'));
      return button;
    }));
  }
  [...lightingSlots.querySelectorAll('button')].forEach((button, position) => {
    const slot = slots[position];
    const active = slot.index === lightingState.activeIndex;
    const mode = active ? lightingState.mode : slot.mode;
    button.querySelector('small').textContent = `Slot ${slot.index}`;
    button.querySelector('strong').textContent = names[mode] || `Effect ${mode}`;
    button.setAttribute('aria-pressed', String(active));
  });
}

// Builds the effect list from the modes the speaker reports, in the order the
// speaker lists them. The markup's options remain as a fallback until then.
function renderModeOptions() {
  const supported = lightingState.supportedModes;
  const names = lightingState.modes;
  if (!Array.isArray(supported) || !names) return;
  const current = [...lightingMode.options].map((option) => option.value).join();
  if (current === supported.join()) return;
  lightingMode.replaceChildren(...supported.map((mode) => {
    const option = document.createElement('option');
    option.value = String(mode);
    option.textContent = names[mode] || `Effect ${mode}`;
    return option;
  }));
}

// Applies what the capability record says an effect supports before the
// speaker confirms the change, so the controls settle immediately.
function previewCapabilities(mode) {
  const capabilities = lightingState.capabilities?.[mode];
  if (!capabilities) return {};
  return {
    speed: capabilities.speed ? lightingState.speed : null,
    direction: capabilities.direction ? lightingState.direction : null,
    directionSupport: capabilities.direction,
    colors: capabilities.colors ? lightingState.colors : [],
    colors2: capabilities.colors2 ? lightingState.colors2 : []
  };
}

// Option values are the direction number for looping, or "bounce".
function renderDirection() {
  const support = lightingState.directionSupport;
  const current = lightingState.direction;
  const available = Boolean(support && current);
  lightingDirectionField.classList.toggle('unsupported', !available);
  lightingDirection.disabled = !available;
  lightingDirection.setAttribute('aria-disabled', String(!available));

  const values = [];
  if (available) {
    if (support.leftRight) values.push('1', '2');
    if (support.upDown) values.push('3', '4');
    if (support.bouncing) values.push('bounce');
  }
  const existing = [...lightingDirection.options].map((option) => option.value);
  if (existing.join() !== values.join()) {
    lightingDirection.replaceChildren(...values.map((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value === 'bounce' ? 'Bounce' : DIRECTION_LABELS[value];
      return option;
    }));
  }
  if (available) lightingDirection.value = current.bouncing ? 'bounce' : String(current.direction);
}

function renderOutputTarget(connected) {
  const targets = Array.isArray(lightingState.outputTargets) ? lightingState.outputTargets : [];
  outputTarget.hidden = !connected || targets.length === 0;
  outputTargetButtons.forEach((button) => {
    const target = Number(button.dataset.target);
    button.disabled = !targets.includes(target);
    button.setAttribute('aria-pressed', String(target === lightingState.outputTarget));
  });
}

function fillColorWells(container, colors, labelFor) {
  const wells = [...container.querySelectorAll('input')];
  if (wells.length !== colors.length) {
    container.replaceChildren(...colors.map((color, index) => {
      const well = document.createElement('label');
      well.className = 'color-well';
      const input = document.createElement('input');
      input.type = 'color';
      input.value = color;
      input.dataset.index = String(index);
      input.setAttribute('aria-label', labelFor(index));
      well.append(input);
      return well;
    }));
  } else {
    wells.forEach((input, index) => { input.value = colors[index]; });
  }
  container.classList.toggle('single', colors.length === 1);
}

function renderColorStops(colors, colors2) {
  fillColorWells(lightingColors, colors, (index) => (colors.length > 1 ? `Gradient stop ${index + 1}` : 'Effect color'));
  fillColorWells(lightingColors2, colors2, () => 'Second effect color');

  lightingMatchColors.hidden = colors.length < 2;
  if (colors.length > 1) {
    lightingColorsTitle.textContent = 'Gradient';
    lightingColorsHint.textContent = `${colors.length} stops blend across both speakers`;
  } else if (colors.length === 1 && colors2.length === 1) {
    lightingColorsTitle.textContent = 'Morph colors';
    lightingColorsHint.textContent = 'Fades from the first color to the second';
  } else if (colors.length === 1) {
    lightingColorsTitle.textContent = 'Effect color';
    lightingColorsHint.textContent = 'Both speakers use this color';
  } else {
    lightingColorsTitle.textContent = 'Colors';
    lightingColorsHint.textContent = 'This effect has no adjustable colors';
  }
}

function showStatus(message, isError = false) {
  syncStatus.textContent = message;
  syncStatus.classList.toggle('error', isError);
  deviceStatus.classList.toggle('error', isError);
}

async function syncAudio() {
  try {
    const audioState = await window.pebble.getAudioState();
    if (!isAdjusting) render(audioState);
    showStatus(audioState.muted ? 'Output muted' : 'Synced with Windows audio');
  } catch (error) {
    showStatus('Windows audio is unavailable', true);
  }
}

// Creative names the Pebble endpoints after the product, so the label is
// enough to tell whether Windows is actually sending audio to the speakers.
function isPebbleOutput(label) {
  return /pebble/i.test(label);
}

async function findDefaultOutput() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const output = devices.find((device) => device.kind === 'audiooutput' && device.deviceId === 'default')
      || devices.find((device) => device.kind === 'audiooutput');
    if (!output?.label) return;
    const label = output.label.replace(/^Default\s*-\s*/i, '');
    const pebble = isPebbleOutput(label);
    deviceName.textContent = label;
    outputDetail.textContent = label;
    deviceStatus.classList.toggle('warning', !pebble);
    deviceStatus.title = pebble ? '' : 'Windows is not sending audio to a Creative Pebble';
    outputLabel.textContent = pebble ? 'ACTIVE OUTPUT' : 'ACTIVE OUTPUT · NOT A PEBBLE';
  } catch (error) {
    // The generic Windows label remains accurate when device enumeration is unavailable.
  }
}

async function syncLighting() {
  try {
    const nextState = await window.pebble.getLightingState();
    if (!isAdjustingLighting && Date.now() - lastColorEdit > 1500) renderLighting(nextState);
    lightingStatus.textContent = nextState.connected ? 'Creative Pebble X Plus connected' : 'Connect by USB to control RGB';
    lightingStatus.classList.remove('error');
  } catch (error) {
    console.error('Lighting sync failed:', error);
    renderLighting({ connected: false });
    lightingStatus.textContent = 'Lighting control unavailable';
    lightingStatus.classList.add('error');
  }
}

volumeSlider.addEventListener('pointerdown', () => { isAdjusting = true; });
window.addEventListener('pointerup', () => { isAdjusting = false; });

volumeSlider.addEventListener('input', () => {
  const volume = Number(volumeSlider.value);
  const wasMuted = state.muted;
  render({ volume, muted: false });
  clearTimeout(volumeTimer);
  volumeTimer = setTimeout(async () => {
    try {
      await window.pebble.setVolume(volume);
      if (wasMuted) await window.pebble.setMuted(false);
      showStatus('Volume updated');
    } catch (error) {
      showStatus('Could not change volume', true);
    }
  }, 60);
});

muteButton.addEventListener('click', async () => {
  const muted = !state.muted;
  render({ muted });
  try {
    await window.pebble.setMuted(muted);
    showStatus(muted ? 'Output muted' : 'Output unmuted');
  } catch (error) {
    render({ muted: !muted });
    showStatus('Could not change mute state', true);
  }
});

presets.forEach((preset) => {
  preset.addEventListener('click', async () => {
    const volume = Number(preset.dataset.volume);
    render({ volume, muted: false });
    try {
      await Promise.all([window.pebble.setVolume(volume), window.pebble.setMuted(false)]);
      showStatus(`${preset.querySelector('strong').textContent} preset applied`);
    } catch (error) {
      showStatus('Could not apply preset', true);
    }
  });
});

launchToggle.addEventListener('change', async () => {
  try {
    launchToggle.checked = await window.pebble.setLaunchAtLogin(launchToggle.checked);
  } catch (error) {
    launchToggle.checked = !launchToggle.checked;
    showStatus('Could not change startup setting', true);
  }
});

lightingToggle.addEventListener('change', async () => {
  const enabled = lightingToggle.checked;
  renderLighting({ enabled });
  try {
    await window.pebble.setLightingEnabled(enabled);
    lightingStatus.textContent = enabled ? 'Lighting enabled' : 'Lighting disabled';
  } catch (error) {
    renderLighting({ enabled: !enabled });
    lightingStatus.textContent = 'Could not change lighting power';
  }
});

lightingSpeed.addEventListener('change', async () => {
  const previousSpeed = lightingState.speed;
  const speed = Number(lightingSpeed.value);
  renderLighting({ speed });
  try {
    renderLighting(await window.pebble.setLightingSpeed(speed));
    lightingStatus.textContent = `${lightingSpeed.selectedOptions[0].textContent} speed applied`;
  } catch (error) {
    renderLighting({ speed: previousSpeed });
    lightingStatus.textContent = 'Could not change effect speed';
  }
});

lightingSlots.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  const index = Number(button.dataset.index);
  if (index === lightingState.activeIndex) return;
  try {
    renderLighting(await window.pebble.setLightingSlot(index));
    lightingStatus.textContent = `Slot ${index} active`;
  } catch (error) {
    lightingStatus.textContent = 'Could not switch lighting slot';
  }
});

lightingDirection.addEventListener('change', async () => {
  const previous = lightingState.direction;
  const value = lightingDirection.value;
  const request = value === 'bounce'
    ? { direction: previous?.direction || 1, bouncing: true }
    : { direction: Number(value), bouncing: false };
  renderLighting({ direction: request });
  try {
    renderLighting(await window.pebble.setLightingDirection(request));
    lightingStatus.textContent = `${lightingDirection.selectedOptions[0].textContent} direction applied`;
  } catch (error) {
    renderLighting({ direction: previous });
    lightingStatus.textContent = 'Could not change effect direction';
  }
});

lightingMode.addEventListener('change', async () => {
  const previousMode = lightingState.mode;
  const mode = Number(lightingMode.value);
  renderLighting({ mode, ...previewCapabilities(mode) });
  try {
    renderLighting(await window.pebble.setLightingMode(mode));
    lightingStatus.textContent = `${lightingMode.selectedOptions[0].textContent} effect applied`;
  } catch (error) {
    renderLighting({ mode: previousMode });
    lightingStatus.textContent = 'Could not change lighting effect';
  }
});

function applyColors(colors) {
  lastColorEdit = Date.now();
  renderLighting({ colors, color: colors[0] });
  clearTimeout(colorTimer);
  colorTimer = setTimeout(async () => {
    try {
      const result = await window.pebble.setLightingColors(colors);
      renderLighting(result);
      lightingStatus.textContent = colors.length > 1 ? 'Gradient applied' : 'Effect color applied';
    } catch (error) {
      lightingStatus.textContent = 'Could not change lighting colors';
      await syncLighting();
    }
  }, 100);
}

lightingColors.addEventListener('pointerdown', () => { isAdjustingLighting = true; });
lightingColors.addEventListener('input', (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const colors = [...lightingState.colors];
  colors[Number(input.dataset.index)] = input.value;
  applyColors(colors);
});

let colors2Timer;
lightingColors2.addEventListener('pointerdown', () => { isAdjustingLighting = true; });
lightingColors2.addEventListener('input', (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const colors2 = [...lightingState.colors2];
  colors2[Number(input.dataset.index)] = input.value;
  lastColorEdit = Date.now();
  renderLighting({ colors2 });
  clearTimeout(colors2Timer);
  colors2Timer = setTimeout(async () => {
    try {
      renderLighting(await window.pebble.setLightingColors2(colors2));
      lightingStatus.textContent = 'Second color applied';
    } catch (error) {
      lightingStatus.textContent = 'Could not change the second color';
      await syncLighting();
    }
  }, 100);
});

outputTargetButtons.forEach((button) => {
  button.addEventListener('click', async () => {
    const target = Number(button.dataset.target);
    if (target === lightingState.outputTarget) return;
    const previous = lightingState.outputTarget;
    renderLighting({ outputTarget: target });
    try {
      renderLighting(await window.pebble.setOutputTarget(target));
      lightingStatus.textContent = `Audio routed to ${button.textContent.toLowerCase()}`;
    } catch (error) {
      renderLighting({ outputTarget: previous });
      lightingStatus.textContent = 'Could not change speaker output';
    }
  });
});

lightingMatchColors.addEventListener('click', () => {
  if (!lightingState.colors.length) return;
  applyColors(lightingState.colors.map(() => lightingState.colors[0]));
});

lightingBrightness.addEventListener('pointerdown', () => { isAdjustingLighting = true; });
window.addEventListener('pointerup', () => { isAdjustingLighting = false; });
lightingBrightness.addEventListener('input', () => {
  const brightness = Number(lightingBrightness.value);
  renderLighting({ brightness });
  clearTimeout(brightnessTimer);
  brightnessTimer = setTimeout(async () => {
    try {
      await window.pebble.setLightingBrightness(brightness);
      lightingStatus.textContent = 'Lighting brightness updated';
    } catch (error) {
      lightingStatus.textContent = 'Could not change lighting brightness';
      await syncLighting();
    }
  }, 80);
});

// Microphone card: the Pebble X Plus capture endpoint, driven through the
// main process audio bridge.
const recordingCard = document.querySelector('#recordingCard');
const micControls = document.querySelector('#micControls');
const micName = document.querySelector('#micName');
const micStatus = document.querySelector('#micStatus');
const micMuteButton = document.querySelector('#micMuteButton');
const micVolume = document.querySelector('#micVolume');
const micVolumeValue = document.querySelector('#micVolumeValue');
const micFormat = document.querySelector('#micFormat');
const micDefaultButton = document.querySelector('#micDefaultButton');
const micDefaultHint = document.querySelector('#micDefaultHint');

let micState = { connected: false, volume: 100, muted: false, isDefault: false, formats: [], format: null };
let micVolumeTimer;
let isAdjustingMic = false;
let lastMicEdit = 0;

function renderMic(nextState) {
  micState = { ...micState, ...nextState };
  const connected = Boolean(micState.connected);
  recordingCard.hidden = !connected && !micState.everSeen;
  micControls.disabled = !connected;
  if (!connected) return;
  micName.textContent = micState.name || 'Microphone';
  micVolume.value = micState.volume;
  micVolume.style.setProperty('--volume', `${micState.volume}%`);
  micVolumeValue.textContent = micState.volume;
  micMuteButton.setAttribute('aria-pressed', String(micState.muted));
  micMuteButton.setAttribute('aria-label', micState.muted ? 'Unmute microphone' : 'Mute microphone');

  const formats = Array.isArray(micState.formats) ? micState.formats : [];
  const current = [...micFormat.options].map((option) => option.value).join();
  if (current !== formats.map((format) => format.key).join()) {
    micFormat.replaceChildren(...formats.map((format) => {
      const option = document.createElement('option');
      option.value = format.key;
      option.textContent = format.label;
      return option;
    }));
  }
  if (micState.format) {
    if (![...micFormat.options].some((option) => option.value === micState.format.key)) {
      const option = document.createElement('option');
      option.value = micState.format.key;
      option.textContent = micState.format.label;
      micFormat.prepend(option);
    }
    micFormat.value = micState.format.key;
  }
  micFormat.disabled = formats.length < 2;

  micDefaultButton.hidden = micState.isDefault;
  micDefaultHint.textContent = micState.isDefault ? 'Windows default microphone' : 'Not the Windows default';
}

async function syncMic() {
  try {
    const nextState = await window.pebble.getMicState();
    if (!isAdjustingMic && Date.now() - lastMicEdit > 1500) renderMic({ ...nextState, everSeen: micState.everSeen || nextState.connected });
    micStatus.textContent = nextState.connected ? (nextState.muted ? 'Muted' : 'Ready') : 'Connect the speaker by USB';
    micStatus.classList.remove('error');
  } catch (error) {
    console.error('Microphone sync failed:', error);
    renderMic({ connected: false });
    micStatus.textContent = 'Microphone control unavailable';
    micStatus.classList.add('error');
  }
}

micVolume.addEventListener('pointerdown', () => { isAdjustingMic = true; });
window.addEventListener('pointerup', () => { isAdjustingMic = false; });
micVolume.addEventListener('input', () => {
  const volume = Number(micVolume.value);
  lastMicEdit = Date.now();
  renderMic({ volume });
  clearTimeout(micVolumeTimer);
  micVolumeTimer = setTimeout(async () => {
    try {
      await window.pebble.setMicVolume(volume);
      micStatus.textContent = 'Level updated';
    } catch (error) {
      micStatus.textContent = 'Could not change microphone level';
      await syncMic();
    }
  }, 60);
});

micMuteButton.addEventListener('click', async () => {
  const muted = !micState.muted;
  renderMic({ muted });
  try {
    await window.pebble.setMicMuted(muted);
    micStatus.textContent = muted ? 'Muted' : 'Ready';
  } catch (error) {
    renderMic({ muted: !muted });
    micStatus.textContent = 'Could not change microphone mute';
  }
});

micFormat.addEventListener('change', async () => {
  const previous = micState.format;
  try {
    const format = await window.pebble.setMicFormat(micFormat.value);
    renderMic({ format });
    micStatus.textContent = `${format.label} applied`;
  } catch (error) {
    renderMic({ format: previous });
    micStatus.textContent = 'Could not change audio quality';
  }
});

micDefaultButton.addEventListener('click', async () => {
  try {
    await window.pebble.setMicDefault();
    renderMic({ isDefault: true });
    micStatus.textContent = 'Set as Windows default microphone';
  } catch (error) {
    micStatus.textContent = 'Could not set the default microphone';
  }
});

// Acoustic Engine card: Creative's driver effects, stored per output path.
const effectsCard = document.querySelector('#effectsCard');
const effectsStatus = document.querySelector('#effectsStatus');
const effectsMaster = document.querySelector('#effectsMaster');
const effectsTabs = document.querySelector('#effectsTabs');
const effectsGrid = document.querySelector('#effectsGrid');

let effectsState = { connected: false, output: 'speakers', master: false, effects: {} };
let effectsOutput = 'speakers';
const effectLevelTimers = new Map();
let lastEffectEdit = 0;

function buildEffectCard(id, effect) {
  const card = document.createElement('div');
  card.className = 'effect';
  card.dataset.effect = id;

  const head = document.createElement('div');
  head.className = 'effect-head';
  const title = document.createElement('strong');
  title.textContent = effect.label;
  const toggle = document.createElement('label');
  toggle.className = 'launch-setting';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('aria-label', `${effect.label} on or off`);
  input.addEventListener('change', () => applyEffect(id, { enabled: input.checked }));
  const knob = document.createElement('span');
  knob.className = 'toggle';
  knob.setAttribute('aria-hidden', 'true');
  toggle.append(input, knob);
  head.append(title, toggle);

  const level = document.createElement('label');
  level.className = 'effect-level';
  const levelText = document.createElement('span');
  levelText.append('Level ', Object.assign(document.createElement('strong'), { textContent: '--' }));
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.setAttribute('aria-label', `${effect.label} level`);
  slider.addEventListener('input', () => {
    const value = Number(slider.value);
    levelText.querySelector('strong').textContent = `${value}%`;
    slider.style.setProperty('--volume', `${value}%`);
    lastEffectEdit = Date.now();
    clearTimeout(effectLevelTimers.get(id));
    effectLevelTimers.set(id, setTimeout(() => applyEffect(id, { level: value }), 120));
  });
  level.append(levelText, slider);

  card.append(head, level);

  if (Array.isArray(effect.modes)) {
    const modes = document.createElement('div');
    modes.className = 'effect-modes';
    modes.setAttribute('role', 'group');
    modes.setAttribute('aria-label', `${effect.label} mode`);
    effect.modes.forEach((mode) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.mode = mode;
      button.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
      button.addEventListener('click', () => applyEffect(id, { mode }));
      modes.append(button);
    });
    card.append(modes);
  }

  const description = document.createElement('small');
  description.className = 'effect-description';
  description.textContent = effect.description;
  card.append(description);
  return card;
}

function renderEffects(nextState) {
  effectsState = { ...effectsState, ...nextState };
  const connected = Boolean(effectsState.connected);
  effectsCard.hidden = !connected && !effectsState.everSeen;
  effectsGrid.disabled = !connected;
  effectsMaster.disabled = !connected;
  effectsMaster.checked = connected && effectsState.master;
  [...effectsTabs.querySelectorAll('button')].forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.output === effectsOutput));
  });
  if (!connected) return;

  const entries = Object.entries(effectsState.effects || {});
  const existing = [...effectsGrid.querySelectorAll('.effect')].map((card) => card.dataset.effect);
  if (existing.join() !== entries.map(([id]) => id).join()) {
    effectsGrid.replaceChildren(...entries.map(([id, effect]) => buildEffectCard(id, effect)));
  }
  entries.forEach(([id, effect]) => {
    const card = effectsGrid.querySelector(`[data-effect="${id}"]`);
    card.classList.toggle('on', effect.enabled && effectsState.master);
    card.querySelector('input[type="checkbox"]').checked = effect.enabled;
    const slider = card.querySelector('input[type="range"]');
    if (effect.level !== null) {
      slider.value = effect.level;
      slider.style.setProperty('--volume', `${effect.level}%`);
      card.querySelector('.effect-level strong').textContent = `${effect.level}%`;
    }
    card.querySelectorAll('.effect-modes button').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.mode === effect.mode));
    });
  });
}

async function syncEffects() {
  try {
    const nextState = await window.pebble.getEffectsState(effectsOutput);
    if (Date.now() - lastEffectEdit > 1500) renderEffects({ ...nextState, everSeen: effectsState.everSeen || nextState.connected });
    effectsStatus.textContent = nextState.connected
      ? (nextState.master ? 'Effects active' : 'Effects bypassed')
      : 'Connect the speaker by USB';
    effectsStatus.classList.remove('error');
  } catch (error) {
    console.error('Effects sync failed:', error);
    renderEffects({ connected: false });
    effectsStatus.textContent = 'Acoustic Engine unavailable';
    effectsStatus.classList.add('error');
  }
}

async function applyEffect(id, changes) {
  lastEffectEdit = Date.now();
  try {
    renderEffects(await window.pebble.setEffect(id, changes, effectsOutput));
    const label = effectsState.effects[id]?.label || id;
    effectsStatus.textContent = changes.enabled !== undefined
      ? `${label} ${changes.enabled ? 'on' : 'off'}`
      : `${label} updated`;
  } catch (error) {
    effectsStatus.textContent = `Could not change ${id}`;
    await syncEffects();
  }
}

effectsMaster.addEventListener('change', async () => {
  const enabled = effectsMaster.checked;
  renderEffects({ master: enabled });
  try {
    renderEffects(await window.pebble.setEffectsMaster(enabled, effectsOutput));
    effectsStatus.textContent = enabled ? 'Effects active' : 'Effects bypassed';
  } catch (error) {
    renderEffects({ master: !enabled });
    effectsStatus.textContent = 'Could not change Acoustic Engine';
  }
});

effectsTabs.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button || button.dataset.output === effectsOutput) return;
  effectsOutput = button.dataset.output;
  lastEffectEdit = 0;
  await syncEffects();
});

// Device card: identity from the USB descriptor, the Creative driver version
// from Windows, and links to Creative's support pages.
const deviceCard = document.querySelector('#deviceCard');
const deviceModel = document.querySelector('#deviceModel');
const deviceSerial = document.querySelector('#deviceSerial');
const deviceFirmware = document.querySelector('#deviceFirmware');
const deviceDriver = document.querySelector('#deviceDriver');
const deviceUsb = document.querySelector('#deviceUsb');
const deviceLinks = document.querySelector('#deviceLinks');

function renderDeviceInfo(info) {
  deviceCard.hidden = !info.connected;
  if (!info.connected) return;
  deviceModel.textContent = info.model;
  deviceSerial.textContent = info.serial ? `Serial ${info.serial}` : '';
  deviceFirmware.replaceChildren(document.createTextNode(info.firmware));
  if (info.firmwareBuild) {
    const build = document.createElement('small');
    build.textContent = `Build ${info.firmwareBuild}`;
    deviceFirmware.append(build);
  }
  if (info.driver && info.driver.version) {
    deviceDriver.replaceChildren(document.createTextNode(info.driver.version));
    const detail = document.createElement('small');
    detail.textContent = [info.driver.provider, info.driver.date].filter(Boolean).join(', ');
    deviceDriver.append(detail);
  } else {
    deviceDriver.textContent = 'Not found';
  }
  deviceUsb.textContent = `${info.vendorId.toString(16).toUpperCase().padStart(4, '0')}:${info.productId.toString(16).toUpperCase().padStart(4, '0')}`;
  if (!deviceLinks.childElementCount) {
    deviceLinks.replaceChildren(...info.links.map((link) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'text-button';
      button.textContent = link.label;
      button.addEventListener('click', () => window.pebble.openLink(link.url).catch(() => {}));
      return button;
    }));
  }
}

async function syncDeviceInfo() {
  try {
    renderDeviceInfo(await window.pebble.getDeviceInfo());
  } catch (error) {
    console.error('Device info failed:', error);
    renderDeviceInfo({ connected: false });
  }
}

async function initialize() {
  await Promise.all([
    syncAudio(),
    syncLighting(),
    findDefaultOutput(),
    window.pebble.getLaunchAtLogin().then((enabled) => { launchToggle.checked = enabled; })
  ]);
  window.setInterval(syncAudio, 2500);
  window.setInterval(syncLighting, 5000);
  syncMic();
  window.setInterval(syncMic, 5000);
  syncEffects();
  window.setInterval(syncEffects, 5000);
  syncDeviceInfo();
  window.pebble.onAudioChanged(syncAudio);
  navigator.mediaDevices.addEventListener('devicechange', findDefaultOutput);
  window.pebble.onLightingPresence(async (connected) => {
    if (!connected) {
      renderLighting({ connected: false });
      renderDeviceInfo({ connected: false });
      lightingStatus.textContent = 'Speaker disconnected';
      return;
    }
    lightingStatus.textContent = 'Speaker connected';
    await syncLighting();
    await syncMic();
    await syncEffects();
    await syncDeviceInfo();
  });
}

initialize();
