# haptics-sound-reactive — Cost-Down Analysis
Trivial loop: read I2S, threshold, drive 2 GPIO. C3 is the cheapest viable target with I2S support; RP2040 saves another $0.65 but needs PIO-I2S code.
