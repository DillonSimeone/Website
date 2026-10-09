# ESP32 Audio Haptic Follower (Simple)

## Overview
This follower node receives wireless ESP-NOW haptic commands from the **Leader**. It is designed for standard DC vibration motors driven via generic PWM pins (Forward/Reverse/Alternating).

## Key Features
*   **Simple PWM Logic**: Directly drives motor pins based on the incoming `intensity` and `mode`.
*   **Multi-Mode Support**: Supports Forward, Reverse, and Alternating (AC-emulation) patterns.
*   **Channel Mapping**: Uses `#define MY_CHANNEL_ID` to listen to specific audio bands.
*   **Visual Feedback**: Inverted onboard LED PWM matches the haptic intensity.
