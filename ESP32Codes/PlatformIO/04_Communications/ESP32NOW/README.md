# ESP32NOW / PCC Capstone Course 2025

## Overview
This directory contains a distributed system project (likely for a PCC Capstone Course) that uses ESP-NOW for low-latency communication between ESP32 nodes and a Node.js backend for orchestration.

## System Architecture
The system consists of three main components:

1.  **RFID Reader Node (`RFIDreaderESP32NOW`)**
    *   **Hardware:** ESP32 + MFRC522 RFID Reader + LEDs.
    *   **Function:** Reads RFID tags. When a tag is detected, it sends the UID via ESP-NOW to the Master node. It also displays local visual feedback (LEDs).
    
2.  **Master/Follower Node (`SerialMagic.ino` inside `ESP32SeriesReaderNodeJS`)**
    *   **Hardware:** ESP32 + LED Strip (WS2812B).
    *   **Function:**
        *   **Master Mode:** Receives ESP-NOW messages (from RFID readers), relays them to the PC via Serial, and broadcasts "Glitch" commands to Follower nodes.
        *   **Follower Mode:** Listens for "Glitch" commands via ESP-NOW and triggers LED animations.
        *   **Serial Interface:** Sends "Ping!" heartbeats to the PC and listens for "Pong!" commands to trigger effects.

3.  **Node.js Backend (`ESP32SeriesReaderNodeJS`)**
    *   **Stack:** Node.js, `serialport`.
    *   **Function:** Connects to the Master ESP32 via Serial.
    *   **Logic:** Listens for "RFID" messages. When an RFID tag is detected, it logs the event and sends a "Pong!" command back to the Master ESP32, triggering a system-wide LED glitch effect.

## Directory Structure
*   `PCC_Capstone_Course_2025/RFIDreaderESP32NOW/`: Source code for the RFID sensing node.
*   `PCC_Capstone_Course_2025/ESP32SeriesReaderNodeJS/`: Node.js backend code.
    *   `SerialMagic/`: Source code for the Master/Follower LED nodes.
    *   `main.js`: Main entry point for the Node.js serial bridge.
    *   `serialYoinker.js`: Helper library for managing serial connections.

## Key Technologies
*   **ESP-NOW:** For peer-to-peer, WiFi-independent communication between ESP32s.
*   **Serial Communication:** For bridging the embedded network with the PC backend.
*   **FastLED:** For controlling WS2812B LED strips.
*   **Node.js:** For logic and potential integration with other web services.
