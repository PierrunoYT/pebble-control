const volumeSlider = document.querySelector('#volumeSlider');
const volumeValue = document.querySelector('#volumeValue');
const muteButton = document.querySelector('#muteButton');
const launchToggle = document.querySelector('#launchToggle');
const syncStatus = document.querySelector('#syncStatus');
const deviceStatus = document.querySelector('#deviceStatus');
const deviceName = document.querySelector('#deviceName');
const outputDetail = document.querySelector('#outputDetail');
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
const lightingColors = document.querySelector('#lightingColors');
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
let lightingState = { connected: false, enabled: false, brightness: 255, mode: 11, color: '#ffffff', colors: [] };
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
  lightingMode.value = String(lightingState.mode);
  const hasSpeed = Number.isInteger(lightingState.speed);
  lightingSpeedField.classList.toggle('unsupported', !hasSpeed);
  lightingSpeed.disabled = !hasSpeed;
  lightingSpeed.setAttribute('aria-disabled', String(!hasSpeed));
  if (hasSpeed) lightingSpeed.value = String(lightingState.speed);
  renderDirection();
  renderColorStops(Array.isArray(lightingState.colors) ? lightingState.colors : []);
  renderOutputTarget(connected);
  lightingBrightness.value = lightingState.brightness;
  lightingBrightness.style.setProperty('--volume', `${(lightingState.brightness / 255) * 100}%`);
  lightingBrightnessValue.textContent = lightingState.brightness;

  if (Array.isArray(lightingState.supportedModes)) {
    [...lightingMode.options].forEach((option) => {
      option.disabled = !lightingState.supportedModes.includes(Number(option.value));
    });
  }
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

function renderColorStops(colors) {
  const wells = [...lightingColors.querySelectorAll('input')];
  if (wells.length !== colors.length) {
    lightingColors.replaceChildren(...colors.map((color, index) => {
      const well = document.createElement('label');
      well.className = 'color-well';
      const input = document.createElement('input');
      input.type = 'color';
      input.value = color;
      input.dataset.index = String(index);
      input.setAttribute('aria-label', colors.length > 1 ? `Gradient stop ${index + 1}` : 'Effect color');
      well.append(input);
      return well;
    }));
  } else {
    wells.forEach((input, index) => { input.value = colors[index]; });
  }

  lightingColors.classList.toggle('single', colors.length === 1);
  lightingMatchColors.hidden = colors.length < 2;
  if (colors.length > 1) {
    lightingColorsTitle.textContent = 'Gradient';
    lightingColorsHint.textContent = `${colors.length} stops blend across both speakers`;
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

async function findDefaultOutput() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const output = devices.find((device) => device.kind === 'audiooutput' && device.deviceId === 'default')
      || devices.find((device) => device.kind === 'audiooutput');
    if (!output?.label) return;
    const label = output.label.replace(/^Default\s*-\s*/i, '');
    deviceName.textContent = label;
    outputDetail.textContent = label;
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
  renderLighting({ mode });
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

async function initialize() {
  await Promise.all([
    syncAudio(),
    syncLighting(),
    findDefaultOutput(),
    window.pebble.getLaunchAtLogin().then((enabled) => { launchToggle.checked = enabled; })
  ]);
  window.setInterval(syncAudio, 2500);
  window.setInterval(syncLighting, 5000);
}

initialize();
