# Phone Energy Daemon (Native Windows Rust) 🦀⚡

High-performance native Windows daemon written in Rust, engineered to manage low-power **Eco-Tether profiles** on Android devices (specifically Google Pixel 6a) when tethered as a high-speed USB/Wi-Fi bridge.

This daemon completely supersedes the legacy Python implementation (`energy_daemon.py`), eliminating Python runtime dependencies, reducing memory usage from ~45 MB to **<4 MB**, and dropping the standalone executable size to **377 KB**.

---

## Architecture & Windows Native Invariants

Adhering strictly to [`Glue/RUST/AGENTS.md`](../AGENTS.md):

1. **Zero Console Window Flicker:**
   - Compiled with `#![windows_subsystem = "windows"]` in `src/main.rs`.
   - All background invocations and child ADB process spawns use the Win32 flag `CREATE_NO_WINDOW (0x08000000)`, guaranteeing zero black console flash on startup or during polling cycles.
2. **Dual-Mode Console Attachment:**
   - When executed without CLI arguments, the application runs silently in the background as a detached daemon.
   - When interactive CLI flags (`--status`, `--eco`, `--restore`, `--stop`, `--help`) are provided, the process dynamically calls Win32 `AttachConsole(ATTACH_PARENT_PROCESS)` to stream formatted diagnostic output directly to the invoking PowerShell/CMD terminal.
3. **Ultra-Compact Binary:**
   - Release profile configuration:
     ```toml
     [profile.release]
     opt-level = "z"
     lto = true
     codegen-units = 1
     panic = "abort"
     strip = true
     ```
   - Final standalone binary size: **377.5 KB**.
4. **Single-Instance & Event-Driven IPC:**
   - Enforces a single instance using a Windows Named Mutex (`Local\PixelEnergyDaemon_Mutex`) and a local `energy.pid` tracking file.
   - Graceful shutdown is mediated by a Win32 Event (`Local\PixelEnergyDaemon_Stop`). The monitoring loop waits on this event, waking up immediately with zero latency when `--stop` or Ctrl-C is signaled.
5. **Win32 Local Timestamp Telemetry:**
   - Timestamps in `energy.log` are formatted with Win32 `GetLocalTime`, avoiding heavy runtime date/time libraries.

---

## Core Capabilities & Automation

### Automated ADB Discovery
The daemon checks candidate paths in the following priority:
1. `..\..\Daemons\USBTethering\platform-tools\adb.exe` (Relative to executable)
2. `..\..\Daemons\USBTethering\platform-tools\adb.exe` (Relative to working directory)
3. `F:\Github\Website\public\Glue\Daemons\USBTethering\platform-tools\adb.exe` (Repo workspace path)
4. `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe` (Android SDK)
5. `C:\platform-tools\adb.exe` (Standard root install)
6. System `PATH` environment lookup
7. Fallback to `"adb.exe"`

### Eco-Tether Profile
When USB tethering (`ncm0` / `rndis0`) is active, the daemon applies the low-power profile:
* **Display Sleep:** Queries `dumpsys power` wakefulness; if screen is awake, executes `input keyevent 26` to sleep display without accidental toggle if already dozing.
* **Screen Timeout:** Caps display timeout to 15 seconds (`settings put system screen_off_timeout 15000`).
* **Display Refresh Rate:** Caps refresh rate at 60Hz (`settings put system peak_refresh_rate 60.0`).
* **Brightness:** Dims display brightness to minimum level (`settings put system screen_brightness 1`).
* **Low Power Mode:** Enables Android Battery Saver mode (`settings put global low_power 1`), throttling non-essential background tasks while leaving USB NCM networking unhindered at full bandwidth.
* **Ambient Display / AOD:** Disables Ambient Doze / Always-On Display (`settings put secure doze_always_on 0`).
* **Radios Off:** Disables GPS Location (`settings put secure location_mode 0`), Bluetooth (`svc bluetooth disable`), and NFC (`svc nfc disable`).

### Auto-Restoration
Upon device disconnection, tethering deactivation, or daemon termination:
* Low power mode disabled (`settings put global low_power 0`).
* Screen timeout restored to 60 seconds (`settings put system screen_off_timeout 60000`).
* Refresh rate cap removed (`settings delete system peak_refresh_rate`).
* Brightness restored to standard level 50 (`settings put system screen_brightness 50`).
* Ambient Display re-enabled (`settings put secure doze_always_on 1`).
* GPS re-enabled to High Accuracy (`settings put secure location_mode 3`).
* Bluetooth re-enabled (`svc bluetooth enable`).

### Telemetry Logging
* Writes timestamped logs to `energy.log`.
* Every 120 seconds while tethered, captures battery charge percentage, battery status, and microamp current draw (`/sys/class/power_supply/battery/current_now`).

---

## CLI Usage & Commands

```powershell
# Display help and available switches
.\energy-daemon.exe --help

# Query real-time daemon state and phone diagnostics
.\energy-daemon.exe --status

# Force immediate activation of Eco-Tether profile
.\energy-daemon.exe --eco

# Force immediate restoration of default mobile settings
.\energy-daemon.exe --restore

# Gracefully stop background daemon and restore phone
.\energy-daemon.exe --stop
```

### Example Status Output
```text
==================================================
     Phone Energy Daemon Status & Diagnostics     
==================================================
 Daemon Process   : RUNNING (PID: 22972)
 ADB Binary       : \\?\F:\Github\Website\public\Glue\Daemons\USBTethering\platform-tools\adb.exe
 Android Device   : CONNECTED
 USB Tethering    : ACTIVE (Eco Profile Target)
 Display State    : SLEEP / DOZING
 Battery Level    : 100% (Not Charging)
 Charging Current : +58.8 mA (USB: true)
 Device Settings  :
   - Screen Timeout : 15000 ms
   - Peak Refresh   : 60.0 Hz
   - Brightness     : 1
   - Low Power Mode : 1
   - Ambient AOD    : 0
==================================================
```

---

## Persistent Launch (Outliving Tool Sessions)

To spawn the daemon as an independent background process that survives caller shell exits:

```powershell
Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = '"F:\Github\Website\public\Glue\RUST\energy-daemon\energy-daemon.exe"'
    CurrentDirectory = "F:\Github\Website\public\Glue\RUST\energy-daemon"
}
```

---

## Build Instructions

```powershell
# Ensure Cargo is discoverable
$env:PATH += ";$env:USERPROFILE\.cargo\bin"

# Fast type-check
cargo check

# Compile optimized release binary
cargo build --release

# Copy release binary to project root
Copy-Item "target\release\energy-daemon.exe" "energy-daemon.exe" -Force
```
