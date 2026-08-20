# ESP32 OSC Controls Firmware

This project turns an **ESP32-C3 SuperMini** (or generic ESP32) into a network-enabled, real-time hardware actuator using the **Open Sound Control (OSC)** protocol. Designed to work in tandem with desktop controllers (such as the OSC Monitor) and VR engines (such as PatchXR), it allows you to map virtual gestures to physical outputs.

---

## Key Features

1. **Dual Mode Operation:**
   * **Web Configuration Mode:** Serves a local web interface to configure port settings and pin mappings.
   * **OSC Runtime Mode:** Disables the web server for zero-overhead, high-frequency UDP/OSC packet parsing.
2. **Wi-Fi Manager with Fallback:**
   * Automatically attempts to connect to saved station credentials.
   * Falls back to Access Point (AP) mode spawning its own network: **`OSCdevice`** with active captive DNS portal.
3. **mDNS Resolution:**
   * Easily accessible at **`http://oscdevice.local`** when connected to a local network.
4. **Dynamic Pin Mapping:**
   * Map custom OSC addresses (e.g. `/led/pulse`, `/motor/pwm`) to GPIO pins.
   * Supported output styles: **Toggle**, **Pulse (configurable duration)**, and **PWM (10-bit analog fade)**.

---

## Folder Structure

* `src/main.cpp`: Main firmware implementation containing Wi-Fi, Web Server, DNS Server, and OSC parsing engines.
* `src/secrets.h`: Placeholder file for Wi-Fi credentials (ignored/censored).
* `data/`: Dynamic web UI files uploaded to LittleFS for configuration.
* `platformio.ini`: PlatformIO build configuration.

---

## Hardware Setup (ESP32-C3 SuperMini)

### Pin Definitions
* **Onboard LED:** GPIO 8 (Active High).
* **Boot Button:** GPIO 9 (Used to trigger runtime/config modes).
* **Default I2C:** SDA (GPIO 8), SCL (GPIO 9).
* **Native USB:** D-/D+ for CDC serial output.

### Switch Modes
* Press the physical **BOOT** button (GPIO 9) during runtime to switch the device back into **Web Configuration Mode** from OSC Mode.

---

## Getting Started

1. Set your credentials in `src/secrets.h`.
2. Deploy the firmware to your ESP32 using PlatformIO or Arduino IDE.
3. Boot the device. If it cannot connect to local Wi-Fi, connect your PC/phone to the `OSCdevice` hotspot.
4. Navigate to `http://oscdevice.local` (or `192.168.4.1` in AP mode) to configure your OSC mappings!
 