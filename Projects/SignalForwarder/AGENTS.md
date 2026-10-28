# OSC WebApp Monitor Context

## Project Overview
This tool is a standalone desktop application designed to monitor Open Sound Control (OSC) messages. It was built specifically to debug and verify connections from **PatchXR** (VR software) but works with any OSC sender. It features a modern glassmorphism UI.

## Architecture
- **Language:** Python 3.14 (Bleeding Edge)
- **GUI Framework:** `pywebview` using **Qt** (PyQt6) as the backend.
- **OSC Library:** `python-osc`.
- **Frontend:** HTML/CSS/JS located in the `web/` folder.

### How it Works
1.  **Backend (`app.py`):** Starts a UDP server on `0.0.0.0` (all interfaces) to listen for OSC packets. It also dynamically detects the local IP address for display.
2.  **Threading:** The OSC server runs on a background thread to avoid freezing the UI.
3.  **Bridge:** When a message is received, Python serializes it to JSON (including the sender's IP and port) and injects it into the running webview using `window.evaluate_js()`.
4.  **Frontend (`web/`):** A dark-themed, glassmorphism UI that displays the local IP and listening port, provides instructions, and logs incoming OSC messages with their address, arguments, and the sender's IP and port.
5.  **Robustness:** JavaScript bridge calls (`pywebview.api`) are now made after the `pywebviewready` event to prevent race conditions.

## "Library Decay" Prevention
This project uses **PyQt6** instead of the default .NET renderer for `pywebview`.
-   **Reason:** The user is on Python 3.14. The standard .NET bridge (`pythonnet`) is not yet compatible with 3.14, causing build failures.
-   **Solution:** We explicitly force the Qt backend, which is stable on 3.14. We also explicitly ensured all necessary Qt components (`QtPy`, `PyQt6-WebEngine`) are installed and correctly bundled.
-   **Freezing:** The `build_exe.bat` script uses **PyInstaller** to bundle the Python interpreter, all libraries, and the web assets into a single `.exe`. This ensures the tool will work forever, even if the local Python environment changes.

## Critical Files
-   `app.py`: Main application logic, including OSC server and IP detection.
-   `run_gui.bat`: Setup script (creates `venv`, installs specific deps like `QtPy`, runs app).
-   `build_exe.bat`: Compiles the project into a portable `.exe` in `dist/`, including necessary hidden imports for `PyQt6` and `pywebview`'s Qt backend.
-   `requirements.txt`: Dependency list (Crucially uses `pywebview` without default deps + `PyQt6`, `QtPy`, `PyQt6-WebEngine`).
-   `web/index.html`, `web/style.css`, `web/app.js`: The frontend UI components, with glassmorphism styling and robust `pywebview` API handling.

## Usage
-   **Standard:** Run `run_gui.bat`.
-   **PatchXR:** Use an `execute` block with `remote_ip [YOUR_LOCAL_IP]` and `port_out [LISTENING_PORT]` (displayed in the app) in Patchworld to send data to this PC's IP.
-   **Standalone:** Run `build_exe.bat` then execute `dist\OSC_Monitor.exe`.