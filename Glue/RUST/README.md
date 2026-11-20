# Glue Native Rust Ecosystem 🦀⚡

The high-performance, native Windows rewrite of the Glue daemon and telemetry suite. Engineered for sub-millisecond responsiveness, zero console window flicker, and sub-35 MB total system RAM footprint across all utilities combined.

---

## Suite Summary & Memory Breakdown

| Utility | Binary Path | RAM Footprint | Replaces | Key Role |
| :--- | :--- | :--- | :--- | :--- |
| **`daemon-command-center`** | `daemon-command-center\daemon-command-center.exe` | **~1.4 MB** | `command_center.py` (~40 MB) | System tray supervisor, dynamic badge, watchdog, and HUD. |
| **`taskbar-sentinel`** | `taskbar-sentinel\taskbar-sentinel.exe` | **~25 MB** | MSN Weather WebView2 (~200 MB) | Live taskbar telemetry (CPU, RAM, DSK, Watts, $/mo rate) with laptop battery-aware power modeling and 1-click Ultra Eco Mode toggle. |
| **`audio-to-smartphone-haptics`** | `audio-to-smartphone-haptics\audio-to-smartphone-haptics.exe` | **~11 MB** | `audio_haptics_daemon.py` (~102 MB) | Direct WASAPI loopback audio DSP, multi-band IIR filters & smartphone haptics. |
| **`wifi-sentinel`** | `wifi-sentinel\wifi-sentinel.exe` | **~1.0 MB** | `Watch-PhoneWifi5G.ps1` (~65 MB) | Background 5 GHz lock & 2.4 GHz drift auto-nudge via ADB. |
| **`usb-tether`** | `usb-tether\usb-tether.exe` | **~0.9 MB** | `auto_tether.py` (~14 MB) | Hardware USB detection, NCM/RNDIS auto-tethering & watchdog. |
| **`energy-daemon`** | `energy-daemon\energy-daemon.exe` | **~0.8 MB** | `energy_daemon.py` (~12 MB) | Enforces Eco-Tether power clamp (screen off, 60Hz clamp) on phone. |
| **TOTAL ECOSYSTEM** | *(6 Standalone Binaries)* | **< 40 MB** | *(Legacy Python & WebPack)* | **Over 88% RAM reduction across the OS with zero Python runtime needed.** |

---

## 1-Click Multi-Machine Portable Setup (Laptop Ready 💻)

The entire `RUST` directory is portable. You can copy this folder to any other computer (such as a Windows laptop):

1. **Install / First-Run**: Double-click `Install-Glue.bat`.
   * Automatically checks for `platform-tools\adb.exe`; downloads Google's official platform-tools zip if missing.
   * Generates default `config.json` with your preferred toggles.
   * Registers automatic startup in Windows `shell:startup`.
   * Immediately launches `daemon-command-center.exe` and `taskbar-sentinel.exe` detached.
2. **Uninstall**: Double-click `Uninstall-Glue.bat` to cleanly terminate processes and remove startup shortcuts.

---

## Interacting with the Ecosystem

* **Taskbar Sentinel (Bottom-left of Taskbar)**:
  * **Left-Click (Metrics)**: Instantly opens Windows Task Manager (	askmgr.exe).
  * **Left-Click (MODE Button)**: 1-click toggle between NORM (Full Clocks & Turbo Boost) and ECO (CPU capped to 65% max frequency, low-power C-states, minimal wattage).
  * **Right-Click**: Opens custom native context menu to toggle Ultra Eco Mode, adjust electricity cost rates ($/kWh), toggle startup, or exit.
* **Glue Command Center (System Tray)**:
  * **Tray Badge**:
    * 🟢 **Neon Green**: Phone connected, 5 GHz Wi-Fi locked, USB tether active.
    * 🟡 **Amber**: Phone connected, 2.4 GHz Wi-Fi or tether idle.
    * 🔴 **Red**: Phone disconnected.
  * **Left-Click**: Opens borderless floating HUD with live telemetry, daemon status rows, and one-click toggles.
  * **Right-Click**: Opens menu with quick actions (`Force 5GHz Nudge`, `Re-trigger Tether`, `Restart Active Daemons`) and individual daemon toggles.

---

## Standards & Development

* **[`AGENTS.md`](AGENTS.md)**: Win32 invariants, compilation standards, MinGW toolchain rules, and telemetry requirements.
* **[`SKILL.md`](SKILL.md)**: Agent instructions, project paths, and runbooks.
* **[`GEMINI.md`](GEMINI.md)**: Architecture pointers and quick references.
