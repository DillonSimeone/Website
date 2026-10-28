# Audio Reactive LEDs & Motors

## Overview
A versatile project that uses an I2S microphone to drive visual colors (NeoPixels) and haptic feedback (Motors) based on audio frequency and volume.

## Hardware Setup
*   **Microcontroller:** ESP32
*   **Microphone:** I2S Mic (Pins: SD 16, SCK 4, WS 15).
*   **Visuals:** WS2812 LED Strip (Pin 13).
*   **Haptics:** Multiple motor pins (9, 10, 20, 21).

## Key Features
*   **Frequency-to-Hue Mapping:** Maps detected audio frequency (FFT) to LED colors.
*   **Volume-to-Brightness Mapping:** Adjusts LED brightness based on audio magnitude.
*   **Multi-Channel Motor Control:** Supports independent thresholds for multiple haptic motors.
*   **Configuration Portal:** Includes a web interface (Captive Portal) to adjust motor thresholds dynamically.
