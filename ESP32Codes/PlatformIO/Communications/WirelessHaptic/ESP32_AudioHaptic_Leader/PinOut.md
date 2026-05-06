# Leader PinOut (ESP32-C3)

| Component | ESP32-C3 Pin | Notes |
| :--- | :--- | :--- |
| **INMP441 Microphone** | | |
| GND | 4 | Ground |
| L/R | 2 | Left/Right Channel Select (Tied LOW for Left/Single channel) |
| WS | 3 | Word Select (Left/Right Clock) |
| SCK | 1 | Serial Data Clock (BCLK) |
| SD | 0 | Serial Data Out (DIN) |
| VDD | 3.3V | 3.3V Power |
| **Onboard Components** | | |
| Onboard LED | 8 | PWM controlled or WS2812 (dependent on specific C3 dev board) |
