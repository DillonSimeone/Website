# MicroPython Audio-Reactive Motor Controller

## Project Overview
This project runs on an **ESP32-C3 SuperMini** and controls motors based on audio input from a MAX4466 microphone. It includes a robust WiFi management system (STA + AP Fallback) and a web-based configuration interface.

## Hardware Context
*   **Board**: ESP32-C3 SuperMini
*   **Microphone**: MAX4466
    *   **Pin**: GPIO 3 (ADC)
    *   **Virtual Ground**: GPIO 4 (Output LOW) - Used to simplify wiring or reduce noise loops?
*   **Motors**: Standard PWM-controlled drivers (L298N, MX1508, etc.) connected to free GPIOs.

## Software Architecture

### Files
*   **`boot.py`**:
    *   **Priority 1**: Tries connecting using `wifi_config.json`.
    *   **Priority 2**: Tries connecting using `secrets.py`.
    *   **Fallback**: Starts Access Point (`reactiveMotorX`).
    *   **Conflict Resolution**: Scans for existing APs with the same base name and increments a suffix number to avoid collisions.
*   **`main.py`**:
    *   **Single Threaded Loop**: Combines audio sampling, motor updates, and network serving.
    *   **Audio**: Samples ADC for ~20ms windows to find peak-to-peak amplitude (volume).
    *   **DNS Server**: Minimal implementation to hijack all queries in AP mode (Captive Portal).
    *   **HTTP Server**: Non-blocking socket server. Handles API (`/api/status`, `/api/settings`, `/api/wifi/*`) and serves `index.html`.
*   **`secrets.py`**: (Ignored) User credentials.
*   **`wifi_config.json`**: (Ignored) Runtime saved credentials.
*   **`settings.json`**: (Ignored) Runtime motor configurations.

### Key Workflows
1.  **Boot**: `boot.py` establishes network connectivity.
2.  **Run**: `main.py` enters infinite loop.
3.  **Captive Portal**: In AP mode, the DNS server answers all queries with the ESP's IP, forcing devices to load the configuration page.

## Development Tools
*   **Flash**: `flash.ps1` (uses `esptool`).
*   **Upload**: `upload.ps1` (uses `ampy`).
*   **Monitor**: `monitor_serial.py` (uses `serial`).

## Known Nuances
*   **Blocking Audio**: Audio sampling blocks the main loop for ~20ms. This might introduce slight latency in web requests but is generally acceptable.
*   **Memory**: ESP32-C3 has limited RAM. `gc.collect()` is used, but watch out for fragmentation if the web UI gets complex.
*   **Pin Conflicts**: The code explicitly prevents using GPIO 3 (Mic) and 4 (GND) for motors.
