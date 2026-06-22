# HumanDetector

A microcontroller project built using PlatformIO.

## 🛠️ Project Specifications

- **Board:** `esp32-c6-devkitm-1`
- **Platform:** `https://github.com/pioarduino/platform-espressif32/releases/download/54.03.20/platform-espressif32.zip`
- **Framework:** `arduino`
- **Dependencies:**
  - `adafruit/Adafruit SSD1306 @ ^2.5.13`
  - `adafruit/Adafruit GFX Library @ ^1.11.11`
  - `iavorvel/MyLD2410 @ ^1.0.1`

## 🔌 Pin Configuration

| Signal Name | GPIO Pin |
| :--- | :--- |
| `SDA_PIN` | `19` |
| `SCL_PIN` | `20` |
| `RADAR_RX` | `17` |
| `RADAR_TX` | `16` |

## 🚀 Build & Upload Instructions

This project is configured for **PlatformIO**.

1. Install the [PlatformIO IDE](https://platformio.org/) extension in VS Code.
2. Open this directory in VS Code.
3. Use the PlatformIO toolbar to **Build** (checkmark icon) and **Upload** (arrow icon) the code to your board.
4. Alternatively, run the local `upload.bat` script to build, upload, and launch the serial monitor automatically.
