# Haxel Firmware

This PlatformIO project implements the core real-time embedded logic for the Haxel tactile pattern engine. It supports a multi-tasking FreeRTOS environment that coordinates real-time haptic pattern generation, audio analysis, and connection services (WiFi or BLE).

## Build & Flash (via Web Uploader)

For the easiest compilation and deployment experience, use the visual **Web Uploader** tool provided in the project root:

1. Run the `StartUploader.bat` script.
2. Open the page (defaults to `http://localhost:3567`).
3. Select **Haxel/firmware** in the project catalog.
4. Select your environment suffix in the **ENV** dropdown:
   - `esp32-c3-wifi` / `esp32-c3-ble` (for ESP32-C3)
   - `esp32-s3-wifi` / `esp32-s3-ble` (for ESP32-S3)
   - `esp32dev-wifi` / `esp32dev-ble` (for classic ESP32)
5. Click **BUILD & FLASH DEVICE**.

---

## Build & Flash (via CLI)

To compile and upload from the command line:

```bash
# Default C3 profile: WiFi + FastLED strip
pio run -e c3WIFILED -t upload
pio run -e c3WIFILED -t uploadfs

# Other useful envs
pio run -e c3WIFI          # WiFi only (no LED/audio/OLED)
pio run -e c3WIFIAUDIOLED  # WiFi + LED + mic FFT
pio run -e c3BLULED        # BLE + LED
pio run -e c3FULLOLED      # WiFi + LED + Audio + Knobs + OLED
```

### Feature modules (`HAXEL_FEATURE_*`)

| Flag | What it enables | Typical env |
|------|-----------------|-------------|
| `LED` | FastLED strip | `c3WIFILED` |
| `AUDIO` | I2S/ADC FFT | `c3WIFIAUDIOLED` |
| `KNOBS` | ADC knobs | `c3FULLOLED` |
| `OLED` | SSD1306 HUD | `c3FULLOLED` |

Legacy env names (`esp32-c3-wifi`, etc.) still work as aliases.

---

## Connection Modes

Haxel compiles into either **WiFi Mode** or **Bluetooth Mode** to prevent resource contention and reduce memory footprint:

### 1. WiFi Mode (`*-wifi`)
- **Captive Portal**: Broadcasts SSID `Haxel-XXXX` for initial credential provisioning.
- **REST & WebSocket API**: Mounts an asynchronous web server for HTTP REST control and low-latency WebSockets.
- **Web UI**: Access the main control page locally by navigating to `http://haxel.local` (or the softAP IP `192.168.4.1`) or via the [Haxel Portal Website Page](file:///f:/Github/Website/public/Projects/Haxel/index.html).

### 2. Bluetooth Mode (`*-ble`)
- **Direct BLE GATT Server**: Broadcasts as `Haxel-XXXX` using BLE GATT services.
- **Web Bluetooth API**: Control Haxel directly from your Chrome or Chromium-based browser with sub-15ms latency without any WiFi setup or network routing.
- **Web UI**: Launch the [Haxel BLE Control Page](file:///f:/Github/Website/public/Projects/Haxel/bluetooth.html) in your browser and click **CONNECT BLE**.

---

## Layout

```text
firmware/
├── platformio.ini         Build environment configurations
├── partitions.csv         Flash partition table
├── include/
│   └── Haxel.h            Umbrella header
├── src/
│   ├── main.cpp           FreeRTOS task layout and setups
│   ├── core/
│   │   ├── Engine         1 kHz pattern scheduler
│   │   ├── Config         JSON-backed configurations
│   │   ├── Pattern        IPattern base class
│   │   ├── StatusLed      Status breathing/blinking states
│   │   └── AudioAnalyzer  FFT envelope follower
│   ├── hal/               Actuator driver interface
│   │   ├── IHapticDriver
│   │   ├── DriverFactory  Resolves driver kind (MOSFET, DRV2605L, etc.)
│   │   └── MOSFETDriver   PWM motor driver
│   ├── patterns/
│   │   └── Patterns       Built-in pattern registry
│   └── web/               Network APIs
│       ├── WebServer      Async HTTP server
│       ├── CaptivePortal  Captive portal DNS server
│       ├── BleServer      BLE GATT server
│       └── ApiHandlers    Common state patch/serialization helper
└── data/                  LittleFS UI files (for WiFi mode)
```
