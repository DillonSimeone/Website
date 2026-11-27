# ledbrace

A microcontroller project built using PlatformIO.

## ️ Project Specifications

- **Board:** `esp32dev`
- **Platform:** `espressif32@6.6.0`
- **Framework:** `arduino`

## Pin Configuration

| Signal Name | GPIO Pin |
| :--- | :--- |
| `I2S_SCK_PIN` | `6` |
| `I2S_WS_PIN` | `4` |
| `I2S_SD_PIN` | `16` |
| `I2S_SEL_PIN` | `17` |
| `LED_PIN` | `7` |

## Build & Upload Instructions

This project is configured for **PlatformIO**.

1. Install the [PlatformIO IDE](https://platformio.org/) extension in VS Code.
2. Open this directory in VS Code.
3. Use the PlatformIO toolbar to **Build** (checkmark icon) and **Upload** (arrow icon) the code to your board.
4. Alternatively, run the local `upload.bat` script to build, upload, and launch the serial monitor automatically.
