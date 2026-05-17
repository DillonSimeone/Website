# deaf-clock — Cost-Down Analysis

## Project Purpose
Tactile/visual clock for Deaf and Hard-of-Hearing users. I2S mic on pins 14/15/32 captures ambient sound; 9 GPIOs drive discrete status LEDs for hour/minute display.

## Original Hardware
- Board: `esp32dev` (ESP32-WROOM-32E)
- Peripherals: INMP441 I2S mic, 9 discrete LEDs

## Replacement Selection
**ESP32-C3-MINI-1-N4** ($1.45 vs $1.86 WROOM-32E). C3 has WiFi+BLE for future NTP, I2S0 peripheral handles INMP441 at 16 kHz easily, and 11 usable GPIOs cover 9 LEDs + 3 I2S lines if mic is moved off of strapping pins.

## Pin Mapping Changes
| Function | Old (ESP32) | New (C3) | Note |
|---|---|---|---|
| I2S SCK | 14 | 0 | strap-safe at boot if pulled |
| I2S WS  | 15 | 1 | |
| I2S SD  | 32 | 2 | C3 has no GPIO 32 |
| LED 1-9 | mixed (incl. 43/44) | 3-7, 8, 10, 18, 19 | GPIOs 43/44 don't exist on C3; remap all |

Pin count is tight (12 needed, 11 available) — recommend dropping one LED or multiplexing two LEDs via charlieplexing if all 9 must remain.

## Library Substitutions
- Arduino `i2s_install` → `driver/i2s_std.h`
- `digitalWrite` → `gpio_set_level` over `driver/gpio.h`

## Risk & Validation
- Tight GPIO budget. Validate that LED layout matches available pins before PCB fab.
- I2S sample rate 16 kHz, 32-bit confirmed supported on C3 (single I2S controller).
