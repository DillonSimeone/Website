# OSC WebApp Monitor

A simple OSC (Open Sound Control) monitor application using Python, Qt (via pywebview), and python-osc.

## Features
- Listens for OSC messages on a configurable port (default 3330).
- Displays address and arguments of incoming messages in real-time.
- "Dark Mode" UI inspired by Govee Light Controls.
- Built to work with PatchXR and other OSC-compatible software.

## Setup
1. Ensure you have Python installed.
2. Run `run_gui.bat`.
   - This will create a virtual environment, install dependencies (`python-osc`, `pywebview`, `PyQt6`), and launch the app.

## Usage with PatchXR
1. In Patchworld, use an `execute` block with `port_out [PORT]` (e.g., `port_out 3330`) to send data to this app.
2. Or configure your external software to send OSC messages to this computer's IP at the port specified in the app.
