# firmware

Ember — ESP32-C3 firmware Stack-based bytecode VM, atomic program swap, FreeRTOS task isolation. See ARCHITECTURE.md for the design rationale.

## ️ Project Specifications

- **Board:** `esp32-c3-devkitm-1` (`min_spiffs.csv` partitions, `littlefs` filesystem)
- **Environments:** `esp32c3` (standard) and `audio` (default in `upload.bat`)
- **Platform:** `espressif32@6.6.0`
- **Framework:** `arduino`
- **Dependencies:**
 - `fastled/FastLED@3.6.0`
 - `esphome/ESPAsyncWebServer-esphome @ ^3.1.0`
 - `bblanchon/ArduinoJson @ ^7.0.0`
 - `kosme/arduinoFFT @ ^2.0.2`

## Build & Upload Instructions

This project is configured for **PlatformIO**.

1. Install the [PlatformIO IDE](https://platformio.org/) extension in VS Code.
2. Open this directory in VS Code.
3. Use the PlatformIO toolbar to **Build** (checkmark icon) and **Upload** (arrow icon) the code to your board.
4. Alternatively, run the local `upload.bat` script to build, upload, and launch the serial monitor automatically.

## Default Settings & Wi-Fi Credentials

- **SoftAP Password:** `ember123` (Portal IP: `http://192.168.4.1`)
- **SoftAP SSID & mDNS:** `Ember-Audio-XXXX` / `ember-audio-xxxx.local` (`audio`, AP-only); `Ember-XXXX` / `ember.local` (`esp32c3`)
- **Hardware Defaults (`Reset Settings to Defaults`):**
  - LED Pin: `GPIO 5` · Brightness: `128`
  - Pixel Count: `100` (`audio`) / `30` (`esp32c3`) — updates live without reboot
  - Mic Source: `MAX4466` (`2`) on `audio` / `Off` (`0`) on `esp32c3`
  - MAX4466 Pins: OUT `GPIO 3`, Soft GND `GPIO 4` · INMP441 I2S: BCLK `6`, WS `7`, DATA `2`
  - Mic Gain / Smoothing: `1.50×` / `0.60`
  - Audio Gate: Enabled (`audio`) / Disabled (`esp32c3`), Threshold `2500` MAD
  - Auto Cycle: Enabled (`audio`) / Disabled (`esp32c3`), `5` s interval
