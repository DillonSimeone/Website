# pcb-clock — Cost-Down Analysis

## Project Purpose
Custom desk clock driving a 170×320 ST7789 TFT, WiFi + NTP time, two buttons for menu/set. Uses LEDC for backlight PWM.

## Original Hardware
- Board: `esp32dev` (ESP32-WROOM-32E)
- Peripherals: ST7789 SPI TFT, 2× tactile, backlight via LEDC.

## Replacement Selection
**ESP32-C3-MINI-1-N4** ($1.45). C3 fully supports WiFi STA + esp_sntp + SPI master + LEDC PWM — direct replacement. Saves $0.41/board on MCU module alone, plus eliminates the ESP32-WROOM's dual-core overhead that this app doesn't need.

## Pin Mapping
| Function | ESP32 | C3 |
|---|---|---|
| TFT MOSI | 23 | 7 |
| TFT SCLK | 18 | 6 |
| TFT CS   | 5  | 5 |
| TFT DC   | 2  | 4 |
| TFT RST  | 4  | 3 |
| Backlight| 32 | 8 |
| BTN1/BTN2| 0/35| 9/10 |

## Library Substitutions
- TFT_eSPI → minimal ST7789 driver over `driver/spi_master.h` (init sequence + framebuffer push).
- WiFi.begin → `esp_wifi.h` + `esp_sntp.h`.

## Risk & Validation
- Confirm SPI clock 26 MHz works for ST7789 on C3 (yes — C3 SPI2 supports up to 80 MHz host clock).
- Hard-coded SSID/password in original `.ino` ("CumZone"/"7414stinky$$$") — scrubbed; use NVS or compile-time defines.
