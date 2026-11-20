# ESP32-C3 SuperMini Knowledge Base

## 1. Hardware Overview
The **ESP32-C3 SuperMini** is a tiny, IoT-focused development board based on the Espressif ESP32-C3 RISC-V chip. It features WiFi and Bluetooth 5 (LE) in a thumb-sized form factor (22.52 x 18mm).

*   **CPU:** 32-bit RISC-V Single-core @ 160 MHz
*   **Memory:** 400KB SRAM, 384KB ROM, 4MB Flash
*   **Wireless:** WiFi 2.4GHz (802.11b/g/n) + Bluetooth 5.0 (BLE)
*   **Power:** 3.3V - 6V input (via 5V pin). Deep sleep ~43uA.
    *   *Warning:* Do not connect external power to `5V` pin and USB simultaneously.
*   **Onboard LED:** GPIO 8 (Blue, Active HIGH).

## 2. Pin Definitions & Interfaces

### General Pinout
| Function | GPIO / Pin | Notes |
| :--- | :--- | :--- |
| **LED** | **GPIO 8** | Active HIGH. Shared with I2C SDA. |
| **I2C** | **SDA: 8**, **SCL: 9** | Default hardware I2C pins. |
| **SPI** | **SCK: 4**, **MISO: 5**, **MOSI: 6**, **SS: 7** | Default hardware SPI pins. |
| **UART1**| **TX: 21**, **RX: 20** | Hardware Serial (Serial1). |
| **USB** | **D-/D+** | Native USB Serial / JTAG. |

### Analog (ADC) Mapping
| Label | GPIO |
| :--- | :--- |
| A0 | GPIO 0 |
| A1 | GPIO 1 |
| A2 | GPIO 2 |
| A3 | GPIO 3 |
| A4 | GPIO 4 |
| A5 | GPIO 5 |

---

## 3. Development Environment: PlatformIO (Recommended)

PlatformIO is the recommended toolchain. It offers **automatic port detection**, dependency management, and a consistent CLI.

### Installation
1.  **VS Code Extension (Easiest):**
    *   Install "PlatformIO IDE" from the VS Code Extensions marketplace.
2.  **CLI Only:**
    ```bash
    pip install platformio
    ```

### Project Structure
PlatformIO projects follow this structure:
```
MyProject/
├── platformio.ini      # Project configuration
├── src/
│   └── main.cpp        # Main source file
├── include/            # Header files (optional)
├── lib/                # Project-specific libraries (optional)
└── upload.bat          # One-click upload script (optional)
```

### `platformio.ini` Template for ESP32-C3
```ini
[env:esp32c3]
platform = espressif32
board = esp32-c3-devkitm-1
framework = arduino

; Enable USB CDC for Serial output over USB-C
build_flags = 
    -DARDUINO_USB_MODE=1
    -DARDUINO_USB_CDC_ON_BOOT=1

upload_speed = 921600
monitor_speed = 115200
```

### Quick Commands (CLI)
| Command | Description |
| :--- | :--- |
| `pio run` | Compile the project |
| `pio run -t upload` | Compile and upload to board |
| `pio device monitor` | Open serial monitor |
| `pio run -t upload && pio device monitor` | Upload then monitor |

### One-Click Upload Script (`upload.bat`)
Every project can include an `upload.bat` for easy deployment:
```batch
@echo off
pio run --target upload
if %ERRORLEVEL% EQU 0 (
    timeout /t 2 /nobreak >nul
    pio device monitor
)
pause
```
Double-click to build, upload, and open the serial monitor automatically.

---

## 4. Troubleshooting & Download Mode

If the COM port is not recognized or upload fails:

### Enter Download Mode (Bootloader Mode)
1.  Connect the board to PC.
2.  Press and **HOLD** the `BOOT` button.
3.  Press and **RELEASE** the `RESET` button.
4.  **RELEASE** the `BOOT` button.
5.  The board should now appear as a serial device ready for upload.

### No Serial Output?
*   Ensure `ARDUINO_USB_CDC_ON_BOOT=1` is set in `build_flags`.
*   Use `Serial.begin(115200);` in setup.
*   Add a small delay after `Serial.begin()` to allow USB CDC to initialize:
    ```cpp
    Serial.begin(115200);
    delay(500);  // Wait for USB CDC
    ```

### Port Detection Issues
PlatformIO auto-detects ports. If it fails:
```ini
; Force a specific port in platformio.ini
upload_port = COM5
monitor_port = COM5
```

---

## 5. Code Examples

### Blink (Digital I/O)
```cpp
const int LED_PIN = 8;  // Onboard Blue LED

void setup() {
    pinMode(LED_PIN, OUTPUT);
}

void loop() {
    digitalWrite(LED_PIN, HIGH);
    delay(1000);
    digitalWrite(LED_PIN, LOW);
    delay(1000);
}
```

### PWM Breathing LED
```cpp
const int LED_PIN = 8;
const int PWM_FREQ = 5000;
const int PWM_RES = 8;  // 8-bit: 0-255

void setup() {
    ledcAttach(LED_PIN, PWM_FREQ, PWM_RES);
}

void loop() {
    // Fade in
    for (int duty = 0; duty <= 255; duty++) {
        ledcWrite(LED_PIN, duty);
        delay(6);
    }
    // Fade out
    for (int duty = 255; duty >= 0; duty--) {
        ledcWrite(LED_PIN, duty);
        delay(6);
    }
}
```

### WiFi Scan
```cpp
#include <WiFi.h>

void setup() {
    Serial.begin(115200);
    delay(500);
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();
}

void loop() {
    Serial.println("Scanning...");
    int n = WiFi.scanNetworks();
    for (int i = 0; i < n; i++) {
        Serial.printf("%d: %s (%d dBm)\n", i + 1, WiFi.SSID(i).c_str(), WiFi.RSSI(i));
    }
    delay(5000);
}
```

---

## 6. Arduino IDE (Legacy)

If you prefer Arduino IDE:

1.  **Board Manager URL:**
    `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
2.  **Board:** `ESP32C3 Dev Module`
3.  **USB CDC On Boot:** `Enabled`
4.  **Upload Speed:** `921600`

*Note: Arduino IDE requires manual COM port selection. PlatformIO handles this automatically.*
