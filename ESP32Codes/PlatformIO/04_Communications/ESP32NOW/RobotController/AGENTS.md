# Omni-Wheel Robot Receiver (ESP-NOW)

## Overview
A high-performance robot receiver designed for omni-wheel (Mecanum) movement. It receives commands via the **ESP-NOW** protocol and translates them into precise motor movements.

## Hardware Setup
*   **Microcontroller:** ESP32 (Freenove/WROVER compatible)
*   **Motor Drivers:** 2x L298N Mini (or compatible 2-pin PWM drivers).
*   **Motor Configuration:** 4-motor drive (Front Left, Front Right, Rear Left, Rear Right).
*   **Pins:**
    *   **Logic:** Uses 2 pins per motor (Forward/Backward). No separate Enable pin required.
    *   **Configurable:** All motor pins are remappable via the built-in Web Interface.

## Key Features
*   **Web-Based Configuration:** Hosts an Access Point (`OmniBot_Setup`) to dynamically reassign pins via a Glassmorphism web UI.
*   **Omni-Directional Movement:** Supports Forward, Backward, Strafe (Left/Right), Diagonal Slide, and Rotation.
*   **Dual Mode Connectivity:** Runs **ESP-NOW** for low-latency control AND a **SoftAP** for configuration simultaneously.
*   **NVS Persistence:** Saves custom pin mappings to flash memory, surviving reboots.
*   **PWM Speed Control:** Hardware-based PWM for smooth acceleration.
