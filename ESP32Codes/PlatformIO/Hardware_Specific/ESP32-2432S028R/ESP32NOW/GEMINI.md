# ESP32-2432S028R (CYD) Robot Controller

## Overview
A touch-based remote control for omni-wheel robots, designed for the **ESP32-2432S028R** (also known as the Cheap Yellow Display or CYD). It provides a **6-button (3x2 grid)** touch interface that broadcasts commands via ESP-NOW.

## Hardware Setup
*   **Microcontroller:** ESP32-2432S028R (CYD).
*   **Display:** 2.8" TFT with integrated resistive touch (XPT2046).

## Button Layout
```
[ROT L]   [UP]     [ROT R]
[SLIDE L] [DOWN]   [SLIDE R]
```

## Key Features
*   **Stop-on-Release:** No dedicated STOP button. The robot stops automatically when you lift your finger.
*   **6-Button Touch Interface:** Matches the RobotController's web UI layout.
*   **ESP-NOW Broadcast:** Sends commands to all nearby receivers using the `0xFF:0xFF:0xFF:0xFF:0xFF:0xFF` broadcast address.
*   **Visual Feedback:** Buttons highlight white when pressed.
*   **Compatibility:** Designed to work with the `RobotController` receiver in `/Communications/ESP32NOW/`.
