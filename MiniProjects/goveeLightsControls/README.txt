# Govee Lights Control Project

## Overview
This project provides a modern Desktop GUI to interact with the Govee API (v1/router) to control smart lighting devices. It allows for listing devices, selecting multiple lights, and controlling their power and color.

## Setup
1.  **Environment:** Requires Python 3.
2.  **Virtual Environment:**
    ```powershell
    python -m venv venv
    venv\Scripts\pip install -r requirements.txt
    ```
    *Note: The project uses PyQt6 as the backend for the GUI.*

3.  **Credentials:**
    *   Create a `.env` file in the root directory.
    *   Add your API key: `GOVEE_API_KEY=your-uuid-key-here`

## Usage

### Run the GUI (Recommended)
*   **Double-click** `run_gui.bat` to launch the application.
*   **Or via CLI:**
    ```powershell
    venv\Scripts\python app.py
    ```

### Run Sanity Test (CLI)
*   **Double-click** `run_sanity_test.bat`.
*   **Or via CLI:**
    ```powershell
    venv\Scripts\python sanityTest.py
    ```

## Files
*   `app.py`: Main GUI application entry point (Python backend).
*   `web/`: Contains frontend assets (HTML, CSS, JS) for the GUI.
    *   `index.html`: Main UI structure.
    *   `style.css`: Glassmorphism styling.
    *   `app.js`: UI logic and API bridging.
*   `sanityTest.py`: Simple CLI script to toggle all devices ON/OFF.
*   `API_DOCS.md`: Local reference for the Govee API endpoints used.
*   `requirements.txt`: Python dependencies (`requests`, `pywebview`, `PyQt6`, etc.).