# ESP32I2SMic

## Overview
This project appears to be a development or testing version of the audio-reactive LED/Motor controller found in `CogworksMiniESP32C3`. It focuses on testing the I2S microphone input and LED visualization, with other features (motor control, web portal) currently disabled in the code.

## Key Features
*   **Audio Analysis:** Captures audio via I2S (likely INMP441) and performs FFT to extract frequency and amplitude.
*   **Reactive Lighting:** Changes LED color based on audio frequency and brightness based on amplitude.
*   **Disabled Features:** Code contains logic for Motor Control and a Web Captive Portal, but they are currently commented out in the `setup()` and `loop()` functions.

## Hardware Config
*   **Microphone:** I2S Interface (SCK: 4, WS: 15, SD: 16).
*   **LEDs:** Pin 13 (Count: 64).
*   **Motors:** Pins defined but logic disabled.

## Dependencies
*   `WiFi`, `WebServer`, `DNSServer`
*   `driver/i2s.h`
*   `arduinoFFT`
*   `Adafruit_NeoPixel` (Default) or `FastLED`
