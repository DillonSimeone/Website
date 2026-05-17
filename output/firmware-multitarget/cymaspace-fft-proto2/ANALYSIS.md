# cymaspace-fft-proto2 — Cost-Down Analysis
Identical to cymaspace-fft but with 300 LEDs. RMT TX time ≈ 9 ms for 300 LEDs (300 × 24 bits × 1.25 µs). At 30 fps target (33 ms frame), this leaves 24 ms for FFT + animation — comfortably feasible on C3.
## Risk
Power budget: 300 LEDs × 60 mA peak = 18 A worst case. Use external 5V/10A PSU; LED data line through 470 Ω level-shifter (or 74AHCT125).
