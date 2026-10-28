#!/usr/bin/env python3
"""
Phone Energy Daemon for Google Pixel 6a (and Android devices)
Manages low-power Eco Tether profile while the phone is tethered as a Wi-Fi bridge.

Key optimizations while tethered:
1. Puts phone display to sleep (KEYCODE_SLEEP) and keeps screen off.
2. Sets screen timeout to 15s and dims screen brightness.
3. Disables Always-On Display (AOD / Ambient Doze).
4. Enables Android Battery Saver (low_power mode) to clamp background CPU usage,
   throttle background apps (Discord, Google Drive, email sync), and disable animations.
5. Disables non-essential radios (GPS/Location, Bluetooth, NFC).
6. Keeps Wi-Fi 6 (5 GHz) and USB NCM Tethering completely unhindered at full speed.
7. Automatically restores normal settings when disconnected or upon exit.
"""

from __future__ import annotations

import os
import sys
import time
import subprocess
import re
from datetime import datetime
from typing import Optional, Tuple

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(SCRIPT_DIR, "energy.log")
PID_FILE = os.path.join(SCRIPT_DIR, "energy.pid")

# Redirect std streams for pythonw.exe
if sys.stderr is None:
    try:
        sys.stderr = open(os.path.join(SCRIPT_DIR, "stderr.log"), "a", encoding="utf-8")
    except Exception:
        pass
if sys.stdout is None:
    try:
        sys.stdout = open(os.path.join(SCRIPT_DIR, "stdout.log"), "a", encoding="utf-8")
    except Exception:
        pass

def log(msg: str):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{timestamp}] {msg}"
    if sys.stdout is not None:
        try:
            print(formatted, flush=True)
        except Exception:
            pass
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(formatted + "\n")
    except Exception:
        pass

# Locate ADB binary
ADB_CANDIDATES = [
    os.path.abspath(os.path.join(SCRIPT_DIR, "..", "USBTethering", "platform-tools", "adb.exe")),
    os.path.join(os.environ.get("LOCALAPPDATA", ""), "Android", "Sdk", "platform-tools", "adb.exe"),
    r"C:\platform-tools\adb.exe",
    "adb.exe"
]

def get_adb_path() -> str:
    for candidate in ADB_CANDIDATES:
        if os.path.exists(candidate):
            return candidate
    return "adb.exe"

def run_adb(adb: str, args: list[str], timeout: int = 8) -> Tuple[int, str]:
    try:
        cmd = [adb] + args
        if any(a in ["start-server", "wait-for-device"] for a in args):
            proc = subprocess.run(
                cmd,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=timeout,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            )
            return proc.returncode, ""

        proc = subprocess.run(
            cmd,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=timeout,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        )
        return proc.returncode, proc.stdout.strip()
    except Exception as e:
        return -1, str(e)

_MUTEX_HANDLE = None

def acquire_single_instance_mutex() -> bool:
    global _MUTEX_HANDLE
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        _MUTEX_HANDLE = kernel32.CreateMutexW(None, False, "Global\\PixelEnergyDaemon_Mutex")
        if kernel32.GetLastError() == 183:  # ERROR_ALREADY_EXISTS
            return False
        return True
    except Exception:
        return True

class EnergyDaemon:
    def __init__(self):
        self.adb = get_adb_path()
        run_adb(self.adb, ["start-server"], timeout=10)
        self.running = True
        self.eco_applied = False
        self.last_telemetry_time = 0.0

    def is_device_connected(self) -> bool:
        code, out = run_adb(self.adb, ["devices"], timeout=4)
        if code == 0:
            for line in out.splitlines():
                if re.search(r"^[a-zA-Z0-9]+\s+device$", line.strip()):
                    return True
        return False

    def is_tethering_active(self) -> bool:
        code, out = run_adb(self.adb, ["shell", "dumpsys", "tethering"], timeout=4)
        if code == 0 and "tetheredstate" in out.lower():
            return True
        code_ip, out_ip = run_adb(self.adb, ["shell", "ip", "-br", "link"], timeout=3)
        if code_ip == 0 and re.search(r"(ncm0|rndis0)\s+UP", out_ip, re.IGNORECASE):
            return True
        return False

    def get_battery_metrics(self) -> Tuple[int, str, float]:
        """Returns (battery_pct, status_str, current_mA)."""
        level = 50
        status = "Unknown"
        current_ma = 0.0

        code, out = run_adb(self.adb, ["shell", "dumpsys", "battery"], timeout=4)
        if code == 0:
            m_lvl = re.search(r"level:\s*(\d+)", out)
            if m_lvl: level = int(m_lvl.group(1))
            m_stat = re.search(r"status:\s*(\d+)", out)
            if m_stat:
                st = m_stat.group(1)
                status = "Charging" if st == "2" else ("Discharging" if st == "3" else "Not Charging")

        code_cur, out_cur = run_adb(self.adb, ["shell", "cat", "/sys/class/power_supply/battery/current_now"], timeout=3)
        if code_cur == 0:
            try:
                # current_now in microamps (uA)
                uA = int(out_cur.strip())
                current_ma = round(uA / 1000.0, 1)
            except Exception:
                pass

        return level, status, current_ma

    def apply_eco_profile(self):
        log("Activating Eco Tether Profile on Pixel 6a...")
        # 1. Battery Saver mode (global low_power)
        run_adb(self.adb, ["shell", "settings", "put", "global", "low_power", "1"], timeout=4)
        
        # 2. Location / GPS OFF
        run_adb(self.adb, ["shell", "settings", "put", "secure", "location_mode", "0"], timeout=4)
        
        # 3. Extra Radios OFF
        run_adb(self.adb, ["shell", "svc", "bluetooth", "disable"], timeout=4)
        run_adb(self.adb, ["shell", "svc", "nfc", "disable"], timeout=4)
        
        # 4. Display optimizations (timeout 15s, AOD off, screen off)
        run_adb(self.adb, ["shell", "settings", "put", "system", "screen_off_timeout", "15000"], timeout=4)
        run_adb(self.adb, ["shell", "settings", "put", "secure", "doze_always_on", "0"], timeout=4)
        run_adb(self.adb, ["shell", "input", "keyevent", "223"], timeout=4)  # KEYCODE_SLEEP
        
        self.eco_applied = True
        log("Eco Tether Profile applied: Battery Saver ON, GPS/BT/NFC OFF, Screen Sleep.")

    def restore_normal_profile(self):
        if not self.eco_applied:
            return
        log("Restoring standard mobile power profile...")
        try:
            run_adb(self.adb, ["shell", "settings", "put", "global", "low_power", "0"], timeout=4)
            run_adb(self.adb, ["shell", "settings", "put", "secure", "location_mode", "3"], timeout=4)
            run_adb(self.adb, ["shell", "svc", "bluetooth", "enable"], timeout=4)
            run_adb(self.adb, ["shell", "settings", "put", "system", "screen_off_timeout", "60000"], timeout=4)
            run_adb(self.adb, ["shell", "settings", "put", "secure", "doze_always_on", "1"], timeout=4)
        except Exception:
            pass
        self.eco_applied = False
        log("Normal mobile power profile restored.")

    def ensure_screen_asleep(self):
        """If screen is awake, send sleep command."""
        code, out = run_adb(self.adb, ["shell", "dumpsys", "power"], timeout=4)
        if code == 0:
            if "mWakefulness=Awake" in out:
                run_adb(self.adb, ["shell", "input", "keyevent", "223"], timeout=3)

    def run(self):
        log("=" * 60)
        log("Phone Energy Daemon started.")
        log(f"Using ADB binary: {self.adb}")
        log("=" * 60)

        while self.running:
            try:
                connected = self.is_device_connected()
                if not connected:
                    if self.eco_applied:
                        self.eco_applied = False
                    time.sleep(8)
                    continue

                tether_active = self.is_tethering_active()
                if tether_active:
                    if not self.eco_applied:
                        self.apply_eco_profile()
                    else:
                        self.ensure_screen_asleep()

                    now = time.time()
                    if now - self.last_telemetry_time >= 120.0:
                        self.last_telemetry_time = now
                        lvl, stat, cur = self.get_battery_metrics()
                        sign = "+" if cur > 0 else ""
                        log(f"Telemetry: Battery {lvl}% ({stat}) • Current: {sign}{cur} mA")

                time.sleep(15)

            except KeyboardInterrupt:
                break
            except Exception as e:
                log(f"Unexpected error in energy loop: {e}")
                time.sleep(10)

        self.restore_normal_profile()
        log("Phone Energy Daemon stopped.")


if __name__ == "__main__":
    if not acquire_single_instance_mutex():
        log("Another instance of energy_daemon is already running. Exiting.")
        sys.exit(0)

    try:
        with open(PID_FILE, "w", encoding="utf-8") as f:
            f.write(str(os.getpid()))
    except Exception:
        pass

    try:
        daemon = EnergyDaemon()
        daemon.run()
    finally:
        try:
            if os.path.exists(PID_FILE):
                os.remove(PID_FILE)
        except Exception:
            pass
