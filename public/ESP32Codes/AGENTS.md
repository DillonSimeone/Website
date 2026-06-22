# ESP32 & Microcontroller Project Portfolio

This repository contains a collection of ESP32, ESP32-C3, and other microcontroller projects. The codebase is organized within a structured **PlatformIO** environment managed within categorized subdirectories.

## 📁 Repository Structure (`/PlatformIO`)

Projects are organized into 8 numbered top-level category folders for easy discovery and clean maintenance:

### 💡 1. [01_Starters_Tests](./PlatformIO/01_Starters_Tests/)
*   **Purpose:** Basic board verification, hardware sandboxes, and starter templates.
*   **Key Projects:** BlinkTest, PWMStatusLight, xYmotorLedStrip, and ESP32C3Starter.

### 🔊 2. [02_Audio_Haptics](./PlatformIO/02_Audio_Haptics/)
*   **Purpose:** Audio processing, microphone sanity tests (INMP441, INMP411, MAX4466), and tactile/haptic feedback systems (Haxel, WirelessHaptic).
*   **Key Projects:** Bluetooth Mic streaming, I2S Mic test, sound-reactive haptic controllers.

### 🎨 3. [03_Visuals_Art](./PlatformIO/03_Visuals_Art/)
*   **Purpose:** LED animations, display drivers (TFT, OLED, MAX7219), and custom wearable electronics.
*   **Key Projects:** CymaSpace FFT visualizers, Ember, LightBaton, CarrieBrainBadge, and WebFastLed.

### 📡 4. [04_Communications](./PlatformIO/04_Communications/)
*   **Purpose:** Wireless protocols including ESP-NOW, WiFi web servers, and OSC controls.
*   **Key Projects:** DeafDoorbell Leader/Follower, ESP32NOW sender/receiver pairs, and Web-controlled PWM.

### 🏎️ 5. [05_Robotics_Vehicles](./PlatformIO/05_Robotics_Vehicles/)
*   **Purpose:** Motion control, custom telemetry gloves, and mobile vehicular systems.
*   **Key Projects:** DataGlove (Main, Sender, Receiver), RatVehicle, camera drone wheels, and final course robotics.

### ⏰ 6. [06_Clocks](./PlatformIO/06_Clocks/)
*   **Purpose:** Assistive technology and visual clock hardware.
*   **Key Projects:** DeafClock and PCBClock.

### 📸 7. [07_Cameras](./PlatformIO/07_Cameras/)
*   **Purpose:** ESP32-CAM firmware, camera web server hosting, and streaming configurations.
*   **Key Projects:** ESP32Cameras (ESP32S3 and FreeNove Wrover Dev).

### 🛠️ 8. [08_Hardware_Specific](./PlatformIO/08_Hardware_Specific/)
*   **Purpose:** Projects tailored for specific development boards (CYD, Cogworks Mini) or custom PCB verification.
*   **Key Projects:** ESP32-2432S028R (CYD), CogworksMiniESP32C3, and Microcontroller2PCB2025Winter.

---

## 🚀 Development Workflow

### Project Anatomy
Each project folder contains:
- `src/main.cpp`: The primary source code.
- `platformio.ini`: Project configuration (board, framework, and **library dependencies**).
- `upload.bat`: A one-click script to build, upload, and open the serial monitor.

### Adding New Projects
When adding a new project:
1.  Identify the correct category folder (e.g., `03_Visuals_Art`).
2.  Create a new directory for your project.
3.  Include a `src/main.cpp` and a `platformio.ini`.
4.  **Dependencies:** Do not add libraries manually. Instead, list them in `platformio.ini` under `lib_deps`. PlatformIO will automatically download and manage them.

### One-Click Upload Template
Every project should include an `upload.bat` for convenience:
```batch
@echo off
pio run --target upload
if %ERRORLEVEL% EQU 0 (
    timeout /t 2 /nobreak >nul
    pio device monitor
)
pause
```

---

## 🛠️ Infrastructure Notes
- **Library Management:** PlatformIO's `lib_deps` system is the source of truth for all external code.
- **MicroPython:** MicroPython experiments are located in the [MicroPython](./MicroPython/) root directory.

