# RatVehicle: Capacitive Touch Robot

## Overview
A unique robot control project that eliminates traditional buttons or joysticks in favor of **Capacitive Touch** sensors. By touching exposed wires, the user can command the robot to move.

## Hardware Setup
*   **Microcontroller:** ESP32 / Arduino compatible.
*   **Inputs:** 3x Capacitive Wires (Forward, Left, Right).
*   **Motors:** 2-wheel drive with Enable pins (GPIO 6, 9) and Direction pins (GPIO 7, 8, 12, 11).

## Key Features
*   **Custom Capacitive Library:** Implements a raw bit-banging approach to measure pin discharge time (cycles), allowing for touch detection without external libraries.
*   **State Machine:** Logic to handle combinations of touches (e.g., Left + Forward = Diagonal/Curve).
*   **Debug HUD:** Detailed serial output showing the raw cycle count for each pin to help with threshold tuning.
