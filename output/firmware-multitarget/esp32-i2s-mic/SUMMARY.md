# esp32-i2s-mic — Cost-Down Summary
- **Project Purpose:** INMP441 + WiFi AP + 1024-pt FFT + 64 WS2812.
- **Original MCU:** ESP32-WROOM-32E.
- **Recommended Replacement:** ESP32-C3-MINI-1-N4.
- **Cost Delta ($):** −$0.41.
- **Confidence Level (1-10):** 7 — 1024-pt FFT @ 16 kHz on C3 is feasible with esp-dsp (~0.6 ms/FFT); fall back to 512-pt if dropouts.
