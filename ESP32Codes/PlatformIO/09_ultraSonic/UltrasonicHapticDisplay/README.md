# Waveshare RP2040-Zero Ultrasonic Haptic Display Demo Firmware

Firmware for driving a mid-air ultrasonic haptic display demo array using a Waveshare RP2040-Zero mini microcontroller, TPA3118 Class-D Audio Amplifier Module, and SSD1306 OLED display.

## Pinout Mapping (Waveshare RP2040-Zero)

| RP2040-Zero Silk Pad | Signal / Function | Connected Hardware | Target Range / Notes |
| :--- | :--- | :--- | :--- |
| **15** (Top Right) | GPIO 15 (PWM) | TPA3118 IN+ | 40.0 kHz Carrier (2mA Drive Strength) |
| **GND** (Right) | GND | TPA3118 IN-, Pots & OLED GND | Shared System Ground |
| **26** (Right) | ADC0 (GPIO 26) | Potentiometer 1 | Carrier Frequency (38.0 kHz to 42.0 kHz) |
| **27** (Right) | ADC1 (GPIO 27) | Potentiometer 2 | Modulation Rate (50 Hz to 300 Hz) |
| **28** (Right) | ADC2 (GPIO 28) | Potentiometer 3 | Drive Level / Duty Cycle (see **BENCH_TEST** below) |
| **4** (Left) | GPIO 4 (SDA) | SSD1306 OLED SDA | I2C0 Data @ 10 Hz Telemetry |
| **5** (Left) | GPIO 5 (SCL) | SSD1306 OLED SCL | I2C0 Clock |
| **3V3** (Right) | 3.3V Power | Pots & OLED VCC | 3.3V System Power Output |

## BENCH_TEST mode (default)

`src/Config.h` enables **BENCH_TEST** by default for hardware bring-up:

| Setting | Normal (`BENCH_TEST=0`) | Bench (`BENCH_TEST=1`) |
| :--- | :--- | :--- |
| Drive duty (Pot 3) | 1% – 20% | **25% – 50%** |
| AM envelope | 50% burst @ mod rate | **Off** (continuous 40 kHz) |
| GPIO 15 drive | 2 mA | **12 mA** |

To restore conservative limits, set `BENCH_TEST=0` in `Config.h` or add `build_flags = -DBENCH_TEST=0` in `platformio.ini`.

## Interactive Web Pinout & Signal Simulator

An interactive HTML visualizer is available in [`pinout.html`](pinout.html). Open `pinout.html` in your browser to view the board layout, connection matrix, and live oscilloscope signal simulator.

## Building & Flashing

1. Connect your RP2040-Zero via USB-C while holding the **BOOT** button (or insert firmware when `D:\` / `RPI-RP2` is mounted).
2. Run `upload.bat` or run:
   ```bash
   pio run
   ```
3. Copy `.pio/build/pico/firmware.uf2` into `D:\` (`RPI-RP2`).
