# reactiveHandleLightMotion

A microcontroller project built using PlatformIO.

## ️ Project Specifications

- **Board:** `esp32-c3-devkitm-1`
- **Platform:** `espressif32@6.6.0`
- **Framework:** `arduino`
- **Dependencies:**
 - `fastled/FastLED @ ^3.6.0`

## Pin Configuration

| Signal Name | GPIO Pin |
| :--- | :--- |
| `SDA_PIN` | `2` |
| `SCL_PIN` | `3` |
| `INT_PIN` | `5` |
| `GND_PIN` | `4` |
| `MOTOR_PIN` | `7` |
| `LED_PIN` | `6` |
| `NUM_LEDS` | `76` |

## Build & Upload Instructions

This project is configured for **PlatformIO**.

1. Install the [PlatformIO IDE](https://platformio.org/) extension in VS Code.
2. Open this directory in VS Code.
3. Use the PlatformIO toolbar to **Build** (checkmark icon) and **Upload** (arrow icon) the code to your board.
4. Alternatively, run the local `upload.bat` script to build, upload, and launch the serial monitor automatically.
