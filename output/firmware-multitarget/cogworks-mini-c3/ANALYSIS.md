# cogworks-mini-c3 — Cost-Down Analysis

## Project Purpose
Demo firmware for the Cogworks Mini ESP32-C3 dev board — I2S INMP441 mic + FFT, 60-LED WS2812 strip, captive-portal WiFi config, 4 GPIO motor pins.

## Original Hardware
- Board: `esp32-c3-devkitm-1` (or Cogworks Mini board, both based on C3-MINI-1).
- Peripherals: INMP441, WS2812×60, 4 GPIO motor outputs.

## Replacement Selection
**Keep ESP32-C3-MINI-1-N4 module.** This project is already on the cost-optimal silicon for its feature set (WiFi + I2S + sufficient GPIOs). Two paths forward:
1. **Maintain** the module (zero risk).
2. **Downgrade to bare ESP32-C3FH4N4 QFN** ($1.05 vs $1.45) on the production PCB. Saves $0.40 but requires PCB antenna design, RF tuning, and certification (FCC/CE) — only worthwhile above ~1000 units.

## Pin Mapping
No change — already on C3.

## Library Substitutions
Port FastLED → RMT-based WS2812; arduinoFFT → `esp-dsp` (`dsps_fft2r_fc32`); `WebServer` → `esp_http_server.h` + softAP.

## Risk & Validation
For bare-QFN path: validate antenna VSWR < 2.0 across 2.400–2.484 GHz. Use TI WEBENCH or Saturn PCB Toolkit for trace impedance.
