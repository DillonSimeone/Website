# ESP32C6

A microcontroller project built using PlatformIO.

## ️ Project Specifications

- **Board:** `esp32-c6-devkitc-1`
- **Platform:** `espressif32@6.6.0`
- **Framework:** `arduino`

## Pin Configuration

| Signal Name | GPIO Pin |
| :--- | :--- |
| `OLED_ADDR` | `0x3C` |
| `TRIGGER_PIN` | `5` |
| `ECHO_PIN` | `4` |
| `LED_PIN2` | `17` |

## Build & Upload Instructions

This project is configured for **PlatformIO**.

1. Install the [PlatformIO IDE](https://platformio.org/) extension in VS Code.
2. Open this directory in VS Code.
3. Use the PlatformIO toolbar to **Build** (checkmark icon) and **Upload** (arrow icon) the code to your board.
4. Alternatively, run the local `upload.bat` script to build, upload, and launch the serial monitor automatically.
