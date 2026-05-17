# cymaspace-fft — Cost-Down Analysis
INMP441 + 512-pt FFT + 70 WS2812 in a star pattern. C3 handles all three (I2S0, esp-dsp, RMT). 70 LEDs at 24 bits = 2.1 ms RMT transmission, leaves >95% CPU for FFT.
