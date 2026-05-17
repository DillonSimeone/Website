# max4466-motor-control — Cost-Down Summary
- **Project Purpose:** MAX4466 analog mic → 256-pt FFT → WS2812 strip + MOSFET motor.
- **Original MCU:** ESP32-C3 (no radio used).
- **Recommended Replacement:** **RP2040** (no radio needed; native 12-bit ADC).
- **Cost Delta ($):** −$0.38 (RP2040).
- **Confidence Level (1-10):** 7 — arduinoFFT works on RP2040 Mbed core; PIO WS2812.
