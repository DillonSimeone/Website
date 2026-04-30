# ESP-NOW Piezo Sender

## Overview
A simple wireless communication project using the **ESP-NOW** protocol. It reads vibrations from a piezo sensor and sends the magnitude to a designated receiver.

## Hardware Setup
*   **Microcontroller:** ESP32
*   **Sensor:** Piezo sensor (Pin 4)
*   **Communication:** ESP-NOW (Proprietary Espressif protocol)

## Key Features
*   **Low Latency:** Uses ESP-NOW for near-instantaneous data transfer without the overhead of a full Wi-Fi connection.
*   **Threshold Detection:** Only sends data when the change in piezo value exceeds a hardcoded threshold (50), saving bandwidth and power.
*   **Peer Registration:** Configures a specific receiver MAC address for point-to-point communication.
