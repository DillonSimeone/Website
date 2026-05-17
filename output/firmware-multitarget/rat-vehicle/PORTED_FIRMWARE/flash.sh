#!/usr/bin/env bash
set -e
mkdir -p build && cd build && cmake .. && make -j
picotool load rat_vehicle.uf2 -f && picotool reboot
