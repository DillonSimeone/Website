# led-brace — Cost-Down Summary
- **Project Purpose:** Wearable LED brace: 21 WS2812, I2S mic, BNO055 IMU, BLE-MIDI input, vibration motors.
- **Original MCU:** ESP32-WROOM-32E.
- **Recommended Replacement:** ESP32-C3-MINI-1-N4 (C3 supports BLE 5; BLE-MIDI service trivially fits).
- **Cost Delta ($):** −$0.41.
- **Confidence Level (1-10):** 7 — BLE-MIDI on ESP-IDF requires NimBLE setup; not as turnkey as Arduino BLEMIDI lib.
