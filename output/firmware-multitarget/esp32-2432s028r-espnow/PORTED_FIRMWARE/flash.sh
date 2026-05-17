#!/usr/bin/env bash
set -e
idf.py set-target esp32 && idf.py build && idf.py -p "${PORT:-auto}" flash monitor
