# User Guide

## What Pebble Control Does

Pebble Control provides a compact control surface for the current Windows default audio output. When a Creative Pebble is selected as that output, changes made in the app affect sound played through the speakers.

The app controls Windows audio on all Pebble models. When a Creative Pebble X Plus is connected by USB, it can also control the speaker's RGB lighting. The physical volume knob, speaker power, hardware gain mode, and equalizer settings remain outside the app's control.

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

### Speaker Output

When a Creative Pebble X Plus is connected by USB, a **Speaker output** switch appears in the bottom bar. Choose **Speakers** to play through the satellites or **Headphones** to route audio to the headphone jack on the right speaker. The switch is hidden for other connections.

### Tray Icon

Pebble Control keeps a green pebble icon in the notification area. Closing the window hides it there instead of quitting. Click the icon to bring the window back, or right-click it for a menu with Mute or Unmute, Lighting on or off, and Quit. Quit is the only way to exit the app.

### Launch at Startup

Enable **Launch at startup** to open Pebble Control when you sign in to Windows. Disable it at any time from the same switch.

### Pebble X Plus Lighting

Connect the Creative Pebble X Plus directly by USB. The Ambient lighting panel becomes available within about a second of the speaker appearing, and disables itself as soon as the speaker is unplugged.

- Use **Lighting** to turn the RGB LEDs on or off.
- Pick one of the four **slots**. Each slot stores its own effect, colors, speed, and direction, and the speaker shows whichever slot is active. All controls below edit the active slot.
- Select Chasers, Aurora, Peak Meter, Glowing, Wave, Cycle, Static, or Morph from **Effect**.
- Choose a **Speed** from Slowest to Fastest for Cycle, Wave, Morph, Aurora, Glowing, and Chasers. The control is dimmed for Static and Peak Meter, which have no speed.
- Choose a **Direction** for Wave, Chasers, and Peak Meter. The options follow what the effect supports: left or right, top or bottom, and Bounce, which runs back and forth. The control is dimmed for other effects.
- Drag **Brightness** to set the hardware brightness from 0 to 255.
- Pick the effect's colors from the color wells. Static, Glowing, Wave, and Peak Meter use a five-stop gradient that blends across both speakers; Morph and Chasers use one color; Cycle and Aurora have no adjustable colors.
- Use **Use one color for all stops** to turn a gradient into a single flat color, then adjust any stop to bring the gradient back.
- Morph shows two wells: the color it starts from and the color it fades to.

Both speakers always show the same lighting. The Pebble X Plus does not support different colors on the left and right speaker.

RGB control is specific to Pebble X Plus USB device `041E:329A`. It does not send lighting commands to other Pebble models, and it is unavailable over an audio-only or Bluetooth connection.

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

### Lighting Controls Are Unavailable

1. Confirm the speaker is a Creative Pebble X Plus.
2. Connect its USB cable directly to the computer, not only through Bluetooth or a 3.5 mm audio cable.
3. Disconnect and reconnect the USB cable, then reopen Pebble Control.
4. Close other lighting utilities if they prevent access to the speaker.

## Uninstall

Open **Settings > Apps > Installed apps**, find **Pebble Control**, and select **Uninstall**.
