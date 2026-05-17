#!/usr/bin/env bash
set -e
mkdir -p build && cd build && cmake .. && make -j && picotool load oled_strip.uf2 -f && picotool reboot
