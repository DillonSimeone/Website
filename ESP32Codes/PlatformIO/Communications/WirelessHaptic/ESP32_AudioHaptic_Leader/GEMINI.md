# ESP32 Audio Haptic Leader

## Overview
This is the **Leader (Sender)** module of the WirelessHaptic system. It reads audio from an INMP441 I2S microphone, performs FFT to calculate band energy (Bass/Mid/Treble/Transients), and broadcasts haptic control packets over ESP-NOW to all listening Haptic-Followers.

## Features
*   **Web UI Configurator**: A LittleFS-hosted web page accessible via the `DillonSimeoneHaptics` AP.
*   **Performance Toggle**: Set `#define ENABLE_WEB_UI false` to disable the heavy AP/Web server, allowing for maximum FFT/processing performance.
*   **Persistent Memory**: All settings modified in the Web UI are saved to non-volatile memory via `Preferences.h`. These are restored on boot, even if `ENABLE_WEB_UI` is turned off.
*   **ESP-NOW Broadcast**: Uses the open broadcast MAC (`FF:FF:FF:FF:FF:FF`) to stream a struct containing 4 separate channels of haptic data.
