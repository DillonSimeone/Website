# MicroPython on ESP32-C3 SuperMini

## Overview
This directory contains a self-contained, automated workflow for flashing and running MicroPython on the **ESP32-C3 SuperMini** development board. It leverages PlatformIO's toolchain for robustness but runs via a standalone PowerShell script for ease of use.

## Prerequisites
*   **PlatformIO**: Must be installed (usually via VS Code extension or `pip install platformio`). Used to provide `esptool.py`.
*   **Python**: Required for `ampy` and `esptool`.
*   **Ampy**: Adafruit MicroPython Tool (`pip install adafruit-ampy`) for file management.

## Key Files

### 1. `flash.ps1` (Automated Flasher)
A robust PowerShell script that:
*   Automatically locates `esptool.py` within the PlatformIO package directories.
*   Detects the ESP32-C3 COM port using a heuristic (Hardware ID -> Highest COM Port -> Default `COM5`).
*   Erases the flash memory.
*   Flashes the included `ESP32_GENERIC_C3` firmware at address `0x0`.

### 2. `main.py` (Hello World)
A "breathing LED" script that demonstrates:
*   Control of the onboard LED (GPIO 8).
*   PWM-like fading effects using simple delays.
*   Upload this file to the board to verify functionality.

### 3. Firmware
*   **File**: `ESP32_GENERIC_C3-20251209-v1.27.0.bin`
*   **Type**: Generic ESP32-C3 (Native USB support is built-in).

## Quick Start Guide

### 1. Flash Firmware
Run the PowerShell script from this directory:
```powershell
.\flash.ps1
```
*Follow the on-screen instructions. If the script hangs or fails to connect, enter **Download Mode** manually:*
1.  Hold **BOOT**.
2.  Press/Release **RESET**.
3.  Release **BOOT**.

### 2. Upload Code
After flashing, reset the board (press **RESET**).
Use `ampy` to upload your script:
```bash
# Replace COMx with your actual port (e.g., COM5)
ampy -p COMx put main.py /main.py
```

### 3. Run
Press **RESET** again. The onboard blue LED should start "breathing" (fading in and out).

## Development Notes
*   **LED Pin**: GPIO 8 (Active HIGH).
*   **Native USB**: The generic firmware handles the native USB-to-Serial/JTAG interface automatically.
*   **REPL**: Accessible via Serial Monitor (baud 115200).
    *   *Tip:* Use Thonny IDE for an interactive coding experience.

## Troubleshooting
*   **"No ESP32-C3 device found"**:
    *   Ensure drivers are installed (though Windows 10/11 usually handles CDC automatically).
    *   Try a different USB-C cable (some are power-only).
    *   Force Download Mode (see above).
*   **"esptool.py not found"**:
    *   Ensure PlatformIO is correctly installed and `pio system info` works in your terminal.
