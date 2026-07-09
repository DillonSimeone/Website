# Haxel Documentation

[Haxel](file:///f:/Github/Website/public/Projects/Haxel/index.html) is an open-source ESP32 haptic pattern engine, real-time control portal, and hardware abstraction layer (HAL) designed to bridge the gap between software-defined tactile patterns and diverse haptic actuators.

This document serves as a high-level overview for AI agents to quickly understand the project structure and capabilities.

---

## 1. System Overview & Core Features

Haxel is split into:
1. **Interactive Web Interface**: An addressable captive portal and tactile simulator for testing patterns, adjusting parameters, and analyzing live telemetry (`index.html`, `haptics.js`).
2. **Embedded Firmware Core**: A PlatformIO-based ESP32 project implementing a multi-tasking FreeRTOS environment that coordinates real-time haptic pattern generation, audio analysis, and web communication.

* **Firmware Location**: [F:\Github\Website\dist\ESP32Codes\PlatformIO\Haptic\Haxel](file:///F:/Github/Website/dist/ESP32Codes/PlatformIO/Haptic/Haxel)
* **Main Configuration**: [platformio.ini](file:///F:/Github/Website/dist/ESP32Codes/PlatformIO/Haptic/Haxel/firmware/platformio.ini)

---

## 2. Core Architecture

Haxel's firmware utilizes a 4-task FreeRTOS concurrency model to ensure high-performance timing while handling network operations:

* **Real-time Tasks (Core 1)**:
  * `engine_task` (1 kHz): Evaluates pattern math and commits outputs to the HAL layer.
  * `audio_task` (I2S DMA driven): Performs FFT and envelope calculations.
* **Network Tasks (Core 0)**:
  * `web_task`: Drives the WebSocket server, captive DNS portal, and API.
  * `housekeeping`: Manages mDNS, network watchdogs, and non-volatile configuration updates.

For detailed developer specifications, see:
* [PRODUCT_SPEC.md](file:///F:/Github/Website/dist/ESP32Codes/PlatformIO/Haptic/Haxel/PRODUCT_SPEC.md)
* [ARCHITECTURE.md](file:///F:/Github/Website/dist/ESP32Codes/PlatformIO/Haptic/Haxel/ARCHITECTURE.md)
* [HAL_SPEC.md](file:///F:/Github/Website/dist/ESP32Codes/PlatformIO/Haptic/Haxel/HAL_SPEC.md)
* [API_SPEC.md](file:///F:/Github/Website/dist/ESP32Codes/PlatformIO/Haptic/Haxel/API_SPEC.md)

---

## 3. Documentation & Reference Manual

* **Reference Manual (`manual.html`)**: A newly added static documentation reference explaining system tasks, back-EMF hardware protection, stiction stall calibration, and raw WebSocket/REST API JSON structures.
* **Pattern Script Cheatsheet Integration**: Plan includes expanding `manual.html` to act as an on-demand, interactive cheatsheet inside the Pattern Studio UI via an iframe modal, preventing the user from losing current work states when querying API or scripting variables.
* **Firmware Deployment**: The manual page is deployed directly in the firmware's LittleFS (`/manual.html`) to be served directly by the ESP32 in captive portal standalone deployments.

