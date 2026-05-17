# carrie-brain-badge — Cost-Down Summary

- **Project Purpose:** Wearable conference badge (badge for "Carrie") with motion-reactive WS2812 LED pattern via MPU6050 and tactile motor feedback; deep-sleep aware.
- **Original MCU:** ESP32-C3 (`esp32-c3-devkitm-1`)
- **Recommended Replacement:** ESP32-C3-MINI-1-N4 module (LCSC C2902509) — drop the dev kit, design module straight onto the badge PCB.
- **Cost Delta ($):** −$3.50 per board (dev-kit @ ~$5 → module @ $1.45 + USB-C/LDO/passives ~$0.10).
- **Confidence Level (1-10):** 10 — same silicon, same peripherals, only the carrier board changes. Pure BOM consolidation.
