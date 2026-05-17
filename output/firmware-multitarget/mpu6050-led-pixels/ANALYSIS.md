# mpu6050-led-pixels — Cost-Down Analysis
## Project Purpose
MPU6050 IMU → WS2812 strip (144 LEDs) reactive animation.
## Original Hardware
`esp32-c3-devkitm-1`. I2C on GPIO 0/1, WS2812 DIN on GPIO 2.
## Replacement Selection
Two options:
- **Keep C3** (zero risk, $1.45)
- **RP2040 + 16Mbit flash** ($1.07) if you commit to no future WiFi/BLE. Saves $0.38 silicon plus removes USB-UART (RP2040 has native USB).
## Pin Mapping
Same on C3. For RP2040: I2C on GP4/GP5; PIO state machine on GP6 for WS2812.
## Library Substitutions
FastLED → RMT (C3) or PIO (RP2040, use pico-examples ws2812.pio). Wire/MPU6050 lib → manual I2C reads from registers 0x3B–0x40.
## Risk & Validation
At 144 LEDs the RMT or PIO output is ~4.3 ms per frame — verify frame rate target.
