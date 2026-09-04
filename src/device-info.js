// Device card data: the speaker's identity from the HID descriptor and the
// Creative audio driver version that Windows holds for its audio interface.

const { execFile } = require('node:child_process');
const lighting = require('./lighting');

const SUPPORT_LINKS = Object.freeze([
  { label: 'Product support', url: 'https://support.creative.com/' },
  { label: 'Downloads and firmware', url: 'https://support.creative.com/downloads/' },
  { label: 'Pebble X Plus product page', url: 'https://us.creative.com/p/speakers/creative-pebble-x-plus' }
]);

// The audio interface is MI_01 of the composite USB device; MI_00 is HID.
const DRIVER_QUERY = `
$device = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -match 'VID_041E&PID_329A&MI_01' } | Select-Object -First 1
if ($device) {
  $prop = { param($key) (Get-PnpDeviceProperty -InstanceId $device.InstanceId -KeyName $key -ErrorAction SilentlyContinue).Data }
  @{ version = & $prop 'DEVPKEY_Device_DriverVersion'; date = [string](& $prop 'DEVPKEY_Device_DriverDate'); provider = & $prop 'DEVPKEY_Device_DriverProvider' } | ConvertTo-Json -Compress
}`;

let driverCache = null;

function readDriver() {
  if (driverCache) return Promise.resolve(driverCache);
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', DRIVER_QUERY], { windowsHide: true, timeout: 15000 }, (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve(null);
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        driverCache = {
          version: parsed.version || '',
          provider: parsed.provider || '',
          date: parsed.date ? new Date(parsed.date).toISOString().slice(0, 10) : ''
        };
        resolve(driverCache);
      } catch (parseError) {
        resolve(null);
      }
    });
  });
}

async function getInfo() {
  const identity = await lighting.getIdentity();
  if (!identity.connected) {
    driverCache = null;
    return { connected: false };
  }
  return { ...identity, driver: await readDriver(), links: SUPPORT_LINKS };
}

function isAllowedLink(url) {
  return SUPPORT_LINKS.some((link) => link.url === url);
}

module.exports = { getInfo, isAllowedLink, SUPPORT_LINKS };
