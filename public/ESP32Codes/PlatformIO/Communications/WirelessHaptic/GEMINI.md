# Wireless Audio-to-Haptic Sync Project

This project implements a low-latency, real-time wireless audio-to-haptic feedback system using ESP32-C3 modules and ESP-NOW.

## 🏗️ System Architecture

### 1. Leader Node (`ESP32_AudioHaptic_Leader`)
*   **Hardware**: ESP32-C3 + INMP441 I2S Microphone.
*   **Audio Processing**: 
    *   Captures audio at 16kHz with 128-sample (8ms) windows.
    *   Performs Float FFT to extract frequency band energy (Bass, Mid, Treble).
    *   Calculates overall audio intensity (MAD - Mean Absolute Deviation).
*   **Communication**: Broadcasts a 4-channel `struct_message` via ESP-NOW to all listening followers every 8ms.
*   **Web UI**: Configuration portal for thresholds, patterns, and performance mode toggles.
*   **Performance Mode**: BOOT button (GPIO 9) or Web UI "Go Dark" button stops the Web Server/DNS to prioritize radio cycles for ESP-NOW.

### 2. Follower Nodes
*   **Follower Simple**: Drives standard vibration motors using PWM (DRV8833 or similar H-bridge).
*   **Follower DRV2605L**: Drives Dayton Audio Puck transducers via a DRV2605L driver in RTP (Real-Time Playback) mode.
*   **Logic**:
    *   Listens for a specific `MY_CHANNEL_ID` in the broadcast.
    *   **Asymmetric Envelope**: Implements instant attack (for sync) and slow decay (to bridge packet jitter/missed frames).

---

## ⚡ Real-Time Optimization Strategies

### DMA Backlog Purge
To prevent the "laggy jerk" effect (where haptics happens after the sound stops), the Leader reads the entire I2S hardware buffer and processes only the most recent samples. This "teleports" the analysis to the present millisecond, even if the CPU was busy with WiFi tasks.

### Asymmetric Follower Smoothing
Followers use the logic:
`if (target > smoothIntensity) smoothIntensity = target; else smoothIntensity *= 0.85f;`
This ensures the motor kicks in instantly with the sound but doesn't "chop" if a wireless packet arrives a millisecond late.

---

## ⚠️ Current Testing Configuration (IMPORTANT)

**Force Forward Mode: `ACTIVE (true)`**
In the current version, the Leader has `forceForward = true` in its configuration.
*   **Reason**: Complex audio (like humming) can cause the FFT to rapidly switch between frequency bands. If one band is set to "Forward" and another to "Reverse", the motor will jerk as the H-bridge switches directions.
*   **Behavior**: All followers are currently forced into **Forward Mode (1)** regardless of the frequency band being detected. This ensures smooth, continuous vibration during hums and voices.

---

## 🔌 Hardware Notes & Troubleshooting

### Brownouts
If the follower haptics behave oddly or the chip resets when you make a loud sound, you are likely experiencing **Brownouts**. The haptic motor/puck draws significant current on "Attack" spikes.
*   **Fix**: Ensure your power supply can handle the peak current and add a large decoupling capacitor (e.g., 220uF - 470uF) across the motor driver power rails.

### Pinout
Each folder contains a `PinOut.md` specific to that module's wiring.
