# Development Guide

## Stack

- Electron for the Windows desktop shell
- Plain HTML, CSS, and JavaScript for the renderer
- [`loudness`](https://www.npmjs.com/package/loudness) for Windows master volume access
- `electron-builder` for the NSIS installer

## Project Layout

```text
Pebble Control/
|-- src/
|   |-- main.js       Electron main process and IPC handlers
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

`src/main.js` creates the application window and owns all operating-system access. It reads and writes the Windows master volume through `loudness` and manages the launch-at-login setting through Electron.

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

### Renderer

`src/renderer.js` maintains the displayed volume and mute state. It polls the operating system every 2.5 seconds so external volume changes are reflected in the interface. Slider writes are briefly debounced to avoid launching excessive system volume operations.

The renderer uses `navigator.mediaDevices.enumerateDevices()` only to display an output label. Audio control does not depend on device enumeration.

## Commands

| Command | Description |
| --- | --- |
| `npm start` | Run the app in Electron |
| `npm run check` | Check JavaScript syntax |
| `npm run dist` | Build the x64 Windows NSIS installer |

## Verification

Before a release:

1. Run `npm run check`.
2. Run `npm start` and test volume, mute, every preset, and launch at startup.
3. Change volume outside the app and confirm that the UI refreshes.
4. Switch the Windows default output and confirm that controls target the new endpoint.
5. Run `npm run dist`.
6. Launch `dist/win-unpacked/Pebble Control.exe` and repeat the audio checks.
7. Install with the generated setup executable and verify the Start menu and uninstall entries.

## Release Process

1. Update `version` in `package.json` and `package-lock.json`.
2. Move pending entries in `CHANGELOG.md` into a dated release section.
3. Complete the verification checklist.
4. Run `npm run dist`.
5. Distribute the installer from `dist/`.

Code signing is not configured. Publicly distributed installers should be signed with a trusted Windows code-signing certificate.

## Design Constraints

- Do not describe presets as EQ profiles; they only set volume.
- Do not imply direct control of Pebble firmware or physical controls.
- Keep operating-system access in the main process.
- Validate all values received through IPC.
- Preserve keyboard access, focus visibility, and reduced-motion behavior when changing the interface.
