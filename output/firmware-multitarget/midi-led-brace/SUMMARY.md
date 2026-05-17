# midi-led-brace — Cost-Down Summary
- **Project Purpose:** Wearable brace driven by USB-MIDI input → LED animation.
- **Original MCU:** ESP32-WROOM-32E (no native USB).
- **Recommended Replacement:** **RP2040** (native USB, TinyUSB MIDI class) or ESP32-S3 (also native USB).
- **Cost Delta ($):** −$1.06 (RP2040) vs WROOM, eliminates CH340N too.
- **Confidence Level (1-10):** 8 — TinyUSB MIDI on RP2040 is well-supported.
