# ESP32-2432S028R Pinout Reference

## Display (SPI - HSPI)
| Function | GPIO | Notes |
| :------- | :--- | :---- |
| MOSI     | 13   |       |
| MISO     | 12   |       |
| SCK      | 14   |       |
| CS       | 15   |       |
| DC/RS    | 2    |       |
| RESET    | -    | Connected to EN (Reset Pin) |
| Backlight| 21   | PWM Capable (Active HIGH) |

## Touch Screen (SPI - VSPI)
| Function | GPIO | Notes |
| :------- | :--- | :---- |
| MOSI     | 32   |       |
| MISO     | 39   |       |
| SCK      | 25   |       |
| CS       | 33   |       |
| IRQ      | 36   |       |

## Micro-SD Card (SPI - VSPI)
| Function | GPIO | Notes |
| :------- | :--- | :---- |
| MOSI     | 23   |       |
| MISO     | 19   |       |
| SCK      | 18   |       |
| CS       | 5    |       |

## Onboard Peripherals
| Function    | GPIO | Notes |
| :---------- | :--- | :---- |
| RGB LED (R) | 4    | Active LOW |
| RGB LED (G) | 16   | Active LOW |
| RGB LED (B) | 17   | Active LOW |
| LDR (Light) | 34   | Analog Input |
| Audio Out   | 26   | Into PAM8002A Amp |

## Expansion Headers

### P1 (UART)
- VIN (5V)
- TX (GPIO 1)
- RX (GPIO 3)
- GND

### P3 (Extended)
- GND
- GPIO 35 (Input Only)
- GPIO 22
- GPIO 21 (Backlight shared)

### CN1 (I2C)
- GND
- GPIO 22 (SCL)
- GPIO 27 (SDA)
- 3V3

### P4 (Speaker)
- GPIO 26
- GND
