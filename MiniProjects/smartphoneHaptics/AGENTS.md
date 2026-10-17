# Smartphone Haptics Mini-Project

This project explores various ways to control smartphone haptic feedback using web technologies, leveraging the Web Vibration API in conjunction with different sensor inputs.

## Project Structure

The project consists of five main HTML pages, each demonstrating a distinct method of triggering haptics, along with their associated JavaScript and a shared CSS file.

- `index.html`: Original button-based haptics demo.
- `gestureHaptics.html`: Haptics controlled by smartphone motion (MPU readings).
- `micHaptics.html`: Haptics controlled by microphone input (sound levels).
- `cameraHaptics.html`: Haptics controlled by camera input (pixel data).
- `websocketHaptics.html`: Remote haptics control using PeerJS.

All pages share the `css/style.css` for consistent styling. Each specialized HTML page links to its own dedicated JavaScript file in the `js/` directory.

## Features of Each HTML Page

### 1. `index.html` - Button-Controlled Haptics

This is the foundational page demonstrating basic Web Vibration API usage through direct button interactions.

**Features:**
-   **Trigger Buttons:** "VIBRATE" (custom pattern), "STOP", "SIMPLE TEST" (fixed pattern).
-   **Duration Slider:** Adjusts the duration of a single pulse vibration.
-   **Preset Patterns:** Buttons for "Single", "Double", "Pulse", and "Mario" vibration patterns.
-   **Custom Pattern Input:** Allows users to define their own vibration patterns (e.g., `100,50,100`).
-   **Status Indicator:** Displays the current vibration status.
-   **Troubleshooting Guide:** Provides tips for enabling haptics on Android devices.

**Associated JavaScript:** `js/script.js`
-   Handles UI interactions.
-   Manages `navigator.vibrate()` calls based on user input.
-   Includes a basic check for Web Vibration API support and common browser limitations (e.g., DuckDuckGo).
-   Implements a small audio context "unlock" to ensure haptics work consistently on some platforms.

### 2. `gestureHaptics.html` - MPU-Driven Haptics

This page translates motion sensor (MPU) readings into haptic feedback, allowing users to "feel" their device's movement.

**Features:**
-   **Start/Stop Buttons:** To activate/deactivate MPU reading and haptic generation.
-   **Deadzone Control:** A slider to set a threshold for motion before haptics are triggered.
-   **Sensitivity Control:** Adjusts how strongly motion impacts haptic intensity.
-   **Intensity Cap:** Sets a maximum vibration intensity.
-   **Haptic Pattern Selection:** Dropdown to choose between "Single Pulse", "Double Pulse", "Ramp Up", and "Ramp Down" patterns.
-   **MPU Readouts:** Displays real-time accelerometer data (X, Y, Z axes) and a combined acceleration value.
-   **Status Indicator:** Shows sensor and haptics status.

**Associated JavaScript:** `js/gestureScript.js`
-   Checks for Web Vibration API and DeviceMotionEvent/Accelerometer API support.
-   Manages `Accelerometer` or `DeviceMotionEvent` event listeners.
-   Processes accelerometer data, calculates combined acceleration, and applies deadzone and sensitivity settings.
-   Triggers `navigator.vibrate()` with selected patterns and dynamically calculated intensity.
-   Updates the MPU readout display.
-   Includes a request for motion sensor permission for iOS devices.

### 3. `micHaptics.html` - Microphone-Driven Haptics

This page converts real-time microphone input levels into haptic feedback, making the device vibrate in response to sound.

**Features:**
-   **Start/Stop Buttons:** To activate/deactivate microphone access and haptic generation.
-   **Threshold Control:** A slider to set the minimum sound level required to trigger haptics.
-   **Sensitivity Control:** Adjusts how strongly sound level impacts haptic intensity.
-   **Intensity Cap:** Sets a maximum vibration intensity.
-   **Haptic Pattern Selection:** Dropdown to choose between "Single Pulse", "Continuous", and "Dynamic Pulse" patterns.
-   **Mic Level Visualizer:** A dynamic bar and numeric display showing the current microphone input level.
-   **Status Indicator:** Shows microphone and haptics status.

**Associated JavaScript:** `js/micScript.js`
-   Checks for Web Vibration API and `getUserMedia` (microphone access) support.
-   Requests microphone access.
-   Uses `Web Audio API` (`AudioContext`, `AnalyserNode`, `ScriptProcessorNode`) to process audio stream and extract amplitude/volume levels.
-   Applies threshold, sensitivity, and intensity cap to convert audio level into haptic feedback.
-   Triggers `navigator.vibrate()` with selected patterns and dynamically calculated intensity.
-   Updates the microphone level visualizer.

### 4. `cameraHaptics.html` - Camera-Driven Haptics

This page processes visual input from the smartphone camera to generate haptic feedback, allowing the user to "feel" changes in their environment.

**Features:**
-   **Start/Stop Buttons:** To activate/deactivate camera access and haptic generation.
-   **Camera Selection:** Dropdown to choose between available front and back cameras.
-   **Processing Mode Selection:** Dropdown to choose how camera frames are analyzed:
    -   **Average Brightness:** Haptics respond to the overall brightness of the scene.
    -   **Motion Detection:** Haptics respond to movement detected between frames.
    -   *(Future Expansion: Edge Detection)*
-   **Threshold Control:** A slider to set the minimum processed value required to trigger haptics.
-   **Sensitivity Control:** Adjusts how strongly the processed visual data impacts haptic intensity.
-   **Intensity Cap:** Sets a maximum vibration intensity.
-   **Haptic Pattern Selection:** Dropdown to choose between "Single Pulse", "Continuous", and "Dynamic Pulse" patterns.
-   **Camera Feed Display:** Shows the live camera feed on the page.
-   **Processed Value Visualizer:** A dynamic bar and numeric display showing the current processed visual value.
-   **Status Indicator:** Shows camera and haptics status.

**Associated JavaScript:** `js/cameraScript.js`
-   Checks for Web Vibration API and `getUserMedia` (camera access) support.
-   Enumerates and populates available video input devices.
-   Manages camera stream, displaying it in a `<video>` element.
-   Uses a hidden `<canvas>` to capture and process video frames.
-   Implements `calculateAverageBrightness` and `detectMotion` algorithms to extract meaningful values from pixel data.
-   Applies threshold, sensitivity, and intensity cap to convert processed visual data into haptic feedback.
-   Triggers `navigator.vibrate()` with selected patterns and dynamically calculated intensity.
-   Updates the processed value visualizer.

### 5. `websocketHaptics.html` - Remote/P2P Haptics

This page enables remote control of haptic feedback between devices using PeerJS (WebRTC), allowing a "Host" to trigger vibrations on multiple "Clients".

**Features:**
-   **Host/Client Toggle:** Switch between broadcasting commands (Host) and receiving them (Client).
-   **Host Protection:** Prevents multiple users from becoming Host simultaneously (ID collision check).
-   **Status Indicators:** Shows connection status, Peer ID, and number of connected clients.
-   **Shared Controls:** Host has access to the standard vibration controls (Presets, Custom Patterns) which are broadcast to all clients.

**Associated JavaScript:** `js/websocketScript.js`
-   Initializes PeerJS connections.
-   Manages Host/Client logic and state.
-   Handles data transmission (JSON objects with `type` and `pattern`).
-   Executes received vibration commands on Client devices.

---

## Technical Notes

### Browser-Based WebSockets & PeerJS Limitation
A standard web browser cannot act as a TCP/WebSocket **Server** due to security sandboxing. It can strictly act only as a **Client**. This means a browser page cannot open a port on the device to accept incoming connections from other devices on the LAN directly.

To achieve "Serverless" device-to-device communication (e.g., Phone to PC) without running a local Node.js/Python server, this project uses **PeerJS** (WebRTC).

-   **Mechanism:** PeerJS uses a public cloud "Signaling Server" for the initial handshake to exchange connection details (ICE candidates).
-   **P2P Data:** Once the handshake is complete, the actual data (haptic commands) flows **Directly (Peer-to-Peer)** between the devices, often over the local network (LAN) if both are on the same WiFi.
-   **Requirement:** An internet connection is required for the initial handshake/discovery. True offline, local-only discovery is not possible with pure client-side JavaScript in the browser without an intermediate server.
