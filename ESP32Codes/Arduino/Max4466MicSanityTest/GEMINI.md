# Max4466MicSanityTest

## Overview
A simple utility sketch to verify the operation of a **MAX4466 Analog Microphone** connected to an ESP32. It performs a basic FFT analysis and prints the raw ADC value and detected peak frequency to the Serial Monitor.

## Hardware Config
*   **Microphone:** MAX4466 Analog Mic on **Pin 2** (ADC).

## Dependencies
*   `arduinoFFT`

## Usage
1.  Upload to ESP32.
2.  Open Serial Monitor at 115200 baud.
3.  Speak or play sound into the mic to see the detected frequency.
