# cymaSpaceStarFFT

A microcontroller project built using PlatformIO.

## ️ Project Specifications

- **Board:** `esp32dev`
- **Platform:** `espressif32@6.6.0`
- **Framework:** `arduino`
- **Dependencies:**
 - `adafruit/Adafruit NeoPixel @ ^1.11.0`
 - `kosme/arduinoFFT @ ^2.0.2`

## Pin Configuration

| Signal Name | GPIO Pin |
| :--- | :--- |
| `MIC_WS_PIN` | `4` |
| `MIC_SEL_PIN` | `5` |
| `MIC_SCK_PIN` | `23` |
| `MIC_DO_PIN` | `22` |
| `LED_PIN` | `6` |
| `NUM_LEDS` | `70` |
| `printRawMicData` | `0` |

## Build & Upload Instructions

This project is configured for **PlatformIO**.

1. Install the [PlatformIO IDE](https://platformio.org/) extension in VS Code.
2. Open this directory in VS Code.
3. Use the PlatformIO toolbar to **Build** (checkmark icon) and **Upload** (arrow icon) the code to your board.
4. Alternatively, run the local `upload.bat` script to build, upload, and launch the serial monitor automatically.
