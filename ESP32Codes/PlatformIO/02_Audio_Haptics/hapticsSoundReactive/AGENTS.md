# Sound Reactive Haptics

## Overview
A simple, high-speed test for sound-reactive haptic feedback. It uses 32-bit I2S sampling to drive digital outputs with low latency.

## Hardware Setup
*   **Microcontroller:** ESP32
*   **Microphone:** I2S (Pins: SCK 14, WS 15, SD 30).
*   **Feedback:** Digital Pins 2 and 13.

## Key Features
*   **High Bit-Depth Sampling:** Reads 32-bit audio samples for precise threshold detection.
*   **Low-Latency Trigger:** Directly drives output pins when audio exceeds a hardcoded threshold.
*   **Minimalist Design:** Focused on performance and direct feedback.
