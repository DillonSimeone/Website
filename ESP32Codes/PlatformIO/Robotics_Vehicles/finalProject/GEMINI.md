# Intelligent Assistant Robot (Final Project)

## Overview
The culmination of the Robotics course, this 4-wheeled robot features a suite of advanced sensors and a web-based control interface. It is designed to detect humans and interact with its environment.

## Hardware Setup
*   **Microcontroller:** ESP32
*   **Chassis:** 4-wheel drive with dedicated motor control pins.
*   **Sensors:**
    *   **LD2410 Human Presence:** Detects stationary and moving "meatbags" with high precision.
    *   **Ultrasonic Sensor:** Measures distance to obstacles for collision avoidance.
*   **Display:** 0.96" OLED (SSD1306) to show real-time sensor data and action states.
*   **Lighting:** WS2811 LED array for visual status feedback.

## Key Features
*   **WiFi Command Center:** Hosts its own Access Point ("DSfinal") with a mobile-friendly grid UI for manual driving.
*   **Human Tracking:** Real-time distance and movement state reporting for humans in the vicinity.
*   **Shrek Engine:** A custom "ShrekButton" counter and humorous boot messages.
*   **Automatic Motor Timeout:** Safety feature to stop motors if communication is lost.
