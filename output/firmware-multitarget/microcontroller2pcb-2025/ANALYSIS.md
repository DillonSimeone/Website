# microcontroller2pcb-2025 — Cost-Down Analysis
## Project Purpose
Winter 2025 PCC student PCB combining 4 motor GPIOs, I2S microphone, WS2812 strip, OLED display.
## Original Hardware
`esp32-c3-devkitm-1`.
## Replacement Selection
Already on cost-optimal silicon. Real cost-down opportunity is in the motor drive — replace 4 discrete GPIO drives with **DRV8833** dual H-bridge ($1.20) which collapses 4 pins to 2 PWM + 2 dir, adds current limiting, removes need for protection diodes.
## Pin Mapping
Same C3 pins.
## Library Substitutions
Arduino → ESP-IDF: `driver/ledc.h` for motor PWM, `driver/i2s_std.h` for mic, `driver/i2c_master.h` for OLED, `driver/rmt_tx.h` for WS2812.
## Risk & Validation
Confirm DRV8833 nSLEEP held high in firmware; otherwise outputs disabled.
