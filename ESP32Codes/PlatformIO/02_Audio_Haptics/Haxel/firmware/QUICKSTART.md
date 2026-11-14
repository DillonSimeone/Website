# HAXEL — Quickstart & Flashing Guide

Welcome to **Haxel**, an open-source ESP32 haptic pattern engine, telemetry pipeline, and captive portal controller.

This guide walks you through setting up your microcontroller, wiring your actuator and addressable LEDs, and flashing the firmware.

---

## 1. Hardware Shopping List

You can build a complete Haxel haptic node for under $10:

| Component | Recommended Model | Where to Buy |
| :--- | :--- | :--- |
| **Microcontroller (Default)** | **ESP32-C3 SuperMini** ($2) | [AliExpress ESP32-C3 SuperMini](https://www.aliexpress.us/w/wholesale-esp32-c3-super-mini.html?spm=a2g0o.home.search.0) |
| **Microcontroller (LiPo/Fleet)** | **DFRobot FireBeetle 2 ESP32-C6 Mini** ($6, onboard LiPo charger) | [DFRobot Official Store](https://www.dfrobot.com/product-2778.html) |
| **Vibration Motors** | Coin vibration motors (ERM, 10mm / 8mm) or NMB M1N10FB11G | [AliExpress Vibration Motors](https://www.aliexpress.us/w/wholesale-vibrator-motor.html?spm=a2g0o.productlist.search.0) |
| **Motor Driver (Single Ch)** | Low-side MOSFET module (AO3400A / LR7843 / D4184) | [AliExpress MOSFET Modules](https://www.aliexpress.us/w/wholesale-mosfet-module-esp32.html) |
| **Motor Driver (Dual/Triple)** | Mini L298N 2-channel H-bridge (sign-magnitude PWM) | [AliExpress Mini L298N](https://www.aliexpress.us/w/wholesale-mini-l298n.html) |
| **Addressable LEDs** | **WS2812B NeoPixel Strip / Ring** (5V or 3.3V tolerant) | [AliExpress WS2812B Strip](https://www.aliexpress.us/w/wholesale-ws2812b-strip.html) |
| **Audio Mic (Optional)** | INMP441 I2S digital MEMS microphone | [AliExpress INMP441](https://www.aliexpress.us/w/wholesale-inmp441.html) |

---

## 2. Hardware Wiring & Default Pinouts

### A. ESP32-C3 SuperMini (Default — Environment `c3WIFILED`)
- **Motor Driver (MOSFET)**:
  - Gate / PWM Control $\rightarrow$ **GPIO 6**
  - Driver GND $\rightarrow$ ESP32 **GND**
  - Driver V+ $\rightarrow$ External 3.7V–5V power
  - Motor $\rightarrow$ Across MOSFET output terminals (with 1N4001/SS34 flyback diode)
- **FastLED Light Strip (WS2812B)**:
  - Data In (DIN) $\rightarrow$ **GPIO 5**
  - 5V / VDD $\rightarrow$ 5V (USB pin or battery)
  - GND $\rightarrow$ **GND** (common ground)
- **Optional I2S Microphone (INMP441)**:
  - SCK $\rightarrow$ GPIO 2, WS $\rightarrow$ GPIO 3, SD $\rightarrow$ GPIO 4, L/R $\rightarrow$ GND

### B. DFRobot FireBeetle 2 ESP32-C6 Mini (Mini L298N — Environment `c6WIFILED` or `c6WIFILED_FOLLOWER`)
- **L298N INT1** $\rightarrow$ **GPIO 16** (MOTOR-A Coin motor 1 & 2 in parallel)
- **L298N INT2** $\rightarrow$ **GPIO 17**
- **L298N INT3** $\rightarrow$ **GPIO 19** (MOTOR-B NMB M1N10 5V brushed motor)
- **L298N INT4** $\rightarrow$ **GPIO 20**
- **L298N ENA / ENB** $\rightarrow$ Jumpered to +5V on module
- **FastLED Light Strip**: GPIO 17 (or onboard status LED on GPIO 8)

---

## 3. Flashing Your ESP32

### Option 1: 1-Click Batch Flasher (Windows — Easiest)
1. Plug your ESP32 into your computer via a USB data cable.
2. Double-click `flash_haxel.bat` inside this folder.
3. The script will automatically:
   - Check for Python (prompts to install via `winget` if missing).
   - Check for PlatformIO (prompts to install via `pip` if missing).
   - Present a menu to pick your target board (Default: `[1] ESP32-C3 WiFi + FastLED`).
   - Compile and flash both the **firmware** and the **LittleFS web portal filesystem**.

---

### Option 2: VS Code with PlatformIO (Cross-Platform GUI)
1. Install [VS Code](https://code.visualstudio.com/) and add the **PlatformIO IDE** extension.
2. In VS Code, choose **File $\rightarrow$ Open Folder...** and select this `firmware` directory.
3. Plug in your ESP32.
4. Open the PlatformIO alien icon on the left sidebar:
   - Under `c3WIFILED` (or your board of choice), click **Upload** to flash the code.
   - Under `c3WIFILED` $\rightarrow$ **Platform**, click **Upload Filesystem Image** (`uploadfs`).
     *(Note: This uploads `data/index.html`, `main.js`, and `styles.css` into the ESP32's LittleFS memory so it can serve the web portal!)*

---

### Option 3: Command Line (CLI)
```bash
# Upload firmware binary
pio run -e c3WIFILED -t upload

# Upload LittleFS web portal filesystem (REQUIRED for WiFi portal)
pio run -e c3WIFILED -t uploadfs

# Optional: Monitor serial output @ 115200 baud
pio device monitor
```

*For Bluetooth-only builds (no WiFi portal required):*
```bash
pio run -e c3BLULED -t upload
```

---

## 4. First Boot & Connecting

1. Once flashing finishes, disconnect and reconnect USB or press the **RESET** button.
2. **Wi-Fi Portal Mode**:
   - On your smartphone, tablet, or laptop, open your Wi-Fi settings.
   - Connect to the open network **`Haxel-XXXX`** (where `XXXX` is your board's unique MAC suffix).
   - The **Bauhaus captive portal** will open automatically!
   - If it doesn't open automatically, navigate to `http://192.168.4.1` in any browser.
3. **Web Bluetooth Mode** (if flashed with `c3BLULED` or `c6BLULED`):
   - Open Chrome or Edge on PC/Mac/Android.
   - Navigate to [bluetooth.html](https://dillonsimeone.com/Projects/Haxel/bluetooth.html).
   - Click **CONNECT BLE** and select your `Haxel-XXXX` device.

---

## 5. FastLED Strip Customization

Haxel features built-in FastLED support for WS2812B strips:
- Visualizes haptic patterns in real time with an attack/release envelope filter.
- Changes color based on active pattern signature RGB or procedural rainbow sweeps.
- To change pins or LED count at any time:
  1. Open the Haxel web portal.
  2. Tap **Settings $\rightarrow$ Hardware Configuration**.
  3. Under **FastLED Reactivity**, adjust **Data Pin** (GPIO 2, 3, 4, 5, 6, 7, 8, 10) and **LED Count** (1–300).
  4. Click **Save Hardware Configuration & Reboot**.
