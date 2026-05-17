# rat-vehicle — Cost-Down Analysis
## Project Purpose
Capacitive-touch driven small vehicle, 4 motor GPIOs + EN pins + status LED.
## Original Hardware
`esp32dev` declared. Code uses `portOutputRegister`, `SREG`, `noInterrupts` — AVR-specific; will not compile for ESP32.
## Replacement Selection
**RP2040 + 16Mbit flash** ($1.07). No radio needed. PIO can implement capacitive sensing as RC-charge-time on a GPIO — cleaner than AVR's `readCapacitivePin` hack.
## Pin Mapping
GP4/GP5 cap-touch inputs (via PIO), GP10–13 motor outputs, GP14/15 EN.
## Library Substitutions
AVR cap-touch hack → PIO capsense program (charge GPIO, time decay).
## Risk & Validation
Firmware essentially a rewrite. Test cap-touch threshold against environmental EMI before deployment.
