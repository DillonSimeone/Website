# Ember — Quick Start & Architecture Guide

Welcome to **Ember**, a high-performance, sound-reactive pattern engine for the ESP32-C3. This document outlines how to compile and flash the firmware/filesystem, how to connect to the device, and provides a high-level overview of the architecture and features.

---

## 1. How to Build & Flash

Ember is built using **PlatformIO** inside a Windows/VS Code development environment.

### Prerequisites
* **PlatformIO CLI** installed and added to your system path.
* An **ESP32-C3** development board connected via USB.

### Auto-Detection Flash (One-Click)
In the [`firmware/`](file:///f:/Github/Website/public/ESP32Codes/PlatformIO/Visuals_Art/Ember/firmware) directory, run the custom flash utility:
```cmd
upload.bat
```
This batch script will:
1. Scan for active ESP32-C3 ports (using USB VID `303A` for Espressif).
2. Compile and upload the binary firmware (`pio run --target upload`).
3. Compile and upload the `data/` folder as a **LittleFS** filesystem partition (`pio run --target uploadfs`).
4. Automatically start the PlatformIO Serial Monitor on the detected port.

### Manual Command-Line Flash
If you prefer running commands manually, navigate to [`firmware/`](file:///f:/Github/Website/public/ESP32Codes/PlatformIO/Visuals_Art/Ember/firmware) and execute:
```sh
# Build and upload the C++ firmware
pio run --target upload

# Build and upload the web UI filesystem (LittleFS)
pio run --target uploadfs

# Open the serial monitor
pio device monitor
```

---

## 2. How to Connect

Once flashed and booted, Ember hosts its own wireless network and serves a **Captive Portal** for zero-configuration access.

### Step 1: Connect to the Access Point
1. Open the Wi-Fi settings on your phone, tablet, or laptop.
2. Connect to the network:
 * **SSID:** `ember0` (configurable in settings)
 * **Password:** `ember123` (minimum WPA2 length of 8 characters)

### Step 2: Access the Web Dashboard
* **Automatic Popup (Captive Portal):** Upon connection, your device's operating system (iOS, Android, Windows, macOS) will automatically detect the gateway and prompt you with a sign-in popup displaying the dashboard.
* **Manual Access:** If your device does not trigger the captive portal automatically, open any web browser and navigate to:
 * [http://192.168.4.1/](http://192.168.4.1/)
 * [http://ember0.local/](http://ember0.local/) (via mDNS)

### Step 3: Connect to Home Wi-Fi (Optional)
Navigate to the **Settings** tab in the dashboard, enter your home Wi-Fi SSID and Password, and save. Ember will automatically switch to **Station (STA) Mode** and connect to your home router, falling back to AP Mode if connection fails.

---

## ️ 3. High-Level Feature Overview

Ember is engineered from the ground up to support responsive, real-time LED control on single-core microcontrollers without frame stutter.

```
 ┌─────────────────────────────────────┐
 │ ESP32-C3 Core 0 (Single Core) │
 │ │
 │ ┌────────────┐ ┌──────────────┐ │
 │ │ RenderTask │ │ WebServer / │ │
 │ │ (Prio 2) │ │ AsyncTCP │ │
 │ │ │ │ (Prio 3) │ │
 │ └─────┬──────┘ └──────┬───────┘ │
 └────────┼─────────────────┼──────────┘
 ▼ ▼
 RMT Peripheral WebSockets /
 (DMA LED Output) Captive Portal
```

### ️ Stack-Based Bytecode VM
* **Dynamic Compilation:** User-authored pattern expressions are sent as plain text over WebSockets and compiled **once** on the device into flat bytecode.
* **Pixelblaze-like Performance:** Evaluates compiled bytecode in a tight interpreter loop on a per-pixel, per-frame basis, achieving **60 FPS** on 60+ pixel strips (~14 µs/pixel vs. 190 µs/pixel on tree-walking interpreters).
* **Zero Steady-State Jitter:** Operand stacks and variables reside in pre-allocated memory pools; no heap allocation occurs during rendering.

### Lock-Free Atomic Program Swapping
* Uses `std::atomic<Program*>` to swap bytecode hot-paths instantly when you edit code. The rendering task captures the pointer atomically at the start of a frame, ensuring that hot-swaps never read half-compiled bytecode or cause visual glitches.

### FreeRTOS Task Isolation
* **Render Task (Priority 2):** Pinned to the core, rendering frames at 60Hz. It yields CPU time during DMA transfers.
* **Async Web Server Task (Priority 3):** Handles incoming TCP/WebSocket packets. Because communication is event-driven and runs at a higher priority, WebSocket edits preempt the render loop instantly, compiling and swapping bytecode in under 1ms without drops in render frame rate.
* **Hardware-Accelerated output:** LED data is pushed via the ESP32-C3's **RMT peripheral** using Direct Memory Access (DMA), consuming only ~50 µs of CPU time for a 60-pixel write.

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
