# rat-vehicle — Cost-Down Summary
- **Project Purpose:** Capacitive-touch driven vehicle (original code is AVR-specific, won't compile on ESP32).
- **Original MCU:** ESP32-WROOM-32E declared, but code uses AVR register macros.
- **Recommended Replacement:** **RP2040** (LCSC C2040) — no radio needed, native PIO can implement capacitive sensing cleanly.
- **Cost Delta ($):** −$1.06/board (WROOM $1.86 → RP2040+flash $0.80+$0.27 net ≈ $1.07, ~$0.80 saving).
- **Confidence Level (1-10):** 4 — full firmware rewrite required; AVR cap-touch idiom doesn't map.
