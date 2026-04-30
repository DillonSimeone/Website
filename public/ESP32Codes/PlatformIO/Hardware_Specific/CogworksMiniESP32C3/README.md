# CogworksMiniESP32C3

## Overview
This project controls LEDs and motors based on audio input from an I2S microphone. It runs on an ESP32 (specifically geared towards the C3 Mini variant based on the name) and provides a captive portal for configuration.

## Key Features
*   **Audio Analysis:** Uses an I2S microphone (e.g., INMP441) to sample audio at 16kHz. Performs FFT (Fast Fourier Transform) to determine dominant frequency and calculates amplitude.
*   **Reactive Lighting:** Drives addressable LEDs (WS2812/NeoPixel). The color (hue) changes based on the dominant audio frequency, and brightness reacts to volume.
*   **Motor Control:** Toggles GPIO pins (connected to motors) when audio amplitude exceeds configurable thresholds.
*   **Web Interface:** Hosts a WiFi Access Point ("ESP32-Cogwork-Controller") with a Captive Portal. Users can connect and adjust sensitivity thresholds for each motor via a web page.

## Hardware Config
*   **Microphone:** I2S Interface (SCK: 2, WS: 4, SD: 1).
*   **LEDs:** Data Pin 8.
*   **Motors:** Pins 9, 10, 20, 21.

## Dependencies
*   `WiFi`, `WebServer`, `DNSServer` (Standard ESP32 libs)
*   `driver/i2s.h` (ESP-IDF)
*   `arduinoFFT`
*   `FastLED` OR `Adafruit_NeoPixel` (Configurable via `#define`)
