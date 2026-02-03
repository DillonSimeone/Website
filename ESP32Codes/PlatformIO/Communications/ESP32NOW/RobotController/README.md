# ESP32NOW Robot Controller (Receiver)

This project is the receiver side for the Omni-Wheel Robot. it runs on a Freenove ESP32 and controls two L298N motor drivers.

## Features
- **ESP-NOW Receiver:** Listens for broadcast commands from the CYD Controller.
- **Dual Motor Driver Support:** Wired for 4-wheel Omni-drive.
- **Serial Debugging:** Prints all received commands for testing.

## Hardware Preparation (6-Pin PWM Mode)

To use this code, you must prepare your L298N drivers for PWM speed control:

1. **Yank the Jumpers**: Remove the two black jumpers on the ENA and ENB headers.
2. **Solder the Signal Pins**: Connect the ESP32 PWM pins to the **OUTER** pins of the ENA/ENB headers (the ones further from the heatsink).
3. **WARNING**: The inner pins of those headers output **5V**. Connecting these to an ESP32 will likely destroy the GPIO pin or the whole chip. Always double-check with a multimeter or by tracing the traces on the bottom of the PCB.

## Common Ground
Ensure the **Negative (-)** terminal of your motor battery is connected to the **GND** of the ESP32. Without a common ground, the signals will not work.

## Getting Started
1. Wire the motors according to `PINS.md`.
2. Connect the Freenove ESP32 to your PC.
3. Run `upload.bat`.
4. Open the Serial Monitor.

## Wireless Pairing
The master (CYD) is set to **Broadcast mode**. As long as this receiver is in Station (STA) mode and initialized, it will pick up the commands on the same WiFi channel (usually Channel 1 by default).
