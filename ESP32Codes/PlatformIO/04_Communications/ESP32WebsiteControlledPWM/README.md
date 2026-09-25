# ESP32WebsiteControlledPWM

## Overview
This project enables remote control of PWM pins (e.g., for motors or LEDs) via a web interface hosted on the ESP32. Uniquely, the **audio reactivity is handled by the client's browser**, utilizing the device's microphone and Web Audio API, rather than processing audio on the ESP32 itself.

## Key Features
*   **Web Control Interface:** Serves a responsive HTML/JS dashboard with 4 control blocks.
*   **Client-Side Audio Reactivity:** Uses the **Web Audio API** in the browser to analyze audio from the controlling device's microphone (phone/laptop).
*   **Logic:** When audio energy exceeds a user-defined threshold in the browser, the JavaScript simulates a button press and sends a command to the ESP32.
*   **Dual Mode Connectivity:** Attempts to connect to a known WiFi network (STA). If it fails, it creates its own Access Point (`ESP32-AP`).
*   **Captive Portal:** Redirects all requests to the controller interface when in AP mode.

## Hardware Config
*   **PWM Outputs:** Pins 12, 13, 14, 15.
*   **Platform:** ESP32.

## Dependencies
*   `WiFi`, `WebServer`, `DNSServer`, `ESPmDNS` (Standard ESP32 libs).

## Usage
1.  Connect to `ESP32-AP` (Password: `12345678`) or the local network IP.
2.  Navigate to `http://esp32.local` (or the IP).
3.  Tap the screen to enable Microphone access.
4.  Use sliders to set PWM power.
5.  Check "Audio reactive" and adjust the "Audio threshold" slider to trigger the pins with sound.
