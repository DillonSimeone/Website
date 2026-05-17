# led-brace — Cost-Down Analysis
Wearable form-factor. C3 covers BLE-MIDI (NimBLE) + I2S mic + I2C IMU + RMT WS2812 + LEDC motor PWM. Pin budget ~9 — fits within C3's 11.
## Library Substitutions
BLEMIDI → NimBLE MIDI-over-BLE service (3 chars: 0x03B80E5A...). FastLED → RMT. Wire → `driver/i2c_master.h`.
## Risk & Validation
NimBLE MIDI service GATT details are well-documented but requires manual UUID/property setup.
