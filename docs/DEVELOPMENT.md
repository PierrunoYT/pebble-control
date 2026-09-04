# Development Guide

## Stack

- Electron for the Windows desktop shell
- Plain HTML, CSS, and JavaScript for the renderer
- [`loudness`](https://www.npmjs.com/package/loudness) for Windows master volume access
- [`node-hid`](https://www.npmjs.com/package/node-hid) for Pebble X Plus USB lighting and output control
- Windows PowerShell 5.1, bundled with Windows, for the Core Audio microphone bridge
- Node's built-in test runner for the unit tests
- `electron-builder` for the NSIS installer

## Project Layout

```text
Pebble Control/
|-- src/
|   |-- main.js       Electron main process and IPC handlers
|   |-- lighting.js   Restricted Pebble X Plus HID protocol implementation
|   |-- capture.js    Microphone control through the PowerShell audio bridge
|   |-- device-info.js  Device identity, driver version, and support links
|   |-- effects.js    Acoustic Engine control through the effects property store
|   |-- audio-bridge.ps1  Core Audio COM bridge run as a child process
|   |-- preload.js    Restricted renderer bridge
|   |-- index.html    Application markup
|   |-- styles.css    Responsive visual design
|   `-- renderer.js   UI state and interactions
|-- docs/
|   |-- USER_GUIDE.md
|   `-- DEVELOPMENT.md
|-- CHANGELOG.md
|-- package.json
`-- README.md
```

## Setup

Use a current Node.js LTS release and npm on Windows.

```powershell
npm install
npm start
```

The application is Windows-focused. The renderer can load on other platforms, but supported behavior and release packaging target Windows.

## Architecture

### Main Process

### Audio Bridge

Microphone control needs Windows Core Audio interfaces that the `loudness` package does not expose. `src/capture.js` starts `src/audio-bridge.ps1` as a long-lived PowerShell child and exchanges one JSON line per request. The script defines the COM interfaces in C# through `Add-Type` (`IMMDeviceEnumerator`, `IAudioEndpointVolume`, `IAudioClient`, and the undocumented `IPolicyConfig` used for the default device and the shared-mode format) with `[PreserveSig]` so HRESULTs are returned rather than thrown. Because PowerShell cannot open a script inside `app.asar`, the script is copied to the temp directory on first use. The first call takes about 300 ms while the types compile; later calls take a few milliseconds. Accepted formats are probed once per endpoint with `IsFormatSupported` in exclusive mode and cached.

### Acoustic Engine

Creative App configures its driver effects through Windows' `IAudioSystemEffectsPropertyStore`, activated on the render endpoint with a `VT_CLSID` activation parameter naming a context GUID, and then the per-user store opened with `STGM_READWRITE`. No elevation is needed and Creative's APO applies changes at once. `src/effects.js` does the same through the bridge's `effects-get` and `effects-set` operations. The contexts and property keys below were recovered from `Creative.Platform.Devices.dll` and verified against the live store, whose values matched Creative App's display.

| Item | GUID, ID | Type |
|------|----------|------|
| Speakers context | `852311bc-1afb-454e-92ca-c35252cacaaf` | activation parameter |
| Headphones context | `3f5f306b-a033-4f19-843d-1c44a736ff4d` | activation parameter |
| Master on/off | `3c14eccc-4a1f-47f7-91dd-bf45af920a4d`, 0 | bool |
| Surround enable, level | `5b4777a4-8ad4-4d34-893a-df34da0e56ca`, 0 and `a5a78ea4-c156-4db7-85aa-81cff1c3f192`, 0 | bool, float 0 to 1 |
| Crystalizer enable, level | `3cd83c04-868f-4f08-8d75-b4625ffe3b31`, 0 and `0f03f0bb-72c7-4ec1-8422-7b8d7410694a`, 0 | bool, float 0 to 1 |
| Bass enable, strength | `f67cf426-f8cb-4a40-bdac-580802e3e193`, 0 and `dd527e35-21a5-4ca6-ab90-8ad464fb55e3`, 0 | bool, float 0 to 100 |
| Smart Volume enable, level, mode | `9ad782d7-f46e-465c-8df5-3cda75424987`, 0; `80b0c7bb-0989-434e-af5b-fb9020f471b3`, 0; `e6ec3743-ddd2-4817-8466-b433761dcf9d`, 0 | bool, float 0 to 1, float 0 normal 1 loud 2 night |
| Dialog+ enable, level | `ea3137f9-be10-4eaa-8fce-a36988bca7dd`, 0 and `a79717e9-81cf-4272-adc6-d12b69b389a0`, 0 | bool, float 0 to 1 |

The graphic equalizer lives in the same store: enable `9a9d0cb2-4dc9-494c-8210-9848ae1aa629`, 0 (bool), preamp `ddcf8d90-de27-4de4-af57-088b8ad78fdf`, 0 (float dB), and gains `2b88c76d-d07c-4e97-8922-1bac9f6d5935`, 0 to 9 (float dB) for 31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, and 16000 Hz. Creative App's factory presets are JSON files under `%ProgramData%\Creative\CreativeApp\Product\MF0495\Presets\EQ`, each with Speaker and Headphone band lists; `src/effects.js` reads them when present and falls back to built-in curves. The bass crossover frequency is `3f23dbc5-12d1-4d62-89ed-bc458337e0fc` with ID 0 for external speakers and 2 for headphones, in Hz. Creative's sound modes are JSON files under `...\Product\MF0495\SoundMode`, each with Speaker and Headphone sections holding every effect's enable, level, and mode plus an equalizer preset reference by `Id`; `applySoundMode` writes them all and turns the master on, and `getState` reports which mode the live settings match.

`src/main.js` registers the global shortcuts Ctrl+Alt+Up, Ctrl+Alt+Down, and Ctrl+Alt+M through Electron's `globalShortcut` and releases them on quit. A registration that fails because another app holds the combination is logged and skipped.

`src/main.js` also owns the tray icon. Closing the window hides it; the tray menu is rebuilt from live mute and lighting state each time it opens, and its Quit item is what ends the process. The icon is `src/assets/tray.png`, generated by `npm run icon`.

`src/main.js` creates the application window and owns all operating-system access. It reads and writes the Windows master volume through `loudness`, delegates Pebble X Plus RGB access to `src/lighting.js`, and manages the launch-at-login setting through Electron.

`src/lighting.js` matches only USB device `041E:329A` on vendor usage page `FF01`. It serializes access, validates semantic values, correlates responses, and checks device acknowledgements. Raw HID reports and device paths are never accepted over IPC.

### Lighting Protocol Reference

Sources: live probing of a Pebble X Plus (firmware release 4720) and the decompiled `Creative.Platform.Devices.dll` and `Creative.App.Features.Lighting.dll` from Creative App, where the feature is called `LEDControlV2` and the transport is the "CDC raw" command set.

**Transport.** HID interface with usage page `FF01`, report ID `03`. Every report is `03 6a <command> <len lo> <len hi> <payload>`. Command `3a` (58) is `LEDControl`; command `02` is `Acknowledge` with payload `3a <status> <operation>`, status `00` for success and `83` for rejected. Queries are answered with a `3a` report whose payload starts with the same operation byte. After a mode or active-slot change the speaker also pushes unsolicited mode, colour, speed, and direction reports, so response matching must filter by operation code.

**Slots.** The speaker stores five lighting slots (indices 0 to 4), each holding an effect and its customizations. `getActiveIndex` reports the live slot and `setActiveIndex` switches it. Activating slot 0 is acknowledged but ignored: the speaker pushes the current slot's state and the active index does not change, so the app offers slots 1 to 4 only. Customization reads and writes are only accepted for the active slot; the same write to another slot is rejected with `83`.

**Operations** (first payload byte):

| Op | Name | Payload | Notes |
|----|------|---------|-------|
| `1f` | LEDControlSupport | - | Reply `01 06 00000000`: version 1, 6 presets, capability 0 |
| `20` | LEDInfoV2 | - | Reply `05 01 00 0400 00 0a`: max 5 colour groups; one LED region, logical index 0, position mask `0x0004`, start 0, 10 LEDs |
| `21` | SupportedModes | - | Reply `08 00` then mode list `0b 08 0a 09 04 01 03 07` |
| `22` | SupportedModeCustomization | `<mode>` | Reply `<mode> <count>` then records `<type> <len> <params>` |
| `25` / `26` | Enable set / get | `<0|1>` | LED power |
| `27` / `28` | Brightness set / get | `<0-255>` | |
| `29` / `2a` | Mode set / get | `<slot> [<mode>]` | Works on any slot |
| `2b` / `2c` | Customization set / get | `<slot> <type> [<value>]` | Active slot only |
| `2d` / `2e` | ActiveIndex set / get | `[<slot>]` | |
| `2f` | ToggleActiveIndex | - | No reply on Pebble X Plus |
| `30` | CopyProfile | `<src> <dst>` | Defined by Creative App; untested |
| `31`-`35` | Profile name and UUID | | No reply on Pebble X Plus |
| `36` | ResetProfile | `<slot>` | No reply on Pebble X Plus |
| `37` / `38` | GroupCount set / get | `<slot>` | No reply on Pebble X Plus |

**Modes.** `01` Cycle, `03` Static, `04` Wave, `07` Morph, `08` Aurora, `09` Glowing, `0a` Peak Meter, `0b` Chasers. Creative's enum also defines `02` Spectrum Analyzer, `05` Pulsate, and `06` Blink, which this speaker does not list.

**Customization types** (`<type>` byte): `1` Colour, `2` Colour2, `3` Speed, `4` Direction, `5` Gradient, `7` LeftRight, `8` TransientColour, `9` BeatReaction. The Pebble X Plus reports only types 1 to 4.

| Mode | Colour | Colour2 | Speed | Direction mask |
|------|--------|---------|-------|----------------|
| Cycle | - | - | yes | - |
| Static | 5 groups | - | - | - |
| Wave | 5 groups | - | yes | `07` |
| Morph | 1 | 1 | yes | - |
| Aurora | - | - | yes | - |
| Glowing | 5 groups | - | yes | - |
| Peak Meter | 5 groups | - | - | `02` |
| Chasers | 1 | - | yes | `05` |

**Colour value** (types 1 and 2): `<starting group id>` followed by one 32-bit little-endian word per group. The word is `R<<24 | G<<16 | B<<8 | A`, so the bytes on the wire are `A B G R`; alpha is always `ff`. The starting group ID is `1` in every reply and the speaker accepts `0` to `2` on writes. The group count is fixed per mode: a write with any other number of colours is rejected. The five groups of Static, Wave, Glowing, and Peak Meter render as one gradient shown identically on both speakers. The capability record for Colour is `08 08 08 08`, the bit depth of each channel.

**Speed** (type 3): 16-bit little-endian milliseconds. The capability record is `02 7017 fa00 0100` (data type 2, max 6000, min 250, step 1), but the firmware only accepts the seven Creative App presets: 6000 Slowest, 4000 Slower, 2500 Slow, 1333 Normal, 750 Fast, 375 Faster, 250 Fastest. Any other value is rejected.

**Direction** (type 4): two bytes `<direction> <bouncing>`. Directions are `1` left to right, `2` right to left, `3` top to bottom, `4` bottom to top; bouncing is `0` looping or `1` bouncing. The capability mask has bit 0 for left/right support, bit 1 for up/down, bit 2 for bouncing, so Wave offers all six combinations, Chasers left/right with bouncing, and Peak Meter up/down only. With bouncing enabled the firmware ignores the direction byte and reports the mode's default direction.

**Other commands the speaker answers.** Creative App enables four device features for this product: the `6a` transport, `LEDControlV2`, `MultiplexOutput`, and a hidden firmware update on a second HID collection (usage page `FF99`, report ID `3d`). Probing every other command in Creative's set confirmed that only these reply:

| Command | Name | Payload | Notes |
|---------|------|---------|-------|
| `03` | MaxPayloadSize | - | Reply `3f 00`: 63 bytes |
| `09` | DeviceInformationV2 | `00` general, `01 <index>` firmware | General: 17-byte reply, bytes 4 to 6 read `02 1e 04`. Firmware: `01 <index> <build u32> <mcu> <format>`, build `2dd189c0` with format `04` on this unit. Operations `02` (version string) and `03` (serial string) get no reply. The USB release number `0x1270` is the "1.27" Creative App shows; its longer suffix comes from the Qualcomm HID DFU interface on usage page `FF99`. |
| `2c` | SpeakerOutputTargetSelectionControl | `00 <mask u32>` set, `01` get, `02` support | Mask `2` PowerAmplifierOut (speakers), `4` Headphone. Support reply lists both. Switching to `4` routes audio to the headphone jack; unsupported masks are rejected with `81`. |
| `3a` | LEDControl | see above | |

Audio level, mute, EQ, speaker configuration, subwoofer, sound mode, and feature control get no reply. Creative App's Acoustic Engine, 10-band equalizer, and sound modes for this speaker are host-side processing in the Creative USB audio driver, not speaker commands. They are configured through the Windows effects property store instead; see the Acoustic Engine section.

**Beat reaction** (type 9, not on this speaker): `<version> <mode> <idle brightness> <beat brightness> <cooldown ms u16>`.

The window uses `contextIsolation`, disables renderer Node.js integration, and runs the renderer in a sandbox.

### Preload Bridge

`src/preload.js` exposes a small API as `window.pebble`. The renderer cannot import Node.js modules or call arbitrary IPC channels.

| Method | Result | Purpose |
| --- | --- | --- |
| `getAudioState()` | `{ volume, muted }` | Read the current system audio state |
| `setVolume(volume)` | `number` | Set and return a clamped integer from 0 to 100 |
| `setMuted(muted)` | `boolean` | Set the system mute state |
| `getLaunchAtLogin()` | `boolean` | Read the startup preference |
| `setLaunchAtLogin(enabled)` | `boolean` | Update and return the startup preference |
| `getLightingState()` | lighting state object | Read Pebble X Plus connection, power, brightness, mode, the active effect's colors, speed, and direction, the per-mode capability records, and the current and supported output targets |
| `setLightingEnabled(enabled)` | `boolean` | Enable or disable the RGB LEDs |
| `setLightingBrightness(value)` | `number` | Set hardware brightness from 0 to 255 |
| `setLightingMode(mode)` | `{ mode, colors, color, speed, direction, directionSupport }` | Select a validated, device-supported effect and return its color list, speed, and direction |
| `setLightingColor(color)` | `{ color, colors, mode }` | Switch to Static and fill every gradient stop with one `#RRGGBB` color |
| `setLightingColors(colors)` | `{ colors, mode }` | Replace the active effect's color list; the length must match what the effect holds |
| `setLightingColors2(colors)` | `{ colors2, mode }` | Replace Morph's second color list (customization type 2) |
| `setLightingSpeed(speed)` | `{ speed, mode }` | Set the active effect's speed to one of the seven firmware presets in milliseconds |
| `setLightingDirection({ direction, bouncing })` | `{ direction, directionSupport, mode }` | Set the active effect's direction (1 to 4) and bounce flag, validated against the effect's capability record |
| `setLightingSlot(index)` | full lighting state | Make slot 1 to 4 active and return the state of that slot |
| `setOutputTarget(target)` | `{ outputTarget, outputTargets }` | Route audio to the speakers (`2`) or the headphone jack (`4`) |
| `getDeviceInfo()` | device info object | Model, serial, firmware (from the USB release number), firmware build word, Creative audio driver version, and support links |
| `openLink(url)` | - | Open one of the fixed Creative support links in the browser; any other URL is refused |
| `getEffectsState(output)` | effects state object | Read the Acoustic Engine master switch and each effect's enabled flag, level (0 to 100), and mode for `speakers` or `headphones` |
| `setEffect(id, changes, output)` | effects state object | Apply `enabled`, `level`, or `mode` to one effect; enabling also turns the master on |
| `setEffectsMaster(enabled, output)` | effects state object | Turn Acoustic Engine processing on or off |
| `applySoundMode(id, output)` | `{ effects, eq }` | Apply one of Creative's sound modes: every effect, the equalizer preset, and the master |
| `getEqState(output)` | equalizer state object | Read the equalizer's enabled flag, preamp, ten band gains in dB, the matching preset, and the preset list |
| `setEq(changes, output)` | equalizer state object | Apply `enabled`, `preamp`, `gains` (ten dB values), or `preset` (an id from the list) |
| `getMicState()` | microphone state object | Read the Pebble capture endpoint's name, level, mute, default status, current format, and accepted formats |
| `setMicVolume(volume)` | `number` | Set the capture level from 0 to 100 |
| `setMicMuted(muted)` | `boolean` | Mute or unmute the capture endpoint |
| `setMicDefault()` | `true` | Make the Pebble the Windows default microphone for all roles |
| `setMicFormat(key)` | format object | Set the shared-mode format from the accepted list |
| `onLightingPresence(callback)` | - | Subscribe to speaker attach and detach events; the main process polls HID presence once a second |
| `onAudioChanged(callback)` | - | Fired after a global shortcut changes volume or mute, so the display refreshes without waiting for the poll |

### Renderer

The lighting panel is capability driven: the effect list is built from the modes the speaker reports, and the colour, speed, and direction controls follow the capability record of the active effect rather than a hardcoded table. Capability records are read once per connection and cached in `src/lighting.js`.

`src/renderer.js` maintains the displayed volume and mute state. It polls the operating system every 2.5 seconds so external volume changes are reflected in the interface. Slider writes are briefly debounced to avoid launching excessive system volume operations.

The renderer uses `navigator.mediaDevices.enumerateDevices()` only to display an output label and to warn when that label does not name a Pebble. It re-checks on the `devicechange` event. Audio control does not depend on device enumeration.

## Commands

| Command | Description |
| --- | --- |
| `npm start` | Run the app in Electron |
| `npm run check` | Check JavaScript syntax |
| `npm run dist` | Build the x64 Windows NSIS installer |

## Verification

Before a release:

1. Run `npm run check` and `npm test`. The tests in `test/` run the lighting module against a scripted fake speaker (`test/fake-hid.js`) and cover report framing, colour decoding, rejection handling, capability parsing, slots, and the output target, plus the microphone device selection and format labels, so protocol changes can be checked without hardware.
2. Run `npm start` and test volume, mute, every preset, and launch at startup.
3. With a Pebble X Plus on USB: switch slots and effects, edit colours, speed, and direction, toggle lighting power, switch between Speakers and Headphones, and change the microphone level and mute. Confirm the Device panel shows firmware 1.27 or newer, the Creative driver version, and that each support link opens in the browser. In the Acoustic Engine panel, enable an effect and confirm Processing turns on, move its level, switch Smart Volume's mode, then open Creative App's Acoustic Engine page and confirm it shows the same values; restore the original settings afterwards.
4. Unplug and reconnect the USB cable; the lighting and microphone panels should disable and re-enable within a second or two.
5. Close the window and confirm the tray icon remains, its menu reflects mute and lighting state, and Quit exits.
6. Press Ctrl+Alt+Up, Ctrl+Alt+Down, and Ctrl+Alt+M with the window hidden and confirm the volume display has caught up when it is shown again.
7. Change volume outside the app and confirm that the UI refreshes.
8. Switch the Windows default output to a non-Pebble device and confirm the amber warning, then switch back.
9. Run `npm run dist`.
10. Launch `dist/win-unpacked/Pebble Control.exe` and repeat the audio, RGB, microphone, and Device panel checks; the microphone bridge and the driver lookup both run PowerShell from the packaged app.
11. Install with the generated setup executable and verify the Start menu and uninstall entries.

## Release Process

1. Update `version` in `package.json` and `package-lock.json`.
2. Move pending entries in `CHANGELOG.md` into a dated release section.
3. Complete the verification checklist.
4. Run `npm run dist`.
5. Tag the commit (`git tag v<version>` and `git push --tags`) and attach `dist/Pebble Control Setup <version>.exe` to a GitHub release. The `dist/` folder is ignored by git, so the installer only reaches users through releases.

Code signing is not configured. Publicly distributed installers should be signed with a trusted Windows code-signing certificate.

## Design Constraints

- Do not describe presets as EQ profiles; they only set volume.
- Limit direct hardware claims to what has been verified on the Pebble X Plus: lighting, the output target, and the Windows microphone endpoint. The speaker accepts no volume, mute, EQ, or subwoofer commands over USB.
- Keep operating-system access in the main process. The renderer never sees device paths, raw HID reports, or the audio bridge.
- Validate all values received through IPC, and validate again against what the device reports supported before writing to it.
- Read the speaker's capability records rather than hardcoding per-effect behaviour.
- Restore any device state a probe or test changes; the speaker persists slots, colours, and formats across power cycles.
- Preserve keyboard access, focus visibility, and reduced-motion behavior when changing the interface.
