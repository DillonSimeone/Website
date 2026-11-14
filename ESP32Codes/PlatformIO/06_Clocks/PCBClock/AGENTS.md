# PCB Digital Clock (NTP)

## Overview
A stylish digital clock that synchronizes with global time servers (NTP) over Wi-Fi. It features a high-resolution display with animated "circuit board" style backgrounds.

## Hardware Setup
*   **Microcontroller:** ESP32.
*   **Display:** 320x170 ST7789 or similar TFT.
*   **Inputs:** 2 buttons for brightness and theme selection.

## Key Features
*   **NTP Sync:** Automatically fetches real-time data from `pool.ntp.org`.
*   **Animated Backdrops:** Cycles through randomized animated frames stored in memory.
*   **Adjustable Brightness:** 7-level PWM brightness control via hardware buttons.
*   **Rich Typography:** Uses custom DSEG7 fonts for a retro-digital aesthetic.
