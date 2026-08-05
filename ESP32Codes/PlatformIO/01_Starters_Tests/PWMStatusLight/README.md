# PWM Status Light - ESP32-C3 SuperMini

Smoothly fades the onboard status LED (GPIO 8) using PWM. The LED fades from 0% to 100% brightness and back over a 6-second cycle (3s fade in, 3s fade out - or as configured in `main.cpp`).

## Project Details
*   **Hardware**: ESP32-C3 SuperMini
*   **LED Pin**: GPIO 8 (Active HIGH)
*   **Toolchain**: PlatformIO

## Quick Start
1.  Plug in your ESP32-C3.
2.  Run `upload.bat` to build, flash, and monitor the device.

## Configuration
The fade timing can be adjusted in `src/main.cpp` by changing `FADE_DURATION_MS`.
