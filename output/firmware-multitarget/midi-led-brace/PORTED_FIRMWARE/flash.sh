#!/usr/bin/env bash
set -e
mkdir -p build && cd build && cmake .. && make -j && picotool load midi_led_brace.uf2 -f && picotool reboot
