# DataGlove: Wireless Haptic Interface

## Overview
A multi-node wearable system that translates hand gestures into wireless commands and provides haptic feedback. It consists of a sensor-equipped glove (Sender) and a motor-equipped interface (Receiver).

## System Components

### 1. Sender
*   **Sensors:** 4x Hall Effect sensors (GPIO 17, 16, 6, 4) to detect finger positions via magnet proximity.
*   **Feedback:** 4x Haptic motors (GPIO 5, 23, 22, 21).
*   **Communication:** Sends finger state data packets via **ESP-NOW**.

### 2. Receiver
*   **Feedback:** 4x Haptic motors (GPIO 5, 23, 22, 21).
*   **Logic:** Receives finger state packets and triggers motors with timed pulses (120ms) to provide tactical feedback for remote events.

### 3. MainGlove (Integrated)
*   A standalone version that combines local sensor reading with local haptic feedback for data logging and testing.

## Key Features
*   **Low-Latency Mapping:** Real-time transmission of analog finger states.
*   **Bidirectional Interaction:** The sender can both "feel" and "send" data simultaneously.
*   **Calibration:** Includes debounce and state-tracking logic to ensure clean signal processing from hall sensors.
