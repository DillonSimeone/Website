# MAX7219_Bullshit

A microcontroller project built using PlatformIO.

## 🛠️ Project Specifications

- **Board:** `esp32-c3-devkitm-1`
- **Platform:** `espressif32@6.6.0`
- **Framework:** `arduino`
- **Dependencies:**
  - `majicdesigns/MD_Parola@^3.7.3`
  - `majicdesigns/MD_MAX72XX@^3.5.1`
  - `upload_speed = 921600`
  - `monitor_speed = 115200`

## 🔌 Pin Configuration

| Signal Name | GPIO Pin |
| :--- | :--- |
| `DATA_PIN` | `6` |
| `CLK_PIN` | `4` |
| `CS_PIN` | `5` |

## 🚀 Build & Upload Instructions

This project is configured for **PlatformIO**.

1. Install the [PlatformIO IDE](https://platformio.org/) extension in VS Code.
2. Open this directory in VS Code.
3. Use the PlatformIO toolbar to **Build** (checkmark icon) and **Upload** (arrow icon) the code to your board.
4. Alternatively, run the local `upload.bat` script to build, upload, and launch the serial monitor automatically.
