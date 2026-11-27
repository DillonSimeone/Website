# Glue Daemon Command Center 🎛️⚡

A native, zero-dependency Windows System Tray supervisor written in 100% Rust. Replaces the legacy Python `command_center.py` and manages all Glue worker daemons with near-zero resource utilization.

---

## Highlights

* **Footprint:** **~1.3 MB Private Working Set** (vs. ~40 MB in Python).
* **System Tray Status Badge:**
  * 🟢 **Neon Green**: Locked to 5 GHz Wi-Fi and actively tethered via USB (NCM/RNDIS).
  * 🟡 **Amber**: Untethered idle or 2.4 GHz Wi-Fi drift.
  * 🔴 **Red**: Disconnected / No Android device detected.
* **Persistent Configuration:**
  * Toggle states for `wifi_sentinel`, `usb_tether`, `energy_daemon`, and `audio_haptics` are saved to `config.json`.
  * Toggles persist across resets, shutdowns, reboots, and sleep/wake cycles.
* **3-Second Auto-Watchdog:**
  * Continuously polls active processes; automatically revives any enabled daemon if it exits unexpectedly.
* **Interactive Floating HUD (Left-Click):**
  * Borderless acrylic HUD floating above the system tray.
  * Displays real-time phone model, battery level, charging status, Wi-Fi band & frequency, and tether state.
  * Clickable daemon rows to toggle individual daemons on/off with instant feedback.
  * Quick-action buttons: Force 5GHz Nudge, Re-trigger Tether, Restart All.
  * Automatically closes when clicking away (`WM_KILLFOCUS`).
* **System Tray Context Menu (Right-Click):**
  * Real-time status header.
  * Quick action triggers (`Force 5GHz Nudge`, `Re-trigger Tether`, `Restart Active Daemons`).
  * Checkable Daemon Manager submenu with live status badges.
  * Windows Startup toggle and clean Exit.

---

## Configuration (`config.json`)

The supervisor reads and atomically writes its settings to `config.json`:

```json
{
  "toggles": {
    "wifi_sentinel": true,
    "usb_tether": true,
    "energy_daemon": true,
    "audio_haptics": false
  },
  "auto_restart_crashed": true
}
```

---

## Build & Run

```powershell
# Ensure Cargo is on PATH
$env:PATH += ";$env:USERPROFILE\.cargo\bin"

# Fast check
cargo check

# Release build
cargo build --release

# Copy to root executable
Copy-Item "target\release\daemon-command-center.exe" -Destination "daemon-command-center.exe" -Force
```

---

## Deployment & Multi-Machine Portable Setup

To install on a new machine or laptop:
1. Copy the parent `RUST` directory.
2. Run `Install-Glue.bat` (which runs `Setup.ps1`).
3. ADB will be auto-downloaded if not present, and the Command Center will register for automatic startup.
