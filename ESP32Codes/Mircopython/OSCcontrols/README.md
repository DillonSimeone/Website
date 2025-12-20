# ESP32-C3 OSC Controller

A robust, configurable Open Sound Control (OSC) to Hardware interface for the ESP32-C3 SuperMini.

## Project Overview
This firmware turns an ESP32-C3 into a wireless OSC bridge. It allows you to control hardware pins (LEDs, relays, servos via PWM) by sending OSC messages over WiFi.

**Key Features:**
*   **WiFi & AP Mode:** Automatically connects to configured WiFi. Falls back to Access Point mode (`OSCdevice`) if connection fails.
*   **Web Configuration:** Built-in web server for configuring WiFi credentials, OSC port, and Pin Mappings.
*   **Dynamic Pin Mapping:** Map any OSC address (e.g., `/light/1`) to a specific hardware pin and mode (Toggle, Pulse, PWM) via the web UI.
*   **Modes:**
    *   **WEB Mode:** For configuration (HTTP API active).
    *   **OSC Mode:** High-performance UDP listening for real-time control.
*   **Hardware Support:** Supports digital input/output and PWM (LEDC) for dimming.

## History (The Switch from MicroPython)
This project was originally attempted in MicroPython. However, managing simultaneous WiFi stack operations, high-speed UDP (OSC) traffic, and hardware timing proved unstable ("insanity") on the C3 SuperMini.

This **C++ / PlatformIO** rewrite solves those issues, providing rock-solid stability and performance.

## Structure
*   `src/main.cpp`: The core firmware logic.
*   `data/`: Contains the Web UI (`index.html`) uploaded to LittleFS.
*   `platformio.ini`: PlatformIO build configuration.

## Build & Upload

1.  **Hardware:** ESP32-C3 SuperMini.
2.  **Software:** VS Code with PlatformIO (or PlatformIO Core CLI).
3.  **Upload Procedure:**
    *   Connect the board via USB.
    *   **Step 1: Upload Filesystem Image** (flashes the `data/` folder containing the Web UI):
        ```bash
        pio run -t uploadfs
        ```
    *   **Step 2: Upload Firmware**:
        ```bash
        pio run -t upload
        ```

4.  **Usage:**
    *   Connect to `OSCdevice` WiFi (if not configured) or your local network.
    *   Go to `http://<ip-address>` (default AP IP is usually `192.168.4.1`).
    *   Configure your mappings and switch to "OSC Mode".

## Configuration & Status

### `src/secrets.h`
This file contains the default hardcoded WiFi credentials (`SECRET_SSID` and `SECRET_PASSWORD`). The device uses these to attempt an initial connection.

### LED Status (GPIO 8)
The onboard LED serves as a status indicator during the boot process:
*   **Blinking:** The device is attempting to connect to the WiFi network configured in `secrets.h` or saved settings.
*   **OFF:** Connection **Successful**. The device is connected to the WiFi network and ready in Station Mode.
*   **ON (Solid):** Connection **Failed**. The device has started its own Access Point (`OSCdevice`) and is in AP Mode.

## TODO
*   **Investigate LED Polarity:** The LED behavior seems inverted (Active Low?). Currently, the code setting the pin `LOW` results in the LED being **ON**, and `HIGH` results in it being **OFF**. Verify if GPIO 8 is active low or if there's another electrical quirk.