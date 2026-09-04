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
- Ten-band equalizer with presets, and Creative's sound modes applied in one step
- Instant response to the speaker being plugged in or removed

## Requirements

- Windows 10 or Windows 11
- A Creative Pebble speaker connected and selected as the Windows output device
- A Creative Pebble X Plus connected by USB for the lighting, output, microphone, and device panels
- [Creative App](https://support.creative.com/) installed for the Acoustic Engine and equalizer panels
- Node.js and npm only when running from source

### Dependency on Creative App

Pebble Control does not replace Creative App; part of it builds on Creative's software.

- The Acoustic Engine effects and the equalizer are processing inside Creative's USB audio driver. Pebble Control only changes their settings, so without that driver those panels stay empty and the sound is unprocessed. The driver comes with Creative App, and the panels also read Creative App's factory equalizer presets from its data folder.
- Windows audio, RGB lighting, the speaker or headphone switch, the microphone panel, and the device panel talk to Windows and to the speaker directly and work without Creative App.
- Firmware updates, driver updates, and the factory reset remain Creative App features.

Both apps write the same settings, so changes made in one show up in the other.

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

The Pebble X Plus does not accept volume, mute, EQ, or subwoofer commands over USB, so those stay with Windows. Creative App's Acoustic Engine effects run in Creative's audio driver; Pebble Control configures them through the Windows effects property store, so the driver must be installed. Creative's sound modes and equalizer presets are read from Creative App's data folder, so they appear only when Creative App is installed. Both speakers always show the same lighting; the hardware has no per-speaker colors. Speaker power, gain mode, and the physical volume knob remain outside the app's control.
