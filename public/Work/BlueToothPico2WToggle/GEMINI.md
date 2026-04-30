# Bioni Input Switcher — Project Plan
**Hardware:** Raspberry Pi Pico 2W (RP2350) + WeAct 2.9" B/W/R E-Ink Display  
**Toolchain:** PlatformIO + C++ (Arduino framework via earlephilhower core)  
**App:** Flutter (Android) via Google IDX — built last

---

## Project Overview

A BLE-controlled hardware input switcher. The Pico 2W advertises over Bluetooth and listens for a command from an Android app. Upon receiving a command, the Pico:
1. Toggles a GPIO output pin (radio-button style — only one active at a time)
2. Updates the E-Ink display to reflect the active input

The project is gated behind a hardware sanity test that verifies the E-Ink display is wired and functioning correctly before any BLE logic is introduced.

---

## Hardware

| Part | Spec |
|---|---|
| MCU | Raspberry Pi Pico 2W (RP2350, dual-core Cortex-M33, BT 5.2) |
| Display | WeAct 2.9" E-Ink, B/W/R, 296×128px, SPI, **driver: SSD1680** |
| Display resolution | 296 × 128 pixels |
| Display colors | Black, White, Red |

> **Driver confirmed in Phase 1:** This specific board uses the **SSD1680** controller,
> *not* the UC8151/IL0373 that WeAct documentation typically lists.
> `GxEPD2_290c` (UC8151) produced a blank screen; `GxEPD2_290_BS` (SSD1680) worked.

---

## Wiring — Pico 2W ↔ E-Ink (SPI0)

The Pico 2W's SPI0 block uses the following default hardware pins. All six
display control lines are kept in the GP0–GP9 range to keep wiring tidy.

| E-Ink Pin | Pico 2W GPIO | Physical Pin | Notes |
|---|---|---|---|
| VCC | 3.3V | Pin 36 | Do NOT use 5V — display is 3.3V logic |
| GND | GND | Pin 38 | |
| SCK (SCL) | GP2 | Pin 4 | SPI0 Clock |
| SDA (MOSI) | GP3 | Pin 5 | SPI0 TX |
| CS (ECS) | GP5 | Pin 7 | Chip Select (active LOW) |
| D/C | GP6 | Pin 9 | Data=HIGH / Command=LOW |
| RST (RES) | GP7 | Pin 10 | Reset (active LOW) |
| BUSY | GP8 | Pin 11 | HIGH when display is refreshing |

> **Note:** MISO is not needed for E-Ink (write-only). GP4 is intentionally
> skipped so CS sits one pin away from the SPI data lines — this matches
> how the WeAct module's 8-pin connector is physically laid out
> (VCC, GND, SCK, SDA, CS, DC, RST, BUSY).
>
> **CRITICAL — SPI pins must be remapped in code.** The earlephilhower Arduino
> core defaults SPI0 to different pins. Always call these before `display.init()`:
> ```cpp
> SPI.setSCK(2);
> SPI.setTX(3);
> SPI.begin();
> ```
> Without this, the display receives no data and stays blank.

**Toggle Output Pins (Phase 2 onwards):**

| Function | Pico 2W GPIO | Physical Pin |
|---|---|---|
| INPUT 1 output | GP10 | Pin 14 |
| INPUT 2 output | GP11 | Pin 15 |
| (Future INPUT 3) | GP12 | Pin 16 |

Only one OUTPUT pin is HIGH at a time. All others are LOW.

---

## E-Ink Display — Refresh Modes (Phase 1 Findings)

This display has two physically separate pixel layers inside: a **B/W layer** and
a **Red layer**, each with its own RAM buffer in the SSD1680 controller
(`0x24` = B/W RAM, `0x26` = Red RAM).

Understanding which refresh mode to use is critical for Phase 2 design.

---

### Slow Mode — Full Refresh (Tri-Color Capable)

Use `display.setFullWindow()` before each draw cycle.

```cpp
display.setFullWindow();
display.firstPage();
do {
  display.fillScreen(GxEPD_WHITE);
  display.fillCircle(x, y, r, GxEPD_RED);   // ✅ Red works
  display.fillRect(x, y, w, h, GxEPD_BLACK); // ✅ Black works
} while (display.nextPage());
```

**How it works:** The SSD1680 runs its internal waveform sequencer across all
three color layers (White, Black, Red) in sequence. Each layer's ink particles
are given enough voltage time to fully migrate to their correct position.

**Speed:** **~5–15 seconds per frame** — measured during Phase 1 testing.
The red ink particles are physically heavier than the black ones and require
longer drive pulses to fully move, which is why tri-color is always slow.

**Use case:** Anything where the content changes infrequently. For Phase 2,
a full refresh on each button press is fine — the display then holds the image
indefinitely with zero power.

**Red ink side effect:** During the waveform sequence, the display visibly
flashes black → white → black as part of the hardware reset before settling
to the final image. This is normal and expected.

---

### Fast Mode — Partial Refresh (B/W Only)

Use `display.setPartialWindow()` before each draw cycle.

```cpp
display.setPartialWindow(0, 0, display.width(), display.height());
display.firstPage();
do {
  display.fillScreen(GxEPD_WHITE);
  display.fillCircle(x, y, r, GxEPD_BLACK); // ✅ Black works
  // display.fillCircle(x, y, r, GxEPD_RED); // ❌ Red is ignored / not updated
} while (display.nextPage());
```

**How it works:** The SSD1680 runs a much shorter waveform that only drives
the B/W ink layer. Only pixels that have *changed* since the previous frame
are re-driven, which is dramatically faster. The Red RAM (`0x26`) is never
touched by this path — the red layer physically stays wherever it last was.

**Speed:** **~500ms per frame** — achieved ~2fps in Phase 1 testing.
While not fast enough for smooth animation, it is significantly faster than a full tri-color refresh (5–15s) and perfectly acceptable for snappy UI updates.

**Mandatory startup rule:** The SSD1680 requires **at least one
`setFullWindow()` full refresh after `init()`** before `setPartialWindow()`
will operate at full speed. Without it, every "partial" call silently falls
back to full-refresh mode — making it slow AND triggering the red-ink waveform.
We call this a `primingWipe()` and it only runs once at power-on:

```cpp
void primingWipe() {
  display.setFullWindow();   // one-time primer
  display.firstPage();
  do { display.fillScreen(GxEPD_WHITE); } while (display.nextPage());
}

void setup() {
  display.init(115200, true, 2, false);
  display.setRotation(1);
  primingWipe(); // prime once — never call setFullWindow() again
}
```

**Red ink side effect:** The `primingWipe()` at startup will briefly expose
red ink for ~1 second as the waveform runs. After that, fast partial updates
never trigger the red waveform again, so red ink is not visible during normal
operation — as long as `setFullWindow()` is never called again after boot.

---

### 🚀 The Cold Boot Fast Bypass (EEPROM Sync)

**Hypothesis:** Can we skip the slow 5-15s `primingWipe()` completely, even on a cold boot (power loss)?
**Result (Tested in Phase 1): Success!** Cold boots can be truly instant.

By default, skipping the initial full refresh on a cold boot causes severe ghosting because the SSD1680 RAM is wiped when power is lost, but the physical E-ink screen still holds the last image. A partial refresh blends the new RAM state onto the blank RAM state, resulting in an illegible mess over the old physical image.

**The Solution:** We can sync the controller's RAM back to the physical screen's state by saving the current state across reboots using flash memory (`EEPROM`), and passing `initial=false` to the driver's `init()` function to remove the software lock:

```cpp
// 1. Init without the software lock
display.init(115200, false, 2, false);  // The first 'false' skips the initial wipe flag

// 2. Read the known physical state from EEPROM
int savedInput = EEPROM.read(0);

// 3. Run a fast partial refresh of that exact state
drawUI(); // assuming it draws using savedInput
```
This tricks the controller into loading the exact image that is already on the physical screen into its RAM. Any subsequent partial updates are then physically accurate and perfectly clean, reducing the boot time from ~10 seconds to instant.

> **Toolchain Quirks:** Compiling `EEPROM` on `rpipico2w` in PlatformIO may throw an `arm-none-eabi-ar.exe - Bad Image` error popup during archiving. Clicking "OK" bypasses it, and the final upload still completes successfully.

---

### ⚠️ The Hybrid Approach (Dead End)

**Hypothesis:** What if we pre-load the Red RAM once at startup (`0x00`), and then never touch it, using fast partial B/W updates to reveal the red layer beneath? giving us a fast-updating red background.

**Result (Tested in Phase 1): Failed.** When the red RAM contains data (is not `0xFF`), the SSD1680 controller detects it and internally forces its waveform sequencer into the slow, 5–15 second full-refresh tri-color sequence, regardless of whether `setPartialWindow()` is called. The speed immediately plummets to ~1fps.

**Conclusion:** Fast partial refresh (~2fps) is strictly bounded to the B/W layers with the Red RAM explicitly empty.

---

### Summary Table

| Mode | Driver Class | Speed | Colors Available | Use When |
|---|---|---|---|---|
| Full Refresh | `GxEPD2_3C` | 5–15s / frame | Black, White, **Red** | Content changes infrequently |
| Fast Partial | `GxEPD2_BW` | ~500ms / frame | Black, White only | UI updates |


---

## Software Architecture

### PlatformIO Configuration (`platformio.ini`)

```ini
[env:rpipico2w]
platform = https://github.com/maxgerhardt/platform-raspberrypi.git
board = rpipico2w
framework = arduino
board_build.core = earlephilhower
board_build.filesystem_size = 0.5m
monitor_speed = 115200
build_flags = -DPIO_FRAMEWORK_ARDUINO_ENABLE_BLUETOOTH
lib_deps =
    ZinggJM/GxEPD2 @ ^1.6.0
```

> **Note:** The `platform = https://github.com/earlephilhower/arduino-pico.git`
> form does NOT install correctly — it fails with `MissingPackageManifestError`.
> Use `https://github.com/maxgerhardt/platform-raspberrypi.git` with
> `board_build.core = earlephilhower` instead.

### Libraries

| Library | Purpose |
|---|---|
| `GxEPD2` (ZinggJM) | E-Ink display driver |
| `BTstackLib` (Built-in) | BLE peripheral stack for RP2350 (`ArduinoBLE` is broken on earlephilhower) |

**Fast mode driver (confirmed working):**
```cpp
GxEPD2_BW<GxEPD2_290_BS, GxEPD2_290_BS::HEIGHT> display(
    GxEPD2_290_BS(EPD_CS, EPD_DC, EPD_RST, EPD_BUSY)
);
```

**Slow tri-color driver (SSD1680-based, if needed):**
```cpp
GxEPD2_3C<GxEPD2_290_C90c, GxEPD2_290_C90c::HEIGHT> display(
    GxEPD2_290_C90c(EPD_CS, EPD_DC, EPD_RST, EPD_BUSY)
);
```
> `GxEPD2_290_C90c` (GDEM029C90, SSD1680-based 3C) confirmed as the correct
> slow-mode driver for this unit. `GxEPD2_290c` (UC8151) does not respond.

---

## Phase 0 — Project Scaffold ✅

**Goal:** Get PlatformIO compiling and uploading to the Pico 2W.

**Deliverable:** Blinking LED. Build + upload pipeline confirmed working.

---

## Phase 1 — E-Ink Sanity Test ✅

**Goal:** Drive the display and characterize real-world refresh behaviour.

**Confirmed findings:**
- Driver chip is **SSD1680** (not UC8151 as expected from WeAct docs)
- Fast partial refresh runs at **~500ms (~2fps)** — suitable for snappy UI updates
- Full refresh (tri-color) runs at **~5–15 seconds per frame**
- One `setFullWindow()` primer at boot is required before partial refresh works
- Red ink bleeds into partial refreshes if `setFullWindow()` is called post-boot
- `setPartialWindow()` is always the right call after `primingWipe()`

**Current `main.cpp`:** "The Shining" animation demo — types "All work and no
play makes Jack a dull boy.", slides text off, bounces shapes, flickers B/W.

---

## Phase 2 — GPIO Toggle Logic

**Goal:** Add the output pins and a software state machine for input selection.

### Behavior

- `currentInput` state variable: `0` = none, `1` = INPUT 1, `2` = INPUT 2 (expandable)
- On selection:
  - All output pins set `LOW`
  - Selected pin set `HIGH`
  - E-Ink display refreshes to show selected input

### Display States

| State | Screen Content | Ink Color | Refresh Type |
|---|---|---|---|
| INPUT 1 active | Large "INPUT 1" text | Black on white | Fast partial |
| INPUT 2 active | Large "INPUT 2" (inverted style) | White on black | Fast partial |
| None | "---" centered | White | Fast partial |

> **Design note:** We tested drawing INPUT 2 in red, but as documented above,
> any use of red ink forces the slow 5-15s full-refresh cycle on the SSD1680.
> For snappy UI responsiveness matching the physical button clicks, both states
> will use B/W fast partial refresh. To make the states visually distinct from
> across the room, INPUT 2 will be color-inverted (white text on solid black).

**Deliverable:** When you manually call `setInput(1)` or `setInput(2)` from
code, the correct pin goes HIGH and the screen updates.

---

## Phase 3 — BLE Integration

**Goal:** Expose the toggle logic over BLE so the Flutter app can control it.

### BLE Profile

| Parameter | Value |
|---|---|
| Device Name | `BioniBLE` |
| Advertising | Open (no pairing required) |
| Service UUID | `12345678-1234-1234-1234-123456789abc` |
| Characteristic UUID | `87654321-4321-4321-4321-cba987654321` |
| Characteristic Properties | WRITE + NOTIFY |

### Protocol (single-byte command)

| Byte Value | Action |
|---|---|
| `0x01` | Select INPUT 1 (GP10 HIGH, all others LOW, screen → INPUT 1) |
| `0x02` | Select INPUT 2 (GP11 HIGH, all others LOW, screen → INPUT 2) |
| `0xFF` | Deselect all (all LOW, screen → blank) |

The Pico NOTIFYs the current state back to the app after each state change
so the app UI stays in sync.

### BLE State Machine

```
[ADVERTISING] ---(connection)---> [CONNECTED]
[CONNECTED]   ---(command rx)---> [UPDATING] → setInput() → screen refresh
[CONNECTED]   ---(disconnect)---> [ADVERTISING]  (device keeps last state)
```

**Deliverable:** Phone can connect to `BioniBLE`, send a byte, watch the
correct GPIO go HIGH and the E-Ink display update.

**Desktop Testing Sub-tool:**
Since mobile dev comes last, a desktop utility is provided to test the hardware immediately:
1. Run `BleControl.bat` in the project root. It will create a local Python `venv` and install `bleak`.
2. It provides a simple CLI menu on the PC to send `0x01`, `0x02`, or `0xFF` to the Pico over your PC's Bluetooth adapter.

---

## Phase 4 — Flutter App

> **Prerequisites:** Phases 0–3 confirmed working on hardware.

**Platform:** Android only (initially)  
**Dev Environment:** Google IDX (Flutter)

### App UI ("Input Switcher" screen)

- BLE scan + auto-connect to device named `BioniBLE`
- Two large radio-button-style cards:
  - **INPUT 1** (dark/black theme card)
  - **INPUT 2** (red theme card)
- Only one card is active/selected at a time (same radio logic as hardware)
- Tapping a card sends the corresponding BLE command byte
- Connection status indicator (searching / connected / disconnected)
- Deselect button (sends `0xFF`)

### App Architecture

```
lib/
├── main.dart
├── ble/
│   ├── ble_manager.dart       # Scan, connect, write, notify listener
│   └── ble_constants.dart     # UUIDs, command bytes
├── screens/
│   └── switcher_screen.dart   # Main UI
└── widgets/
    └── input_card.dart        # Reusable input button card
```

**Deliverable:** Installable APK that connects to the Pico and toggles inputs
with visual confirmation on both the phone and the E-Ink display.

---

## Risk Register

| Risk | Mitigation |
|---|---|
| Wrong E-Ink driver | **Resolved** — SSD1680 confirmed. Use `GxEPD2_290_BS` (fast) or `GxEPD2_290_C90c` (slow 3C) |
| SPI pins not remapped | Always call `SPI.setSCK(2); SPI.setTX(3); SPI.begin();` before `display.init()` |
| Partial refresh slow/red bleeds | Always call `primingWipe()` once at boot; never call `setFullWindow()` again |
| earlephilhower ArduinoBLE not stable on RP2350 | **Resolved** — `ArduinoBLE` does not compile on RP2350. Switched to `BTstackLib` which is native to the core and works flawlessly, using `-DPIO_FRAMEWORK_ARDUINO_ENABLE_BLUETOOTH`. |
| Long E-Ink refresh during BLE operation | Refresh display asynchronously; BLE stack runs on Core 0, display updates on Core 1 via `rp2040.fifo` |

---

## File & Folder Structure

```
BlueToothPico2WToggle/
├── GEMINI.md                  ← This file
├── platformio.ini
├── src/
│   ├── main.cpp               ← Entry point (active phase code)
│   ├── display_manager.h/.cpp ← E-Ink drawing logic
│   ├── ble_manager.h/.cpp     ← BLE advertising + command handler
│   └── input_controller.h/.cpp← GPIO toggle state machine
├── include/
│   └── config.h               ← Pin definitions, UUIDs, constants
└── flutter_app/               ← Created in Phase 4
    └── bioni_input_switcher/
```

---

## Milestone Checklist

- [x] **Phase 0** — LED blink, toolchain verified
- [x] **Phase 1** — E-Ink characterised: driver confirmed SSD1680, fast/slow modes documented, animation demo running
- [x] **Phase 2** — GPIO toggles on `setInput()`, screen shows correct state (fast B/W).
- [x] **Phase 3** — BLE connects, byte command received, hardware responds
- [x] **Phase 4** — Flutter app connects, sends commands, app UI syncs with hardware state
