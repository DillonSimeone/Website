# Project: Govee Lights Control

## Context
This project allows control of Govee smart devices via the Govee Open API and local LAN API.

## API Details
*   **Base URL:** `https://openapi.api.govee.com`
*   **Key Header:** `Govee-API-Key`
*   **Endpoints Implemented:**
    *   `GET /router/api/v1/user/devices`: List all devices.
    *   `POST /router/api/v1/device/state`: Fetch real-time device states (power, brightness, color, temperature).
    *   `POST /router/api/v1/device/control`: Control device state (On/Off, Brightness, Color Temperature, Color RGB).
    *   `LAN UDP API`: Multicast discovery on port 4001/4002, command execution on port 4003 (sub-10ms response if LAN control is enabled on device).

## Development History
*   **2026-10-15 (Windows System Tray App & Brightness Fix):**
    *   **Goal:** Replace browser-launching console app with a native, background-running Windows System Tray application. Resolve brightness limiting issue.
    *   **Root Cause for 50% Brightness:** 
        1. Devices (SKU: H6056) were set to 25% brightness in the cloud; the web UI was hardcoded to display "100%" on slider load without querying live state.
        2. RGB mode (`colorRgb` e.g. `#ffffff`) only illuminates RGB diodes, which output ~40-50% the maximum lumens of the hardware. True 100% maximum brightness requires Color Temperature mode (`colorTemperatureK` / True White LEDs).
    *   **Implementation:**
        *   Created `govee_api.py` with `GoveeManager` (supports real-time state querying, LAN discovery/control with cloud fallback, debounced controls).
        *   Created `tray_app.py` combining `pystray` (tray icon, context menus, quick presets) and a dark-themed Tkinter mini flyout window.
        *   Window docks above the taskbar in the lower right, closes/minimizes cleanly to tray.
        *   Added `True White (Max Lumens)` presets (2700K Warm, 4000K Neutral, 6500K Daylight).
        *   Built standalone windowed `.exe` (`dist/GoveeTrayControl.exe`) with `build_tray_exe.bat` (no console window).
*   **2025-12-31 (Architecture Overhaul):**
    *   Replaced `pywebview` with native Python `http.server` to reduce size.
*   **2025-12-14 (Initial):**
    *   Initial project setup.

## Current Tech Stack
*   **Tray App:** Python 3, `pystray`, `Pillow`, `tkinter`
*   **Backend:** `requests`, `python-dotenv`, UDP socket (LAN control)
*   **Build Tool:** PyInstaller (`--windowed` mode, single-file exe)
*   **Executables:**
    *   `dist/GoveeTrayControl.exe` (Recommended: silent system tray app with sleek flyout and right-click quick controls).
    *   `dist/GoveeControl.exe` (Legacy: console + browser).

## Operational Guide
1.  **Running Tray App:** Execute `run_tray.bat` or launch `dist/GoveeTrayControl.exe`.
2.  **Using the Tray App:**
    *   **Left-click / Double-click** tray icon: Opens / minimizes the modern control window.
    *   **Right-click** tray icon: Instant presets (All On/Off, Brightness %, True White, Colors, per-device submenus).
    *   **Close (X)** on window: Minimizes back to system tray.
    *   **Exit**: Choose `Exit` from the right-click tray menu.
3.  **Building:** Run `build_tray_exe.bat`.
