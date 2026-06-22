# firmware

Ember — ESP32-C3 firmware Stack-based bytecode VM, atomic program swap, FreeRTOS task isolation. See ARCHITECTURE.md for the design rationale.

## ️ Project Specifications

- **Board:** `min_spiffs.csv`
- **Platform:** `espressif32@6.6.0`
- **Framework:** `arduino`
- **Dependencies:**
 - `fastled/FastLED @ ^3.6.0`
 - `esphome/ESPAsyncWebServer-esphome @ ^3.1.0`
 - `bblanchon/ArduinoJson @ ^7.0.0`
 - `kosme/arduinoFFT @ ^2.0.2`

## Build & Upload Instructions

This project is configured for **PlatformIO**.

1. Install the [PlatformIO IDE](https://platformio.org/) extension in VS Code.
2. Open this directory in VS Code.
3. Use the PlatformIO toolbar to **Build** (checkmark icon) and **Upload** (arrow icon) the code to your board.
4. Alternatively, run the local `upload.bat` script to build, upload, and launch the serial monitor automatically.
