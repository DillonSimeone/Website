# Audio to Motor Controller (ESP32-C3 SuperMini)

Control motors via PWM based on audio volume levels from a MAX4466 microphone. This project uses MicroPython and features a built-in Web Interface for configuration, supporting both WiFi Station (STA) mode and Access Point (AP) mode with a Captive Portal.

## Hardware Setup
*   **MAX4466 Microphone**:
    *   **VCC**: 3.3V
    *   **GND**: GPIO 4 (Software defined Virtual Ground)
    *   **OUT**: GPIO 3 (ADC)
*   **Motors**:
    *   Connect motor driver PWM inputs to any free GPIO pins (e.g., 0, 1, 2, 5).
    *   Configure these pins dynamically via the Web Interface.

## Features
*   **Dual WiFi Mode**:
    *   **Station Mode**: Connects to your existing WiFi network (configured via `secrets.py` or Web UI).
    *   **AP Mode (Fallback)**: Creates a WiFi Hotspot (e.g., `reactiveMotor`, `reactiveMotor1`) if connection fails. Connect to it to configure the device.
*   **Captive Portal**: In AP mode, any website you try to visit will redirect you to the configuration page.
*   **Web Interface**:
    *   Real-time Volume Monitoring.
    *   Dynamic Motor Configuration (Pin, Volume Range -> Duty Cycle Range).
    *   WiFi Scanning and Configuration.
*   **MDNS**: Accessible via `http://reactiveCogs.local` when connected to the same network.

## Software Setup
1.  **Flash Firmware** (if needed):
    *   Run `.\flash.ps1` to erase flash and install MicroPython.
2.  **Upload Code**:
    *   Run `.\upload.ps1` (or use `ampy`) to upload `main.py`, `boot.py`, `index.html`, and `secrets.py` (optional).
    *   *Note*: `secrets.py` is ignored by git. Create one based on the template below if you want hardcoded credentials.

### `secrets.py` Template
```python
SSID = "Your_WiFi_SSID"
PASSWORD = "Your_WiFi_Password"
```

## Usage
1.  **Power On**: The board will try to connect to WiFi.
    *   **Success**: Accessible at `http://reactiveCogs.local` or its IP address.
    *   **Failure**: Creates a hotspot named `reactiveMotor` (or similar). Connect to it.
2.  **Configuration**:
    *   Open the web interface.
    *   Go to **Settings** to add motors.
    *   **Example Mapping**:
        *   **Pin**: 0
        *   **Min Vol**: 1000, **Max Vol**: 3000
        *   **Min Duty**: 0%, **Max Duty**: 100%
        *   *Result*: Motor on Pin 0 stays off until volume hits 1000, then ramps up to full speed at volume 3000.

## Development
*   **`boot.py`**: Handles WiFi connection logic (STA vs AP) and mDNS announcement.
*   **`main.py`**: Runs the main loop:
    *   Samples Audio (ADC).
    *   Smooths volume level.
    *   Updates Motor PWM duties.
    *   Serves HTTP (Web UI/API) and DNS (Captive Portal).
