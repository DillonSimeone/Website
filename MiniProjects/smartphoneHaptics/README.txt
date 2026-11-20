# Smartphone Haptics Mini-Project

This project demonstrates various ways to utilize smartphone sensor inputs (buttons, motion, microphone, camera) to control haptic feedback via the Web Vibration API.

## Project Files:

-   `index.html`: Basic button-controlled haptics.
-   `gestureHaptics.html`: Haptics based on device motion (accelerometer/MPU).
-   `micHaptics.html`: Haptics based on microphone sound levels.
-   `cameraHaptics.html`: Haptics based on camera pixel data (brightness, motion).
-   `websocketHaptics.html`: Remote haptics control using PeerJS (WebRTC) for device-to-device communication.

Each HTML file has a corresponding JavaScript file in the `js/` directory (e.g., `gestureHaptics.html` uses `js/gestureScript.js`).
All pages share common styling from `css/style.css`.

## How to Run:

Simply open any of the `.html` files in a modern web browser on a smartphone or device that supports the Web Vibration API and relevant sensor APIs (Web Audio, Device Motion, MediaDevices.getUserMedia).

For optimal experience, use Chrome on Android. iOS support for some sensor APIs (like Device Motion) may require specific user permissions.

## Features:

-   **Modular Design:** Separate HTML and JS files for each haptic demonstration.
-   **Configurable Settings:** Each demo allows users to adjust parameters like sensitivity, thresholds, intensity caps, and vibration patterns.
-   **Real-time Feedback:** Visual indicators show current sensor readings or processed values.

## Further Information:

For a detailed explanation of each page's features and implementation, please refer to `GEMINI.md`.
