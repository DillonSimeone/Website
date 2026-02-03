# Bluetooth Mic (AudioTools)

## Overview
A project exploring audio streaming from an **INMP441 I2S Microphone** using the **AudioTools** library. It highlights the technical constraints of streaming audio over Bluetooth on the ESP32-C3.

## Hardware Setup
*   **Microcontroller:** ESP32-C3 SuperMini
*   **Microphone:** INMP441
*   **Pins:**
    *   `WS`: 3
    *   `SCK`: 5
    *   `SD`: 4

## Key Features
*   **AudioTools Integration:** Uses a high-level stream-based approach for audio handling.
*   **CSV Serial Output:** Streams audio data directly to the Serial Plotter in CSV format.
*   **Documentation:** Includes technical notes on BLE vs. Bluetooth Classic for audio profiles (HFP/HSP).
