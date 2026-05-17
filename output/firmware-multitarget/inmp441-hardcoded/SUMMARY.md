# inmp441-hardcoded — Cost-Down Summary
- **Project Purpose:** INMP441 mic test with hardcoded pin config, no radio.
- **Original MCU:** ESP32-C3 (already optimal).
- **Recommended Replacement:** **RP2040** (no radio needed; PIO can drive I2S). Or keep C3 for simplicity.
- **Cost Delta ($):** −$0.38 (RP2040 path) / $0.00 (keep).
- **Confidence Level (1-10):** 8 (RP2040 requires PIO I2S port) / 10 (keep).
