# ESP32NOW Robot Controller (Receiver)

This project is the receiver side for the Omni-Wheel Robot. it runs on a Freenove ESP32 and controls two L298N motor drivers.

## Features
- **Web-Based Pin Config:** Connect to `OmniBot_Setup` (Pass: `12345678`) to reassign pins on the fly.
- **ESP-NOW Receiver:** Listens for broadcast commands from the CYD Controller.
- **L298N Mini Support:** Optimized for 2-pin driver logic (PWM on IN1/IN2, no Enable pin).
- **Persistent Settings:** settings saved to NVS.

## Hardware Preparation (L298N Mini)

This code is designed for **L298N Mini** or similar 2-pin H-Bridges:

1.  **Wiring:** Connect 2 ESP32 pins to the IN1/IN2 of each motor driver channel.
2.  **Power:** Ensure common ground between the Battery and ESP32.
3.  **Warning:** The code defaults to a safe pinout (avoiding input-only pins 34-39), but the web interface allows remapping. Ensure you only select valid OUTPUT pins.

## Default Pinout (Configurable)
- **RF:** 32, 33
- **LF:** 25, 26
- **RB:** 27, 14
- **LB:** 12, 13 (Swapped from 34/35 due to hardware limits)

## Getting Started
1. Wire the motors according to `PINS.md`.
2. Connect the Freenove ESP32 to your PC.
3. Run `upload.bat`.
4. Open the Serial Monitor.

## Wireless Pairing
The master (CYD) is set to **Broadcast mode**. As long as this receiver is in Station (STA) mode and initialized, it will pick up the commands on the same WiFi channel (usually Channel 1 by default).
