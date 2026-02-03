# WebFastLed: Live-Programmable LED Control

## Overview
An advanced, browser-based LED pattern development environment. It allows users to write mathematical expressions in a dedicated web UI that are then parsed and executed in real-time on the ESP32 to drive NeoPixels.

## Hardware Setup
*   **Microcontroller:** ESP32
*   **LED Strip:** WS2812B (Pin 2, configurable via web API).
*   **Filesystem:** Uses LittleFS to store settings and saved patterns.

## Key Features
*   **Expression Engine:** A custom-built lexer and parser (VM) that evaluates math expressions for every pixel at 30+ FPS.
*   **Web IDE:** A sleek web interface with a code editor, color picker, and real-time "Live" preview.
*   **Standard Functions:** Support for `sin()`, `cos()`, `hsv()`, `rgb()`, `triangle()`, they variables like `index`, `time`, and `n` (pixel count).
*   **mDNS & API:** Accessible via `http://WFL.local`. Includes a JSON API for settings management and pattern CRUD operations.
*   **WiFi Fallback:** Attempts to connect to a preset home network ("CumZone") before falling back to its own Access Point.
