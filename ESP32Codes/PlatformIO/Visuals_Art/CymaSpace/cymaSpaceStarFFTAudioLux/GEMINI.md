# Audio Reactivity with CymaSpace Star

## Overview
A core component of the CymaSpace project that visualizes environmental audio using a large star-shaped LED array. It uses Fast Fourier Transform (FFT) to process audio and map it to colors.

## Hardware Setup
*   **Microcontroller:** ESP32
*   **Microphone:** I2S (Pins: SCK 23, WS 4, SD 22, SEL 5).
*   **LED Strip:** WS2812B (Pin 6, 150 LEDs).

## Key Features
*   **Frequency-to-Hue Mapping:** Uses the `arduinoFFT` library to identify the peak frequency and maps it to the 0-255 hue range.
*   **Amplitude-to-Brightness:** Maps the magnitude of the peak frequency to LED brightness for a dynamic, "pulsing" effect.
*   **Sample Rate:** Operates at 10kHz sampling for efficient but effective frequency detection.
