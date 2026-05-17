# human-detector — Cost-Down Summary
- **Project Purpose:** Presence sensor combining LD2410 24 GHz mmWave radar + HC-SR04/URM37 ultrasonic + SSD1306 OLED.
- **Original MCU:** ESP32-C6 (`esp32-c6-devkitm-1`).
- **Recommended Replacement:** ESP32-C3-MINI-1-N4 (LCSC C2902509). No Thread/Matter used → C6 is overkill.
- **Cost Delta ($):** −$0.50/board (C6 $1.95 → C3 $1.45).
- **Confidence Level (1-10):** 9 — UART for radar, I2C for OLED, GPIO for US all fit on C3 trivially.
