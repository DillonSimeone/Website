---
name: rust-study-workspace
description: >-
  Operational guide, build instructions, and architectural reference for developing native Windows
  Rust daemons, taskbar overlays, and high-performance system telemetry utilities in Glue/RUST.
---

# Rust Study Workspace Runbook 🦀

## Overview
The `RUST` workspace in `F:\Github\Website\public\Glue\RUST` explores high-performance native Windows applications built in Rust to complement or enhance the Glue daemon ecosystem.

All design decisions, Win32 invariants, and compilation standards are formally codified in **[`AGENTS.md`](file:///F:/Github/Website/public/Glue/RUST/AGENTS.md)**.

---

## Active Projects

### 1. `taskbar-sentinel` 🛡�E�⚡
* **Purpose:** A 364 KB native Win32 pill pinned to the bottom-left of the Windows 11 taskbar (`X=4, Y=1036, W=340, H=40` on 1080p).
* **Role:**
  * Blocks unwanted MSN weather/news popup flyouts by intercepting mouse clicks.
  * Absorbs right-clicks to display a custom Rust context menu (replacing default Windows taskbar popups).
  * Displays 5 real-time metrics:
    1. **CPU %** (Cyan bar)
    2. **RAM %** (Neon Green bar)
    3. **Disk I/O MB/s** (Amber bar)
    4. **PWR (Watts)** (Flame Orange bar  Eexact GPU draw via NVML + Ryzen power model + 80+ Gold PSU efficiency)
    5. **EST (Monthly Cost)** (Emerald Green bar  Edynamic `$/mo` based on configurable `$/kWh` rate)
  * Left-click launches Task Manager (`taskmgr.exe`).
  * Right-click opens context menu with Electricity Rate presets / custom input box, Run on Startup toggle, and Exit.
* **Footprint:** **0.00% active CPU**, **~7.5 MB private RAM**, **364 KB standalone binary**.

### 2. `wifi-sentinel` 📶⚡
* **Purpose:** A ~349 KB native Win32 daemon monitoring connected phone Wi-Fi telemetry over ADB, auto-nudging connections back to the 5 GHz band when 2.4 GHz drift occurs.
* **Role:**
  * Replaces legacy `Watch-PhoneWifi5G.ps1` PowerShell daemon.
  * Zero console flicker (`#![windows_subsystem = "windows"]` and Win32 `CREATE_NO_WINDOW`).
  * Auto-discovers ADB via repository relative paths, Android SDK, and PATH.
  * Queries real-time link speed, frequency (MHz), SSID, BSSID via `cmd wifi status` (with fallback).
  * Auto-cycles phone Wi-Fi (`svc wifi disable; sleep 1; svc wifi enable`) with 45s cooldown upon 2.4 GHz drift.
  * Single instance tracking via `sentinel.pid` and bounded logging (<200 KB) in `sentinel.log`.
  * Audio alerts via `MessageBeep` and non-blocking Windows Action Center toast notifications.
* **Footprint:** **0.00% active CPU**, **<1 MB private RAM**, **~349 KB standalone binary**.

### 3. `energy-daemon` 🔋⚡
* **Purpose:** A ~377 KB native Win32 daemon enforcing the Eco-Tether power conservation profile on connected Android devices over ADB.
* **Role:**
  * Replaces legacy `energy_daemon.py` Python daemon.
  * Zero console flicker (`#![windows_subsystem = "windows"]` and Win32 `CREATE_NO_WINDOW`).
  * Enforces low-power display clamp (screen sleep, 15s timeout, 60Hz peak refresh, minimum brightness, battery saver on).
  * Auto-restores normal user settings upon phone disconnect or process termination.
  * Single instance tracking via Win32 Named Mutex (`Local\PixelEnergyDaemon_Mutex`) and `energy.pid`.
  * Instant event-driven termination via `--stop` event waiting.
  * CLI diagnostics via console attach (`--status`, `--eco`, `--restore`, `--stop`).
* **Footprint:** **0.00% active CPU**, **~1.2 MB private RAM**, **377 KB standalone binary**.

---

### 4. `usb-tether` 🦀📱
* **Purpose:** A 371 KB native Win32 daemon monitoring USB connection of Google Pixel 6a / Android devices, auto-activating and maintaining NCM/RNDIS tethering.
* **Role:**
  * Replaces legacy `auto_tether.py` Python daemon.
  * Zero console flicker (`#![windows_subsystem = "windows"]` and Win32 `CREATE_NO_WINDOW`).
  * Multi-tier tether activation: Tier 1 kernel gadget switch (`ncm,adb` / `rndis,adb`), Tier 2 UI automation fallback (`TetherSettings` + `uiautomator`), Tier 3 service commands (`cmd connectivity / tethering`).
  * Direct Win32 IP Helper API (`GetAdaptersAddresses`) link status monitoring (NDIS/NCM adapter name, link status, link speed in Mbps, assigned IPv4 addresses).
  * Internet connectivity watchdog probe (DNS socket probe `1.1.1.1:53` / `8.8.8.8:53`) with auto-recovery on tether stall.
  * Single instance tracking via Windows named mutex (`Global\PixelAutoTetherDaemon_RustMutex`) and `auto_tether.pid`.
  * Timestamped logging in `tethering.log`.
  * CLI diagnostic tools (`--status`, `--test`, `--stop`).
* **Footprint:** **0.00% active CPU**, **~1.0 MB private RAM**, **371 KB standalone binary**.

---

### 5. `daemon-command-center` 🎛️⚡
* **Purpose:** A 477 KB native Win32 System Tray Supervisor & interactive HUD managing the Glue daemon ecosystem.
* **Role:**
  * Replaces legacy `command_center.py` Python app (~40 MB RAM).
  * Resides in the Windows System Tray with a real-time color badge:
    * 🟢 **Neon Green**: 5 GHz locked & tethered active.
    * 🟡 **Amber**: 2.4 GHz drift or untethered idle.
    * 🔴 **Red**: Disconnected.
  * **Individual Daemon Toggles**: Independent toggles for `wifi_sentinel`, `usb_tether`, `energy_daemon`, and `audio_haptics`.
  * **Persistent Configuration**: Saved atomically to `config.json` across reboots and resets.
  * **Built-in Watchdog**: 3-second cycle auto-reviving any crashed enabled daemon.
  * **Interactive Floating HUD**: Left-clicking the tray icon toggles a dark acrylic popup HUD displaying live phone telemetry, daemon status rows with one-click toggles, and quick action buttons.
  * **Slide-out Haptic Tuning Drawer**: Integrated real-time tuning UI with 40 FPS audio/PWM visualizers, interactive sliders, and preset buttons.
  * **Right-Click Tray Menu**: Quick actions (Force 5GHz Nudge, Re-trigger Tether, Restart All), Manage Daemons submenu with checkmarks, Run on Startup toggle, and Exit.
* **Footprint:** **0.00% active CPU**, **~1.4 MB private RAM**, **477 KB standalone binary**.

---

### 6. `audio-to-smartphone-haptics` 🎵🔊📳
* **Purpose:** A 460 KB native Rust real-time WASAPI audio loopback DSP engine synthesizing tactile haptic waves and hardware primitives on Google Pixel 6a.
* **Role:**
  * Replaces legacy `audio_haptics_daemon.py` Python daemon (~102 MB RAM).
  * Direct Windows WASAPI loopback audio stream capture via `cpal` (captures system audio output at 48 kHz float32).
  * 3-band 4th-order Butterworth IIR filterbank (Sub-Bass, Mid-Punch, Snap) with zero heap allocations.
  * Adaptive dynamic headroom AGC with dual-EMA onset detection.
  * Dynamic continuous PWM envelope follower (smooth attack ~25ms, musical release ~85ms) with cosine transient hit layer.
  * Emits 40 FPS localhost UDP JSON packets to port `48123` for the live tuning visualizer.
  * Persistent ADB shell pipeline sending synchronized waveform commands directly to phone LRA motor with anti-collision cooldown.
  * Auto-reloads `config.json` dynamically within 250ms without dropping audio frames.
* **Footprint:** **0.00% active CPU**, **~11 MB private RAM**, **460 KB standalone binary**.

---

---

## 1-Click Multi-Machine Portable Setup
The entire `RUST` directory is self-contained and deployable to any Windows PC or laptop without installing Rust, Python, or Visual Studio:
1. Copy or download the `Glue\RUST` folder to the target machine (e.g. laptop).
2. Run `Install-Glue.bat`:
   * Checks for `platform-tools\adb.exe` (automatically downloads from Google if missing).
   * Generates default `config.json` if missing.
   * Registers `GlueCommandCenter.lnk` and `TaskbarSentinel.lnk` in `shell:startup`.
   * Immediately launches the entire suite detached via WMI.
3. To uninstall, run `Uninstall-Glue.bat`.

---

## Standard Development Workflows

### 1. Cargo Environment & Toolchain
The workspace uses the `stable-x86_64-pc-windows-gnu` toolchain to compile without requiring Visual Studio C++ Build Tools:

```powershell
# Ensure Cargo is discoverable
$env:PATH += ";$env:USERPROFILE\.cargo\bin"

# Fast type-check
cargo check

# Compile optimized release binary
cargo build --release
```

### 2. Spawning Detached Native Utilities
To launch a compiled utility so it survives tool runner exits:
```powershell
Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = '"F:\Github\Website\public\Glue\RUST\taskbar-sentinel\taskbar-sentinel.exe"'
    CurrentDirectory = "F:\Github\Website\public\Glue\RUST\taskbar-sentinel"
}
```

### 3. Killing or Restarting Sentinel
```powershell
Stop-Process -Name "taskbar-sentinel" -Force -ErrorAction SilentlyContinue
```

---

## Key Invariants for AI Agents
Refer to **[`AGENTS.md`](file:///F:/Github/Website/public/Glue/RUST/AGENTS.md)** before writing or altering code:
1. `#![windows_subsystem = "windows"]` on all GUI apps for zero console flash.
2. `BeginPaint` / `EndPaint` in `WM_PAINT` to prevent 100% CPU loops.
3. Direct Win32 telemetry (`GlobalMemoryStatusEx`, `GetSystemTimes`, PDH) over shell execution.
4. Double-buffered GDI memory DC to eliminate visual flicker.
