# PiPico (RP2040 Projects)

## Overview
This directory contains projects designed for the **Raspberry Pi Pico (RP2040)** using the Arduino framework.

## Sub-Projects

### 1. `i2SPico` (Audio Visualizer)
A functional I2S audio visualizer for the Pi Pico.
*   **Audio Input:** Reads from an I2S microphone (e.g., INMP441) using the `I2S` library.
    *   SD: GP0, WS: GP2, SCK: GP1, SEL: GP3.
*   **Visualization:** Uses FFT to determine frequency and amplitude, mapping them to LED hue and brightness respectively.
*   **LEDs:** Drives a WS2812B/NeoPixel strip on GP4.
*   **Status:** Blinks the onboard LED (GP25) if no audio signal is detected.

### 2. `buttonsSetSolidColorStrip` (Hardware Test)
A simple utility to test GPIO buttons and LED control.
*   **Input:** Maps almost every available GPIO pin (0-28, excluding LED pin) to a unique color.
*   **Function:** Pressing a button triggers the LED strip (connected to GP2) to display that button's assigned color. Useful for verifying button matrix wiring.

## Dependencies
*   `arduinoFFT`
*   `FastLED` OR `Adafruit_NeoPixel`
*   `I2S` (RP2040 Arduino Core)
