# robotics-final-project — Cost-Down Analysis
## Project Purpose
Capstone autonomous robot. WiFi AP serves a control web UI; LD2410 + HC-SR04 for obstacle detection; OLED status; 4-wheel skid-steer with discrete H-bridges (8 GPIOs).
## Original Hardware
ESP32-WROOM-32E. ~13 GPIOs in use.
## Replacement Selection
ESP32-C3-MINI-1 with **redesign**: replace 8 discrete motor GPIOs with one DRV8833 dual H-bridge (4 PWM inputs control 4 motor channels via paired direction). Fits in C3's 11 usable pins.
## Pin Mapping
Radar UART 4/5, OLED I2C 6/7, US 8/9, DRV8833 PWM 0/1/2/3, status LED 10.
## Library Substitutions
WebServer → `esp_http_server.h`. WiFi.softAP → `esp_wifi` AP mode.
## Risk & Validation
Verify peak motor stall current < 1.5 A per channel (DRV8833 limit). For ≥4 wheels with heavier motors, use 2× DRV8833 instead.
