# audio-sanity-test — Cost-Down Analysis
## Project Purpose
Diagnostic: confirm INMP441 I2S mic captures audio and display amplitude live.
## Original Hardware
ESP32-WROOM + integrated TFT (LilyGo-style board).
## Replacement Selection
ESP32-C3-MINI-1; replace TFT with SH1106 1.3" OLED ($1.50) if display still needed — saves ~$5 board cost.
## Library Substitutions
TFT_eSPI → SSD1306/SH1106 I2C minimal driver. Arduino I2S → `driver/i2s_std.h`.
## Risk & Validation
None — simple sanity loop.
