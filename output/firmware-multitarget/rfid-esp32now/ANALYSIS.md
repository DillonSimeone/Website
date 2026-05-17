# rfid-esp32now — Cost-Down Analysis
PN532 over I2C + ESP-NOW broadcast. C3 has I2C + ESP-NOW.
## Library Substitutions
Adafruit_PN532 → direct I2C transactions (PN532 has well-documented frame protocol: preamble 00 00 FF + LEN + LCS + TFI + PD + DCS + 00).
