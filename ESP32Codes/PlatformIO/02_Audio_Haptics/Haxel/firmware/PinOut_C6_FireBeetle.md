# FireBeetle 2 ESP32-C6 Mini — Haxel pin map

Board: **DFRobot FireBeetle 2 ESP32-C6** (`esp32-c6-devkitm-1` in PlatformIO).

Fleet default: **mini L298N** driving **3 motors as 2 haptic channels** (Haxel `L298N` driver, sign-magnitude mode).

**All C6 PlatformIO envs** (`c6WIFILED`, `c6BLULED`, `c6WIFILED_FOLLOWER`) share this pin map via `HAXEL_TARGET_C6` in firmware defaults.

## ESP32 ↔ mini L298N

| L298N label | FireBeetle GPIO | Haxel pin slot |
| :--- | :--- | :--- |
| **INT1** | **16** | `pins[1]` |
| **INT2** | **17** | `pins[2]` |
| **INT3** | **19** | `pins[4]` |
| **INT4** | **20** | `pins[5]` |
| **ENA / ENB** | *(jumper to +5V on module)* | `pins[0]` / `pins[3]` = unused |
| **Onboard status LED** | **8** | firmware only (not the bridge) |

**Logic GND** on the L298N must tie to FireBeetle **GND**. Motor **+** on the module goes to your motor supply (3–5 V for coin cells / 5 V for M1N10).

## Motor wiring (recommended)

The mini L298N has **two H-bridge channels**, not four independent outputs. OUT1 and OUT2 are **one pair** (MOTOR-A); OUT3 and OUT4 are **one pair** (MOTOR-B).

Do **not** hang one coin motor from OUT1→GND and another from OUT2→GND — those outputs are complementary and cannot both drive high at once.

Instead:

```
Channel A — both coin vibration motors IN PARALLEL:
  Coin motor 1:  (+) OUT1,  (−) OUT2   (or both reds to OUT1, both blacks to OUT2)
  Coin motor 2:  same — wired in parallel with motor 1
  → Haxel channel 0 (INT1 / INT2)

Channel B — NMB M1N10FB11G (5 V brushed, 12 mm):
  M1N10:  (+) OUT3,  (−) OUT4
  → Haxel channel 1 (INT3 / INT4)
```

Flyback / snub diodes across each motor if the module does not include them. The M1N10 draws more current than the coin motors — use a supply that can handle peak draw on channel B.

## PlatformIO envs

| Env | Use |
| :--- | :--- |
| **`c6BLULED`** | Normal standalone Haxel — Chrome Web Bluetooth |
| **`c6WIFILED`** | WiFi captive portal (same hardware / motor pins) |
| **`c6WIFILED_FOLLOWER`** | ESP-NOW Command Mode fleet node (22× batch flash) |

Flash: Web Uploader → **Haxel/firmware** → **`c6WIFILED_FOLLOWER — Mesh Follower · ESP32-C6`**

Master: **`c3WIFILED_MASTER`** (unchanged).

## Fleet tab behavior

Each follower exposes **2 channels** in Command Mode:

| Channel | Motors | Typical use |
| :--- | :--- | :--- |
| **0** | Both coin cells (parallel) | Light / fast haptics |
| **1** | M1N10FB11G | Stronger rotary haptic |

Patterns and Fleet controls can drive them independently.

## Download mode

Hold **BOOT** → pulse **RESET** → release **BOOT** if upload fails.
