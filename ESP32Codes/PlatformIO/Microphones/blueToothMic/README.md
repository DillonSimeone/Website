# blueToothMic

A PlatformIO project for the **ESP32-C3 SuperMini** to stream audio from an **INMP441 I2S Microphone** to a smartphone.

## Goal
Stream real-time audio to a smartphone's live transcript application, acting as an external microphone.

## Hardware Setup
- **Board:** ESP32-C3 SuperMini
- **Mic:** INMP441 (I2S Digital Microphone)

### Wiring
| INMP441 Pin | ESP32-C3 Pin | Notes |
| :--- | :--- | :--- |
| **VDD** | 3.3V | |
| **GND** | GND | |
| **L/R** | GND | Left Channel |
| **WS** | GPIO 3 | Word Select |
| **SCK** | GPIO 5 | Serial Clock |
| **SD** | GPIO 4 | Serial Data |

## Development Notes
- **Bluetooth:** The ESP32-C3 supports **BLE only**. Standard Bluetooth Hands-Free (HFP) / Headset (HSP) profiles used by most transcript apps typically require Bluetooth Classic (supported by original ESP32). 
- **LE Audio:** This project explores the use of LE Audio or custom BLE transmission. 
- **PlatformIO:** Integrated with the `ESP32C3Starter` workflow.

## Quick Start
1.  Connect your INMP441 microphone as per the wiring table.
2.  Double-click `upload.bat` to build and upload the code.
3.  Open the Serial Monitor to verify I2S initialization.

## Credits
Based on the [ESP32C3Starter](../ESP32C3Starter) template.
