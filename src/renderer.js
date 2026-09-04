const volumeSlider = document.querySelector('#volumeSlider');
const volumeValue = document.querySelector('#volumeValue');
const muteButton = document.querySelector('#muteButton');
const launchToggle = document.querySelector('#launchToggle');
const syncStatus = document.querySelector('#syncStatus');
const deviceStatus = document.querySelector('#deviceStatus');
const deviceName = document.querySelector('#deviceName');
const outputDetail = document.querySelector('#outputDetail');
const presets = [...document.querySelectorAll('.preset')];

let state = { volume: 50, muted: false };
let volumeTimer;
let isAdjusting = false;

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

async function initialize() {
  await Promise.all([
    syncAudio(),
    findDefaultOutput(),
    window.pebble.getLaunchAtLogin().then((enabled) => { launchToggle.checked = enabled; })
  ]);
  window.setInterval(syncAudio, 2500);
}

initialize();
