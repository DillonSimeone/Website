# ESP32-C3 FastLED with ESP-NOW

This firmware enables ESP32-C3 microcontrollers to act as wireless LED nodes controlled via **ESP-NOW** from the desktop tray application (`GoveeTrayControl`).

## Features
* **Zero Wi-Fi router latency:** Uses ESP-NOW (peer-to-peer 2.4GHz wireless) with response times under 5ms.
* **FastLED Engine:** Drives WS2812B, SK6812, WS2811 LED strips with hardware precision.
* **Built-in Patterns:**
  * `0`: Solid Color
  * `1`: Rainbow Cycle
  * `2`: Fire2012 Simulation
  * `3`: Breathing / Pulse
  * `4`: Twinkle / Sparkle
  * `5`: Color Chase
* **Power, Brightness & RGB Controls:** Instant sync over wireless packets.

---

## Hardware Pinout (ESP32-C3)
| ESP32-C3 Pin | WS2812B LED Strip | Notes |
|---|---|---|
| **GPIO 8** | **DIN (Data In)** | Configurable in `main.cpp` (`#define LED_PIN 8`) |
| **5V / VBUS** | **5V / VDD** | Power for LEDs (use external 5V supply for >30 LEDs) |
| **GND** | **GND** | Common ground |

---

## How to Build & Flash with PlatformIO
From this directory:
```bash
# 1. Build firmware
pio run

# 2. Upload to ESP32-C3 (connected via USB)
pio run -t upload

# 3. Monitor Serial logs
pio run -t monitor
```

---

## Gateway Bridge Architecture
Since standard PC Wi-Fi cards cannot directly send ESP-NOW frames to non-associated nodes without specialized packet injection, two options are available:

1. **Option A (Recommended: Wi-Fi to ESP-NOW UDP Gateway):**
   * Flash `src/espnow_gateway_bridge.cpp.example` to ONE spare ESP32 on your home Wi-Fi.
   * The Python Tray App sends small UDP packets to this bridge on port `4210`.
   * The bridge immediately broadcasts the packets over ESP-NOW to all battery/node ESP32-C3s simultaneously.
2. **Option B (USB Serial Bridge):**
   * Plug one ESP32 into a USB port on the PC.
   * Python sends packet bytes over COM port; the plugged-in ESP32 broadcasts via ESP-NOW.
