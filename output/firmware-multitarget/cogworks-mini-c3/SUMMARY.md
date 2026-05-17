# cogworks-mini-c3 — Cost-Down Summary
- **Project Purpose:** Cogworks Mini dev board demo: I2S mic FFT, WS2812 strip, captive-portal WiFi config, 4 motor GPIOs.
- **Original MCU:** ESP32-C3 (`esp32-c3-devkitm-1`).
- **Recommended Replacement:** **Keep ESP32-C3-MINI-1-N4** (already optimal); for >1k volume, downgrade to bare ESP32-C3FH4N4 QFN + custom antenna (saves $0.40/board, needs RF cert).
- **Cost Delta ($):** $0.00 (already optimal) or −$0.40 (bare QFN at scale).
- **Confidence Level (1-10):** 10 (keep) / 6 (bare QFN — adds antenna-tuning risk).
