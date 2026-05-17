# deaf-clock — Cost-Down Summary

- **Project Purpose:** Visual clock for Deaf/HoH users: 9 status LEDs and I2S mic input. No WiFi/NTP in current code (time set locally).
- **Original MCU:** ESP32-WROOM-32E on `esp32dev` board.
- **Recommended Replacement:** ESP32-C3-MINI-1-N4 (LCSC C2902509).
- **Cost Delta ($):** −$0.41 per board (module-only); broader savings from collapsing dev board to custom PCB.
- **Confidence Level (1-10):** 7 — solid swap but original references GPIO 32/43/44 which don't exist on C3; pins must be remapped (see ANALYSIS.md).
