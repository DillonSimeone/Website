# Ember — Quick Start & Architecture Guide

Welcome to **Ember**, a high-performance, sound-reactive pattern engine for the ESP32-C3. This document outlines how to compile and flash the firmware/filesystem, how to connect to the device, and provides a high-level overview of the architecture and features.

---

## 1. How to Build & Flash

Ember is built using **PlatformIO** inside a Windows/VS Code development environment.

### Prerequisites
* **PlatformIO CLI** installed and added to your system path.
* An **ESP32-C3** development board connected via USB.

### Auto-Detection Flash (One-Click)
In the [`firmware/`](file:///f:/Github/Website/public/ESP32Codes/PlatformIO/03_Visuals_Art/Ember/firmware) directory, run the custom flash utility:
```cmd
upload.bat
```
This batch script defaults to the `audio` environment (pass `esp32c3` as an argument to override) and will:
1. Scan for active ESP32-C3 ports (using USB VID `303A` for Espressif).
2. Compile and upload the binary firmware (`pio run -e %PIO_ENV% --target upload`).
3. Compile and upload the `data/` folder as a **LittleFS** filesystem partition (`pio run -e %PIO_ENV% --target uploadfs`).
4. Automatically start the PlatformIO Serial Monitor on the detected port.

### Manual Command-Line Flash
If you prefer running commands manually, navigate to [`firmware/`](file:///f:/Github/Website/public/ESP32Codes/PlatformIO/03_Visuals_Art/Ember/firmware) and execute:
```sh
# Build and upload the C++ firmware (use -e audio or -e esp32c3)
pio run -e audio --target upload

# Build and upload the web UI filesystem (LittleFS)
pio run -e audio --target uploadfs

# Open the serial monitor
pio device monitor
```

---

## 2. How to Connect

Once flashed and booted, Ember hosts its own wireless network and serves a **Captive Portal** for zero-configuration access.

### Step 1: Connect to the Access Point
1. Open the Wi-Fi settings on your phone, tablet, or laptop.
2. Connect to the device's unique network:
 * **SSID:** `Ember-Audio-XXXX` (`audio` env) or `Ember-XXXX` (`esp32c3` env), suffixed with the chip's last 2 MAC bytes (configurable in settings)
 * **Password:** `ember123` (minimum WPA2 length of 8 characters)

### Step 2: Access the Web Dashboard
* **Automatic Popup (Captive Portal):** Upon connection, your device's operating system (iOS, Android, Windows, macOS) will automatically detect the gateway and prompt you with a sign-in popup displaying the dashboard.
* **Manual Access:** If your device does not trigger the captive portal automatically, open any web browser and navigate to:
 * [http://192.168.4.1/](http://192.168.4.1/)
 * `http://ember-audio-xxxx.local/` or `http://ember.local/` (via mDNS)

### Step 3: Connect to Home Wi-Fi (Optional, `esp32c3` env)
Navigate to the **Settings** tab in the dashboard, enter your home Wi-Fi SSID and Password, and apply. Standard `esp32c3` builds switch to **Station (STA) Mode** and fall back to AP Mode if connection fails (`audio` builds stay AP-only).

---

## ️ 3. High-Level Feature Overview

Ember is engineered from the ground up to support responsive, real-time LED control on single-core microcontrollers without frame stutter.

```
 ┌──────────────────────────────────────────────────────────────┐
 │ ESP32-C3 Core 0 (Single Core)                                │
 │                                                              │
 │ ┌────────────┐  ┌───────────┐  ┌──────────┐  ┌────────────┐  │
 │ │ RenderTask │  │ AudioTask │  │ loopTask │  │  AsyncTCP  │  │
 │ │  (Prio 2)  │  │ (Prio 1)  │  │ (Prio 1) │  │  (Prio 3)  │  │
 │ └─────┬──────┘  └───────────┘  └──────────┘  └─────┬──────┘  │
 └───────┼────────────────────────────────────────────┼─────────┘
         ▼                                            ▼
   RMT Peripheral                                WebSockets /
  (DMA LED Output)                             Captive Portal
```

### ️ Stack-Based Bytecode VM
* **Dynamic Compilation:** User-authored pattern expressions are sent as plain text over WebSockets and compiled **once** on the device into flat bytecode.
* **Pixelblaze-like Performance:** Evaluates compiled bytecode in a tight interpreter loop on a per-pixel, per-frame basis, achieving **50 FPS** locked frame pacing (~14 µs/pixel vs. 190 µs/pixel on tree-walking interpreters).
* **Zero Steady-State Jitter:** Operand stacks and variables reside in pre-allocated memory pools; no heap allocation occurs during rendering.

### Mutex-Protected Atomic Program Swapping
* Uses `std::atomic<Program*>` guarded by `g_progMu` to swap compiled bytecode cleanly when you edit code, ensuring the rendering task never reads freed or half-compiled bytecode.

### FreeRTOS Task Isolation
* **Render Task (Priority 2):** Pinned to Core 0, rendering frames at 50 Hz (`pdMS_TO_TICKS(20)`) using a 6 KB stack.
* **Async Web Server Task (Priority 3):** Handles incoming TCP/WebSocket packets. Because communication is event-driven and runs at a higher priority, WebSocket edits preempt the render loop quickly without dropping frames.
* **Hardware-Accelerated output:** LED data is pushed via the ESP32-C3's native ESP-IDF **RMT peripheral** (`rmt_write_sample` with an IRAM bit-translator ISR), offloading bit timing from the CPU loop.

### Sound-Reactive FFT Analyzer (Optional)
* Supports digital **INMP441 (I2S)** and analog **MAX4466 (ADC1)** microphones.
* Runs an isolated FreeRTOS audio task sampling at **16 kHz**, computing real-time FFT windows to produce:
 * **VU Level & Decaying Peak Level**
 * **Dominant Pitch Tracker**
 * **8 Logarithmic Frequency Bands** (Bass, Mid, Treble, and logarithmic intermediates)
* Accessible directly in the pattern editor through built-in helper functions (`bass()`, `mid()`, `treble()`, `band(n)`, etc.).

### Self-Contained Web Dashboard IDE
* Served entirely from the ESP32-C3's flash memory via LittleFS.
* **Custom Editor:** Hand-rolled textarea overlays providing live syntax highlighting, debounced compile-on-keystroke, and keyboard shortcuts.
* **HTML5 Canvas Simulator:** Runs a JS clone of the stack-based VM to render an exact preview of the LED output in real-time inside the browser, allowing pattern testing offline.
* **Presets & Settings:** Includes buttons to save/delete patterns, select LED pins, change pixel count, adjust brightness, configure microphones, and join network stations.
