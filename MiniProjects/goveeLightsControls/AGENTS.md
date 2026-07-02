# Project: Govee Lights Control

## Context
This project allows control of Govee smart devices via the Govee Open API.
It utilizes a **lightweight local server architecture**, serving a modern web interface to the user's default browser while proxying API requests to handle CORS.

## API Details
*   **Base URL:** `https://openapi.api.govee.com`
*   **Key Header:** `Govee-API-Key`
*   **Endpoints Implemented:**
    *   `GET /router/api/v1/user/devices`: List all devices.
    *   `POST /router/api/v1/device/control`: Control device state (On/Off, Color).

## Development History
*   **2025-12-31 (Architecture Overhaul):**
    *   **Goal:** Reduce file size (was 200MB+) and improve startup speed.
    *   **Change:** Replaced `pywebview` (which required heavy `PyQt6` binaries) with a native Python `http.server`.
    *   **Implementation:** 
        *   Created `server.py` to serve `web/index.html` and proxy API requests (solving CORS).
        *   Updated `web/app.js` to use standard `fetch()` against the local backend.
        *   Modified `build_exe.bat` to exclude `PyQt6`, `tkinter`, and `webview`, resulting in an **11MB executable**.
        *   The `.exe` now opens a console window (kept intentionally for easy closing) and launches the default browser.
*   **2025-12-14 (GUI Update):**
    *   Implemented a Desktop GUI using `pywebview` (PyQt6 engine).
    *   Designed a "Glassmorphism" UI.
    *   Features: Device listing, multi-selection, bulk control.
*   **2025-12-14 (Initial):**
    *   Initialized project, `.env` setup, and API documentation.

## Current State
*   **Status:** Functional Lightweight Desktop Control.
*   **Tech Stack:** 
    *   **Frontend:** HTML5, CSS3, Vanilla JavaScript.
    *   **Backend:** Python 3 (`http.server`, `requests`).
    *   **Build Tool:** PyInstaller (Onefile, Console mode).
*   **Executable Info:**
    *   Size: ~11MB.
    *   Behavior: Starts local server on port 8080 (auto-increments if busy), opens browser.
    *   **Note:** Console window remains open to allow easy process termination.

## Operational Guide
1.  **Building:** Run `build_exe.bat`. It forces a cleanup of previous builds and kills running instances.
2.  **Running:** Execute `dist/GoveeControl.exe`.
3.  **Stopping:** Close the console window to kill the server.

## Next Steps
*   Add brightness control slider.
*   Implement individual device control panels.
*   Add "scenes" or presets.
