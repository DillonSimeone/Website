# Google Pixel 6a Auto USB Tethering Daemon

This folder contains an automated daemon designed to run continuously in the background on your Windows desktop. Whenever your Google Pixel 6a is plugged in via USB (with USB debugging enabled), it detects the phone and automatically enables USB tethering without requiring you to manually navigate your phone's settings menu.

## How It Works

1. **Low-Overhead Connection Listener**:
   * Uses `adb wait-for-device` to block on native OS USB arrival events with 0% CPU consumption while waiting.
2. **Identification & Health Check**:
   * Reads device model (`Pixel 6a`), codename (`bluejay`), and serial number.
   * Checks if USB tethering is already active before trying to toggle it.
3. **Multi-Tier Activation Strategy**:
   * **Tier 1 (Kernel Gadget Switch)**: Issues `svc usb setFunctions ncm,adb` (the modern Tensor/Pixel standard) and `svc usb setFunctions rndis,adb`.
   * **Tier 2 (UI Automation Fallback)**: Automatically launches the Tethering settings menu (`com.android.settings/.TetherSettings`), dumps the UI hierarchy via `uiautomator`, finds the "USB tethering" toggle switch, calculates its bounding box center, taps it if off, and immediately returns the screen home (`KEYCODE_HOME`).
   * **Tier 3 (Service Call)**: Runs `cmd connectivity start-tethering 1`.
4. **Lifecycle & Disconnection Management**:
   * Once tethering is active, monitors `adb get-state`. When unplugged, logs the disconnect and seamlessly loops back to wait for the next connection.

## Files

* **[auto_tether.py](file:///f:/Github/Website/public/Glue/USBTethering/auto_tether.py)**: The Python daemon script.
* **[start_tether.bat](file:///f:/Github/Website/public/Glue/USBTethering/start_tether.bat)**: Runs the daemon in a visible console window (ideal for testing, viewing live logs, and first-time pairing).
* **[run_background.vbs](file:///f:/Github/Website/public/Glue/USBTethering/run_background.vbs)**: Silent launcher that executes `pythonw auto_tether.py` with no visible console window.
* **[install_startup.bat](file:///f:/Github/Website/public/Glue/USBTethering/install_startup.bat)**: Adds or removes `run_background.vbs` from your Windows Startup folder (`shell:startup`) so it automatically starts when Windows boots.
* **[stop_background.bat](file:///f:/Github/Website/public/Glue/USBTethering/stop_background.bat)**: Terminates any active background instances of `auto_tether.py`.
* **`tethering.log`**: Automatically generated log file tracking connection and tethering events.

## First-Time Setup Instructions

1. **Plug in your Pixel 6a** with USB debugging turned ON in Developer Options.
2. If your phone asks **"Allow USB debugging?"**, check the box **"Always allow from this computer"** and tap **Allow**.
3. Run **[start_tether.bat](file:///f:/Github/Website/public/Glue/USBTethering/start_tether.bat)** once to verify everything connects and toggles successfully.
4. Run **[install_startup.bat](file:///f:/Github/Website/public/Glue/USBTethering/install_startup.bat)** to have the daemon run silently on Windows startup.

## Pro-Tip: Android Native Default Setting
On your Pixel 6a, you can also configure:
1. Open **Settings** > **System** > **Developer options**.
2. Scroll to **Default USB configuration**.
3. Select **USB tethering**.

Combining the native setting with this daemon guarantees that whenever your phone is connected and unlocked, USB tethering is engaged immediately.
