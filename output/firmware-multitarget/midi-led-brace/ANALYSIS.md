# midi-led-brace — Cost-Down Analysis
USB-MIDI input + WS2812 output. RP2040 with TinyUSB exposes a USB MIDI device class out of the box; PIO drives WS2812.
## Library Substitutions
Arduino USBMIDI → TinyUSB MIDI (tud_midi_n_*); FastLED → PIO ws2812.
