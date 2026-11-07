# DeafDoorbell — ESP-NOW Visual Doorbell Alert System

## Overview
An accessibility project for deaf individuals. A **Leader** ESP32-C3 with a MAX4466 analog electret microphone sits next to a door chime. When the chime sounds and exceeds a configurable audio threshold (~10ms detection window), the Leader broadcasts an ESP-NOW alert to all **Follower** ESP32-C3 units in the area, which immediately flash 8×8 WS2812B LED matrices and buzz vibration motors to provide a visual and tactile alert.

## Architecture
* **Shared Protocol (`shared/DoorbellProtocol.h`):** Single source of truth included by both `Leader` and `Follower` via `-I../shared` build flags.
* **Leader Node (`Leader/src/`):** Modularized into `Config.h`, `AudioEngine.h`, `EspNowManager.h`, `TelemetryLog.h`, `WebPortal.h`, and `main.cpp`. Uses single-pass MAX4466 ADC capture + IIR DC-blocking filter (`~3.2ms/chunk`), fast 3-chunk (`~9.6ms`) leaky debounce, `WIFI_PS_NONE`, and pure broadcast 4-packet bursts (`FF:FF:FF:FF:FF:FF`).
* **Follower Nodes (`Follower/src/`):** Modularized into `FollowerConfig.h`, `Animations.h`, and `main.cpp`. Runs on Channel 1 with `WIFI_PS_NONE`, asserts `MOTOR_PIN` at 0ms inside `onDataRecv()`, renders phase-aligned Frame 0 immediately in `loop()`, and relays mesh packets with TTL hop limiting.

## Hardware
* **Board:** ESP32-C3 SuperMini (both Leader and Follower)
* **Microphone:** MAX4466 analog mic on `GPIO 3` (`ADC1_CH3`), soft GND on `GPIO 4` (Leader only)
* **LEDs:** WS2812B 8×8 matrix (`64` LEDs) on `GPIO 5` (Follower only)
* **Motor:** Small vibration motor via transistor/MOSFET on `GPIO 3` (Follower only)
* **Status LED:** Onboard LED on `GPIO 8` (inverted logic)
* **Boot Button:** `GPIO 9` (Hold 3s on Follower to re-enter pairing mode)
