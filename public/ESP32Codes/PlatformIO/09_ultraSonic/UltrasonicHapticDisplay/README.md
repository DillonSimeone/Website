# Waveshare RP2040-Zero Ultrasonic Haptic Display Demo Firmware

Firmware for driving a mid-air ultrasonic haptic display demo array using a Waveshare RP2040-Zero mini microcontroller, TPA3118 Class-D Audio Amplifier Module, and SSD1306 OLED display.

## Pinout Mapping (Waveshare RP2040-Zero)

| RP2040-Zero Silk Pad | Signal / Function | Connected Hardware | Target Range / Notes |
| :--- | :--- | :--- | :--- |
| **15** (Top Right) | GPIO 15 (PWM) | TPA3118 IN+ | 40.0 kHz Carrier (2mA Drive Strength) |
| **GND** (Right) | GND | TPA3118 IN-, Pots & OLED GND | Shared System Ground |
| **26** (Right) | ADC0 (GPIO 26) | Potentiometer 1 | Carrier Frequency (38.0 kHz to 42.0 kHz) |
| **27** (Right) | ADC1 (GPIO 27) | Potentiometer 2 | Modulation Rate (50 Hz to 300 Hz) |
| **28** (Right) | ADC2 (GPIO 28) | Potentiometer 3 | Drive Level / Duty Cycle (1% to 20%) |
| **4** (Left) | GPIO 4 (SDA) | SSD1306 OLED SDA | I2C0 Data @ 10 Hz Telemetry |
| **5** (Left) | GPIO 5 (SCL) | SSD1306 OLED SCL | I2C0 Clock |
| **3V3** (Right) | 3.3V Power | Pots & OLED VCC | 3.3V System Power Output |

## Interactive Web Pinout & Signal Simulator

An interactive HTML visualizer is available in [`pinout.html`](pinout.html). Open `pinout.html` in your browser to view the board layout, connection matrix, and live oscilloscope signal simulator.

## Building & Flashing

1. Connect your RP2040-Zero via USB-C while holding the **BOOT** button (or insert firmware when `D:\` / `RPI-RP2` is mounted).
2. Run `upload.bat` or run:
   ```bash
   pio run
   ```
3. Copy `.pio/build/pico/firmware.uf2` into `D:\` (`RPI-RP2`).
