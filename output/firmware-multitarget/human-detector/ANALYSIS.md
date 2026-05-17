# human-detector — Cost-Down Analysis
## Project Purpose
Presence detector: LD2410 mmWave radar over UART + ultrasonic backup + OLED status.
## Original Hardware
`esp32-c6-devkitm-1` chosen but no C6-specific feature exercised.
## Replacement Selection
**ESP32-C3-MINI-1-N4** ($1.45). C6 is unused capability here; C3 provides identical WiFi/BLE + sufficient UART + I2C + GPIO.
## Pin Mapping
| Function | C6 | C3 |
|---|---|---|
| UART1 RX (radar) | 4 | 4 |
| UART1 TX (radar) | 5 | 5 |
| I2C SDA (OLED) | 6 | 6 |
| I2C SCL | 7 | 7 |
| US trig/echo | 18/19 | 8/9 |
## Library Substitutions
Arduino HardwareSerial → `driver/uart.h`. LD2410 parser implemented inline (8-byte frame protocol).
## Risk & Validation
LD2410 frame format is well-documented; verify by capturing reference frames before integration.
