# Pebble Control

A lightweight Windows desktop companion for Creative Pebble speakers. Pebble Control adjusts the Windows default audio endpoint, so it works whether the speakers are connected through USB audio, Bluetooth, or a 3.5 mm output.

> Pebble Control is an independent project and is not affiliated with or endorsed by Creative Technology Ltd.

## Features

- Master volume and mute control
- Late night, everyday, and immersive volume presets
- Active Windows audio output label
- Optional launch at login
- Responsive desktop interface

## Requirements

- Windows 10 or Windows 11
- A Creative Pebble speaker connected and selected as the Windows output device
- Node.js and npm only when running from source

## Install

Run `dist/Pebble Control Setup 1.0.0.exe`, then open Pebble Control from the Start menu.

For usage instructions and troubleshooting, see the [User Guide](docs/USER_GUIDE.md).

## Development

```powershell
npm install
npm start
```

Validate the JavaScript sources:

```powershell
npm run check
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

Creative Pebble speakers do not expose a public control protocol for hardware EQ, lighting, power, or the physical volume knob. Pebble Control changes the Windows output routed to the speakers; it cannot change unsupported hardware settings.
