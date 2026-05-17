# pcb-clock — Cost-Down Summary
- **Project Purpose:** Custom PCB desk clock with ST7789 TFT, WiFi+NTP time sync, 2 buttons.
- **Original MCU:** ESP32-WROOM-32E (`esp32dev`).
- **Recommended Replacement:** ESP32-C3-MINI-1-N4 (LCSC C2902509).
- **Cost Delta ($):** −$0.41/board (module-only).
- **Confidence Level (1-10):** 8 — WiFi+SPI fit on C3; minor pin remap. NB: original .ino contains hard-coded credentials — scrub before publish.
