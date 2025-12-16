# MicroPython SCD41 CO2 Sensor with Web Server (ESP32-C3 SuperMini)

## Project Goal
To read CO2, Temperature, and Humidity data from an SCD41 sensor connected to an ESP32-C3 SuperMini, and serve these readings on a local webpage via mDNS (accessible at `co2.local` on your network).

## Hardware
*   **ESP32-C3 SuperMini**
*   **SCD41 CO2 Sensor Module** (or SCD40, SCD30 - I2C compatible)

## Wiring (SCD41 to ESP32-C3 SuperMini)
Connect the SCD41 sensor to the ESP32-C3 SuperMini as follows:

| SCD41 Pin | ESP32-C3 SuperMini Pin | GPIO Number | Notes                                    |
| :-------- | :--------------------- | :---------- | :--------------------------------------- |
| VDD       | 3V3                    | -           | Power (3.3V)                             |
| GND       | GND                    | -           | Ground                                   |
| SDA       | A3                     | GPIO 3      | I2C Data                                 |
| SCL       | A4                     | GPIO 4      | I2C Clock                                |

**Important:** The SCD41 sensor operates at 3.3V. Ensure your wiring provides 3.3V to its VDD pin.

## Prerequisites
*   **PlatformIO**: Must be installed (used to provide `esptool.py`).
*   **Python**: Required for `ampy`.
*   **Ampy**: Adafruit MicroPython Tool (`pip install adafruit-ampy`) for file management.

## Project Files

*   **`scd41.py`**: MicroPython driver for the SCD41 sensor.
*   **`secrets.py`**: **EDIT THIS FILE** with your WiFi SSID and password.
*   **`boot.py`**: Connects the ESP32 to WiFi and attempts to announce its hostname (`co2.local`) via mDNS.
*   **`main.py`**: Initializes the SCD41, runs a simple web server, and serves sensor data on an auto-refreshing webpage. Also blinks the onboard LED for status.
*   **`flash.ps1`**: PowerShell script to flash the MicroPython firmware onto the ESP32-C3.
*   **`ESP32_GENERIC_C3-20251209-v1.27.0.bin`**: The MicroPython firmware for the ESP32-C3.

## Setup and Usage

### 1. Configure WiFi Credentials
Open `secrets.py` and replace `"YOUR_WIFI_SSID"` and `"YOUR_WIFI_PASSWORD"` with your actual WiFi network details.

```python
# secrets.py
SSID = "MyHomeWiFi"
PASSWORD = "MyAwesomeWiFiPassword"
```

### 2. Flash MicroPython Firmware (if not already done)
Ensure your ESP32-C3 SuperMini is plugged in.
Run the PowerShell flashing script from this project's directory:
```powershell
.\flash.ps1
```
*   **Troubleshooting:** If it fails, try manually putting the ESP32-C3 into **Download Mode**:
    1.  Hold the **BOOT** button on the board.
    2.  Press and release the **RESET** button.
    3.  Release the **BOOT** button.
    Then re-run `.\flash.ps1`.

### 3. Upload Project Files
After flashing (or if MicroPython is already installed), upload all Python files to the board.
Navigate to this project directory in your terminal and run the following `ampy` commands.
*(Replace `COMx` with your ESP32-C3's serial port, e.g., `COM5`)*

```bash
ampy -p COMx put scd41.py /scd41.py
ampy -p COMx put secrets.py /secrets.py
ampy -p COMx put boot.py /boot.py
ampy -p COMx put main.py /main.py
```

### 4. Run the Project
1.  **Press the RESET button** on your ESP32-C3 SuperMini.
2.  The board will connect to your WiFi and start the web server.
3.  Open a web browser on a device connected to the same local network.
4.  Navigate to `http://co2.local/` (or the IP address shown by the serial monitor).
5.  You should see the CO2, Temperature, and Humidity readings. The page will auto-refresh every 5 seconds.

## Notes
*   The onboard LED will blink briefly when sensor data is read and the web server is active.
*   The `boot.py` script attempts to announce `co2.local` via a basic mDNS implementation. If `co2.local` doesn't resolve, try accessing the board via its IP address (which `boot.py` prints to the serial console during startup).
