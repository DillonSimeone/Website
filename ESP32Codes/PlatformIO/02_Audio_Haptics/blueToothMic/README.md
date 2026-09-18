# blueToothMic (HFP)

A PlatformIO project for the **ESP32** to stream audio from an **INMP441 I2S Microphone** to a smartphone using **Bluetooth HFP**.

## Goal
Stream real-time audio to a smartphone's live transcript application (like Google Live Transcript), acting as a Bluetooth headset microphone.

## Hardware Setup
- **Board:** ESP32 DevKit (Full ESP32 required for Bluetooth Classic / HFP)
- **Mic:** INMP441 (I2S Digital Microphone)

### Wiring
| INMP441 Pin | ESP32 Pin | Notes |
| :--- | :--- | :--- |
| **VDD** | 3.3V | |
| **GND** | GND | |
| **L/R** | GND | Left Channel |
| **WS** | D15 | Word Select |
| **SCK** | D4 | Serial Clock |
| **SD** | D5 | Serial Data |
| **LED** | D2 | Built-in LED for amplitude visualization |

## Development Notes
- **Bluetooth:** Uses **Bluetooth Classic HFP (Hands-Free Profile)**. This allows the ESP32 to be recognized as a standard headset mic.
- **Codec:** Supports **mSBC (Wideband Speech)** at 16kHz for high-quality audio or **CVSD** at 8kHz.
- **Framework:** ESP-IDF v5.1.2.
- **Gain:** Includes digital gain boost for the INMP441.

## Quick Start
1.  Connect your INMP441 microphone as per the wiring table.
2.  Double-click `upload.bat` to build and upload the code.
3.  Pair your phone with `ESP32-Mic`.
4.  Open a phone call or Google Live Transcript to test.

## Documentation
For detailed architectural notes, troubleshooting, and critical fixes, see [GEMINI.md](./GEMINI.md).
