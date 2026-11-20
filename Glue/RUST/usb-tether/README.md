# Native USB Tethering Daemon (`usb-tether`) 🦀⚡

High-performance, zero-flicker native Windows background daemon written in Rust. It automatically activates and maintains USB tethering for Android devices (Google Pixel 6a / Tensor NCM, Qualcomm RNDIS, and general USB gadget devices) as soon as they are plugged into the system over USB.

Replaces the legacy Python script (`auto_tether.py`) with a native **371 KB standalone executable** consuming only **~1.0 MB RAM** and **0.00% idle CPU**.

---

## Key Features & Invariants

1. **Zero Console Window Flicker (`windows_subsystem = "windows"`)**:
   - Declares `#![windows_subsystem = "windows"]` in `src/main.rs`.
   - Spawns all subprocesses (including ADB) with `CREATE_NO_WINDOW` (`0x08000000`).
   - Runs 100% silently in the background without popups or console flashes.

2. **Multi-Tier Tethering Activation**:
   - **Tier 1 (Kernel Gadget Switch)**: Fast kernel-level switch via `svc usb setFunctions ncm,adb` (Pixel/Tensor standard) and `svc usb setFunctions rndis,adb`.
   - **Tier 2 (UI Automation Fallback)**: Automatically wakes device (`KEYCODE_WAKEUP`), opens Tethering settings (`com.android.settings/.TetherSettings`), inspects UI hierarchy via `uiautomator dump`, taps the bounding box center of the tethering switch, and returns home (`KEYCODE_HOME`).
   - **Tier 3 (Service Call)**: Issues Android framework commands `cmd connectivity start-tethering 1` and `cmd tethering start-tethering 1`.

3. **Win32 Network Adapter Link Status Monitoring**:
   - Direct Win32 IP Helper API (`GetAdaptersAddresses`) querying with zero subprocess overhead.
   - Identifies active USB NCM/RNDIS adapter (e.g. `Ethernet 6 - UsbNcm Host Device #2`), link state (`Up`), negotiated link speed (`425 Mbps`), and assigned IPv4 addresses (`10.253.40.89`).

4. **Active Connection & Watchdog**:
   - Detects USB arrival and departure via ADB polling.
   - Every 12 seconds, verifies connectivity via DNS socket probes (`1.1.1.1:53` / `8.8.8.8:53`).
   - Auto-recovers if a silent tether stall occurs.

5. **Single Instance & Process Lifecycle**:
   - Guarded by named Windows Mutex (`Global\PixelAutoTetherDaemon_RustMutex`).
   - Maintains process ID in `auto_tether.pid` and gracefully cleans up on exit.
   - Timestamped logging to `tethering.log`.

---

## File Structure

```
F:\Github\Website\public\Glue\RUST\usb-tether\
├── Cargo.toml          # GNU toolchain & binary size optimizations
├── README.md           # Documentation & usage guide
├── usb-tether.exe      # 371 KB standalone native release binary
├── auto_tether.pid     # Active daemon process ID (created at runtime)
├── tethering.log       # Timestamped activity & connection log
└── src/
    ├── main.rs         # Subsystem entry, CLI options, mutex/PID lifecycle
    ├── adb.rs          # ADB candidate discovery, execution, activation tiers
    ├── net.rs          # Win32 IP Helper adapter query & DNS probe
    └── logger.rs       # Zero-alloc Win32 GetLocalTime timestamped logger
```

---

## CLI Usage

When executed from PowerShell or Command Prompt, `usb-tether.exe` detects interactive usage and attaches to parent console for CLI operations:

### 1. View Status
Displays active daemon state, ADB version, connected phones, tether status, network adapters, and internet connectivity:
```powershell
.\usb-tether.exe --status
```
*Sample Output:*
```text
============================================================
Pixel USB Tethering Daemon (Rust Native) - Status
============================================================
[Daemon] Running (PID: 6776)
[ADB] Detected: F:\Github\Website\public\Glue\Daemons\USBTethering\platform-tools\adb.exe
      Android Debug Bridge version 1.0.41
      Version 37.0.1-15733141

[Connected Android Devices]
  * Serial: 2A041JEGR05348, Model: Pixel_6a, Codename: bluejay, State: device
    Tethering Status: ACTIVE (Enabled)

[Windows Network Adapters (Active & Tethered)]
  * Ethernet 6 (UsbNcm Host Device #2): Status=[Up], Speed=425 Mbps, IPs=["10.253.40.89"]

[Internet Connectivity Watchdog Probe]
  Internet Ping (1.1.1.1:53 / 8.8.8.8:53): PASS (Connected)
============================================================
```

### 2. Run Diagnostic Test Pass
Executes a single detection and activation cycle, logging all results to console:
```powershell
.\usb-tether.exe --test
```

### 3. Stop Background Daemon
Gracefully terminates the background daemon referenced in `auto_tether.pid`:
```powershell
.\usb-tether.exe --stop
```

### 4. Run Detached Background Daemon
To spawn the daemon as an independent background service that survives terminal closing:
```powershell
Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = '"F:\Github\Website\public\Glue\RUST\usb-tether\usb-tether.exe"'
    CurrentDirectory = "F:\Github\Website\public\Glue\RUST\usb-tether"
}
```

---

## Build Instructions

Built with the `stable-x86_64-pc-windows-gnu` Rust toolchain:

```powershell
# Ensure Cargo is in PATH
$env:PATH += ";$env:USERPROFILE\.cargo\bin"

# Navigate to project
Set-Location "F:\Github\Website\public\Glue\RUST\usb-tether"

# Check code
cargo check

# Compile optimized release build
cargo build --release

# Copy to root executable
Copy-Item "target\release\usb-tether.exe" "usb-tether.exe" -Force
```

### Release Profile Configuration (`Cargo.toml`)
```toml
[profile.release]
opt-level = "z"       # Minimized binary footprint
lto = true            # Full link-time optimization
codegen-units = 1     # Global optimization scope
panic = "abort"       # Eliminates stack unwinding bloat
strip = true          # Strips debug symbols
```
