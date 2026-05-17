# mpu6050-led-pixels — Cost-Down Summary
- **Project Purpose:** MPU6050 motion drives 144-LED WS2812 strip. No radio used.
- **Original MCU:** ESP32-C3 (`esp32-c3-devkitm-1`).
- **Recommended Replacement:** **Keep ESP32-C3-MINI-1-N4**, or **RP2040** ($0.80, −$0.65) if WiFi/BLE truly never needed.
- **Cost Delta ($):** $0.00 (keep) or −$0.65 (RP2040).
- **Confidence Level (1-10):** 10 (keep C3) / 8 (RP2040 — needs PIO WS2812 + manual I2C bit-bang).
