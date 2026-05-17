#!/usr/bin/env bash
set -e
mkdir -p build && cd build && cmake .. && make -j && picotool load max4466_sanity.uf2 -f && picotool reboot
