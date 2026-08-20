# BlinkTest

A microcontroller project built using PlatformIO.

## ️ Project Specifications

- **Board:** `esp32-c3-devkitm-1`
- **Platform:** `espressif32@6.6.0`
- **Framework:** `arduino`
- **Dependencies:**
 - `fastled/FastLED`
 - `${env:esp32dev.lib_deps}`

## Pin Configuration

| Signal Name | GPIO Pin |
| :--- | :--- |
| `NUM_LEDS` | `75` |
| `DATA_PIN` | `3` |
| `CLOCK_PIN` | `13` |

## Build & Upload Instructions

This project is configured for **PlatformIO**.

1. Install the [PlatformIO IDE](https://platformio.org/) extension in VS Code.
2. Open this directory in VS Code.
3. Use the PlatformIO toolbar to **Build** (checkmark icon) and **Upload** (arrow icon) the code to your board.
4. Alternatively, run the local `upload.bat` script to build, upload, and launch the serial monitor automatically.
