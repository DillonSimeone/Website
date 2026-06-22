# Web-Controlled & Audio-Reactive PWM

## Overview
A hybrid project that combines physical hardware control with browser-based audio processing. It allows users to control 4 PWM channels (e.g., for motors or LEDs) via a mobile-friendly web interface hosted directly on the ESP32.

## Hardware Setup
*   **Microcontroller:** ESP32
*   **PWM Pins:** GPIO 12, 13, 14, 15
*   **Networking:** Connects to a local Wi-Fi network or falls back to Access Point (AP) mode. Supports mDNS (`esp32.local`).

## Key Features
*   **Interactive Web UI:** A dark-themed, yellow-accented interface with sliders and buttons for real-time control.
*   **Browser-Based Audio Reaction:** Uses the browser's Web Audio API (`getUserMedia`) to analyze sound from the user's microphone. It translates sound volume into PWM commands, making the hardware react to the environment without needing a physical microphone on the ESP32.
*   **Captive Portal:** In AP mode, it automatically redirects users to the control page.
*   **mDNS Support:** Easily accessible via `http://esp32.local` on supported devices.
