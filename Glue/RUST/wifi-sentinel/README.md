# Phone Wi-Fi 5GHz Sentinel 📶⚡

A high-performance native Windows daemon engineered in **Rust** to continuously monitor connected Android devices (such as the Google Pixel 6a) over ADB and automatically nudge roaming connections back to the high-speed 5 GHz Wi-Fi band when 2.4 GHz drift or link degradation is detected.

Rewritten from the legacy PowerShell daemon (`Watch-PhoneWifi5G.ps1`) to provide near-zero CPU footprint, minimal memory overhead (<1 MB private memory), and completely silent background operation with zero console window flicker.

---

## Architecture & Features

* **🛡️ Zero Console Window Flicker**:
  * Compiled with `#![windows_subsystem = "windows"]` and explicit Win32 `CREATE_NO_WINDOW` flags on all spawned ADB operations.
  * Runs invisibly in the background without popups or taskbar clutter.
* **⚡ High-Performance ADB Telemetry**:
  * Queries phone link state directly via `cmd wifi status` (with automatic fallback to `dumpsys wifi`).
  * Fast, zero-regex string parser extracts real-time Wi-Fi parameters:
    * **SSID** (e.g. `"Dolphin_5GHz"`)
    * **BSSID** (e.g. `7a:fe:ce:7e:ee:eb`)
    * **Frequency (MHz)** (e.g. `5580 MHz`)
    * **Rx / Tx Link Speeds** (e.g. `288 Mbps / 68 Mbps`)
    * **Wi-Fi Score** (e.g. `100`)
* **🔄 Intelligent Auto-Nudge & 5 GHz Restoration**:
  * Triggers when Wi-Fi drifts to 2.4 GHz (`< 5000 MHz`) or severe link degradation occurs (`Rx <= 5 Mbps`).
  * Executes atomic Android Wi-Fi power cycle: `svc wifi disable; sleep 1; svc wifi enable`.
  * Enforces a 45-second cooldown to prevent aggressive cycling loops while roaming.
  * Re-queries post-association status to verify 5 GHz restoration.
* **🔔 Native Audio & Toast Notifications**:
  * Audio alerts via native Win32 `MessageBeep` (`MB_ICONHAND`, `MB_ICONASTERISK`, `MB_ICONEXCLAMATION`).
  * Non-blocking background Windows Runtime Action Center toast notifications for alerts and restoration status.
* **🔒 Single Instance Protection**:
  * Maintains `sentinel.pid` tracking the active process ID.
  * Win32 `OpenProcess` + `GetExitCodeProcess` checks prevent duplicate daemon instances while cleanly adopting stale PID locks.
* **📜 Bounded Activity Logging**:
  * Logs all events to `sentinel.log` with timestamped lines: `[YYYY-MM-DD HH:MM:SS]`.
  * Automatic size bounding guarantees log stays strictly under 200 KB (keeps the last 500 lines).
* **🪶 Ultra-Lightweight Footprint**:
  * **Binary Size**: ~349 KB standalone executable (`wifi-sentinel.exe`).
  * **Memory Footprint**: **~980 KB private bytes** (vs **~65 MB** for PowerShell).
  * **CPU Utilization**: **0.00%** between 12-second query intervals.

---

## Project Structure

```text
F:\Github\Website\public\Glue\RUST\wifi-sentinel\
├── Cargo.toml               # Release profile optimizations (opt-level="z", LTO, strip=true)
├── wifi-sentinel.exe        # Standalone native release binary (~349 KB)
├── sentinel.pid             # Single-instance PID lock
├── sentinel.log             # Bounded activity log (<200 KB)
├── README.md                # Documentation and runbook
└── src/
    ├── main.rs              # Daemon loop, CLI dispatcher, PID management
    ├── adb.rs               # ADB candidate discovery, Wi-Fi status queries, nudge cycle
    ├── logger.rs            # Bounded timestamped logging system
    └── notify.rs            # Native Win32 audio alerts & Windows toast notifications
```

---

## Command-Line Usage

While `wifi-sentinel.exe` operates silently by default, it includes built-in CLI flags that attach to the calling console when run from PowerShell or CMD:

### 1. Check Live Wi-Fi Status
Query the connected phone's current Wi-Fi telemetry and exit immediately:
```powershell
.\wifi-sentinel.exe --status | Out-String
```
**Example Output:**
```text
Using ADB: F:\Github\Website\public\Glue\Daemons\USBTethering\platform-tools\adb.exe
Wi-Fi Status:
  Connected: Yes
  SSID:      Dolphin_5GHz
  BSSID:     7a:fe:ce:7e:ee:eb
  Frequency: 5580 MHz (5 GHz)
  Rx Speed:  288 Mbps
  Tx Speed:  68 Mbps
  Link Speed:68 Mbps
  Score:     100
```

### 2. Stop Running Background Daemon
Terminate the active daemon process recorded in `sentinel.pid`:
```powershell
.\wifi-sentinel.exe --stop | Out-String
```
**Example Output:**
```text
Stopped Sentinel process (PID: 25980).
Removed sentinel.pid.
```

### 3. Display Help
```powershell
.\wifi-sentinel.exe --help | Out-String
```

---

## Daemon Execution Runbook

### Starting the Daemon (Persistent / Detached)
To launch the sentinel so it runs silently in the background and survives console/tool session closures:
```powershell
Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = '"F:\Github\Website\public\Glue\RUST\wifi-sentinel\wifi-sentinel.exe"'
    CurrentDirectory = "F:\Github\Website\public\Glue\RUST\wifi-sentinel"
}
```

### Checking Daemon Health
```powershell
Get-Process -Name "wifi-sentinel"
Get-Content "F:\Github\Website\public\Glue\RUST\wifi-sentinel\sentinel.log" -Tail 20
```

### Stopping the Daemon
```powershell
# Using the built-in CLI flag:
& "F:\Github\Website\public\Glue\RUST\wifi-sentinel\wifi-sentinel.exe" --stop | Out-String

# Or via PowerShell:
Stop-Process -Name "wifi-sentinel" -Force -ErrorAction SilentlyContinue
```

---

## Compilation & Toolchain

Adheres strictly to `F:\Github\Website\public\Glue\RUST\AGENTS.md`:
* **Target Toolchain**: `stable-x86_64-pc-windows-gnu`
* **Profile**: Optimized for minimal binary size (`opt-level = "z"`, `lto = true`, `codegen-units = 1`, `panic = "abort"`, `strip = true`).

```powershell
# Ensure Cargo is on PATH
$env:PATH += ";$env:USERPROFILE\.cargo\bin"

# Fast type-check
cargo check

# Compile optimized release binary
cargo build --release

# Deploy binary
Copy-Item target\release\wifi-sentinel.exe wifi-sentinel.exe -Force
```
