---
name: glue-daemons
description: >-
  Operational guide, diagnostics runbook, and architectural reference for the Windows
  Glue Daemons ecosystem, including Pixel 6a USB Tethering, 5GHz Wi-Fi Sentinel, Phone Energy
  Governor, Audio-to-Haptics PWM synthesizer, LLM Token Tracker, and the Daemon Command Center HUD.
---

# Glue Daemons Runbook & Architecture Reference

## Overview of the Glue Daemon Ecosystem
The Glue subsystem hosts 5 decoupled background daemons supervised by the **Daemon Command Center**:
1. **USB Tethering (`auto_tether.py`):** Automatically enables Pixel 6a NCM/RNDIS tethering on plug without touchscreen interaction.
2. **Wi-Fi 5GHz Sentinel (`Watch-PhoneWifi5G.ps1`):** Continuously monitors phone Wi-Fi link speed & BSSID, auto-nudging off 2.4 GHz onto 5 GHz via ADB.
3. **Phone Energy Daemon (`energy_daemon.py`):** Enforces 60 Hz display refresh, sleeps screen, sets minimum backlight, and maintains thermal stability for USB trickle charging.
4. **Audio to Haptics Daemon (`audio_haptics_daemon.py`):** Captures desktop WASAPI audio loopback, analyzes sub-bass transients, and synthesizes 155 Hz resonant PWM tactile kicks to the Pixel 6a.
5. **LLM Token Tracker (`LLMTokenTracker.exe`):** Desktop LLM token analytics daemon tracking and caching usage across Google AntiGravity and Cursor IDE sessions.
6. **Daemon Command Center (`command_center.py`):** Borderless HUD and system tray monitor displaying live link metrics, real-time UDP waveform canvas, and hot-reloadable sliders.

---

## Quick Diagnostic Commands

### Check Alive Daemons & Command Center
```powershell
Get-CimInstance Win32_Process | Where-Object { 
    $_.CommandLine -match "command_center|audio_haptics|energy_daemon|auto_tether|Watch-PhoneWifi5G|LLMTokenTracker" 
} | Select-Object ProcessId, CommandLine | Format-Table -Wrap
```

### Detached Launch via WMI (Survives Shell Exits)
When launching long-lived background daemons from agent sessions or scripts, always use WMI to avoid termination by the caller's Windows Job Object:
```powershell
# Command Center
Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = '"C:\Users\DoctorNightmares\AppData\Local\Programs\Python\Python310\pythonw.exe" "F:\Github\Website\public\Glue\DaemonCommandCenter\command_center.py"'
    CurrentDirectory = "F:\Github\Website\public\Glue\DaemonCommandCenter"
}

# Audio Haptics Daemon
Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = '"C:\Users\DoctorNightmares\AppData\Local\Programs\Python\Python310\pythonw.exe" "F:\Github\Website\public\Glue\Daemons\AudioHaptics\audio_haptics_daemon.py"'
    CurrentDirectory = "F:\Github\Website\public\Glue\Daemons\AudioHaptics"
}

# LLM Token Tracker
Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = '"F:\Github\Website\public\Glue\Daemons\TokenTracker\dist\LLMTokenTracker\LLMTokenTracker.exe"'
    CurrentDirectory = "F:\Github\Website\public\Glue\Daemons\TokenTracker\dist\LLMTokenTracker"
}

# Energy Daemon
Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = '"C:\Users\DoctorNightmares\AppData\Local\Programs\Python\Python310\pythonw.exe" "F:\Github\Website\public\Glue\Daemons\EnergyDaemon\energy_daemon.py"'
    CurrentDirectory = "F:\Github\Website\public\Glue\Daemons\EnergyDaemon"
}

# USB Tethering Daemon
Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = '"C:\Users\DoctorNightmares\AppData\Local\Programs\Python\Python310\pythonw.exe" "F:\Github\Website\public\Glue\Daemons\USBTethering\auto_tether.py"'
    CurrentDirectory = "F:\Github\Website\public\Glue\Daemons\USBTethering"
}
```

---

## Windows Script Host (.vbs) Standard
- All daemons have companion `.vbs` launchers for silent execution:
  - `run_command_center.vbs`
  - `run_haptics.vbs`
  - `run_energy_daemon.vbs`
  - `run_auto_tether.vbs`
  - `run_wifi_sentinel.vbs`
  - `run_token_tracker.vbs`
- **Rule:** Never use `WScript.Echo` in these scripts when invoked via `wscript.exe`. `WScript.Echo` produces modal message boxes that freeze headless and Windows Startup launches.

---

## Haptic Waveform Synthesis & Motor Physics
- **Resonant Frequency:** Google Pixel 6a houses an X-axis LRA with a natural resonance frequency of **155 Hz (~6.45 ms/cycle)**.
- **Resonant Hold Duration:** Envelope peaks must be held for **80–125 ms** (`punch_duration_ms: 90`). Shorter pulses (<50 ms) fail to overcome motor inertia and feel faint.
- **Minimum Floor:** Base amplitude floor must be `>= 70 PWM` (out of 255) so subtle bass lines overcome mechanical deadbands.
- **Velocity S-Curve:** Synthesize amplitudes non-linearly:
  $$\text{amplitude} = \text{base} + (255 - \text{base}) \cdot \left(\frac{\text{velocity} - \text{threshold}}{1.0 - \text{threshold}}\right)^{0.65}$$
- **Cooldown Padding:** Cooldown between hits must be at least `envelope_duration + 16 ms` to prevent the Android HAL from throwing `cancelled_superseded`.
- **Telemetry UDP Port:** `127.0.0.1:48123` broadcasts datagrams with `{"energy", "sub", "punch", "snap", "vel", "pwm", "hit", "peak", "enabled"}`.

---

## ADB Tethering & Power Management
- **Never run `adb usb` or reset the USB stack** while tethered; it severs the PC's primary network connection.
- **Safe Tether Check:** Run `adb shell dumpsys tethering` or check for `ncm0` / `rndis0` link status.
- **Energy Conservation:**
  - Backlight: `adb shell settings put system screen_brightness 1`
  - Sleep: `adb shell input keyevent 26`
  - Refresh Rate: `adb shell settings put system peak_refresh_rate 60.0`
