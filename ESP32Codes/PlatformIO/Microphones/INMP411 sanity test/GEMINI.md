# INMP411 Auto-Detect Sanity Test

## Overview
An advanced utility tool designed to solve the common headache of I2S wiring. This tool automatically identifies the correct pin configuration for an I2S microphone (specifically tested with the **INMP411** high-dynamic-range mic).

## How It Works
1.  **Permutation Scanning:** Provide a list of GPIO pins you have connected. The code generates all possible permutations for SCK, WS, and SD.
2.  **Signal Verification:** For each permutation, it initializes the I2S driver and checks for a valid, non-static audio signal.
3.  **Automatic Saving:** Once a working configuration is found, it saves the pin mapping to **Non-Volatile Storage (NVS)** using the `Preferences` library.
4.  **Instant Setup:** On subsequent boots, the tool loads the saved config and verifies the mic is still working.

## Hardware Features
*   **Soft Ground:** Support for using a GPIO as a ground pin if needed.
*   **Status LED:** Uses the onboard LED (inverted logic supported) to indicate scanning status and signal detection.
*   **Serial Commands:** Type 'r' in the Serial Monitor to clear the saved config and restart the scan.
