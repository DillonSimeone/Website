# ESP32 Haptic Control (INMP441)

## Overview
A sophisticated project that converts environmental audio into haptic (vibrational) feedback and visual data. It features a real-time **Web Dashboard** for fine-tuning the experience over-the-air.

## Hardware Setup
*   **Microcontroller:** ESP32-C3
*   **Microphone:** INMP441 I2S
*   **Haptics:** Motor Driver connected to `MOTOR_PIN_FWD` (9) and `MOTOR_PIN_REV` (7).
*   **Visuals:** NeoPixels and "Noodle" LEDs.

## Key Features
*   **Real-time FFT:** Analyzes audio frequency and magnitude in real-time.
*   **Web Control Panel:** A captive portal/AP website (`DillonSimeoneGeLu`) allows users to adjust:
    *   Mic Gain and Gates.
    *   Motor Intensity and Power Curves.
    *   Frequency specific modes (Bass/Mid/Treble).
    *   LED attack/release and brightness.
*   **Transient Boost:** Detects sudden loud noises for sharp haptic response.
*   **AJAX Monitor:** The web UI updates live with audio levels and frequency data without page reloads.
