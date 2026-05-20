# Human Detector: Hybrid Sensing System

This project implements a high-performance human detection and distance measurement system using an ESP32-C6, combining microwave radar and ultrasonic technologies.

## 🚀 Overview
The "Human Detector" leverages two distinct sensing methodologies to provide a robust understanding of its environment:
1.  **HLK-LD2410C (24GHz Radar)**: Detects moving and stationary human presence using FMCW radar. It is highly sensitive to micro-movements like breathing.
2.  **URM37 V5.0 (Ultrasonic)**: Provides reliable distance measurements using sound pulses.

## 🛠 Key Features & Technical Details

### 1. Hybrid Presence Logic
- **Advanced Radar Parsing**: Communicates with the LD2410C via Hardware UART at **256,000 baud**.
*   **Dual-State Tracking**: Separates "Moving" (walking/typing) energy from "Stationary" (sitting/breathing) energy.
- **Smart Filtering**: Implements an **Exponential Moving Average (EMA)** filter (`alpha=0.2`) to eliminate sensor jitter and provide "smooth" transitions on the display.

### 2. High-Precision Ultrasonic Integration
*   Integrated the **URM37 V5.0** in its specific **Active-LOW PWM mode**.
*   Custom timing logic (`pulseIn` on LOW pulse) provides sub-centimeter distance accuracy.

### 3. Dynamic OLED Dashboard
- **Flashing Alerts**: The `DETECTED` indicator flashes when radar presence is confirmed at a distance greater than 40cm.
- **Near-Zone Awareness**: Differentiates between background noise/desk surface (<= 40cm) and legitimate human presence.
- **Energy Monitoring**: Real-time signal strength (E:XX) display for debugging and calibration.

## 📁 Repository Structure
- `src/main.cpp`: Unified sensor fusion logic and OLED state machine.
- `platformio.ini`: Configured for the **pioarduino** platform to support Arduino 3.0+ on the ESP32-C6.
- `upload.bat`: One-click build and deployment tool.

## 📌 Pin Configuration (FireBeetle 2 ESP32-C6)
| Component | Pin | Note |
| :--- | :--- | :--- |
| **I2C SDA** | 19 | OLED Data |
| **I2C SCL** | 20 | OLED Clock |
| **Radar RX** | 17 | Conn. to Sensor TX |
| **Radar TX** | 16 | Conn. to Sensor RX |
| **US TRIG** | 21 | Active-LOW Trigger |
| **US ECHO** | 22 | Active-LOW Echo |
