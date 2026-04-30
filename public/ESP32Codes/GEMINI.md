# ESP32 & Microcontroller Project Portfolio

This repository contains a collection of ESP32, ESP32-C3, and other microcontroller projects. The codebase has been migrated from legacy Arduino `.ino` files to a structured **PlatformIO** environment managed within categorized subdirectories.

## 📁 Repository Structure (`/PlatformIO`)

Projects are organized by application to make them easy to find and maintain:

### 🎤 1. [Microphones](./PlatformIO/Microphones/)
*   **Purpose:** Audio input, I2S microphone tests, and haptic feedback projects.
*   **Key Projects:** Bluetooth Mic streaming, INMP441/INMP411 sanity tests, and audio-reactive haptics.

### 📡 2. [Communications](./PlatformIO/Communications/)
*   **Purpose:** Wireless protocols and networking.
*   **Key Projects:** ESP-NOW Sender/Receiver pairs, OSC (Open Sound Control), and Web-based PWM controllers.

### 🎨 3. [Visuals & Art](./PlatformIO/Visuals_Art/)
*   **Purpose:** LED animations, display drivers, and generative art.
*   **Key Projects:** CymaSpace FFT visualizations, FastLED palettes, and TFT/OLED display demos.

### 🏎️ 4. [Robotics & Vehicles](./PlatformIO/Robotics_Vehicles/)
*   **Purpose:** Motion control, telemetry, and input devices.
*   **Key Projects:** DataGlove (Sender/Receiver/Main), RatVehicle, and final course robotics projects.

### 📸 5. [Cameras](./PlatformIO/Cameras/)
*   **Purpose:** ESP32-CAM and video streaming.
*   **Key Projects:** Camera web servers, security triggers, and drone payloads.

### ⏰ 6. [Clocks](./PlatformIO/Clocks/)
*   **Purpose:** Timekeeping and information hubs.
*   **Key Projects:** PCB Clock (large asset management) and accessible/DeafClock designs.

### 🛠️ 7. [Hardware Specific](./PlatformIO/Hardware_Specific/)
*   **Purpose:** Code tailored to specific development boards or custom PCBs.
*   **Key Projects:** ESP32-2432S028R (CYD), MPU6050 IMU integration, and Cogworks Mini.

### 💡 8. [HelloWorld & Tests](./PlatformIO/HelloWorld_Tests/)
*   **Purpose:** Sanity tests and basic hardware verification.
*   **Key Projects:** Blink, Serial Terminal echoes, and PWM status light tests.

---

## 🚀 Development Workflow

### Project Anatomy
Each project folder contains:
- `src/main.cpp`: The primary source code (converted from `.ino`).
- `platformio.ini`: Project configuration (board, framework, and **library dependencies**).
- `upload.bat`: A one-click script to build, upload, and open the serial monitor.

### Adding New Projects
When adding a new project:
1.  Identify the correct category folder (e.g., `Visuals_Art`).
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
- **Library Management:** The legacy `ArduinoLibraries` folder has been removed. PlatformIO's `lib_deps` system is the source of truth for all external code.
- **MicroPython:** MicroPython experiments are located in their own dedicated root folder (not part of the C++ PlatformIO structure).
