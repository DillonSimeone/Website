# robotics-final-project — Cost-Down Summary
- **Project Purpose:** Capstone robot: WiFi AP web UI, LD2410 radar, ultrasonic, OLED, 4-wheel motor drive.
- **Original MCU:** ESP32-WROOM-32E (`esp32dev`).
- **Recommended Replacement:** ESP32-C3-MINI-1 + DRV8833 dual H-bridge redesign (collapses 8 motor GPIOs → 4 PWM).
- **Cost Delta ($):** −$0.41 on MCU; H-bridge IC adds $1.20 but removes 8 discrete pins + protection.
- **Confidence Level (1-10):** 5 — pin count is tight on C3 (11 usable); redesign required.
