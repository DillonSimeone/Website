# CarrieBrainBadge

A microcontroller project built using PlatformIO.

## 🛠️ Project Specifications

- **Board:** `esp32-c3-devkitm-1`
- **Platform:** `espressif32@6.6.0`
- **Framework:** `arduino`
- **Dependencies:**
  - `fastled/FastLED @ ^3.6.0`
  - `adafruit/Adafruit MPU6050 @ ^2.2.4`
  - `adafruit/Adafruit Unified Sensor @ ^1.1.9`
  - `adafruit/Adafruit BusIO @ ^1.14.1`
  - `build_flags =`
  - `-D ARDUINO_USB_MODE=1`
  - `-D ARDUINO_USB_CDC_ON_BOOT=1`

## 🔌 Pin Configuration

| Signal Name | GPIO Pin |
| :--- | :--- |
| `MPU_SCL` | `2` |
| `MPU_SDA` | `3` |
| `MPU_INT` | `4` |
| `MOTOR_PWM` | `1` |
| `LED_DATA` | `0` |
| `NUM_LEDS` | `9` |

## 🚀 Build & Upload Instructions

This project is configured for **PlatformIO**.

1. Install the [PlatformIO IDE](https://platformio.org/) extension in VS Code.
2. Open this directory in VS Code.
3. Use the PlatformIO toolbar to **Build** (checkmark icon) and **Upload** (arrow icon) the code to your board.
4. Alternatively, run the local `upload.bat` script to build, upload, and launch the serial monitor automatically.
