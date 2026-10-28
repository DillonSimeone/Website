# Daemon Command Center 🎛️

A lightweight Windows 11 system tray dashboard and master supervisor for the Pixel 6a networking daemons:
1. **[USBTethering](../Daemons/USBTethering)** (`auto_tether.py`)
2. **[Wifi5GSentinel](../Daemons/Wifi5GSentinel)** (`Watch-PhoneWifi5G.ps1`)

Built with `pystray`, `PIL`, and `tkinter`, matching the modern dark aesthetic of [goveeLightsControls](../../MiniProjects/goveeLightsControls) and [TokenTracker](../../MiniProjects/TokenTracker).

---

## Features

* **Master Supervisor Role:**
  * Monitors the background processes of both daemons.
  * Auto-starts or revives them if they are stopped or interrupted.
  * 1-click **"Restart Daemons"** button to cycle both workers cleanly.
* **Real-Time Telemetry:**
  * **Phone Status:** Model (`Pixel 6a`), Serial, Battery percentage, and charging state.
  * **USB Tether Link:** Connection state (NCM host interface / `Ethernet 6`).
  * **Wi-Fi Bridge:** Connected SSID, exact frequency (MHz), 5 GHz safety badge, Rx/Tx negotiated PHY link speeds, and link health score.
* **1-Click Manual Actions:**
  * **`⚡ Force 5GHz Nudge`**: Triggers an instantaneous Wi-Fi cycle via ADB to pull the phone back from crowded 2.4 GHz channels to 5 GHz.
  * **`🔄 Re-trigger Tether`**: Issues an ADB kernel gadget switch (`svc usb setFunctions ncm,adb`) to activate tethering immediately.
* **Daemon History & Log Buttons:**
  * **`📜 History / Log` buttons** on each daemon card to instantly launch `tethering.log` or `sentinel.log` in your default text editor.
  * Live **Recent Daemon Activity Stream** right inside the dashboard window showing color-coded chronological events.
* **Dynamic System Tray Icon:**
  * 🟢 **Green Badge:** Phone tethered and locked on 5 GHz.
  * 🟡 **Amber Badge:** Warning — Wi-Fi drifted down to 2.4 GHz or low link speed.
  * 🔴 **Red Badge:** Phone disconnected or ADB offline.
  * **Hover Tooltip:** Shows instant summary (e.g. `Pixel 6a: 🟢 5 GHz (5580MHz) at 432Mbps | Tether: Active`).
  * **Left-Click:** Toggles / minimizes the Command Center dashboard.
  * **Right-Click Menu:** Quick action shortcuts (Nudge 5 GHz, Re-trigger Tether, Open Logs, Restart, Exit).

---

## File Structure

```text
F:\Github\Website\public\Glue\DaemonCommandCenter\
├── command_center.py      # Core tray application and Tkinter dashboard
├── run_command_center.vbs # Zero-console silent background launcher
├── install_startup.bat    # Windows Startup shortcut installer
└── README.md              # This documentation
```

---

## Quick Usage

* **To launch silently:** Double-click `run_command_center.vbs`.
* **To open GUI from tray:** Left-click the system tray icon next to the clock.
* **To install/remove from Windows Startup:** Run `install_startup.bat`.
