# Tasks

Open work for Pebble Control, grouped by area. Protocol details for the lighting tasks are in the [Development Guide](DEVELOPMENT.md#lighting-protocol-reference).

## Lighting

- [x] **Effect speed control**
  Add a speed selector for Cycle, Wave, Morph, Aurora, Glowing, and Chasers using customization type 3. Offer the seven firmware presets: 6000 Slowest, 4000 Slower, 2500 Slow, 1333 Normal, 750 Fast, 375 Faster, 250 Fastest. Reject any other value in `lighting.js` before it reaches the device.

- [ ] **Direction control**
  Add a direction selector using customization type 4 with a direction byte and a bounce byte. Wave offers left, right, up, down, and bounce; Chasers offers left, right, and bounce; Peak Meter offers up and down. Hide the bounce option when the capability mask lacks bit 2.

- [ ] **Morph second colour**
  Read and write customization type 2 for Morph so both fade colours can be edited. Show a second well next to the first one only when the effect is Morph.

- [ ] **Capability-driven controls**
  Query operation `0x22` for each supported mode at connect time and show or hide the colour, speed, and direction controls from the reply instead of hardcoding per effect.

- [ ] **Slot switching**
  Expose the five lighting slots. Read each slot's effect with operation `0x2a`, switch with `0x2d`, and remember that customization only works on the active slot. Present slots as quick-pick presets alongside the existing volume presets.

- [ ] **Hot-plug handling**
  React to USB attach and detach events instead of relying on the 5-second poll, so the lighting panel enables and disables immediately.

## Audio over USB

- [x] **Probe audio commands on the Pebble X Plus**
  Done. Only max payload size (`0x03`), device information (`0x09`), output target selection (`0x2c`), and LED control (`0x3a`) answer. Audio level, mute, EQ, speaker configuration, subwoofer, and sound mode get no reply, so hardware volume and subwoofer level are not possible over USB. Creative App's equalizer, Acoustic Engine, and sound modes are host-side driver processing.

- [x] **Output target switch**
  Add a Speakers / Headphones toggle using command `0x2c`: operation `01` reads the current mask, `00` plus a 32-bit mask sets it, `02` lists supported masks. The speaker reports `2` (speakers) and `4` (headphone jack). Verified round-trip on hardware.

## App

- [ ] **Tray icon**
  Minimise to the system tray with volume, mute, and lighting power in the tray menu.

- [ ] **Keyboard shortcuts**
  Global shortcuts for volume up, volume down, and mute.

- [ ] **Output device check**
  Warn when the active Windows output is not a Creative Pebble device.

- [ ] **Tests for the lighting module**
  Add unit tests for report encoding, response parsing, colour word conversion, and rejection handling using a fake HID device, so protocol changes can be verified without hardware.
