# Smart CO2 Monitor with Web Dashboard & Visual Alerts (ESP32-C3)

## Project Overview
This project transforms an **ESP32-C3 SuperMini** and an **SCD41/SCD40** sensor into a smart air quality monitor. It features a responsive web dashboard with historical graphing, data logging, configurable LED visual alerts (via NeoPixel), and an automation API.

## Features
*   **Real-time Monitoring:** CO2 (ppm), Temperature (°C), Humidity (%), and **Dew Point (°C)**.
*   **Web Dashboard:**
    *   Live readings with "Condensation Risk" visual alerts.
    *   **Interactive History Graph** (Pacific Time X-axis, auto-refreshes every 30s).
    *   **Settings Panel:** Configure LED colors, brightness per threshold, and flashing modes directly from the browser.
*   **Visual Alerts (NeoPixel):**
    *   Connect a WS2812B LED (strip or single pixel) to visually indicate CO2 levels.
    *   Supports dual-color flashing alerts (e.g., Flash Red/Blue when > 2000 ppm).
*   **Data Logging:**
    *   Logs data to internal flash memory (`data.csv`) every 60 seconds.
    *   Auto-rotates logs to prevent memory overflow (50KB limit).
    *   **CSV Download** button on dashboard.
*   **Automation API:** Simple JSON endpoint (`/api/ppm`) for integrating with home automation (e.g., smart vents).

## Hardware Setup

### Components
*   **ESP32-C3 SuperMini**
*   **SCD41 or SCD40** CO2 Sensor
*   **WS2812B NeoPixel** LED (Optional, for visual alerts)

### Wiring Diagram

| Component | Pin | ESP32-C3 Pin | Notes |
| :--- | :--- | :--- | :--- |
| **SCD41** | VDD | 3V3 | **3.3V Only!** |
| | GND | GND | |
| | SDA | GPIO 3 (A3) | I2C Data |
| | SCL | GPIO 4 (A4) | I2C Clock |
| **NeoPixel** | DIN | **GPIO 5** | Data Input |
| | VCC | 3V3 or 5V | |
| | GND | GND | |

## API Documentation
The web server exposes several endpoints for integration:

| Endpoint | Method | Description | Response Example |
| :--- | :--- | :--- | :--- |
| `/api/data` | GET | Full sensor data | `{"co2": 850, "temp": 24.5, "hum": 45.0, "dew_point": 11.2}` |
| `/api/ppm` | GET | Lightweight CO2 only | `{"ppm": 850}` |
| `/api/history` | GET | Historical data for graphing | `[{"ts": 946684800, "co2": 450}, ...]` |
| `/api/settings` | GET/POST | Read or update config | JSON Config Object |
| `/api/download` | GET | Download CSV log | `co2_log.csv` file download |

## Setup & Flashing Guide

### 1. Prerequisites
*   **Python 3** installed.
*   **Ampy** (`pip install adafruit-ampy`).
*   **Esptool** (usually comes with PlatformIO or `pip install esptool`).

### 2. Prepare Credentials
Edit `secrets.py` with your WiFi details:
```python
SSID = "MyWiFi"
PASSWORD = "MyPassword"
```

### 3. Flash Firmware (Clean Install)
For best stability, **erase flash first**:
```powershell
# 1. Enter Download Mode (Hold BOOT, Press RESET, Release BOOT)
.\erase.ps1
# 2. Unplug/Replug board
# 3. Enter Download Mode again
.\flash.ps1
# 4. Press RESET
```

### 4. Upload Files (Sequential Upload)
**CRITICAL:** Uploading files one by one with a pause is much more reliable than a single chained command, as it prevents the serial port from locking up or the board from getting overwhelmed.

Replace `COM5` with your actual port.

```powershell
# Upload helper scripts first
ampy -p COM5 put check_wifi.py /check_wifi.py
Start-Sleep -Seconds 2

# Upload Configuration
ampy -p COM5 put secrets.py /secrets.py
Start-Sleep -Seconds 2
ampy -p COM5 put settings.json /settings.json
Start-Sleep -Seconds 2

# Upload System Files
ampy -p COM5 put boot.py /boot.py
Start-Sleep -Seconds 2
ampy -p COM5 put scd41.py /scd41.py
Start-Sleep -Seconds 2

# Upload Application
ampy -p COM5 put index.html /index.html
Start-Sleep -Seconds 2
ampy -p COM5 put main.py /main.py
```

### 5. Access
1.  Press **RESET** on the ESP32.
2.  Wait ~10 seconds for WiFi connection.
3.  Open `http://co2.local` in your browser.

## Troubleshooting
*   **Ampy Hangs / "ClearCommError":**
    *   This usually means the board is busy or the serial port didn't close properly.
    *   **Fix:** Unplug/Replug the board. Ensure you use `Start-Sleep` between commands.
*   **Graph is empty:** Wait 1-2 minutes. Data logs every 60 seconds.
*   **"Condensation Risk" Alert:** Flashes blue on dashboard if Temp is within 3°C of Dew Point.
*   **Time is wrong:** The graph uses the browser's local timezone (Pacific Time hardcoded in display logic) applied to the ESP32's uptime/NTP timestamp.
