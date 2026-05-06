# ESP32HapticControl_INMP441

## Overview
This project is a sophisticated **Haptic & Light Controller** using an **I2S Microphone (INMP441)**. It performs real-time audio analysis to drive a vibration motor and LED strips with highly configurable logic. Uniquely, it hosts a **standalone local website** (Captive Portal) that allows users to fine-tune every aspect of the haptic feedback and lighting response wirelessly from their phone or computer.

## Key Features
*   **I2S Audio Analysis:** Samples audio at 16kHz using an INMP441 microphone and performs FFT to extract "Band Energy" (Bass/Mid/Treble) and "Peak Frequency".
*   **Advanced Haptics:** Drives a vibration motor (via H-Bridge) with configurable modes (Forward, Reverse, Alternating, Off) which can be assigned to specific frequency bands (e.g., vibrate only on Bass). Includes transient detection for "kick" boosting.
*   **Dual-Mode Lighting:**
    *   **Peak Mode:** The entire LED strip changes color based on the dominant frequency.
    *   **Splitter Mode:** Divides the LED strip into 3 distinct sections (Bass/Mid/Treble) that respond individually to the energy in their respective bands.
*   **"Noodle" LED:** A separate single-color LED string driven by PWM, brightness-mapped to overall volume.
*   **Captive Portal & Web Dashboard:**
    *   **Access Point:** Creates a WiFi network named `DillonSimeoneGeLu`.
    *   **Captive Portal:** Automatically redirects connected devices to the control dashboard.
    *   **Live Customization:** Serves a rich HTML/JS interface for **real-time monitoring** (visualizing audio levels, frequency, and motor duty) and **deep configuration** of over 20 parameters, including:
        *   Mic Gain and Motor Intensity/Gate.
        *   Motor Power Curve and Smoothing.
        *   Band-specific logic (e.g., set Bass to 'Reverse' motor mode).
        *   Transient/Kick threshold and boost duration.
        *   LED brightness, attack, and release times.
    *   **Persistence:** All settings are saved to the ESP32's non-volatile memory (`Preferences`).

## Hardware Config
*   **Microphone:** INMP441 (I2S) -> SCK: 20, WS: 10, SD: 21.
*   **Motor Driver:** Forward: Pin 9, Reverse: Pin 7.
*   **LEDs:** WS2812 Strip on Pin 1.
*   **Noodle LED:** PWM on Pin 8.

## Dependencies
*   `arduinoFFT`
*   `FastLED`
*   `Preferences`, `WebServer`, `DNSServer` (ESP32 Standard)