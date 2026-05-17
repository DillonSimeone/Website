# esp32-i2s-mic — Cost-Down Analysis
WiFi AP + INMP441 + 1024-pt FFT + 64 WS2812. ESP32-C3 handles WiFi + I2S + FFT comfortably at 160 MHz. 1024-pt FFT margin is ~10× headroom at 16 kHz.
## Pin Map
I2S BCLK/WS/SD = 4/5/6; LEDs DIN = 10.
## Library Substitutions
arduinoFFT → esp-dsp; FastLED → RMT; AsyncWebServer → esp_http_server.
## Risk & Validation
Monitor `dsps_fft2r_fc32` cycle count; if > 5 ms per frame, drop to 512-pt or step up to ESP32-S3.
