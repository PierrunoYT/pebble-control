# User Guide

## What Pebble Control Does

Pebble Control provides a compact control surface for the current Windows default audio output. When a Creative Pebble is selected as that output, changes made in the app affect sound played through the speakers.

The app controls Windows audio, not the speaker firmware. The physical volume knob, power state, hardware gain mode, lighting, and equalizer settings are outside the app's control.

## Installation

1. Open `Pebble Control Setup 1.0.0.exe`.
2. Choose an installation directory when prompted.
3. Complete the installation and launch Pebble Control from the Start menu.

Windows may show a reputation warning for an unsigned build. Review the publisher information and only continue if the installer came from a source you trust.

## Connect Your Speakers

1. Connect the Creative Pebble using USB audio, Bluetooth, or the computer's 3.5 mm audio output.
2. Open **Settings > System > Sound** in Windows.
3. Select the Pebble, Bluetooth connection, or sound-card output connected to the speakers.
4. Open Pebble Control.

The selected endpoint appears at the top of the app. If Windows does not provide its name, the app displays **Windows default output**.

## Controls

### Volume

Drag the volume slider to set the Windows master output between 0% and 100%. Moving the slider while audio is muted also unmutes it.

Changes made with keyboard media keys, the Windows volume flyout, or another application are reflected in Pebble Control automatically.

### Mute

Select the speaker button in the Volume panel to mute or unmute the current Windows output.

### Listening Presets

Presets are fixed volume shortcuts. Selecting one also unmutes the output.

| Preset | Volume | Suggested use |
| --- | ---: | --- |
| Late night | 18% | Quiet listening |
| Everyday | 48% | General desktop use |
| Immersive | 72% | Games and films |

Presets do not apply equalization or change the sound profile.

### Launch at Startup

Enable **Launch at startup** to open Pebble Control when you sign in to Windows. Disable it at any time from the same switch.

## Troubleshooting

### The Wrong Device Is Being Controlled

Pebble Control always controls the current Windows default output. Select the intended device under **Settings > System > Sound > Output**, then wait a few seconds for the app to refresh.

### The Device Name Is Missing

The audio controls still work when **Windows default output** is shown. Windows or Electron may withhold device labels in some configurations.

### Volume Does Not Change

1. Confirm that Windows can play audio through the selected output.
2. Confirm that the physical Pebble power and volume controls are on.
3. Close and reopen Pebble Control after switching devices.
4. Restart the Windows Audio service or reboot Windows if the system volume control itself is unresponsive.

### Bluetooth Audio Is Delayed

Bluetooth latency is determined by the Bluetooth connection and audio codec. Pebble Control cannot remove transport latency. Use USB audio or a wired 3.5 mm connection when low latency is important.

### Startup Launch Does Not Work

Check **Settings > Apps > Startup** and ensure Pebble Control is enabled. Corporate device policies may prevent applications from adding themselves to startup.

## Uninstall

Open **Settings > Apps > Installed apps**, find **Pebble Control**, and select **Uninstall**.
