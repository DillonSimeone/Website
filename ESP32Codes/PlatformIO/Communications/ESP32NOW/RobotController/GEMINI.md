# Omni-Wheel Robot Receiver (ESP-NOW)

## Overview
A high-performance robot receiver designed for omni-wheel (Mecanum) movement. It receives commands via the **ESP-NOW** protocol and translates them into precise motor movements.

## Hardware Setup
*   **Microcontroller:** ESP32 (Freenove/WROVER compatible)
*   **Motor Drivers:** 2x L298N Dual H-Bridge Drivers.
*   **Motor Configuration:** 4-motor drive (Front Left, Front Right, Rear Left, Rear Right).
*   **Pins:**
    *   **PWM Channels:** 4 dedicated channels for speed control.
    *   **Logic Pins:** 8 pins for motor direction.

## Key Features
*   **Omni-Directional Movement:** Supports Forward, Backward, Strafe (Left/Right), Diagonal Slide, and Rotation.
*   **Low Latency Control:** Uses ESP-NOW to ensure real-time response from a master controller (e.g., a CYD master).
*   **PWM Speed Control:** Hardware-based PWM for smooth acceleration and consistent torque.
*   **MAC ID Discovery:** Prints the device MAC on boot to simplify master-peer pairing.
