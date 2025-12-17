# Mircocontroller2PCB2025Winter

## Overview
This code serves as a hardware test/firmware for a custom PCB (likely a "Microcontroller 2" course project for Winter 2025). It integrates motor control, audio input, an OLED display, and addressable LEDs.

## Hardware Config
*   **Dual Motor Drivers:**
    *   Motor 1: Pins 17, 16
    *   Motor 2: Pins 7, 6
*   **OLED Display:** SSD1306 (I2C address 0x3C).
    *   SDA: Pin 19
    *   SCL: Pin 20
    *   *Note in code mentions potential trace swap issue.*
*   **Microphone:** I2S Interface.
    *   SD: 22, SCK: 23, WS: 4, L/R: 5.
*   **LEDs:** WS2812 strip on Pin 21.

## Functionality
*   Initializes all hardware peripherals.
*   Reads audio data from the I2S microphone and prints raw samples to the Serial Monitor/Plotter.
*   Displays "Hello World" on the OLED screen.
*   Sets motor pins to LOW (Safety init).

## Dependencies
*   `FastLED`
*   `Adafruit_GFX`, `Adafruit_SSD1306`
*   `driver/i2s.h` (ESP-IDF)
