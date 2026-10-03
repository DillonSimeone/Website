# ESP32-2432S028R Technical Documentation

## Overview
The "Cheap Yellow Display" (CYD) is a feature-rich development board that integrates an ESP32 with a 2.8" TFT.

> [!TIP]
> **Upload Mode:** This board often fails to auto-reset into download mode. **Hold the BOOT button** during the "Connecting..." phase of the upload to fix this.

## Key Components
- **MCU:** ESP32-WROOM-32
- **Display:** 2.8" 320x240 TFT (ILI9341 Driver)
- **Touch:** Resistive (XPT2046 Driver)
- **LDR:** Onboard light sensor (GPIO 34)
- **Audio:** PAM8002A Amplifier (GPIO 26)
- **RGB LED:** Common Anode (GPIO 4:R, 16:G, 17:B)
- **SD Card:** Micro SD Slot (SPI)

## Robot Control Protocol (ESP-NOW)
- **Role:** Master Controller
- **Target:** Broadcast (`FF:FF:FF:FF:FF:FF`)
- **Packet Structure:**
  - `command`: char[16] (e.g., "UP", "SLIDE_L", "ROT_R")

## Useful Links
- [Witnessmenow's CYD Mega-Repo](https://github.com/witnessmenow/ESP32-Cheap-Yellow-Display) - The definitive community resource.
- [Random Nerd Tutorials: CYD Guide](https://randomnerdtutorials.com/esp32-cheap-yellow-display-cyd/)
- [Renzo Mischianti: CYD High-Res Pinout & Schema](https://www.mischianti.org/2023/07/13/esp32-2432s028-cheap-yellow-display-high-resolution-pinout-and-specs/)

## Schematic Summary
- **VCC:** 5V via USB or P1 header.
- **Logic:** 3.3V.
- **Serial:** CH340 USB-to-UART chip.
- **RGB LED:** Wired to 3.3V, switched by GPIOs (Active LOW).
- **LDR:** Divider circuit between 3.3V and GND, wiper to GPIO 34.

## Board Variants
- **Single USB:** Standard version (Micro-USB).
- **Dual USB:** Newer version (USB-C + Micro-USB for power).
- **Capacitive Touch:** Some newer versions (ESP32-2432S028**C**) use capacitive touch instead of resistive. *Note: This folder focuses on the resistive **R** version.*
