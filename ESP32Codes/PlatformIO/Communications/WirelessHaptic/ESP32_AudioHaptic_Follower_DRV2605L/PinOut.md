# DRV2605L Dayton Follower PinOut

| Component | ESP32-C3 Pin | Notes |
| :--- | :--- | :--- |
| **DRV2605L I2C** | | |
| SDA | 8 | Standard I2C Data |
| SCL | 9 | Standard I2C Clock |
| VIN | 3.3V | |
| GND | GND | |
| **Haptics** | | |
| Dayton Puck | DRV2605L L+/L- | Driven in LRA mode by the chip |
| **Status** | | |
| Onboard LED | 10 | PWM Status (Inverted Logic) |
