# RFIDreaderESP32NOW

A microcontroller project built using PlatformIO.

## 🛠️ Project Specifications

- **Board:** `esp32-c3-devkitm-1`
- **Platform:** `espressif32@6.6.0`
- **Framework:** `arduino`
- **Dependencies:**
  - `miguelbalboa/MFRC522 @ ^1.4.11`
  - `fastled/FastLED @ ^3.6.0`

## 🔌 Pin Configuration

| Signal Name | GPIO Pin |
| :--- | :--- |
| `RST_PIN` | `7` |
| `SS_PIN` | `19` |
| `DATA_PIN` | `4` |
| `MAX_LEDS` | `60` |
| `RESET_INTERVAL` | `60000UL` |
| `HW_RESET_INTERVAL` | `1800000UL` |

## 🚀 Build & Upload Instructions

This project is configured for **PlatformIO**.

1. Install the [PlatformIO IDE](https://platformio.org/) extension in VS Code.
2. Open this directory in VS Code.
3. Use the PlatformIO toolbar to **Build** (checkmark icon) and **Upload** (arrow icon) the code to your board.
4. Alternatively, run the local `upload.bat` script to build, upload, and launch the serial monitor automatically.
