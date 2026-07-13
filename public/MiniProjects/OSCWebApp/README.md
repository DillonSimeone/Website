# OSC WebApp Monitor

An elegant, real-time desktop utility for monitoring and forwarding **Open Sound Control (OSC)** traffic. Built with **Python**, **pywebview** (rendering a premium glassmorphic frontend), and **python-osc**, it was designed for patchXR/Patchworld workflows to orchestrate communications between VR engines and physical hardware (such as ESP32 devices).

---

## Key Features

1. **Real-time Monitoring:**
   * Listens on a configurable local UDP port (default `3330`).
   * Beautifully captures and displays OSC addresses, values, arguments, and source IPs in a dark-mode console.
2. **Dynamic Client Discovery:**
   * Automatically detects and registers incoming OSC-transmitting devices.
3. **Smart Packet Forwarding:**
   * Toggle forwarding checkboxes next to any registered IP.
   * Forward incoming VR messages to other local nodes (like your `oscdevice.local` ESP32 controller) on the fly.
4. **Zero-Configuration Launcher:**
   * Double-clicking `run_gui.bat` sets up a virtual environment, auto-installs dependencies, and launches the app.

---

## Installation & Setup

1. Verify Python is installed and added to your system's PATH.
2. Launch the application by running:
   ```bash
   run_gui.bat
   ```
3. Enter your target listening port and click **Start Listener**.

---

## Integration with VR (PatchXR / Patchworld)

1. In Patchworld, configure an OSC execution block:
   * **Target IP:** Set to your computer's Local IP (displayed at the top of the monitor window).
   * **Target Port:** `3330` (or your chosen listener port).
2. Connect your physical devices (such as an ESP32 mapping LED triggers to `/led`) to the same network.
3. Once the monitor captures a message from the VR headset, the headset's IP appears under **Forward To**. Toggle forwarding to sync virtual instruments directly with physical space.
