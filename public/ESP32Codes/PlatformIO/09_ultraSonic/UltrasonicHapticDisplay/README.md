# RP2040 Mid-Air Ultrasonic Haptic Display Demo Firmware

Firmware for driving a mid-air ultrasonic haptic display demo array using a Raspberry Pi Pico (RP2040), TPA3118 Class-D Audio Amplifier Module, and SSD1306 OLED display.

## Hardware Connections

| Device / Interface | Pico (RP2040) Pin | Notes |
| :--- | :--- | :--- |
| **TPA3118 IN+** | GPIO 15 | PWM Output (Drive strength explicitly set to 2mA in software) |
| **TPA3118 IN-** | GND | Shared System Ground |
| **Potentiometer 1** | ADC0 (GPIO 26) | Carrier Frequency (38.0 kHz to 42.0 kHz) |
| **Potentiometer 2** | ADC1 (GPIO 27) | Modulation Frequency (50 Hz to 300 Hz) |
| **Potentiometer 3** | ADC2 (GPIO 28) | Drive Level / Duty Cycle (1% to 20%) |
| **OLED SDA** | GPIO 4 | I2C0 SDA |
| **OLED SCL** | GPIO 5 | I2C0 SCL |
| **OLED VCC / GND** | 3.3V / GND | Power & Ground |

## Signal Generation & Architecture

- **Hardware PWM**: Driven directly via hardware registers (`hardware/pwm.h`) on GPIO 15.
- **Drive Strength**: Limited to 2mA (`GPIO_DRIVE_STRENGTH_2MA`) to soften fast switching spikes at the TPA3118 input stage.
- **AM Envelope Modulation**: The 40 kHz ultrasonic carrier is chopped ON/OFF at tactile modulation rates (50 Hz–300 Hz) using a 50% burst duty cycle envelope.
- **EMA Filtering**: Potentiometer readings use Exponential Moving Average (EMA) smoothing for jitter-free real-time adjustment.
- **OLED UI**: 10 Hz telemetry display rendered using Adafruit SSD1306 library.

## Building & Flashing

Use PlatformIO:
```bash
pio run --target upload
```
or double-click `upload.bat`.
