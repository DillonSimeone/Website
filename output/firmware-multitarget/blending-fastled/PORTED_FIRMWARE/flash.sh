#!/usr/bin/env bash
set -e
mkdir -p build && cd build && cmake .. && make -j && picotool load blending_fastled.uf2 -f && picotool reboot
