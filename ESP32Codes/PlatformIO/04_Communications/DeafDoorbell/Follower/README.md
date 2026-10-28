# DeafDoorbell — Follower Node

ESP-NOW visual & haptic receiver node with store-and-forward mesh repeating and 8×8 WS2812B matrix animations.

## Hardware Specifications

- **Board:** `esp32-c3-devkitm-1` (ESP32-C3 SuperMini)
- **Platform:** `espressif32@6.6.0`
- **Framework:** `arduino`
- **Dependencies:** `fastled/FastLED @ ^3.6.0`

## Pin Configuration

| Signal Name   | GPIO Pin | Notes                                      |
| :------------ | :------- | :----------------------------------------- |
| `LED_PIN`     | `5`      | WS2812B 8×8 matrix data line (64 LEDs)     |
| `MOTOR_PIN`   | `3`      | Vibration motor driver output              |
| `ONBOARD_LED` | `8`      | Inverted status/heartbeat LED              |
| `BOOT_PIN`    | `9`      | Hold 3 seconds to reset pairing to discovery|

## Build & Upload

- **USB Flash & Monitor:** Run `upload.bat`
- **Build Binary Only:** Run `compile_bin.bat`
