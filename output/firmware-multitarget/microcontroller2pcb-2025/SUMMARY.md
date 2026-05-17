# microcontroller2pcb-2025 — Cost-Down Summary
- **Project Purpose:** PCC Winter 2025 student PCB: 2× motor pairs (4 GPIO), I2S mic, WS2812 ×10, SSD1306 OLED, no radio used.
- **Original MCU:** ESP32-C3 (`esp32-c3-devkitm-1`).
- **Recommended Replacement:** **Keep ESP32-C3-MINI-1-N4**; recommend swapping discrete-GPIO motor drive for DRV8833 dual H-bridge (reduces pin count, adds protection).
- **Cost Delta ($):** $0.00 silicon swap; BOM optimization +$1.20 driver but eliminates discrete MOSFETs.
- **Confidence Level (1-10):** 9 — straight ESP-IDF port.
