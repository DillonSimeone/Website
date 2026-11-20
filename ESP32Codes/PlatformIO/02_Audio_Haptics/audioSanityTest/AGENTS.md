# Audio Sanity Test (INMP441)

## Overview
A target-focused sanity test for the **INMP441 I2S Microphone**. This project verifies that the microphone is wired correctly and providing data by calculating the mean amplitude and displaying it on two outputs:
1.  **Serial Plotter:** Visualizes the raw audio mean.
2.  **TFT Display:** Shows the instantaneous mean value as text.

## Hardware Setup
*   **Microcontroller:** ESP32
*   **Microphone:** INMP441
*   **Pins:**
    *   `I2S_WS`: 18
    *   `I2S_SD`: 17
    *   `I2S_SCK`: 21
*   **Display:** TFT_eSPI compatible screen (defined in PlatformIO build flags).

## Key Features
*   **Mean Calculation:** Averages 64 samples at 44.1kHz to determine volume level.
*   **Range Locking:** Uses fake serial print statements to lock the Serial Plotter range for easier viewing.
*   **TFT Feedback:** Real-time numerical feedback on an attached screen.
