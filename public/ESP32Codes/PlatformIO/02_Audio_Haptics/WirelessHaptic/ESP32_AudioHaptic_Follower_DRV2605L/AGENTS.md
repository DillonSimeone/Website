# ESP32 Audio Haptic Follower (DRV2605L)

## Overview
This follower node receives wireless ESP-NOW haptic commands from the **Leader**. It is specifically designed to drive a **Dayton Audio TT25-8 Puck** using the **DRV2605L** module.

## Key Features
*   **LRA Mode Integration**: Configures the DRV2605L to drive the puck using AC-like behavior, preventing DC coil burnout.
*   **Real-Time Playback (RTP)**: Maps incoming audio intensity directly to the motor amplitude for high-fidelity response.
*   **Dayton ROM Patterns**: Triggers specific haptic waveforms (clicks, buzzes) from the DRV2605L ROM when requested by the leader.
*   **Channel Mapping**: Uses `#define MY_CHANNEL_ID` to listen to specific audio bands (Bass, Mid, Treble, or Transients).
*   **Visual Feedback**: Inverted onboard LED PWM matches the haptic intensity.
