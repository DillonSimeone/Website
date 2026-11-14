# Max4466MicMotorControl

## Overview
This project controls LEDs and a Motor based on audio input from an analog **MAX4466 microphone**. It is designed for an ESP32.

## Key Features
*   **Analog Audio Processing:** Samples audio from the MAX4466 via an ADC pin. Calculates the DC offset and Mean Absolute Deviation (MAD) to determine volume levels.
*   **Frequency Analysis:** Uses FFT (Fast Fourier Transform) on the analog sample buffer to detect the dominant frequency.
*   **Reactive Lighting:**
    *   **Color (Hue):** Mapped to the dominant frequency (100Hz - 3000Hz).
    *   **Brightness:** Mapped to the audio volume (MAD) with attack/release smoothing. Includes a low-volume cutoff.
*   **Motor Control:** Drives a motor via PWM. The duty cycle increases with audio volume, kicking in only after a certain noise floor (`LEVEL_GATE`) is reached.

## Hardware Config
*   **Microphone:** MAX4466 Analog Mic on **Pin 2** (ADC).
*   **LEDs:** WS2812 strip on **Pin 1**.
*   **Motor:** MOSFET/Driver on **Pin 4**.

## Dependencies
*   `arduinoFFT`
*   `FastLED`
