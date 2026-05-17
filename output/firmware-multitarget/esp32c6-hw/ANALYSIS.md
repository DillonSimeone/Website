# esp32c6-hw — Cost-Down Analysis
## Project Purpose
Demo of ESP32-C6 hardware: SSD1306 OLED via I2C, HC-SR04 ultrasonic, NeoPixel status.
## Original Hardware
`esp32-c6-devkitc-1` (full dev kit, ~$8 retail).
## Replacement Selection
**Keep ESP32-C6-WROOM-1-N8** ($1.95). The whole point of this project is to demonstrate C6 features (WiFi 6, Thread/Matter). Migrating to a cheaper MCU defeats the purpose. Cost-down captured by moving from dev kit ($8) → custom PCB with bare module ($1.95 + ~$1 BOM).
## Pin Mapping
No change.
## Library Substitutions
Arduino `Wire`/`U8g2` → `driver/i2c_master.h` + minimal SSD1306 init bytes. NeoPixel → RMT.
## Risk & Validation
Validate Thread/Matter stack against expected use case before fab.
