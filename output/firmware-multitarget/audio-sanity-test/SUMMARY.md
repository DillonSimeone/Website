# audio-sanity-test — Cost-Down Summary
- **Project Purpose:** INMP441 mic sanity test with TFT readback. No FFT, no radio.
- **Original MCU:** ESP32-WROOM-32E (with LilyGo TFT dev board).
- **Recommended Replacement:** ESP32-C3-MINI-1-N4 + drop TFT (or swap for SH1106 OLED).
- **Cost Delta ($):** −$0.41 MCU + ~$5 board-level by dropping LilyGo TFT.
- **Confidence Level (1-10):** 8 — I2S works fine on C3; pin remap straightforward.
