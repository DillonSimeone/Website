# cymaspace-fft-proto2 — Cost-Down Summary
- **Project Purpose:** Proto2 of CymaSpace star: I2S mic + 512-pt FFT → 300-LED WS2812.
- **Original MCU:** ESP32-WROOM-32E.
- **Recommended Replacement:** ESP32-C3-MINI-1-N4.
- **Cost Delta ($):** −$0.41 silicon. NB: 300-LED strip pushes board cost ≫ MCU cost.
- **Confidence Level (1-10):** 7 — RMT transmit of 300 LEDs is 9 ms; verify frame-rate target ≥ 30 fps holds with FFT load.
