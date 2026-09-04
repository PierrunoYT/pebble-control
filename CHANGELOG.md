# Changelog

All notable changes to Pebble Control are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- Direct Creative Pebble X Plus RGB power, brightness, effect, and color controls, including the five-stop gradient used by Static, Glowing, Wave, and Peak Meter.
- Effect speed selector with the seven firmware presets from Slowest to Fastest.
- Effect direction selector for Wave, Chasers, and Peak Meter, built from each effect's capability record.
- Second color well for Morph's fade target.
- Effect list and per-effect controls are built from the speaker's own mode list and capability records.
- Slot picker for the speaker's four selectable stored lighting setups.
- Speaker or headphone output switch for the Pebble X Plus over USB.
- Device-scoped HID transport with response validation and a restricted Electron IPC bridge.

## 1.0.0 - 2026-09-04

### Added

- Windows master volume control with live percentage feedback.
- System mute and unmute control.
- Late night, everyday, and immersive volume presets.
- Automatic synchronization with external Windows volume changes.
- Active Windows output label with a generic fallback.
- Optional launch at login.
- Responsive, keyboard-accessible Pebble-inspired interface.
- Secure Electron preload bridge with context isolation and renderer sandboxing.
- Configurable NSIS Windows installer build.
- User and developer documentation.
