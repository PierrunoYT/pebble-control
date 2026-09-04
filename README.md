# Pebble Control

A lightweight Windows desktop companion for Creative Pebble speakers. Pebble Control adjusts the Windows default audio endpoint, so it works whether the speakers are connected through USB audio, Bluetooth, or a 3.5 mm output.

> Pebble Control is an independent project and is not affiliated with or endorsed by Creative Technology Ltd.

## Features

- Master volume and mute control
- Late night, everyday, and immersive volume presets
- Active Windows audio output label with a warning when it is not a Pebble
- Global keyboard shortcuts for volume and mute
- Tray icon with mute, lighting power, and quit; closing the window keeps the app running
- Optional launch at login
- Responsive desktop interface

With a Creative Pebble X Plus connected by USB:

- RGB power, brightness, and effect selection
- Five-stop gradient colors, Morph's two fade colors, effect speed, and direction
- The speaker's four stored lighting slots
- Speaker or headphone output switch
- Microphone level, mute, audio quality, and set as Windows default
- Device details: firmware, serial, driver version, and Creative support links
- Acoustic Engine effects: Surround, Crystalizer, Bass, Smart Volume, and Dialog+ for speakers and headphones
- Instant response to the speaker being plugged in or removed

## Requirements

- Windows 10 or Windows 11
- A Creative Pebble speaker connected and selected as the Windows output device
- A Creative Pebble X Plus connected by USB for RGB controls
- Node.js and npm only when running from source

## Install

Build the installer from source (see Development below), then run `dist/Pebble Control Setup <version>.exe` and open Pebble Control from the Start menu. Prebuilt installers will be attached to [GitHub releases](https://github.com/PierrunoYT/pebble-control/releases) once the first release is published.

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
- [Development Guide](docs/DEVELOPMENT.md), including the reverse-engineered lighting protocol reference
- [Tasks](docs/TASKS.md)
- [Changelog](CHANGELOG.md)

## Limitations

Windows audio controls work with any output routed to Creative Pebble speakers. Direct hardware control is limited to the Creative Pebble X Plus with USB VID/PID `041E:329A`; other Pebble models are not sent hardware commands.

The Pebble X Plus does not accept volume, mute, EQ, or subwoofer commands over USB, so those stay with Windows. Creative App's Acoustic Engine effects run in Creative's audio driver; Pebble Control configures them through the Windows effects property store, so the driver must be installed. Creative's graphic equalizer and sound mode presets are not exposed yet. Both speakers always show the same lighting; the hardware has no per-speaker colors. Speaker power, gain mode, and the physical volume knob remain outside the app's control.
