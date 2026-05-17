#!/usr/bin/env bash
# Build and flash carrie-brain-badge to ESP32-C3
set -e
idf.py set-target esp32c3
idf.py build
idf.py -p "${PORT:-auto}" flash monitor
