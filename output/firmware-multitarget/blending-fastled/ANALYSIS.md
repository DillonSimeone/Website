# blending-fastled — Cost-Down Analysis
Pure LED animation. No radio, ADC, or sensors. RP2040 PIO is the textbook fit for WS2812 — uses one state machine, runs at full LED data-rate while CPU does animation math.
## Library Substitutions
FastLED → ws2812.pio (pico-examples).
