# ESP32-C3 SuperMini Knowledge Base

## 1. Hardware Overview
The **ESP32-C3 SuperMini** is a tiny, IoT-focused development board based on the Espressif ESP32-C3 RISC-V chip. It features WiFi and Bluetooth 5 (LE) in a thumb-sized form factor (22.52 x 18mm).

*   **CPU:** 32-bit RISC-V Single-core @ 160 MHz
*   **Memory:** 400KB SRAM, 384KB ROM, 4MB Flash
*   **Wireless:** WiFi 2.4GHz (802.11b/g/n) + Bluetooth 5.0 (BLE)
*   **Power:** 3.3V - 6V input (via 5V pin). Deep sleep ~43uA.
    *   *Warning:* Do not connect external power to `5V` pin and USB simultaneously.
*   **Onboard LED:** GPIO 8 (Blue).

## 2. Pin Definitions & Interfaces
**Note:** The board uses the "ESP32C3 Dev Module" definition in Arduino.

### General Pinout
| Function | GPIO / Pin | Notes |
| :--- | :--- | :--- |
| **LED** | **GPIO 8** | Active HIGH (per examples). Shared with I2C SDA. |
| **I2C** | **SDA: 8**, **SCL: 9** | Default hardware I2C pins. |
| **SPI** | **SCK: 4**, **MISO: 5**, **MOSI: 6**, **SS: 7** | Default hardware SPI pins. |
| **UART1**| **TX: 21**, **RX: 20** | Hardware Serial (Serial1). Requires "USB CDC On Boot: Disabled" to act as primary if using external adapter. |
| **USB** | **D-/D+** | Native USB Serial / JTAG (Use `Serial` in code). |

### Analog (ADC) Mapping
| Label | GPIO |
| :--- | :--- |
| A0 | GPIO 0 |
| A1 | GPIO 1 |
| A2 | GPIO 2 |
| A3 | GPIO 3 |
| A4 | GPIO 4 |
| A5 | GPIO 5 |

## 3. Development Environment Setup (Arduino IDE)

1.  **Board Manager URL:**
    `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
2.  **Install Board Package:**
    *   Go to **Tools > Board > Boards Manager**.
    *   Search "esp32" (by Espressif Systems). Install the latest version.
3.  **Board Configuration:**
    *   **Board:** `ESP32C3 Dev Module`
    *   **USB CDC On Boot:** `Enabled` (Critical for `Serial.print` over USB-C).
    *   **Flash Mode:** `QIO` (or DIO).
    *   **Upload Speed:** `921600`.
    *   **Partition Scheme:** Default 4MB with spiffs.

## 4. Troubleshooting & Download Mode
If the COM port is not recognized or upload fails:

1.  **Enter Download Mode (Bootloader Mode):**
    *   Connect the board to PC.
    *   Press and **HOLD** the `BOOT` button.
    *   Press and **RELEASE** the `RESET` button.
    *   **RELEASE** the `BOOT` button.
    *   *The board should now appear as a generic serial device waiting for upload.*
2.  **No Serial Output?**
    *   Ensure `USB CDC On Boot` is set to `Enabled` in the Tools menu.
    *   Use `Serial.begin(115200);` in setup.

## 5. Basic Code Snippets

### Blink (Onboard LED)
```cpp
// GPIO 8 is the onboard Blue LED
const int ledPin = 8;

void setup() {
  pinMode(ledPin, OUTPUT);
}

void loop() {
  digitalWrite(ledPin, HIGH); // On
  delay(1000);
  digitalWrite(ledPin, LOW);  // Off
  delay(1000);
}
```

### WiFi Station (Scan)
```cpp
#include "WiFi.h"

void setup() {
  Serial.begin(115200);
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);
}

void loop() {
  Serial.println("Scanning WiFi...");
  int n = WiFi.scanNetworks();
  if (n == 0) {
    Serial.println("No networks found");
  } else {
    Serial.print(n);
    Serial.println(" networks found");
    for (int i = 0; i < n; ++i) {
      Serial.print(i + 1);
      Serial.print(": ");
      Serial.print(WiFi.SSID(i));
      Serial.print(" (");
      Serial.print(WiFi.RSSI(i));
      Serial.println(")");
    }
  }
  delay(5000);
}
```

## 6. Project History & Context (The "Insanity")

### MicroPython vs. C++ (OSC & WiFi Juggling)
This project initially attempted to implement a robust OSC-controlled IO device using **MicroPython**. However, it encountered significant stability and performance issues ("insanity") when trying to juggle:
*   Reliable WiFi connectivity (Station + AP fallback).
*   High-frequency UDP/OSC packet processing.
*   Real-time hardware control (PWM/Pin toggling).

The ESP32-C3 SuperMini, while capable, struggled with the MicroPython overhead for this specific concurrent workload. The decision was made to port the entire logic to **C++ (PlatformIO/Arduino)** to gain:
*   **Stability:** Better memory management and lower level control over WiFi/UDP stacks.
*   **Performance:** Faster GPIO manipulation and immediate OSC parsing.
*   **Control:** Direct usage of FreeRTOS tasks (if needed) and hardware timers (LEDC for PWM).

The current `src/main.cpp` represents the stabilized C++ version, featuring:
*   **Dual Mode:** Web Configuration Mode vs. OSC Runtime Mode.
*   **WiFi Manager:** Auto-connects to saved credentials or falls back to AP (`OSCdevice`).
*   **Dynamic Mapping:** JSON-configurable mapping of OSC addresses to hardware pins (Toggle, Pulse, PWM).

