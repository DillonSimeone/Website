# ESP32-2432S028R (Cheap Yellow Display - CYD)

## Robot Control Protocol (ESP-NOW)
- **Mode:** Station Mode (STA)
- **Role:** Master/Controller
- **Broadcast MAC:** `FF:FF:FF:FF:FF:FF`
- **Payload Structure:**
  ```cpp
  typedef struct struct_message {
      char command[16];
  } struct_message;
  ```

## Useful Links
The "Cheap Yellow Display" (CYD) is a feature-rich development board that integrates an ESP32 with a 2.8" TFT. It is a popular, low-cost integrated development board featuring an ESP32 dual-core processor and a 2.8-inch resistive touchscreen display. It's widely used for IoT dashboards, smart home controllers, and portable gadgets.

> [!TIP]
> **Upload Mode:** This board often fails to auto-reset into download mode. **Hold the BOOT button** during the "Connecting..." phase of the upload to fix this.

## Current Project: Omni-Wheel Robot Controller
This folder currently contains a 9-button touch interface for an omni-directional robot.
- **Protocol:** ESP-NOW (Broadcast mode: `FF:FF:FF:FF:FF:FF`)
- **Commands:** `UP`, `DOWN`, `LEFT`, `RIGHT`, `SLIDE_L`, `SLIDE_R`, `ROT_L`, `ROT_R`, `STOP`

## Hardware Specifications

- **Microcontroller:** ESP32-WROOM-32 (Dual-core @ 240MHz)
- **Memory:** 520KB SRAM, 4MB Flash
- **Display:** 2.8-inch TFT LCD (240x320 resolution)
  - **Driver:** ILI9341 (SPI)
- **Touch Screen:** Resistive touch (XPT2046 controller)
- **Audio:** PAM8002A 3W Class-D Amplifier (GPIO 26)
- **Storage:** Micro-SD Card Slot
- **Onboard Peripherals:**
  - RGB LED (Active LOW)
  - LDR (Light Dependent Resistor)
  - BOOT and RESET buttons
- **Connectors:**
  - Micro-USB for power and programming (CH340 Serial)
  - Extended IO ports (P1, P3, CN1)

## Power Requirements
- **Input:** 5V via USB or VIN pin.
- **Consumption:** ~115mA (Backlight at 100%) to ~250mA peak.

## Development Environment
The recommended environment is **PlatformIO**. See `platformio.ini` for the base configuration.

> [!IMPORTANT]
> **Flashing Tip:** If the upload fails with a "Failed to connect" error, press and **hold the BOOT button** on the back of the board as soon as the terminal shows "Connecting...". Release it once the progress percentage appears.

### Essential Libraries
- **TFT_eSPI:** For high-performance display control.
- **XPT2046_Touchscreen:** For touch input.
- **LVGL:** For advanced UI design.
