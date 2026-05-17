# carrie-brain-badge — Cost-Down Analysis

## Project Purpose
A wearable conference badge driving 9 WS2812 LEDs reactive to MPU6050 motion, plus an ERM motor for tactile feedback. Uses BOOT button to wake from deep sleep for battery life.

## Original Hardware
- Board: `esp32-c3-devkitm-1` (Espressif dev kit, ~$5 retail)
- MCU: ESP32-C3 (RISC-V, WiFi+BLE5)
- Peripherals: MPU6050 over I2C (GPIO 2/3), WS2812×9 on GPIO 0, ERM motor PWM, BOOT button, deep sleep.

## Replacement Selection
**ESP32-C3-MINI-1-N4 module (LCSC C2902509, $1.45 qty 100, JLCPCB Extended).** The dev kit is already on the optimal silicon — the cost-down is moving from a $5 hobby dev kit to a $1.45 module integrated on a custom badge PCB with built-in LiPo charger. No firmware migration; the ESP-IDF port below is a one-for-one rewrite of the Arduino code into bare IDF C.

## Pin Mapping Changes
| Function | Dev-kit pin | Module pin | Notes |
|---|---|---|---|
| WS2812 DIN | GPIO 0 | GPIO 4 | GPIO 0 is strapping; move signal off it on custom PCB |
| I2C SDA | GPIO 2 | GPIO 5 | freed up strapping |
| I2C SCL | GPIO 3 | GPIO 6 | |
| Motor PWM | GPIO 4 | GPIO 7 | LEDC channel 0 |
| Wake button | GPIO 9 (BOOT) | GPIO 9 | retained |

## Library Substitutions
- FastLED → `driver/rmt_tx.h` with a minimal WS2812 RMT encoder.
- Arduino I2C `Wire` → `driver/i2c_master.h` (new IDF 5.x API).
- `analogWrite` → `driver/ledc.h`.
- `esp_sleep_enable_ext1_wakeup_io` on GPIO 9 for wake.

## Risk & Validation
- Confirm 3.3V LDO can supply 9 LEDs × 60 mA peak ≈ 540 mA — use AP2112K-3.3 (1A) rather than AMS1117. Hardware change captured in BOM.
- Validate deep-sleep current < 50 µA with TLV70233 LDO and MPU6050 in sleep mode.
