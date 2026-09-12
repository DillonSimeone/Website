# cameraDroneWheels

A microcontroller project built using PlatformIO.

## ️ Project Specifications

- **Board:** `esp32dev`
- **Platform:** `espressif32@6.6.0`
- **Framework:** `arduino`

## Pin Configuration

| Signal Name | GPIO Pin |
| :--- | :--- |
| `MOTOR_FRONT_LEFT_PIN` | `12` |
| `MOTOR_FRONT_RIGHT_PIN` | `13` |
| `MOTOR_BACK_LEFT_PIN` | `14` |
| `MOTOR_BACK_RIGHT_PIN` | `15` |

## Build & Upload Instructions

This project is configured for **PlatformIO**.

1. Install the [PlatformIO IDE](https://platformio.org/) extension in VS Code.
2. Open this directory in VS Code.
3. Use the PlatformIO toolbar to **Build** (checkmark icon) and **Upload** (arrow icon) the code to your board.
4. Alternatively, run the local `upload.bat` script to build, upload, and launch the serial monitor automatically.
