# ESP32-2432S028R (CYD) Robot Controller

## Overview
A touch-based remote control for omni-wheel robots, designed for the **ESP32-2432S028R** (also known as the Cheap Yellow Display or CYD). It provides a 9-button grid move interface that broadcasts commands via ESP-NOW.

## Hardware Setup
*   **Microcontroller:** ESP32-2432S028R (CYD).
*   **Display:** 2.8" TFT with integrated resistive touch (XPT2046).

## Key Features
*   **Touch Interface:** A 3x3 grid of buttons (SLIDE, UP, ROTATE, LEFT, STOP, RIGHT).
*   **ESP-NOW Broadcast:** Sends commands to all nearby receivers using the `0xFF:0xFF:0xFF:0xFF:0xFF:0xFF` broadcast address.
*   **Visual Feedback:** Buttons highlight when touched.
*   **Compatibility:** Designed to work with the `RobotController` receiver.
