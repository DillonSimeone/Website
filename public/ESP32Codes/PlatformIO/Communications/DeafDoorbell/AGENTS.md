# DeafDoorbell — ESP-NOW Visual Doorbell Alert System

## Overview
An accessibility project for deaf individuals. A **Master** ESP32-C3 with an INMP411 I2S microphone sits next to a door chime. When the chime sounds and exceeds a configurable audio threshold, the Master broadcasts an ESP-NOW message to all **Follower** ESP32-C3 units in the area, which flash LED strips and buzz vibration motors to provide a visual/tactile alert.

## Architecture
*   **Master Node:** INMP411 mic → I2S audio → RMS threshold detection → ESP-NOW broadcast. Hosts a captive portal for live audio monitoring, threshold tuning, flash duration, cooldown, and color selection.
*   **Follower Nodes:** Receive ESP-NOW broadcast → Flash WS2812B LED strip in the chosen color → Activate vibration motor. Unlimited followers can be deployed — the only limits are power and ESP-NOW range (~200m line-of-sight).

## Hardware
*   **Board:** ESP32-C3 SuperMini (both Master and Follower)
*   **Microphone:** INMP411 (Master only)
*   **LEDs:** WS2812B strip (Follower only, default 60 LEDs)
*   **Motor:** Small vibration motor via transistor/MOSFET (Follower only)

## Key Features
*   **Zero-pairing deployment:** ESP-NOW broadcast to `FF:FF:FF:FF:FF:FF` — Followers just need power.
*   **Captive Portal:** Connect to "DeafDoorbell-Master" WiFi to configure all settings from a phone.
*   **Color Wheel:** Choose the flash color from the portal — it's transmitted with each alert.
*   **NVS Persistence:** All settings survive power cycles.
*   **Audio-reactive LED:** Master's onboard LED reflects live audio level for positioning feedback.
*   **Cooldown:** Prevents spam from sustained chimes.
*   **Animation cancellation:** New alerts interrupt in-progress flashes.
