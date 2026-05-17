# max4466-motor-control — Cost-Down Analysis
MAX4466 mic + 256-pt FFT + LED strip + motor MOSFET. No radio. RP2040 covers all: native ADC for MAX4466, PIO for WS2812, PWM for motor.
## Library Substitutions
arduinoFFT → kiss_fft (header-only) or pico-sdk DSP component. FastLED → pico-examples ws2812.pio.
