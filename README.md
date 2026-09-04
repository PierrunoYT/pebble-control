# Pebble Control

A lightweight Windows desktop companion for Creative Pebble speakers. Pebble Control adjusts the Windows default audio endpoint, so it works whether the speakers are connected through USB audio, Bluetooth, or a 3.5 mm output.

> Pebble Control is an independent project and is not affiliated with or endorsed by Creative Technology Ltd.

## Features

- Master volume and mute control
- Late night, everyday, and immersive volume presets
- Active Windows audio output label with a warning when it is not a Pebble
- Optional launch at login
- Tray icon with mute and lighting shortcuts; closing the window keeps it running
- Global keyboard shortcuts for volume and mute
- Pebble X Plus RGB power, brightness, effect, speed, direction, and gradient color control over USB
- Pebble X Plus speaker or headphone output switch over USB
- Responsive desktop interface

## Requirements

- Windows 10 or Windows 11
- A Creative Pebble speaker connected and selected as the Windows output device
- A Creative Pebble X Plus connected by USB for RGB controls
- Node.js and npm only when running from source

## Install

Run `dist/Pebble Control Setup 1.0.0.exe`, then open Pebble Control from the Start menu.

For usage instructions and troubleshooting, see the [User Guide](docs/USER_GUIDE.md).

## Development

```powershell
npm install
npm start
```

Validate the JavaScript sources and run the tests:

```powershell
npm run check
npm test
```

Build a Windows installer:

```powershell
npm run dist
```

Build output is written to `dist/`. See the [Development Guide](docs/DEVELOPMENT.md) for the architecture, IPC API, and release process.

## Documentation

- [User Guide](docs/USER_GUIDE.md)
- [Development Guide](docs/DEVELOPMENT.md)
- [Changelog](CHANGELOG.md)

## Limitations

Windows audio controls work with any output routed to Creative Pebble speakers. Direct RGB control is limited to the Creative Pebble X Plus with USB VID/PID `041E:329A`; other Pebble models are not sent hardware commands. Hardware EQ, speaker power, gain mode, and the physical volume knob remain outside the app's control.
