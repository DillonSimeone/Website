# MPU6050toLEDPixels

## Overview
This project visualizes motion intensity on an LED strip using an **MPU6050 Accelerometer**. The total acceleration magnitude is calculated and mapped to the number of lit LEDs, creating a "power meter" effect that reacts to movement.

## Key Features
*   **Motion Sensing:** Reads X/Y/Z acceleration from MPU6050 (via I2C).
*   **Visualizer:**
    *   **Bar Graph:** The number of active LEDs corresponds to the acceleration magnitude (G-force).
    *   **Smoothing:** Implements attack and decay logic so the LED bar rises quickly and falls slowly.
    *   **Color Cycling:** The hue of the bar rotates over time.
    *   **Threshold:** Only activates when motion exceeds a set G-force (ignoring gravity/static noise).

## Hardware Config
*   **MPU6050:**
    *   SDA: Pin 9
    *   SCL: Pin 10
*   **LEDs:** WS2812 strip (144 pixels) on Pin 20.

## Dependencies
*   `Adafruit_MPU6050`, `Adafruit_Sensor`
*   `FastLED`
