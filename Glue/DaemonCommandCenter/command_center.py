#!/usr/bin/env python3
"""
Daemon Command Center
Master supervisor, real-time status dashboard, and system tray monitor for:
1. Pixel USB Tethering Daemon (auto_tether.py)
2. Wi-Fi 5GHz Sentinel Daemon (Watch-PhoneWifi5G.ps1)
3. Phone Energy Daemon (energy_daemon.py)
4. Audio to Haptics Daemon (audio_haptics_daemon.py)

Engineered with pystray, PIL, and tkinter matching Govee & TokenTracker architecture.
Borderless, drag-enabled HUD docked near the Windows System Tray.
"""

from __future__ import annotations

import os
import sys
import time
import json
import threading
import subprocess
import re
import socket
import collections
from datetime import datetime
from typing import Optional, Dict, Any, List, Tuple

import tkinter as tk
from tkinter import ttk, messagebox
from PIL import Image, ImageDraw
import pystray
from pystray import MenuItem as Item, Menu

# Enable High-DPI Awareness on Windows
try:
    import ctypes
    ctypes.windll.shcore.SetProcessDpiAwareness(1)
except Exception:
    pass

# --- Paths & Logging Redirects ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STDERR_LOG = os.path.join(BASE_DIR, "stderr.log")
STDOUT_LOG = os.path.join(BASE_DIR, "stdout.log")

if sys.stderr is None:
    try:
        sys.stderr = open(STDERR_LOG, "a", encoding="utf-8", buffering=1)
    except Exception:
        pass
if sys.stdout is None:
    try:
        sys.stdout = open(STDOUT_LOG, "a", encoding="utf-8", buffering=1)
    except Exception:
        pass

def custom_thread_excepthook(args):
    try:
        with open(os.path.join(BASE_DIR, "boot.log"), "a", encoding="utf-8") as f:
            f.write(f"THREAD EXCEPTION in {args.thread.name}: {args.exc_type}: {args.exc_value}\n")
            import traceback
            traceback.print_tb(args.exc_traceback, file=f)
    except Exception:
        pass

threading.excepthook = custom_thread_excepthook

DAEMONS_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "Daemons"))

# Daemon 1: USB Tethering
TETHER_DIR = os.path.join(DAEMONS_DIR, "USBTethering")
TETHER_SCRIPT = os.path.join(TETHER_DIR, "auto_tether.py")
TETHER_VBS = os.path.join(TETHER_DIR, "run_background.vbs")
TETHER_LOG = os.path.join(TETHER_DIR, "tethering.log")
TETHER_PID_FILE = os.path.join(TETHER_DIR, "auto_tether.pid")

# Daemon 2: 5GHz Wi-Fi Sentinel
SENTINEL_DIR = os.path.join(DAEMONS_DIR, "Wifi5GSentinel")
SENTINEL_SCRIPT = os.path.join(SENTINEL_DIR, "Watch-PhoneWifi5G.ps1")
SENTINEL_VBS = os.path.join(SENTINEL_DIR, "Start-Sentinel.vbs")
SENTINEL_STOP = os.path.join(SENTINEL_DIR, "Stop-Sentinel.ps1")
SENTINEL_LOG = os.path.join(SENTINEL_DIR, "sentinel.log")
SENTINEL_PID_FILE = os.path.join(SENTINEL_DIR, "sentinel.pid")

# Daemon 3: Energy Daemon (Eco Tether Profile)
ENERGY_DIR = os.path.join(DAEMONS_DIR, "EnergyDaemon")
ENERGY_SCRIPT = os.path.join(ENERGY_DIR, "energy_daemon.py")
ENERGY_VBS = os.path.join(ENERGY_DIR, "Start-EnergyDaemon.vbs")
ENERGY_STOP = os.path.join(ENERGY_DIR, "Stop-EnergyDaemon.ps1")
ENERGY_LOG = os.path.join(ENERGY_DIR, "energy.log")
ENERGY_PID_FILE = os.path.join(ENERGY_DIR, "energy.pid")

# Daemon 4: Audio to Haptics Daemon
HAPTICS_DIR = os.path.join(DAEMONS_DIR, "AudioHaptics")
HAPTICS_SCRIPT = os.path.join(HAPTICS_DIR, "audio_haptics_daemon.py")
HAPTICS_VBS = os.path.join(HAPTICS_DIR, "Start-AudioHaptics.vbs")
HAPTICS_STOP = os.path.join(HAPTICS_DIR, "Stop-AudioHaptics.ps1")
HAPTICS_LOG = os.path.join(HAPTICS_DIR, "haptics.log")
HAPTICS_PID_FILE = os.path.join(HAPTICS_DIR, "haptics.pid")
HAPTICS_CONFIG = os.path.join(HAPTICS_DIR, "config.json")

# Daemon 5: LLM Token Tracker
TOKEN_DIR = os.path.join(DAEMONS_DIR, "TokenTracker")
TOKEN_EXE = os.path.join(TOKEN_DIR, "dist", "LLMTokenTracker", "LLMTokenTracker.exe")
TOKEN_SCRIPT = os.path.join(TOKEN_DIR, "main.py")
TOKEN_VBS = os.path.join(TOKEN_DIR, "run_token_tracker.vbs")
TOKEN_LOG = os.path.join(TOKEN_DIR, "token_tracker.log")
TOKEN_CACHE = os.path.join(TOKEN_DIR, "cache.json")
TOKEN_PID_FILE = os.path.join(TOKEN_DIR, "token_tracker.pid")

# Import TokenTracker popup UI components if available
TOKEN_TRACKER_AVAILABLE = False
try:
    if TOKEN_DIR not in sys.path:
        sys.path.insert(0, TOKEN_DIR)
    from popup_ui import TokenPopup, COLORS as TOKEN_COLORS
    from models import (
        compute_stats, get_daily_breakdown, entry_from_dict,
        local_today_start, local_day_start
    )
    TOKEN_TRACKER_AVAILABLE = True
except Exception:
    pass

if TOKEN_TRACKER_AVAILABLE:
    class SlideOutTokenPopup(TokenPopup):
        """Subclass of TokenPopup customized for seamless side-by-side slide-out docking."""
        def __init__(self, stats_today, stats_7d, stats_30d, stats_lifetime,
                     daily_breakdown, refresh_interval_minutes,
                     on_refresh_interval_change=None, on_refresh_now=None,
                     last_scan_time=None, provider_breakdown=None, parent=None,
                     on_close_request=None, init_geom="450x750+0+0"):
            self.on_refresh_interval_change = on_refresh_interval_change
            self.on_refresh_now = on_refresh_now
            self.refresh_interval_minutes = refresh_interval_minutes
            self.provider_breakdown = provider_breakdown or {}
            self.parent = parent
            self.on_close_request = on_close_request

            self.root = tk.Toplevel(parent)
            self.root.title("LLM Token Tracker")
            self.root.overrideredirect(True)
            self.root.attributes('-topmost', True)
            self.root.configure(bg=TOKEN_COLORS['bg'])
            self.root.geometry(init_geom)

            # Do NOT bind FocusOut so the window stays docked while pairing with Command Center!
            self.root.bind('<Escape>', lambda e: self.close())

            self._setup_styles()
            self._build_ui(stats_today, stats_7d, stats_30d, stats_lifetime,
                           daily_breakdown, last_scan_time, self.provider_breakdown)

            self.root.attributes('-alpha', 0.98)
            self.root.deiconify()

        def close(self):
            if callable(self.on_close_request):
                self.on_close_request()
            else:
                try:
                    self.root.destroy()
                except Exception:
                    pass
else:
    SlideOutTokenPopup = None

ADB_CANDIDATES = [
    os.path.join(TETHER_DIR, "platform-tools", "adb.exe"),
    os.path.join(os.environ.get("LOCALAPPDATA", ""), "Android", "Sdk", "platform-tools", "adb.exe"),
    r"C:\platform-tools\adb.exe",
    "adb.exe"
]

def get_adb_path() -> str:
    for candidate in ADB_CANDIDATES:
        if os.path.exists(candidate):
            return candidate
    return "adb.exe"

_APP_MUTEX = None

def acquire_single_instance() -> bool:
    global _APP_MUTEX
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        _APP_MUTEX = kernel32.CreateMutexW(None, False, "Global\\DaemonCommandCenter_Mutex")
        if kernel32.GetLastError() == 183:  # ERROR_ALREADY_EXISTS
            return False
        return True
    except Exception:
        return True

def is_pid_alive(pid: int, expected_name: Optional[str] = None) -> bool:
    if not pid or pid <= 0:
        return False
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.OpenProcess(0x1000, False, pid)
        if not handle:
            return False
        exit_code = ctypes.c_ulong()
        kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code))
        if exit_code.value != 259:
            kernel32.CloseHandle(handle)
            return False
        if expected_name:
            buf = ctypes.create_unicode_buffer(512)
            size = ctypes.c_ulong(512)
            if kernel32.QueryFullProcessImageNameW(handle, 0, buf, ctypes.byref(size)):
                exe_name = buf.value.lower()
                kernel32.CloseHandle(handle)
                return expected_name.lower() in exe_name
        kernel32.CloseHandle(handle)
        return True
    except Exception:
        return False

# --- Modern Dark Theme Palette (matching GoveeTrayControl & TokenTracker) ---
COLORS = {
    "bg": "#181825",            # Deep background
    "card": "#242438",          # Card background
    "card_hover": "#2c2c44",    # Hover highlight
    "border": "#313244",        # Clean borders
    "divider": "#2a2a40",
    "text_primary": "#cdd6f4",  # High contrast crisp text
    "text_secondary": "#a6adc8",# Subdued text
    "text_muted": "#6c7086",    # Footers / captions
    "accent_blue": "#89b4fa",   # Blue buttons / headers
    "accent_green": "#a6e3a1",  # 5GHz / Active state
    "accent_amber": "#fab387",  # 2.4GHz / Warning state
    "accent_red": "#f38ba8",    # Error / Stopped state
    "accent_purple": "#cba6f7", # Sentinel accent
    "accent_cyan": "#89dceb",   # Eco / Energy accent
    "accent_pink": "#f5c2e7",   # Haptics accent
}

# --- High-Contrast System Tray Icon Generator ---
def create_tray_icon(state: str = "green") -> Image.Image:
    """Creates a high-contrast, bold 64x64 dynamic icon for Windows 11 taskbar."""
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    color_map = {
        "green": (80, 250, 123),   # Vibrant Emerald (5GHz + Tether active)
        "amber": (255, 184, 108),  # Vibrant Orange (2.4GHz drift / degraded)
        "red": (255, 85, 85),      # Vibrant Crimson (Disconnected / Error)
        "gray": (140, 140, 160)    # Neutral Gray
    }

    color = color_map.get(state, color_map["gray"])

    # Outer soft glow & dark pill base
    d.rounded_rectangle([2, 2, 62, 62], radius=16, fill=(24, 24, 38, 255), outline=color, width=4)

    # Wi-Fi broadcast signal arcs
    d.arc([8, 8, 56, 56], start=215, end=325, fill=color, width=5)
    d.arc([16, 16, 48, 48], start=215, end=325, fill=color, width=5)

    # Center glowing beacon dot
    d.ellipse([26, 33, 38, 45], fill=color)

    # USB link indicator bar (Cyan)
    d.rounded_rectangle([22, 50, 42, 56], radius=2, fill=(137, 180, 250, 255))

    return img

ICO_PATH = os.path.join(BASE_DIR, "command_center.ico")


class DaemonCommandCenter:
    def __init__(self):
        self.adb_path = get_adb_path()
        self._run_adb_cmd(["start-server"], timeout=10)
        self.running = True
        self.lock = threading.Lock()

        self._last_tether_start_time = 0.0
        self._last_sentinel_start_time = 0.0
        self._last_energy_start_time = 0.0
        self._last_haptics_start_time = 0.0
        self._last_token_start_time = 0.0
        self._cached_token_pid: Optional[int] = None

        # Window Drag Coordinates
        self._drag_start_x = 0
        self._drag_start_y = 0

        # Token Tracker Slide-Out Panel State
        self.token_slideout = None
        self.token_slideout_open = False

        # Telemetry State
        self.state: Dict[str, Any] = {
            "device_connected": False,
            "device_model": "Searching...",
            "device_serial": "---",
            "battery_level": "--",
            "battery_status": "--",
            "battery_current_ma": 0.0,
            "tether_daemon_running": False,
            "tether_pid": None,
            "tether_active": False,
            "sentinel_daemon_running": False,
            "sentinel_pid": None,
            "energy_daemon_running": False,
            "energy_pid": None,
            "haptics_daemon_running": False,
            "haptics_pid": None,
            "token_daemon_running": False,
            "token_pid": None,
            "token_entries": 0,
            "token_last_scan": "Never",
            "wifi_connected": False,
            "wifi_ssid": "Unknown",
            "wifi_freq": 0,
            "is_5ghz": False,
            "rx_speed": 0,
            "tx_speed": 0,
            "wifi_score": 0,
            "last_updated": "Never",
        }

        # Localhost UDP Listener for Real-Time PWM & Audio Telemetry (Port 48123)
        self.udp_sock: Optional[socket.socket] = None
        try:
            self.udp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self.udp_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.udp_sock.bind(("127.0.0.1", 48123))
            self.udp_sock.setblocking(False)
        except Exception:
            self.udp_sock = None

        # Scrolling History Buffers for Live Visualizer
        self.audio_wave_hist = collections.deque([0.0] * 55, maxlen=55)
        self.pwm_env_hist = collections.deque([0.0] * 55, maxlen=55)
        self.last_telemetry = {
            "energy": 0.0, "sub": 0.0, "punch": 0.0, "snap": 0.0,
            "vel": 0.0, "pwm": 0, "hit": False, "peak": 0, "enabled": True
        }
        self.graph_running = False

        # Initialize Tkinter GUI (Borderless HUD Window)
        self.root = tk.Tk()
        self.root.title("Daemon Command Center")
        self.root.configure(bg=COLORS["bg"])
        self.root.resizable(False, False)
        self.root.overrideredirect(True)  # Completely borderless!

        if os.path.exists(ICO_PATH):
            try:
                self.root.iconbitmap(ICO_PATH)
            except Exception:
                pass

        # Position window near system tray
        self._position_window_near_tray()

        # Build UI Cards & Widgets
        self._build_gui()

        # Start Tray Icon
        self._setup_tray()

        # Start Background Telemetry & Supervisor Thread
        self.worker_thread = threading.Thread(target=self._telemetry_loop, daemon=True)
        self.worker_thread.start()

    def _position_window_near_tray(self):
        w = 480
        h = 750
        try:
            import ctypes.wintypes
            rect = ctypes.wintypes.RECT()
            # SPI_GETWORKAREA = 0x0030 (desktop rect excluding taskbar)
            ctypes.windll.user32.SystemParametersInfoW(0x0030, 0, ctypes.byref(rect), 0)
            work_w = rect.right - rect.left
            work_h = rect.bottom - rect.top
            max_h = min(h, work_h - 12)
            x = max(rect.left + 12, rect.right - w - 16)
            y = max(rect.top + 12, rect.bottom - max_h - 10)
            h = max_h
        except Exception:
            screen_w = self.root.winfo_screenwidth()
            screen_h = self.root.winfo_screenheight()
            x = max(0, screen_w - w - 16)
            y = max(0, screen_h - h - 56)
        self.base_window_h = h
        self.root.geometry(f"{w}x{h}+{x}+{y}")

    # --- Dragging for Borderless Window ---
    def _on_drag_start(self, event):
        self._drag_start_x = event.x
        self._drag_start_y = event.y

    def _on_drag_motion(self, event):
        deltax = event.x - self._drag_start_x
        deltay = event.y - self._drag_start_y
        new_x = self.root.winfo_x() + deltax
        new_y = self.root.winfo_y() + deltay
        self.root.geometry(f"+{new_x}+{new_y}")
        if getattr(self, "token_slideout_open", False) and hasattr(self, "token_slideout") and self.token_slideout and self.token_slideout.root.winfo_exists():
            try:
                self.token_slideout.root.geometry(f"+{new_x - 450 - 6}+{new_y}")
            except Exception:
                pass
        if getattr(self, "haptics_slideout_open", False) and hasattr(self, "haptics_slideout") and self.haptics_slideout and self.haptics_slideout.winfo_exists():
            try:
                self.haptics_slideout.geometry(f"+{new_x - 440 - 6}+{new_y}")
            except Exception:
                pass

    # --- System Tray Setup ---
    def _on_tray_setup(self, icon):
        icon.visible = True
        self._update_tray()

    def _setup_tray(self):
        menu = Menu(
            Item("🎛️ Toggle Command Center", self.toggle_window, default=True),
            Menu.SEPARATOR,
            Item("🎛️ Pop Out Tuning Panel", lambda icon, item: self.toggle_haptics_slideout()),
            Item("🧮 Pop Out Token Tracker", lambda icon, item: self.toggle_token_slideout()),
            Item("📳 Toggle Haptic Mute", lambda icon, item: self.toggle_haptics_power()),
            Item("💡 Toggle Govee Sync", lambda icon, item: self.toggle_govee_sync()),
            Item("📳 Test Haptic Hit", lambda icon, item: self.trigger_test_haptic()),
            Item("🌙 Sleep Phone Screen", lambda icon, item: self.trigger_screen_sleep()),
            Item("⚡ Nudge Wi-Fi to 5 GHz", lambda icon, item: self.trigger_5g_nudge()),
            Item("🔄 Re-trigger USB Tethering", lambda icon, item: self.trigger_retrigger_tether()),
            Item("🧮 Toggle Token Tracker", lambda icon, item: self.toggle_token_power()),
            Menu.SEPARATOR,
            Item("📜 Open Tethering Log", lambda icon, item: self.open_log_file(TETHER_LOG)),
            Item("📜 Open Sentinel Log", lambda icon, item: self.open_log_file(SENTINEL_LOG)),
            Item("📜 Open Energy Log", lambda icon, item: self.open_log_file(ENERGY_LOG)),
            Item("📜 Open Haptics Log", lambda icon, item: self.open_log_file(HAPTICS_LOG)),
            Item("📜 Open Token Tracker Log", lambda icon, item: self.open_log_file(TOKEN_LOG)),
            Menu.SEPARATOR,
            Item("🔄 Restart All Services", lambda icon, item: self.restart_all_daemons()),
            Item("❌ Exit Command Center", self.quit_app)
        )
        self.tray_icon = pystray.Icon(
            "DaemonCommandCenter",
            create_tray_icon("green"),
            "Pixel 6a: Initializing...",
            menu=menu
        )
        try:
            self.tray_icon.run_detached()
            self._update_tray()
        except Exception:
            self.tray_thread = threading.Thread(
                target=self.tray_icon.run,
                kwargs={"setup": self._on_tray_setup},
                daemon=True
            )
            self.tray_thread.start()

    def toggle_window(self, icon=None, item=None):
        try:
            if self.root.winfo_viewable():
                self.root.after(0, self.hide_window)
            else:
                self.root.after(0, self._do_show_window)
        except Exception:
            self.root.after(0, self._do_show_window)

    def _do_show_window(self):
        self._position_window_near_tray()
        self.root.deiconify()
        self.root.lift()
        self.root.attributes("-topmost", True)
        self.root.focus_force()

    def hide_window(self):
        if getattr(self, "token_slideout_open", False) and hasattr(self, "token_slideout") and self.token_slideout and self.token_slideout.root.winfo_exists():
            try:
                self.token_slideout.root.destroy()
            except Exception:
                pass
            self.token_slideout = None
            self.token_slideout_open = False
            if hasattr(self, "btn_token_slideout"):
                self.btn_token_slideout.config(text="◀️ Pop Out", fg=COLORS["accent_blue"], bg="#2e3450")
        self.root.withdraw()

    def quit_app(self, icon=None, item=None):
        try:
            with open(os.path.join(BASE_DIR, "boot.log"), "a", encoding="utf-8") as f:
                f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] quit_app called by icon={icon}, item={item}\n")
        except Exception:
            pass
        self.running = False
        if self.tray_icon:
            try:
                self.tray_icon.stop()
            except Exception:
                pass
        def _terminate():
            try:
                self.root.destroy()
            except Exception:
                pass
            os._exit(0)
        self.root.after(0, _terminate)

    # --- Telemetry & Process Supervisor Loop ---
    def _run_adb_cmd(self, args: List[str], timeout: int = 5) -> Tuple[int, str]:
        try:
            cmd = [self.adb_path] + args
            if any(arg in ["start-server", "wait-for-device"] for arg in args):
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

    def _find_token_tracker_pid(self) -> Optional[int]:
        if os.path.exists(TOKEN_PID_FILE):
            try:
                with open(TOKEN_PID_FILE, "r", encoding="utf-8") as f:
                    pid = int(f.read().strip())
                if is_pid_alive(pid, "python"):
                    return pid
            except Exception:
                pass
        try:
            proc = subprocess.run(
                ["tasklist", "/FI", "IMAGENAME eq LLMTokenTracker.exe", "/FO", "CSV", "/NH"],
                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                text=True, timeout=2, creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            )
            for line in proc.stdout.splitlines():
                parts = line.strip().split('","')
                if len(parts) >= 2:
                    p_name = parts[0].replace('"', '').strip()
                    if "llmtokentracker" in p_name.lower():
                        return int(parts[1].replace('"', '').strip())
        except Exception:
            pass
        return None

    def _get_token_tracker_stats(self) -> Tuple[int, str]:
        entries = 0
        last_scan = "Recent"
        try:
            if os.path.exists(TOKEN_LOG):
                with open(TOKEN_LOG, "r", encoding="utf-8", errors="ignore") as f:
                    for l in reversed(f.readlines()[-30:]):
                        if "Saved" in l and "entries to" in l:
                            m = re.search(r"Saved\s+(\d+)\s+entries", l)
                            if m:
                                entries = int(m.group(1))
                                m_time = re.match(r"^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})", l)
                                if m_time:
                                    last_scan = m_time.group(1).split()[-1]
                                break
        except Exception:
            pass
        if entries == 0 and os.path.exists(TOKEN_CACHE):
            try:
                sz = os.path.getsize(TOKEN_CACHE)
                entries = max(1000, int(sz / 550))
            except Exception:
                pass
        return entries, last_scan

    def _check_running_processes(self) -> Tuple[Tuple[bool, Optional[int]], Tuple[bool, Optional[int]], Tuple[bool, Optional[int]], Tuple[bool, Optional[int]], Tuple[bool, Optional[int]]]:
        tether_info = (False, None)
        sentinel_info = (False, None)
        energy_info = (False, None)
        haptics_info = (False, None)
        token_info = (False, None)

        if os.path.exists(TETHER_PID_FILE):
            try:
                with open(TETHER_PID_FILE, "r", encoding="utf-8") as f:
                    t_pid = int(f.read().strip())
                if is_pid_alive(t_pid, "python"):
                    tether_info = (True, t_pid)
            except Exception:
                pass

        if os.path.exists(SENTINEL_PID_FILE):
            try:
                with open(SENTINEL_PID_FILE, "r", encoding="utf-8") as f:
                    s_pid = int(f.read().strip())
                if is_pid_alive(s_pid, "powershell"):
                    sentinel_info = (True, s_pid)
            except Exception:
                pass

        if os.path.exists(ENERGY_PID_FILE):
            try:
                with open(ENERGY_PID_FILE, "r", encoding="utf-8") as f:
                    e_pid = int(f.read().strip())
                if is_pid_alive(e_pid, "python"):
                    energy_info = (True, e_pid)
            except Exception:
                pass

        if os.path.exists(HAPTICS_PID_FILE):
            try:
                with open(HAPTICS_PID_FILE, "r", encoding="utf-8") as f:
                    h_pid = int(f.read().strip())
                if is_pid_alive(h_pid, "python"):
                    haptics_info = (True, h_pid)
            except Exception:
                pass

        if self._cached_token_pid and is_pid_alive(self._cached_token_pid, "LLMTokenTracker"):
            token_info = (True, self._cached_token_pid)
        else:
            tok_p = self._find_token_tracker_pid()
            if tok_p:
                self._cached_token_pid = tok_p
                token_info = (True, tok_p)
            else:
                self._cached_token_pid = None

        return tether_info, sentinel_info, energy_info, haptics_info, token_info

    def _telemetry_loop(self):
        time.sleep(1)
        while self.running:
            try:
                now = time.time()
                # 1. Process Supervision (Master Manager for all 5 daemons)
                (t_run, t_pid), (s_run, s_pid), (e_run, e_pid), (h_run, h_pid), (tok_run, tok_pid) = self._check_running_processes()
                if not t_run and os.path.exists(TETHER_VBS):
                    if now - self._last_tether_start_time > 8.0:
                        self._last_tether_start_time = now
                        self.start_tether_daemon()
                    t_run, t_pid = True, None
                if not s_run and os.path.exists(SENTINEL_VBS):
                    if now - self._last_sentinel_start_time > 8.0:
                        self._last_sentinel_start_time = now
                        self.start_sentinel_daemon()
                    s_run, s_pid = True, None
                if not e_run and os.path.exists(ENERGY_VBS):
                    if now - self._last_energy_start_time > 8.0:
                        self._last_energy_start_time = now
                        self.start_energy_daemon()
                    e_run, e_pid = True, None
                if not h_run and os.path.exists(HAPTICS_VBS):
                    if now - self._last_haptics_start_time > 8.0:
                        self._last_haptics_start_time = now
                        self.start_haptics_daemon()
                    h_run, h_pid = True, None
                if not tok_run and os.path.exists(TOKEN_VBS):
                    if now - self._last_token_start_time > 8.0:
                        self._last_token_start_time = now
                        self.start_token_tracker()
                    tok_run, tok_pid = True, None

                # 2. ADB Telemetry
                code, out = self._run_adb_cmd(["devices"], timeout=3)
                dev_connected = False
                if code == 0:
                    for line in out.splitlines():
                        if re.search(r"^[a-zA-Z0-9]+\s+device$", line.strip()):
                            dev_connected = True
                            break

                model = "Pixel 6a"
                serial = "---"
                batt_lvl = "--"
                batt_stat = "--"
                batt_cur_ma = 0.0
                tether_active = False
                wifi_ssid = "Disconnected"
                wifi_freq = 0
                rx_speed = 0
                tx_speed = 0
                wifi_score = 0

                if dev_connected:
                    _, model_out = self._run_adb_cmd(["shell", "getprop", "ro.product.model"], timeout=3)
                    if model_out: model = model_out
                    _, serial_out = self._run_adb_cmd(["get-serialno"], timeout=3)
                    if serial_out: serial = serial_out

                    _, batt_out = self._run_adb_cmd(["shell", "dumpsys", "battery"], timeout=3)
                    m_lvl = re.search(r"level:\s*(\d+)", batt_out)
                    if m_lvl: batt_lvl = m_lvl.group(1)
                    m_stat = re.search(r"status:\s*(\d+)", batt_out)
                    if m_stat:
                        st = m_stat.group(1)
                        batt_stat = "Charging" if st == "2" else ("Discharging" if st == "3" else "Not Charging")

                    code_cur, cur_out = self._run_adb_cmd(["shell", "cat", "/sys/class/power_supply/battery/current_now"], timeout=2)
                    if code_cur == 0 and cur_out:
                        try:
                            batt_cur_ma = round(int(cur_out.strip()) / 1000.0, 1)
                        except Exception:
                            pass

                    _, tether_out = self._run_adb_cmd(["shell", "dumpsys", "tethering"], timeout=3)
                    t_out_l = tether_out.lower()
                    if "tetheredstate" in t_out_l or re.search(r"tethered:\s*\[.*(ncm|rndis|usb).*", tether_out, re.IGNORECASE):
                        tether_active = True
                    else:
                        _, ip_out = self._run_adb_cmd(["shell", "ip", "-br", "link"], timeout=2)
                        if re.search(r"(ncm0|rndis0)\s+UP", ip_out, re.IGNORECASE):
                            tether_active = True

                    _, wifi_out = self._run_adb_cmd(["shell", "cmd", "wifi", "status"], timeout=3)
                    m_ssid = re.search(r'SSID:\s*"([^"]+)"', wifi_out)
                    if m_ssid: wifi_ssid = m_ssid.group(1)
                    m_freq = re.search(r'Frequency:\s*(\d+)MHz', wifi_out)
                    if m_freq: wifi_freq = int(m_freq.group(1))
                    m_rx = re.search(r'Rx Link speed:\s*(\d+)Mbps', wifi_out)
                    if m_rx: rx_speed = int(m_rx.group(1))
                    m_tx = re.search(r'Tx Link speed:\s*(\d+)Mbps', wifi_out)
                    if m_tx: tx_speed = int(m_tx.group(1))
                    m_sc = re.search(r'score:\s*(\d+)', wifi_out)
                    if m_sc: wifi_score = int(m_sc.group(1))

                is_5g = (wifi_freq >= 5000)
                tok_entries, tok_scan = self._get_token_tracker_stats()

                with self.lock:
                    self.state.update({
                        "device_connected": dev_connected,
                        "device_model": model,
                        "device_serial": serial,
                        "battery_level": batt_lvl,
                        "battery_status": batt_stat,
                        "battery_current_ma": batt_cur_ma,
                        "tether_daemon_running": t_run,
                        "tether_pid": t_pid,
                        "tether_active": tether_active,
                        "sentinel_daemon_running": s_run,
                        "sentinel_pid": s_pid,
                        "energy_daemon_running": e_run,
                        "energy_pid": e_pid,
                        "haptics_daemon_running": h_run,
                        "haptics_pid": h_pid,
                        "token_daemon_running": tok_run,
                        "token_pid": tok_pid,
                        "token_entries": tok_entries,
                        "token_last_scan": tok_scan,
                        "wifi_connected": (wifi_freq > 0),
                        "wifi_ssid": wifi_ssid,
                        "wifi_freq": wifi_freq,
                        "is_5ghz": is_5g,
                        "rx_speed": rx_speed,
                        "tx_speed": tx_speed,
                        "wifi_score": wifi_score,
                        "last_updated": datetime.now().strftime("%H:%M:%S"),
                    })

                self._update_tray()

            except Exception:
                pass

            time.sleep(2.5)

    def _update_tray(self):
        if not self.tray_icon:
            return

        with self.lock:
            dev = self.state["device_connected"]
            tether = self.state["tether_active"]
            is_5g = self.state["is_5ghz"]
            freq = self.state["wifi_freq"]
            rx = self.state["rx_speed"]
            cur = self.state["battery_current_ma"]
            hap = self.state["haptics_daemon_running"]

        cur_str = f"+{cur}mA" if cur > 0 else f"{cur}mA"
        hap_tag = "📳 Haptics ON" if hap else ""

        if not dev:
            icon_state = "red"
            tip = "Pixel 6a: Disconnected"
        elif not tether:
            icon_state = "amber"
            tip = f"Pixel 6a: USB Connected (Tether Inactive) | {freq}MHz"
        elif not is_5g and freq > 0:
            icon_state = "amber"
            tip = f"Pixel 6a: ⚠️ 2.4 GHz ({freq}MHz) | Rx: {rx}Mbps | {cur_str} {hap_tag}".strip()
        else:
            icon_state = "green"
            tip = f"Pixel 6a: 🟢 5 GHz ({freq}MHz) | Rx: {rx}Mbps | {cur_str} {hap_tag}".strip()

        try:
            self.tray_icon.icon = create_tray_icon(icon_state)
            self.tray_icon.title = tip
            self.tray_icon.visible = True
        except Exception:
            pass

    # --- Actions ---
    def start_tether_daemon(self):
        try:
            subprocess.Popen(["wscript.exe", TETHER_VBS], cwd=TETHER_DIR, creationflags=subprocess.CREATE_NO_WINDOW)
        except Exception:
            pass

    def stop_tether_daemon(self):
        try:
            if os.path.exists(TETHER_PID_FILE):
                with open(TETHER_PID_FILE, "r", encoding="utf-8") as f:
                    pid = int(f.read().strip())
                subprocess.run(["taskkill", "/F", "/PID", str(pid)], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
                os.remove(TETHER_PID_FILE)
        except Exception:
            pass

    def start_sentinel_daemon(self):
        try:
            subprocess.Popen(["wscript.exe", SENTINEL_VBS], cwd=SENTINEL_DIR, creationflags=subprocess.CREATE_NO_WINDOW)
        except Exception:
            pass

    def stop_sentinel_daemon(self):
        try:
            if os.path.exists(SENTINEL_PID_FILE):
                with open(SENTINEL_PID_FILE, "r", encoding="utf-8") as f:
                    pid = int(f.read().strip())
                subprocess.run(["taskkill", "/F", "/PID", str(pid)], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
                os.remove(SENTINEL_PID_FILE)
        except Exception:
            pass
        try:
            subprocess.run(
                ["powershell.exe", "-ExecutionPolicy", "Bypass", "-File", SENTINEL_STOP],
                cwd=SENTINEL_DIR, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW
            )
        except Exception:
            pass

    def start_energy_daemon(self):
        try:
            subprocess.Popen(["wscript.exe", ENERGY_VBS], cwd=ENERGY_DIR, creationflags=subprocess.CREATE_NO_WINDOW)
        except Exception:
            pass

    def stop_energy_daemon(self):
        try:
            if os.path.exists(ENERGY_PID_FILE):
                with open(ENERGY_PID_FILE, "r", encoding="utf-8") as f:
                    pid = int(f.read().strip())
                subprocess.run(["taskkill", "/F", "/PID", str(pid)], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
                os.remove(ENERGY_PID_FILE)
        except Exception:
            pass
        try:
            subprocess.run(
                ["powershell.exe", "-ExecutionPolicy", "Bypass", "-File", ENERGY_STOP],
                cwd=ENERGY_DIR, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW
            )
        except Exception:
            pass

    def start_haptics_daemon(self):
        try:
            subprocess.Popen(["wscript.exe", HAPTICS_VBS], cwd=HAPTICS_DIR, creationflags=subprocess.CREATE_NO_WINDOW)
        except Exception:
            pass

    def stop_haptics_daemon(self):
        try:
            if os.path.exists(HAPTICS_PID_FILE):
                with open(HAPTICS_PID_FILE, "r", encoding="utf-8") as f:
                    pid = int(f.read().strip())
                subprocess.run(["taskkill", "/F", "/PID", str(pid)], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
                os.remove(HAPTICS_PID_FILE)
        except Exception:
            pass
        try:
            subprocess.run(
                ["powershell.exe", "-ExecutionPolicy", "Bypass", "-File", HAPTICS_STOP],
                cwd=HAPTICS_DIR, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW
            )
        except Exception:
            pass

    def start_token_tracker(self):
        try:
            subprocess.Popen(["wscript.exe", TOKEN_VBS], cwd=TOKEN_DIR, creationflags=subprocess.CREATE_NO_WINDOW)
        except Exception:
            pass

    def stop_token_tracker(self):
        try:
            if os.path.exists(TOKEN_PID_FILE):
                try:
                    with open(TOKEN_PID_FILE, "r", encoding="utf-8") as f:
                        pid = int(f.read().strip())
                    subprocess.run(["taskkill", "/F", "/PID", str(pid)], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
                    os.remove(TOKEN_PID_FILE)
                except Exception:
                    pass
            if self._cached_token_pid:
                subprocess.run(["taskkill", "/F", "/PID", str(self._cached_token_pid)], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
                self._cached_token_pid = None
            subprocess.run(["taskkill", "/F", "/IM", "LLMTokenTracker.exe"], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
        except Exception:
            pass

    def toggle_token_power(self):
        with self.lock:
            running = self.state.get("token_daemon_running", False)
        if running:
            self.stop_token_tracker()
        else:
            self.start_token_tracker()

    def _load_token_tracker_data(self):
        """Loads and computes token statistics for the popup UI."""
        if not os.path.exists(TOKEN_CACHE):
            return None
        try:
            with open(TOKEN_CACHE, "r", encoding="utf-8") as f:
                data = json.load(f)
            entries = [entry_from_dict(e) for e in data.get("entries", [])]
            today_start = local_today_start()
            seven_days_ago = local_day_start(6)
            thirty_days_ago = local_day_start(29)

            stats_today = compute_stats(entries, since=today_start)
            stats_7d = compute_stats(entries, since=seven_days_ago)
            stats_30d = compute_stats(entries, since=thirty_days_ago)
            stats_lifetime = compute_stats(entries)
            daily = get_daily_breakdown(entries, days=30)

            daily_dicts = {
                date_str: self._get_token_stats_dict(day_stats)
                for date_str, day_stats in daily.items()
            }

            provider_info = {}
            for provider in ("antigravity", "cursor"):
                p_today = compute_stats(entries, since=today_start, provider=provider)
                p_life = compute_stats(entries, provider=provider)
                provider_info[provider] = {
                    "today_tokens": p_today.total_tokens,
                    "lifetime_tokens": p_life.total_tokens,
                    "accounts": ["Connected"],
                    "paths": [],
                    "disclaimer": "Live Cached Telemetry" if provider == "cursor" else ""
                }

            last_scan = datetime.now()
            if "last_scan_time" in data:
                try:
                    last_scan = datetime.fromisoformat(data["last_scan_time"].replace("Z", "+00:00"))
                except Exception:
                    pass

            return {
                "today": self._get_token_stats_dict(stats_today),
                "7d": self._get_token_stats_dict(stats_7d),
                "30d": self._get_token_stats_dict(stats_30d),
                "lifetime": self._get_token_stats_dict(stats_lifetime, entries),
                "daily": daily_dicts,
                "providers": provider_info,
                "last_scan": last_scan,
            }
        except Exception:
            return None

    def _get_token_stats_dict(self, stats, entries=None) -> dict:
        result = {
            'total_prompt': stats.total_prompt,
            'total_output': stats.total_output,
            'total_thinking': stats.total_thinking,
            'total_cached': stats.total_cached,
            'total_tokens': stats.total_tokens,
            'turns': stats.turns,
            'by_model': stats.by_model,
        }
        if entries is not None:
            from collections import defaultdict
            by_model = defaultdict(lambda: {"prompt": 0, "output": 0, "thinking": 0, "turns": 0})
            for entry in entries:
                key = f"[{entry.provider}] {entry.model}"
                m = by_model[key]
                m["prompt"] += entry.prompt_tokens
                m["output"] += entry.output_tokens
                m["thinking"] += entry.thinking_tokens
                m["cached"] = m.get("cached", 0) + entry.cached_tokens
                m["turns"] += 1
            result['by_model'] = dict(by_model)
        return result

    def toggle_token_slideout(self):
        if getattr(self, "token_slideout_open", False):
            self._slide_in_token_tracker()
        else:
            if getattr(self, "haptics_slideout_open", False):
                self._slide_in_haptics_tuning()
            self._slide_out_token_tracker()

    def _slide_out_token_tracker(self):
        if not TOKEN_TRACKER_AVAILABLE or SlideOutTokenPopup is None:
            messagebox.showinfo("Token Tracker", "Token Tracker module not available.")
            return

        data_pack = self._load_token_tracker_data()
        if not data_pack:
            messagebox.showinfo("Token Tracker", "No cached token data found. Launch Token Tracker first to build initial cache.")
            return

        cc_x = self.root.winfo_x()
        cc_y = self.root.winfo_y()
        cc_h = self.root.winfo_height()
        target_w = 450
        target_x = cc_x - target_w - 6
        target_y = cc_y

        if hasattr(self, "token_slideout") and self.token_slideout and self.token_slideout.root.winfo_exists():
            try:
                self.token_slideout.root.destroy()
            except Exception:
                pass

        init_geom = f"{target_w}x{cc_h}+{cc_x}+{cc_y}"
        self.token_slideout = SlideOutTokenPopup(
            stats_today=data_pack["today"],
            stats_7d=data_pack["7d"],
            stats_30d=data_pack["30d"],
            stats_lifetime=data_pack["lifetime"],
            daily_breakdown=data_pack["daily"],
            refresh_interval_minutes=60,
            last_scan_time=data_pack["last_scan"],
            provider_breakdown=data_pack["providers"],
            parent=self.root,
            on_close_request=self._slide_in_token_tracker,
            init_geom=init_geom
        )

        self.token_slideout.root.lower(self.root)

        if hasattr(self, "btn_token_slideout"):
            self.btn_token_slideout.config(text="⌛ Sliding...", fg=COLORS["accent_amber"], bg="#38291a")

        total_steps = 15
        def _step_anim(step=0):
            if step >= total_steps or not self.token_slideout or not self.token_slideout.root.winfo_exists():
                if self.token_slideout and self.token_slideout.root.winfo_exists():
                    self.token_slideout.root.geometry(f"{target_w}x{cc_h}+{target_x}+{target_y}")
                    self.token_slideout.root.lift()
                self.token_slideout_open = True
                if hasattr(self, "btn_token_slideout"):
                    self.btn_token_slideout.config(text="▶️ Retract", fg=COLORS["accent_amber"], bg="#38291a")
                return
            t = step / total_steps
            ease = 1.0 - (1.0 - t) ** 3
            cur_x = int(cc_x + (target_x - cc_x) * ease)
            self.token_slideout.root.geometry(f"{target_w}x{cc_h}+{cur_x}+{target_y}")
            self.root.after(12, _step_anim, step + 1)

        _step_anim()

    def _slide_in_token_tracker(self):
        if not hasattr(self, "token_slideout") or not self.token_slideout or not self.token_slideout.root.winfo_exists():
            self.token_slideout_open = False
            if hasattr(self, "btn_token_slideout"):
                self.btn_token_slideout.config(text="◀️ Pop Out", fg=COLORS["accent_blue"], bg="#2e3450")
            return

        cc_x = self.root.winfo_x()
        cc_y = self.root.winfo_y()
        cc_h = self.root.winfo_height()
        target_w = 450
        start_x = self.token_slideout.root.winfo_x()
        target_x = cc_x

        self.token_slideout.root.lower(self.root)

        total_steps = 12
        def _step_retract(step=0):
            if step >= total_steps or not self.token_slideout or not self.token_slideout.root.winfo_exists():
                if self.token_slideout and self.token_slideout.root.winfo_exists():
                    try:
                        self.token_slideout.root.destroy()
                    except Exception:
                        pass
                self.token_slideout = None
                self.token_slideout_open = False
                if hasattr(self, "btn_token_slideout"):
                    self.btn_token_slideout.config(text="◀️ Pop Out", fg=COLORS["accent_blue"], bg="#2e3450")
                return
            t = step / total_steps
            ease = t ** 2
            cur_x = int(start_x + (target_x - start_x) * ease)
            self.token_slideout.root.geometry(f"{target_w}x{cc_h}+{cur_x}+{cc_y}")
            self.root.after(12, _step_retract, step + 1)

        _step_retract()

    def restart_all_daemons(self):
        self.stop_tether_daemon()
        self.stop_sentinel_daemon()
        self.stop_energy_daemon()
        self.stop_haptics_daemon()
        self.stop_token_tracker()
        time.sleep(1)
        self.start_tether_daemon()
        self.start_sentinel_daemon()
        self.start_energy_daemon()
        self.start_haptics_daemon()
        self.start_token_tracker()

    def trigger_5g_nudge(self):
        threading.Thread(target=lambda: self._run_adb_cmd(["shell", "svc wifi disable; sleep 1; svc wifi enable"]), daemon=True).start()

    def trigger_retrigger_tether(self):
        threading.Thread(target=lambda: self._run_adb_cmd(["shell", "svc usb setFunctions ncm,adb"]), daemon=True).start()

    def trigger_screen_sleep(self):
        threading.Thread(target=lambda: self._run_adb_cmd(["shell", "input keyevent 223"]), daemon=True).start()

    def trigger_test_haptic(self):
        # Gestolumina PWM continuous ramp envelope (attack -> peak -> decay -> release)
        cmd = "cmd vibrator_manager synced -f -B waveform -a -c 8 60 20 220 16 100 10 35 8 0"
        threading.Thread(target=lambda: self._run_adb_cmd(["shell", cmd]), daemon=True).start()

    def open_log_file(self, log_path: str):
        try:
            if os.path.exists(log_path):
                os.startfile(log_path)
            else:
                messagebox.showinfo("Log File", f"Log file not yet created at:\n{log_path}")
        except Exception as e:
            messagebox.showerror("Error", f"Could not open log file: {e}")

    # --- Haptics Config, Power Toggle & Real-Time PWM Visualizer ---
    def load_haptics_config(self) -> dict:
        default_cfg = {
            "enabled": True,
            "amplitude_scale": 2.0,
            "base_amplitude": 70,
            "punch_duration_ms": 90,
            "noise_floor": 0.010,
            "min_velocity": 0.018,
            "enable_snap_primitives": True,
            "sub_bass_low_hz": 30,
            "sub_bass_high_hz": 90,
            "mid_punch_high_hz": 220,
            "snap_high_hz": 1200,
            "mode": "gestolumina_pwm"
        }
        if os.path.exists(HAPTICS_CONFIG):
            try:
                with open(HAPTICS_CONFIG, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    default_cfg.update(cfg)
            except Exception:
                pass
        return default_cfg

    def save_haptics_config(self, cfg: dict):
        try:
            with open(HAPTICS_CONFIG, "w", encoding="utf-8") as f:
                json.dump(cfg, f, indent=2)
        except Exception:
            pass

    def toggle_haptics_power(self):
        with self.lock:
            h_running = self.state.get("haptics_daemon_running", False)

        if not h_running:
            self.start_haptics_daemon()
            if hasattr(self, "btn_haptics_power"):
                self.btn_haptics_power.config(text="⌛ Starting...", fg=COLORS["accent_cyan"], bg="#173138")
            return

        cfg = self.load_haptics_config()
        cur_enabled = cfg.get("enabled", True)
        new_enabled = not cur_enabled
        cfg["enabled"] = new_enabled
        self.save_haptics_config(cfg)

        if hasattr(self, "btn_haptics_power"):
            if new_enabled:
                self.btn_haptics_power.config(text="🟢 Active", fg=COLORS["accent_green"], bg="#1c302a")
                self.lbl_haptics_badge.config(text="WASAPI Active", fg=COLORS["accent_pink"], bg="#321f2f")
            else:
                self.btn_haptics_power.config(text="⏸️ Paused", fg=COLORS["accent_amber"], bg="#38291a")
                self.lbl_haptics_badge.config(text="Haptics Paused", fg=COLORS["accent_amber"], bg="#38291a")

    def toggle_haptics_slideout(self):
        if getattr(self, "haptics_slideout_open", False):
            self._slide_in_haptics_tuning()
        else:
            if getattr(self, "token_slideout_open", False):
                self._slide_in_token_tracker()
            self._slide_out_haptics_tuning()

    def _slide_out_haptics_tuning(self):
        cc_x = self.root.winfo_x()
        cc_y = self.root.winfo_y()
        cc_h = self.root.winfo_height()
        target_w = 440
        target_x = cc_x - target_w - 6
        target_y = cc_y

        if hasattr(self, "haptics_slideout") and self.haptics_slideout and self.haptics_slideout.winfo_exists():
            try:
                self.haptics_slideout.destroy()
            except Exception:
                pass

        self.haptics_slideout = tk.Toplevel(self.root)
        self.haptics_slideout.title("Gestolumina Tactile Tuning")
        self.haptics_slideout.overrideredirect(True)
        self.haptics_slideout.attributes('-topmost', True)
        self.haptics_slideout.configure(bg=COLORS["bg"])
        init_geom = f"{target_w}x{cc_h}+{cc_x}+{cc_y}"
        self.haptics_slideout.geometry(init_geom)
        self.haptics_slideout.bind('<Escape>', lambda e: self._slide_in_haptics_tuning())

        self._build_haptics_slideout_ui(self.haptics_slideout)

        self.haptics_slideout.lower(self.root)

        if hasattr(self, "btn_tuning_slideout"):
            self.btn_tuning_slideout.config(text="⌛ Sliding...", fg=COLORS["accent_amber"], bg="#38291a")

        total_steps = 15
        def _step_anim(step=0):
            if step >= total_steps or not hasattr(self, "haptics_slideout") or not self.haptics_slideout or not self.haptics_slideout.winfo_exists():
                if hasattr(self, "haptics_slideout") and self.haptics_slideout and self.haptics_slideout.winfo_exists():
                    self.haptics_slideout.geometry(f"{target_w}x{cc_h}+{target_x}+{target_y}")
                    self.haptics_slideout.lift()
                self.haptics_slideout_open = True
                if hasattr(self, "btn_tuning_slideout"):
                    self.btn_tuning_slideout.config(text="▶️ Retract", fg=COLORS["accent_amber"], bg="#38291a")
                self.graph_running = True
                self._update_pwm_graph()
                return
            t = step / total_steps
            ease = 1.0 - (1.0 - t) ** 3
            cur_x = int(cc_x + (target_x - cc_x) * ease)
            self.haptics_slideout.geometry(f"{target_w}x{cc_h}+{cur_x}+{target_y}")
            self.root.after(12, _step_anim, step + 1)

        _step_anim()

    def _slide_in_haptics_tuning(self):
        if not hasattr(self, "haptics_slideout") or not self.haptics_slideout or not self.haptics_slideout.winfo_exists():
            self.haptics_slideout_open = False
            self.graph_running = False
            if hasattr(self, "btn_tuning_slideout"):
                self.btn_tuning_slideout.config(text="◀️ Tuning", fg=COLORS["accent_pink"], bg="#381f2f")
            return

        self.graph_running = False
        cc_x = self.root.winfo_x()
        cc_y = self.root.winfo_y()
        cc_h = self.root.winfo_height()
        target_w = 440
        start_x = self.haptics_slideout.winfo_x()
        target_x = cc_x

        self.haptics_slideout.lower(self.root)

        total_steps = 12
        def _step_retract(step=0):
            if step >= total_steps or not hasattr(self, "haptics_slideout") or not self.haptics_slideout or not self.haptics_slideout.winfo_exists():
                if hasattr(self, "haptics_slideout") and self.haptics_slideout and self.haptics_slideout.winfo_exists():
                    try:
                        self.haptics_slideout.destroy()
                    except Exception:
                        pass
                self.haptics_slideout = None
                self.haptics_slideout_open = False
                if hasattr(self, "btn_tuning_slideout"):
                    self.btn_tuning_slideout.config(text="◀️ Tuning", fg=COLORS["accent_pink"], bg="#381f2f")
                return
            t = step / total_steps
            ease = t ** 2
            cur_x = int(start_x + (target_x - start_x) * ease)
            self.haptics_slideout.geometry(f"{target_w}x{cc_h}+{cur_x}+{cc_y}")
            self.root.after(12, _step_retract, step + 1)

        _step_retract()

    def _build_haptics_slideout_ui(self, win):
        h_cfg = self.load_haptics_config()

        card = tk.Frame(win, bg=COLORS["card"], highlightbackground=COLORS["border"], highlightthickness=1)
        card.pack(fill="both", expand=True, padx=4, pady=4)

        # Header
        top_bar = tk.Frame(card, bg=COLORS["card"])
        top_bar.pack(fill="x", padx=10, pady=(8, 4))

        lbl_title = tk.Label(
            top_bar, text="⚡ Gestolumina Tactile & Visualizer",
            font=("Segoe UI", 9, "bold"), fg=COLORS["accent_pink"], bg=COLORS["card"]
        )
        lbl_title.pack(side="left")

        self.lbl_tuning_status = tk.Label(
            top_bar, text="Live Synced", font=("Segoe UI", 8),
            fg=COLORS["text_muted"], bg=COLORS["card"]
        )
        self.lbl_tuning_status.pack(side="left", padx=8)

        btn_close = tk.Button(
            top_bar, text="✕", font=("Segoe UI", 9, "bold"),
            bg=COLORS["card"], fg=COLORS["text_muted"], activebackground="#ff5555",
            activeforeground="#ffffff", relief="flat", bd=0, padx=6, pady=0, cursor="hand2",
            command=self._slide_in_haptics_tuning
        )
        btn_close.pack(side="right")

        # Subtitle
        lbl_sub = tk.Label(
            card, text="WASAPI loopback multi-band transient synthesis & tactile DSP",
            font=("Segoe UI", 7), fg=COLORS["text_secondary"], bg=COLORS["card"]
        )
        lbl_sub.pack(anchor="w", padx=10, pady=(0, 6))

        # Visualizer Canvas Container
        canvas_container = tk.Frame(card, bg="#101018", highlightbackground="#2a2b3d", highlightthickness=1)
        canvas_container.pack(fill="x", padx=10, pady=(0, 8))

        self.pwm_canvas = tk.Canvas(
            canvas_container, height=80, bg="#101018", highlightthickness=0, bd=0
        )
        self.pwm_canvas.pack(fill="x", expand=True)

        # Sliders Container
        sliders_box = tk.Frame(card, bg="#181825", highlightbackground="#2a2b3d", highlightthickness=1)
        sliders_box.pack(fill="x", padx=10, pady=(0, 8))

        # Row 1: Master Gain
        r1 = tk.Frame(sliders_box, bg="#181825")
        r1.pack(fill="x", padx=8, pady=(6, 2))
        tk.Label(r1, text="Master Gain:", font=("Segoe UI", 8), fg=COLORS["text_secondary"], bg="#181825", width=15, anchor="w").pack(side="left")
        self.lbl_scale_val = tk.Label(r1, text=f"{h_cfg.get('amplitude_scale', 2.0):.1f}x", font=("Segoe UI", 8, "bold"), fg=COLORS["accent_pink"], bg="#181825", width=6, anchor="e")
        self.lbl_scale_val.pack(side="right")
        self.slider_scale = tk.Scale(
            r1, from_=0.5, to=3.5, resolution=0.1, orient="horizontal",
            bg="#181825", fg="#181825", troughcolor="#11111b", highlightthickness=0, bd=0,
            activebackground=COLORS["accent_pink"], sliderlength=14, showvalue=0,
            command=self._on_haptic_slider_change
        )
        self.slider_scale.set(h_cfg.get("amplitude_scale", 2.0))
        self.slider_scale.pack(side="left", fill="x", expand=True, padx=4)

        # Row 2: Base Kick Floor
        r2 = tk.Frame(sliders_box, bg="#181825")
        r2.pack(fill="x", padx=8, pady=2)
        tk.Label(r2, text="Base Kick Floor:", font=("Segoe UI", 8), fg=COLORS["text_secondary"], bg="#181825", width=15, anchor="w").pack(side="left")
        self.lbl_base_val = tk.Label(r2, text=f"{h_cfg.get('base_amplitude', 70)} PWM", font=("Segoe UI", 8, "bold"), fg=COLORS["accent_cyan"], bg="#181825", width=6, anchor="e")
        self.lbl_base_val.pack(side="right")
        self.slider_base = tk.Scale(
            r2, from_=15, to=130, resolution=5, orient="horizontal",
            bg="#181825", fg="#181825", troughcolor="#11111b", highlightthickness=0, bd=0,
            activebackground=COLORS["accent_cyan"], sliderlength=14, showvalue=0,
            command=self._on_haptic_slider_change
        )
        self.slider_base.set(h_cfg.get("base_amplitude", 70))
        self.slider_base.pack(side="left", fill="x", expand=True, padx=4)

        # Row 3: Sustained Hold
        r3 = tk.Frame(sliders_box, bg="#181825")
        r3.pack(fill="x", padx=8, pady=2)
        tk.Label(r3, text="Sustained Hold:", font=("Segoe UI", 8), fg=COLORS["text_secondary"], bg="#181825", width=15, anchor="w").pack(side="left")
        self.lbl_dur_val = tk.Label(r3, text=f"{h_cfg.get('punch_duration_ms', 90)} ms", font=("Segoe UI", 8, "bold"), fg=COLORS["accent_green"], bg="#181825", width=6, anchor="e")
        self.lbl_dur_val.pack(side="right")
        self.slider_dur = tk.Scale(
            r3, from_=40, to=150, resolution=5, orient="horizontal",
            bg="#181825", fg="#181825", troughcolor="#11111b", highlightthickness=0, bd=0,
            activebackground=COLORS["accent_green"], sliderlength=14, showvalue=0,
            command=self._on_haptic_slider_change
        )
        self.slider_dur.set(h_cfg.get("punch_duration_ms", 90))
        self.slider_dur.pack(side="left", fill="x", expand=True, padx=4)

        # Row 4: Trigger Sens
        r4 = tk.Frame(sliders_box, bg="#181825")
        r4.pack(fill="x", padx=8, pady=2)
        tk.Label(r4, text="Trigger Sens:", font=("Segoe UI", 8), fg=COLORS["text_secondary"], bg="#181825", width=15, anchor="w").pack(side="left")
        self.lbl_vel_val = tk.Label(r4, text=f"{h_cfg.get('min_velocity', 0.018):.3f}", font=("Segoe UI", 8, "bold"), fg=COLORS["accent_amber"], bg="#181825", width=6, anchor="e")
        self.lbl_vel_val.pack(side="right")
        self.slider_vel = tk.Scale(
            r4, from_=0.010, to=0.080, resolution=0.005, orient="horizontal",
            bg="#181825", fg="#181825", troughcolor="#11111b", highlightthickness=0, bd=0,
            activebackground=COLORS["accent_amber"], sliderlength=14, showvalue=0,
            command=self._on_haptic_slider_change
        )
        self.slider_vel.set(h_cfg.get("min_velocity", 0.018))
        self.slider_vel.pack(side="left", fill="x", expand=True, padx=4)

        # Row 5: Sub-Bass Cutoff
        r5 = tk.Frame(sliders_box, bg="#181825")
        r5.pack(fill="x", padx=8, pady=(2, 6))
        tk.Label(r5, text="Sub-Bass Cutoff:", font=("Segoe UI", 8), fg=COLORS["text_secondary"], bg="#181825", width=15, anchor="w").pack(side="left")
        self.lbl_sub_val = tk.Label(r5, text=f"{h_cfg.get('sub_bass_high_hz', 90)} Hz", font=("Segoe UI", 8, "bold"), fg=COLORS["accent_purple"], bg="#181825", width=6, anchor="e")
        self.lbl_sub_val.pack(side="right")
        self.slider_sub = tk.Scale(
            r5, from_=50, to=150, resolution=5, orient="horizontal",
            bg="#181825", fg="#181825", troughcolor="#11111b", highlightthickness=0, bd=0,
            activebackground=COLORS["accent_purple"], sliderlength=14, showvalue=0,
            command=self._on_haptic_slider_change
        )
        self.slider_sub.set(h_cfg.get("sub_bass_high_hz", 90))
        self.slider_sub.pack(side="left", fill="x", expand=True, padx=4)

        # Snare Hardware Primitives
        r_snare = tk.Frame(card, bg=COLORS["card"])
        r_snare.pack(fill="x", padx=10, pady=(0, 6))
        self.var_snap_prim = tk.BooleanVar(value=h_cfg.get("enable_snap_primitives", True))
        chk_snap = tk.Checkbutton(
            r_snare, text="Crisp Hardware Primitives (TICK / CLICK for Snares)",
            variable=self.var_snap_prim, font=("Segoe UI", 7), bg=COLORS["card"], fg=COLORS["text_secondary"],
            selectcolor="#11111b", activebackground=COLORS["card"], activeforeground=COLORS["accent_cyan"],
            bd=0, highlightthickness=0, command=self._on_haptic_slider_change
        )
        chk_snap.pack(anchor="w")

        # Presets & Live Test Hit
        r_presets = tk.Frame(card, bg=COLORS["card"])
        r_presets.pack(fill="x", padx=10, pady=(0, 8))

        btn_pre_bal = tk.Button(
            r_presets, text="🎵 Balanced", font=("Segoe UI", 7),
            bg="#232634", fg=COLORS["text_primary"], relief="flat", padx=6, pady=2, cursor="hand2",
            command=lambda: self.apply_haptic_preset("balanced")
        )
        btn_pre_bal.pack(side="left", padx=(0, 4))

        btn_pre_hvy = tk.Button(
            r_presets, text="💥 Heavy Sub", font=("Segoe UI", 7),
            bg="#232634", fg=COLORS["accent_pink"], relief="flat", padx=6, pady=2, cursor="hand2",
            command=lambda: self.apply_haptic_preset("heavy")
        )
        btn_pre_hvy.pack(side="left", padx=(0, 4))

        btn_pre_sub = tk.Button(
            r_presets, text="⚡ Subtle", font=("Segoe UI", 7),
            bg="#232634", fg=COLORS["accent_cyan"], relief="flat", padx=6, pady=2, cursor="hand2",
            command=lambda: self.apply_haptic_preset("subtle")
        )
        btn_pre_sub.pack(side="left", padx=(0, 4))

        btn_live_test = tk.Button(
            r_presets, text="📳 Live Test Hit", font=("Segoe UI", 7, "bold"),
            bg="#321f2f", fg=COLORS["accent_pink"], relief="flat", padx=8, pady=2, cursor="hand2",
            command=self.trigger_live_tuned_haptic
        )
        btn_live_test.pack(side="right")

        # Govee Reactive Sync Card
        govee_box = tk.Frame(card, bg="#181825", highlightbackground="#2a2b3d", highlightthickness=1)
        govee_box.pack(fill="x", padx=10, pady=(0, 4))

        govee_row = tk.Frame(govee_box, bg="#181825")
        govee_row.pack(fill="x", padx=8, pady=6)

        govee_on = h_cfg.get("govee_sync", False)
        g_text = "💡 Govee Sync: ON" if govee_on else "💡 Govee Sync: OFF"
        g_fg = "#ffd740" if govee_on else COLORS["text_muted"]
        g_bg = "#3d3319" if govee_on else "#232634"

        self.btn_govee_sync = tk.Button(
            govee_row, text=g_text, font=("Segoe UI", 7, "bold"),
            bg=g_bg, fg=g_fg, relief="flat", padx=8, pady=2, cursor="hand2",
            command=self.toggle_govee_sync
        )
        self.btn_govee_sync.pack(side="left")

        tk.Label(
            govee_row, text="Flow Plus light bars pulse with bass drops",
            font=("Segoe UI", 7), fg=COLORS["text_secondary"], bg="#181825"
        ).pack(side="left", padx=8)

    def _update_pwm_graph(self):
        if not getattr(self, "haptics_slideout_open", False) or not getattr(self, "graph_running", False):
            return

        # 1. Non-blocking drain of UDP socket
        if self.udp_sock:
            while True:
                try:
                    data, _ = self.udp_sock.recvfrom(1024)
                    self.last_telemetry = json.loads(data.decode("utf-8"))
                except (BlockingIOError, socket.error):
                    break
                except Exception:
                    break

        # 2. Extract values
        t = self.last_telemetry
        is_enabled = t.get("enabled", True)
        energy = float(t.get("energy", 0.0))
        pwm = int(t.get("pwm", 0))
        hit = bool(t.get("hit", False))
        peak = int(t.get("peak", 0))
        sub = float(t.get("sub", 0.0))
        vel = float(t.get("vel", 0.0))

        # Push to visual scrolling buffers
        norm_audio = min(1.0, energy * 2.8)
        self.audio_wave_hist.append(norm_audio)
        self.pwm_env_hist.append(pwm / 100.0)

        # 3. Canvas Rendering
        if hasattr(self, "pwm_canvas") and self.pwm_canvas.winfo_exists():
            w = self.pwm_canvas.winfo_width()
            h = self.pwm_canvas.winfo_height()
            if w <= 10: w = 420
            if h <= 10: h = 80

            self.pwm_canvas.delete("all")

            # Guide lines (25%, 50%, 75% duty cycle)
            for pct, color in [(0.25, "#181a28"), (0.50, "#222538"), (0.75, "#181a28")]:
                y_line = h - 6 - int(pct * (h - 16))
                self.pwm_canvas.create_line(0, y_line, w, y_line, fill=color, dash=(2, 4))

            # Audio Waveform Line (Cyan)
            n = len(self.audio_wave_hist)
            audio_pts = []
            for i, val in enumerate(self.audio_wave_hist):
                x = int(i * (w / max(1, n - 1)))
                y = int(h - 6 - val * (h - 18))
                audio_pts.extend([x, y])

            if len(audio_pts) >= 4:
                self.pwm_canvas.create_line(audio_pts, fill="#00c8ff", width=1)

            # Synthesized PWM Duty-Cycle Envelope (Neon Pink with Area Glow)
            pwm_pts = []
            for i, val in enumerate(self.pwm_env_hist):
                x = int(i * (w / max(1, n - 1)))
                y = int(h - 6 - val * (h - 16))
                pwm_pts.extend([x, y])

            if len(pwm_pts) >= 4:
                poly_pts = [0, h - 6] + pwm_pts + [w, h - 6]
                self.pwm_canvas.create_polygon(poly_pts, fill="#2c1424", outline="")
                self.pwm_canvas.create_line(pwm_pts, fill="#ff2a85", width=2)

            # Telemetry HUD Text
            if is_enabled:
                if pwm > 0 or hit:
                    txt_pwm = f"⚡ PWM: {pwm}%  [PEAK {peak}]"
                    color_pwm = COLORS["accent_pink"]
                else:
                    txt_pwm = "⚡ PWM: IDLE (0%)"
                    color_pwm = COLORS["text_muted"]
            else:
                txt_pwm = "⏸️ HAPTICS PAUSED / MUTED"
                color_pwm = COLORS["accent_amber"]

            self.pwm_canvas.create_text(
                8, 6, text=txt_pwm, anchor="nw",
                fill=color_pwm, font=("Segoe UI", 7, "bold")
            )

            txt_info = f"Sub: {int(sub * 100)}%  •  Vel: {vel:.3f}"
            self.pwm_canvas.create_text(
                w - 8, 6, text=txt_info, anchor="ne",
                fill=COLORS["text_secondary"], font=("Segoe UI", 7)
            )

        # 4. Schedule next frame (~33 FPS)
        if getattr(self, "haptics_slideout_open", False) and self.graph_running:
            self.root.after(30, self._update_pwm_graph)

    def _on_haptic_slider_change(self, val=None):
        if not hasattr(self, "slider_scale"):
            return
        try:
            scale = round(float(self.slider_scale.get()), 1)
            base_amp = int(self.slider_base.get())
            punch_dur = int(self.slider_dur.get()) if hasattr(self, "slider_dur") else 90
            min_vel = round(float(self.slider_vel.get()), 3)
            sub_cutoff = int(self.slider_sub.get())
            snap_enabled = bool(self.var_snap_prim.get())

            self.lbl_scale_val.config(text=f"{scale:.1f}x")
            self.lbl_base_val.config(text=f"{base_amp} PWM")
            if hasattr(self, "lbl_dur_val"):
                self.lbl_dur_val.config(text=f"{punch_dur} ms")
            self.lbl_vel_val.config(text=f"{min_vel:.3f}")
            self.lbl_sub_val.config(text=f"{sub_cutoff} Hz")

            if hasattr(self, "_save_timer") and self._save_timer:
                self.root.after_cancel(self._save_timer)

            def do_save():
                cfg = self.load_haptics_config()
                cfg["amplitude_scale"] = scale
                cfg["base_amplitude"] = base_amp
                cfg["punch_duration_ms"] = punch_dur
                cfg["min_velocity"] = min_vel
                cfg["sub_bass_high_hz"] = sub_cutoff
                cfg["enable_snap_primitives"] = snap_enabled
                self.save_haptics_config(cfg)
                if hasattr(self, "lbl_tuning_status"):
                    self.lbl_tuning_status.config(text="● Saved", fg=COLORS["accent_green"])
                    self.root.after(1200, lambda: self.lbl_tuning_status.config(text="Live Synced", fg=COLORS["text_muted"]))

            self.lbl_tuning_status.config(text="Updating...", fg=COLORS["accent_amber"])
            self._save_timer = self.root.after(75, do_save)
        except Exception:
            pass

    def apply_haptic_preset(self, preset_name: str):
        try:
            if preset_name == "balanced":
                self.slider_scale.set(2.0)
                self.slider_base.set(70)
                if hasattr(self, "slider_dur"): self.slider_dur.set(90)
                self.slider_vel.set(0.018)
                self.slider_sub.set(90)
                self.var_snap_prim.set(True)
            elif preset_name == "heavy":
                self.slider_scale.set(2.8)
                self.slider_base.set(95)
                if hasattr(self, "slider_dur"): self.slider_dur.set(125)
                self.slider_vel.set(0.012)
                self.slider_sub.set(105)
                self.var_snap_prim.set(True)
            elif preset_name == "subtle":
                self.slider_scale.set(1.2)
                self.slider_base.set(40)
                if hasattr(self, "slider_dur"): self.slider_dur.set(55)
                self.slider_vel.set(0.030)
                self.slider_sub.set(75)
                self.var_snap_prim.set(True)
            self._on_haptic_slider_change()
        except Exception:
            pass

    def trigger_live_tuned_haptic(self):
        try:
            base_amp = int(self.slider_base.get()) if hasattr(self, "slider_base") else 70
            punch_dur = int(self.slider_dur.get()) if hasattr(self, "slider_dur") else 90
            scale = float(self.slider_scale.get()) if hasattr(self, "slider_scale") else 2.0
            peak_amp = int(min(255, base_amp + (255 - base_amp) * min(1.0, scale / 2.0)))
            a1 = max(30, int(peak_amp * 0.55))
            a2 = peak_amp
            a3 = max(18, int(peak_amp * 0.42))
            a4 = max(10, int(peak_amp * 0.20))
            cmd = f"cmd vibrator_manager synced -f -B waveform -a -c 10 {a1} {punch_dur} {a2} 24 {a3} 12 {a4} 8 0"
            threading.Thread(target=lambda: self._run_adb_cmd(["shell", cmd]), daemon=True).start()
        except Exception:
            pass

    def toggle_govee_sync(self):
        try:
            cfg = self.load_haptics_config()
            new_state = not cfg.get("govee_sync", False)
            cfg["govee_sync"] = new_state
            self.save_haptics_config(cfg)
            if hasattr(self, "btn_govee_sync"):
                if new_state:
                    self.btn_govee_sync.config(text="💡 Govee Sync: ON", fg="#ffd740", bg="#3d3319")
                else:
                    self.btn_govee_sync.config(text="💡 Govee Sync: OFF", fg=COLORS["text_muted"], bg="#232634")
            if hasattr(self, "lbl_tuning_status"):
                self.lbl_tuning_status.config(text=f"● Govee {'ON' if new_state else 'OFF'}", fg=COLORS["accent_amber"])
                self.root.after(1200, lambda: self.lbl_tuning_status.config(text="Live Synced", fg=COLORS["text_muted"]))
        except Exception:
            pass

    # --- GUI Layout (Borderless HUD) ---
    def _build_gui(self):
        # Outer container with crisp 1px border
        self.main_container = tk.Frame(
            self.root, bg=COLORS["bg"],
            highlightbackground=COLORS["border"], highlightthickness=1
        )
        self.main_container.pack(fill="both", expand=True)

        # Header Bar (Draggable, No Master Badge, Clean [X] Button)
        header_frame = tk.Frame(self.main_container, bg=COLORS["bg"], cursor="fleur")
        header_frame.pack(fill="x", padx=14, pady=(8, 2))
        header_frame.bind("<ButtonPress-1>", self._on_drag_start)
        header_frame.bind("<B1-Motion>", self._on_drag_motion)

        lbl_title = tk.Label(
            header_frame, text="⚡ Daemon Command Center",
            font=("Segoe UI", 11, "bold"), fg=COLORS["text_primary"], bg=COLORS["bg"]
        )
        lbl_title.pack(side="left")
        lbl_title.bind("<ButtonPress-1>", self._on_drag_start)
        lbl_title.bind("<B1-Motion>", self._on_drag_motion)

        # Sleek Close [X] Button (Minimizes to tray)
        btn_close = tk.Label(
            header_frame, text="✕", font=("Segoe UI", 11, "bold"),
            fg=COLORS["text_secondary"], bg=COLORS["bg"],
            padx=8, pady=1, cursor="hand2"
        )
        btn_close.pack(side="right")
        btn_close.bind("<Button-1>", lambda e: self.hide_window())
        btn_close.bind("<Enter>", lambda e: btn_close.config(fg=COLORS["accent_red"], bg=COLORS["card"]))
        btn_close.bind("<Leave>", lambda e: btn_close.config(fg=COLORS["text_secondary"], bg=COLORS["bg"]))

        cards_container = tk.Frame(self.main_container, bg=COLORS["bg"])
        cards_container.pack(fill="both", expand=True, padx=10, pady=1)

        # CARD 1: Device
        self.card_device = self._create_card(cards_container, "📱 Google Pixel 6a (Hardware)")
        self.card_device.pack(fill="x", pady=2)
        dev_grid = tk.Frame(self.card_device, bg=COLORS["card"])
        dev_grid.pack(fill="x", padx=8, pady=3)

        self.lbl_dev_status = tk.Label(dev_grid, text="Status: Connected", font=("Segoe UI", 8, "bold"), fg=COLORS["accent_green"], bg=COLORS["card"])
        self.lbl_dev_status.grid(row=0, column=0, sticky="w", pady=1)

        self.lbl_dev_battery = tk.Label(dev_grid, text="Battery: --%", font=("Segoe UI", 8, "bold"), fg=COLORS["text_secondary"], bg=COLORS["card"])
        self.lbl_dev_battery.grid(row=0, column=1, sticky="e", pady=1, padx=10)

        self.lbl_dev_serial = tk.Label(dev_grid, text="ADB Serial: ---", font=("Segoe UI", 7), fg=COLORS["text_muted"], bg=COLORS["card"])
        self.lbl_dev_serial.grid(row=1, column=0, columnspan=2, sticky="w")

        # CARD 2: USB Tether
        self.card_tether = self._create_card(cards_container, "🔌 USB Tethering (auto_tether.py)")
        self.card_tether.pack(fill="x", pady=2)
        tether_body = tk.Frame(self.card_tether, bg=COLORS["card"])
        tether_body.pack(fill="x", padx=8, pady=3)

        self.lbl_tether_status = tk.Label(tether_body, text="Status: Running", font=("Segoe UI", 8), fg=COLORS["text_primary"], bg=COLORS["card"])
        self.lbl_tether_status.pack(anchor="w")

        self.lbl_tether_link = tk.Label(tether_body, text="Link: Active (NCM Host / Ethernet 6)", font=("Segoe UI", 8, "bold"), fg=COLORS["accent_green"], bg=COLORS["card"])
        self.lbl_tether_link.pack(anchor="w", pady=(1, 3))

        tether_btn_row = tk.Frame(tether_body, bg=COLORS["card"])
        tether_btn_row.pack(fill="x", pady=(1, 1))

        btn_retrigger = tk.Button(
            tether_btn_row, text="🔄 Re-trigger", font=("Segoe UI", 7, "bold"),
            bg="#2e3450", fg=COLORS["accent_blue"], relief="flat", padx=6, pady=2, cursor="hand2",
            command=self.trigger_retrigger_tether
        )
        btn_retrigger.pack(side="left", padx=(0, 4))

        btn_tether_log = tk.Button(
            tether_btn_row, text="📜 History / Log", font=("Segoe UI", 7),
            bg="#2e3450", fg=COLORS["text_secondary"], relief="flat", padx=6, pady=2, cursor="hand2",
            command=lambda: self.open_log_file(TETHER_LOG)
        )
        btn_tether_log.pack(side="left")

        # CARD 3: Wi-Fi Sentinel
        self.card_sentinel = self._create_card(cards_container, "📶 Wi-Fi 5GHz Sentinel (Watch-PhoneWifi5G.ps1)")
        self.card_sentinel.pack(fill="x", pady=2)
        sentinel_body = tk.Frame(self.card_sentinel, bg=COLORS["card"])
        sentinel_body.pack(fill="x", padx=8, pady=3)

        sentinel_top = tk.Frame(sentinel_body, bg=COLORS["card"])
        sentinel_top.pack(fill="x")

        self.lbl_sentinel_status = tk.Label(sentinel_top, text="Status: Running", font=("Segoe UI", 8), fg=COLORS["text_primary"], bg=COLORS["card"])
        self.lbl_sentinel_status.pack(side="left")

        self.lbl_wifi_band_badge = tk.Label(
            sentinel_top, text="5 GHz", font=("Segoe UI", 7, "bold"),
            fg=COLORS["accent_green"], bg="#1c302a", padx=5, pady=1
        )
        self.lbl_wifi_band_badge.pack(side="right")

        self.lbl_wifi_metrics = tk.Label(
            sentinel_body, text="SSID: Dolphin • 5580 MHz • Rx: 432 Mbps • Score: 100",
            font=("Segoe UI", 7), fg=COLORS["text_secondary"], bg=COLORS["card"]
        )
        self.lbl_wifi_metrics.pack(anchor="w", pady=(1, 3))

        sentinel_btn_row = tk.Frame(sentinel_body, bg=COLORS["card"])
        sentinel_btn_row.pack(fill="x", pady=(1, 1))

        btn_nudge = tk.Button(
            sentinel_btn_row, text="⚡ 5GHz Nudge", font=("Segoe UI", 7, "bold"),
            bg="#2e3450", fg=COLORS["accent_purple"], relief="flat", padx=6, pady=2, cursor="hand2",
            command=self.trigger_5g_nudge
        )
        btn_nudge.pack(side="left", padx=(0, 4))

        btn_sentinel_log = tk.Button(
            sentinel_btn_row, text="📜 History / Log", font=("Segoe UI", 7),
            bg="#2e3450", fg=COLORS["text_secondary"], relief="flat", padx=6, pady=2, cursor="hand2",
            command=lambda: self.open_log_file(SENTINEL_LOG)
        )
        btn_sentinel_log.pack(side="left")

        # CARD 4: Energy Governor
        self.card_energy = self._create_card(cards_container, "⚡ Phone Energy Governor (energy_daemon.py)")
        self.card_energy.pack(fill="x", pady=2)
        energy_body = tk.Frame(self.card_energy, bg=COLORS["card"])
        energy_body.pack(fill="x", padx=8, pady=3)

        energy_top = tk.Frame(energy_body, bg=COLORS["card"])
        energy_top.pack(fill="x")

        self.lbl_energy_status = tk.Label(energy_top, text="Status: Running", font=("Segoe UI", 8), fg=COLORS["text_primary"], bg=COLORS["card"])
        self.lbl_energy_status.pack(side="left")

        self.lbl_eco_badge = tk.Label(
            energy_top, text="Eco Active", font=("Segoe UI", 7, "bold"),
            fg=COLORS["accent_cyan"], bg="#173138", padx=5, pady=1
        )
        self.lbl_eco_badge.pack(side="right")

        self.lbl_energy_metrics = tk.Label(
            energy_body, text="Profile: Screen Sleep • Low Power CPU • Extra Radios OFF",
            font=("Segoe UI", 7), fg=COLORS["text_secondary"], bg=COLORS["card"]
        )
        self.lbl_energy_metrics.pack(anchor="w", pady=(1, 3))

        energy_btn_row = tk.Frame(energy_body, bg=COLORS["card"])
        energy_btn_row.pack(fill="x", pady=(1, 1))

        btn_screen_sleep = tk.Button(
            energy_btn_row, text="🌙 Sleep Screen", font=("Segoe UI", 7, "bold"),
            bg="#2e3450", fg=COLORS["accent_cyan"], relief="flat", padx=6, pady=2, cursor="hand2",
            command=self.trigger_screen_sleep
        )
        btn_screen_sleep.pack(side="left", padx=(0, 4))

        btn_energy_log = tk.Button(
            energy_btn_row, text="📜 History / Log", font=("Segoe UI", 7),
            bg="#2e3450", fg=COLORS["text_secondary"], relief="flat", padx=6, pady=2, cursor="hand2",
            command=lambda: self.open_log_file(ENERGY_LOG)
        )
        btn_energy_log.pack(side="left")

        # CARD 5: Audio to Haptics
        self.card_haptics = self._create_card(cards_container, "📳 Audio to Haptics (audio_haptics_daemon.py)")
        self.card_haptics.pack(fill="x", pady=2)
        haptics_body = tk.Frame(self.card_haptics, bg=COLORS["card"])
        haptics_body.pack(fill="x", padx=8, pady=3)

        haptics_top = tk.Frame(haptics_body, bg=COLORS["card"])
        haptics_top.pack(fill="x")

        self.lbl_haptics_status = tk.Label(haptics_top, text="Status: Running", font=("Segoe UI", 8), fg=COLORS["text_primary"], bg=COLORS["card"])
        self.lbl_haptics_status.pack(side="left")

        self.lbl_haptics_badge = tk.Label(
            haptics_top, text="WASAPI Active", font=("Segoe UI", 7, "bold"),
            fg=COLORS["accent_pink"], bg="#321f2f", padx=5, pady=1
        )
        self.lbl_haptics_badge.pack(side="right")

        self.lbl_haptics_metrics = tk.Label(
            haptics_body, text="Source: WASAPI Loopback • Filter: Sub-Bass (<180Hz) • Latency: <15ms",
            font=("Segoe UI", 7), fg=COLORS["text_secondary"], bg=COLORS["card"]
        )
        self.lbl_haptics_metrics.pack(anchor="w", pady=(1, 3))

        haptics_btn_row = tk.Frame(haptics_body, bg=COLORS["card"])
        haptics_btn_row.pack(fill="x", pady=(1, 1))

        # 1-Click Power / Mute Toggle Button
        h_cfg = self.load_haptics_config()
        init_power_txt = "🟢 Active" if h_cfg.get("enabled", True) else "⏸️ Paused"
        init_power_fg = COLORS["accent_green"] if h_cfg.get("enabled", True) else COLORS["accent_amber"]
        init_power_bg = "#1c302a" if h_cfg.get("enabled", True) else "#38291a"

        self.btn_haptics_power = tk.Button(
            haptics_btn_row, text=init_power_txt, font=("Segoe UI", 7, "bold"),
            bg=init_power_bg, fg=init_power_fg, relief="flat", padx=6, pady=2, cursor="hand2",
            command=self.toggle_haptics_power
        )
        self.btn_haptics_power.pack(side="left", padx=(0, 4))

        btn_test_haptic = tk.Button(
            haptics_btn_row, text="📳 Test Hit", font=("Segoe UI", 7, "bold"),
            bg="#2e3450", fg=COLORS["accent_pink"], relief="flat", padx=6, pady=2, cursor="hand2",
            command=self.trigger_test_haptic
        )
        btn_test_haptic.pack(side="left", padx=(0, 4))

        btn_haptics_log = tk.Button(
            haptics_btn_row, text="📜 History", font=("Segoe UI", 7),
            bg="#2e3450", fg=COLORS["text_secondary"], relief="flat", padx=6, pady=2, cursor="hand2",
            command=lambda: self.open_log_file(HAPTICS_LOG)
        )
        btn_haptics_log.pack(side="left")

        # Slide-out toggle button for tuning controls
        self.btn_tuning_slideout = tk.Button(
            haptics_btn_row, text="◀️ Tuning", font=("Segoe UI", 7, "bold"),
            bg="#381f2f", fg=COLORS["accent_pink"], relief="flat", padx=6, pady=2, cursor="hand2",
            command=self.toggle_haptics_slideout
        )
        self.btn_tuning_slideout.pack(side="left", padx=(4, 0))

        # CARD 6: LLM Token Tracker
        self.card_token = self._create_card(cards_container, "🧮 LLM Token Tracker (AntiGravity & Cursor)")
        self.card_token.pack(fill="x", pady=2)
        token_body = tk.Frame(self.card_token, bg=COLORS["card"])
        token_body.pack(fill="x", padx=8, pady=3)

        token_top = tk.Frame(token_body, bg=COLORS["card"])
        token_top.pack(fill="x")

        self.lbl_token_status = tk.Label(token_top, text="Status: Running", font=("Segoe UI", 8), fg=COLORS["text_primary"], bg=COLORS["card"])
        self.lbl_token_status.pack(side="left")

        self.lbl_token_badge = tk.Label(
            token_top, text="38.5k Cached", font=("Segoe UI", 7, "bold"),
            fg=COLORS["accent_purple"], bg="#2d2238", padx=5, pady=1
        )
        self.lbl_token_badge.pack(side="right")

        self.lbl_token_metrics = tk.Label(
            token_body, text="Providers: AntiGravity + Cursor • Cache: Loading... • Scan: Active",
            font=("Segoe UI", 7), fg=COLORS["text_secondary"], bg=COLORS["card"]
        )
        self.lbl_token_metrics.pack(anchor="w", pady=(1, 3))

        token_btn_row = tk.Frame(token_body, bg=COLORS["card"])
        token_btn_row.pack(fill="x", pady=(1, 1))

        self.btn_token_power = tk.Button(
            token_btn_row, text="🟢 Running", font=("Segoe UI", 7, "bold"),
            bg="#1c302a", fg=COLORS["accent_green"], relief="flat", padx=6, pady=2, cursor="hand2",
            command=self.toggle_token_power
        )
        self.btn_token_power.pack(side="left", padx=(0, 4))

        btn_token_log = tk.Button(
            token_btn_row, text="📜 History / Log", font=("Segoe UI", 7),
            bg="#2e3450", fg=COLORS["text_secondary"], relief="flat", padx=6, pady=2, cursor="hand2",
            command=lambda: self.open_log_file(TOKEN_LOG)
        )
        btn_token_log.pack(side="left")

        self.btn_token_slideout = tk.Button(
            token_btn_row, text="◀️ Pop Out", font=("Segoe UI", 7, "bold"),
            bg="#2e3450", fg=COLORS["accent_blue"], relief="flat", padx=6, pady=2, cursor="hand2",
            command=self.toggle_token_slideout
        )
        self.btn_token_slideout.pack(side="left", padx=(4, 0))

        # CARD 7: Live Activity History Stream
        self.card_history = self._create_card(cards_container, "📜 Recent Activity Stream")
        self.card_history.pack(fill="both", expand=True, pady=2)
        hist_body = tk.Frame(self.card_history, bg=COLORS["card"])
        hist_body.pack(fill="both", expand=True, padx=8, pady=3)

        self.txt_history = tk.Text(
            hist_body, height=3, bg="#1a1a28", fg=COLORS["text_secondary"],
            font=("Consolas", 8), relief="flat", highlightthickness=1,
            highlightbackground=COLORS["border"], wrap="word"
        )
        self.txt_history.pack(fill="both", expand=True)

        # Footer
        footer = tk.Frame(self.main_container, bg=COLORS["bg"])
        footer.pack(fill="x", padx=12, pady=(4, 6))

        self.lbl_updated = tk.Label(footer, text="Updated: --:--:--", font=("Segoe UI", 7), fg=COLORS["text_muted"], bg=COLORS["bg"])
        self.lbl_updated.pack(side="left")

        btn_restart = tk.Button(
            footer, text="🔄 Restart All", font=("Segoe UI", 7),
            bg=COLORS["card"], fg=COLORS["text_primary"], relief="flat", padx=8, pady=2,
            cursor="hand2", command=self.restart_all_daemons
        )
        btn_restart.pack(side="right", padx=(4, 0))

        btn_hide = tk.Button(
            footer, text="Minimize to Tray", font=("Segoe UI", 7),
            bg=COLORS["card"], fg=COLORS["text_muted"], relief="flat", padx=8, pady=2,
            cursor="hand2", command=self.hide_window
        )
        btn_hide.pack(side="right")

        self._refresh_gui()

    def _create_card(self, parent: tk.Widget, title: str) -> tk.Frame:
        card = tk.Frame(parent, bg=COLORS["card"], highlightbackground=COLORS["border"], highlightthickness=1)
        header = tk.Frame(card, bg=COLORS["card"])
        header.pack(fill="x", padx=8, pady=(3, 1))
        lbl = tk.Label(header, text=title, font=("Segoe UI", 8, "bold"), fg=COLORS["text_primary"], bg=COLORS["card"])
        lbl.pack(side="left")
        return card

    def _refresh_gui(self):
        with self.lock:
            s = self.state.copy()

        cur_val = s["battery_current_ma"]
        cur_sign = "+" if cur_val > 0 else ""
        cur_color = COLORS["accent_green"] if cur_val > 0 else COLORS["accent_amber"]

        if s["device_connected"]:
            self.lbl_dev_status.config(text=f"Status: Connected ({s['device_model']})", fg=COLORS["accent_green"])
            self.lbl_dev_battery.config(
                text=f"Battery: {s['battery_level']}% ({s['battery_status']} {cur_sign}{cur_val} mA)",
                fg=cur_color
            )
            self.lbl_dev_serial.config(text=f"ADB Serial: {s['device_serial']}")
        else:
            self.lbl_dev_status.config(text="Status: Searching for USB Plug-in...", fg=COLORS["accent_red"])
            self.lbl_dev_battery.config(text="Battery: --%", fg=COLORS["text_secondary"])
            self.lbl_dev_serial.config(text="ADB Serial: Disconnected")

        if s["tether_daemon_running"]:
            pid_str = f"PID: {s['tether_pid']}" if s["tether_pid"] else "Active"
            self.lbl_tether_status.config(text=f"Status: Running ({pid_str})", fg=COLORS["accent_green"])
        else:
            self.lbl_tether_status.config(text="Status: Stopped", fg=COLORS["accent_red"])

        if s["tether_active"]:
            self.lbl_tether_link.config(text="Link: Active (NCM Host / Ethernet 6)", fg=COLORS["accent_green"])
        else:
            self.lbl_tether_link.config(text="Link: Inactive", fg=COLORS["accent_amber"])

        if s["sentinel_daemon_running"]:
            pid_str = f"PID: {s['sentinel_pid']}" if s["sentinel_pid"] else "Active"
            self.lbl_sentinel_status.config(text=f"Status: Running ({pid_str})", fg=COLORS["accent_green"])
        else:
            self.lbl_sentinel_status.config(text="Status: Stopped", fg=COLORS["accent_red"])

        if s["energy_daemon_running"]:
            pid_str = f"PID: {s['energy_pid']}" if s["energy_pid"] else "Active"
            self.lbl_energy_status.config(text=f"Status: Running ({pid_str})", fg=COLORS["accent_green"])
            self.lbl_eco_badge.config(text="Eco Active", fg=COLORS["accent_cyan"], bg="#173138")
        else:
            self.lbl_energy_status.config(text="Status: Stopped", fg=COLORS["accent_red"])
            self.lbl_eco_badge.config(text="Eco Off", fg=COLORS["text_muted"], bg="#242438")

        h_cfg = self.load_haptics_config()
        h_enabled = bool(h_cfg.get("enabled", True))

        if s["haptics_daemon_running"]:
            pid_str = f"PID: {s['haptics_pid']}" if s["haptics_pid"] else "Active"
            self.lbl_haptics_status.config(text=f"Status: Running ({pid_str})", fg=COLORS["accent_green"])
            if h_enabled:
                self.lbl_haptics_badge.config(text="WASAPI Active", fg=COLORS["accent_pink"], bg="#321f2f")
                if hasattr(self, "btn_haptics_power"):
                    self.btn_haptics_power.config(text="🟢 Active", fg=COLORS["accent_green"], bg="#1c302a")
            else:
                self.lbl_haptics_badge.config(text="Haptics Paused", fg=COLORS["accent_amber"], bg="#38291a")
                if hasattr(self, "btn_haptics_power"):
                    self.btn_haptics_power.config(text="⏸️ Paused", fg=COLORS["accent_amber"], bg="#38291a")
        else:
            self.lbl_haptics_status.config(text="Status: Stopped", fg=COLORS["accent_red"])
            self.lbl_haptics_badge.config(text="Inactive", fg=COLORS["text_muted"], bg="#242438")
            if hasattr(self, "btn_haptics_power"):
                self.btn_haptics_power.config(text="▶️ Start", fg=COLORS["accent_cyan"], bg="#173138")

        if s.get("token_daemon_running", False):
            pid_str = f"PID: {s['token_pid']}" if s.get("token_pid") else "Active"
            self.lbl_token_status.config(text=f"Status: Running ({pid_str})", fg=COLORS["accent_green"])
            entries = s.get("token_entries", 0)
            badge_txt = f"{entries:,} Cached" if entries > 0 else "Active"
            self.lbl_token_badge.config(text=badge_txt, fg=COLORS["accent_purple"], bg="#2d2238")
            scan_time = s.get("token_last_scan", "Recent")
            self.lbl_token_metrics.config(
                text=f"Providers: AntiGravity + Cursor • Cache: {entries:,} entries • Scan: {scan_time}"
            )
            if hasattr(self, "btn_token_power"):
                self.btn_token_power.config(text="🟢 Running", fg=COLORS["accent_green"], bg="#1c302a")
        else:
            self.lbl_token_status.config(text="Status: Stopped", fg=COLORS["accent_red"])
            self.lbl_token_badge.config(text="Stopped", fg=COLORS["text_muted"], bg="#242438")
            self.lbl_token_metrics.config(text="Providers: AntiGravity + Cursor • Status: Offline")
            if hasattr(self, "btn_token_power"):
                self.btn_token_power.config(text="▶️ Start", fg=COLORS["accent_cyan"], bg="#173138")

        if s["is_5ghz"]:
            self.lbl_wifi_band_badge.config(text="5 GHz (Safe)", fg=COLORS["accent_green"], bg="#1c302a")
        elif s["wifi_freq"] > 0:
            self.lbl_wifi_band_badge.config(text="2.4 GHz (Drifted!)", fg=COLORS["accent_amber"], bg="#38291a")
        else:
            self.lbl_wifi_band_badge.config(text="No Wi-Fi", fg=COLORS["text_muted"], bg="#242438")

        self.lbl_wifi_metrics.config(
            text=f"SSID: {s['wifi_ssid']} • {s['wifi_freq']} MHz • Rx: {s['rx_speed']} Mbps • Score: {s['wifi_score']}"
        )

        recent_events = self._get_recent_history_lines()
        self.txt_history.config(state="normal")
        self.txt_history.delete("1.0", "end")
        for line in recent_events:
            self.txt_history.insert("end", line + "\n")
        self.txt_history.see("end")
        self.txt_history.config(state="disabled")

        self.lbl_updated.config(text=f"Updated: {s['last_updated']}")

        self.root.after(2000, self._refresh_gui)

    def _get_recent_history_lines(self) -> List[str]:
        lines: List[str] = []
        try:
            if os.path.exists(TETHER_LOG):
                with open(TETHER_LOG, "r", encoding="utf-8", errors="ignore") as f:
                    for l in f.readlines()[-2:]:
                        l_clean = l.strip()
                        if l_clean and not l_clean.startswith("==") and "Version" not in l_clean and "Installed as" not in l_clean and "Running on" not in l_clean:
                            lines.append(f"[TETHER] {l_clean}")
        except Exception:
            pass

        try:
            if os.path.exists(SENTINEL_LOG):
                with open(SENTINEL_LOG, "r", encoding="utf-8", errors="ignore") as f:
                    for l in f.readlines()[-2:]:
                        l_clean = l.strip()
                        if l_clean and not l_clean.startswith("==") and "Using ADB" not in l_clean:
                            lines.append(f"[SENTINEL] {l_clean}")
        except Exception:
            pass

        try:
            if os.path.exists(ENERGY_LOG):
                with open(ENERGY_LOG, "r", encoding="utf-8", errors="ignore") as f:
                    for l in f.readlines()[-2:]:
                        l_clean = l.strip()
                        if l_clean and not l_clean.startswith("==") and "Using ADB" not in l_clean:
                            lines.append(f"[ENERGY] {l_clean}")
        except Exception:
            pass

        try:
            if os.path.exists(HAPTICS_LOG):
                with open(HAPTICS_LOG, "r", encoding="utf-8", errors="ignore") as f:
                    for l in f.readlines()[-2:]:
                        l_clean = l.strip()
                        if l_clean and not l_clean.startswith("==") and "Using ADB" not in l_clean:
                            lines.append(f"[HAPTICS] {l_clean}")
        except Exception:
            pass

        try:
            if os.path.exists(TOKEN_LOG):
                with open(TOKEN_LOG, "r", encoding="utf-8", errors="ignore") as f:
                    for l in f.readlines()[-2:]:
                        l_clean = l.strip()
                        if l_clean and "[INFO]" in l_clean and "token_tracker" in l_clean:
                            msg = l_clean.split("token_tracker:")[-1].strip()
                            lines.append(f"[TOKENS] {msg}")
        except Exception:
            pass

        return lines[-6:] if lines else ["No recent log events recorded."]

    def run(self):
        try:
            with open(os.path.join(BASE_DIR, "boot.log"), "a", encoding="utf-8") as f:
                f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] run() called with argv={sys.argv}\n")
        except Exception:
            pass

        if "--minimized" in sys.argv:
            self.hide_window()
        else:
            self._do_show_window()

        try:
            with open(os.path.join(BASE_DIR, "boot.log"), "a", encoding="utf-8") as f:
                f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Entering self.root.mainloop()...\n")
        except Exception:
            pass

        self.root.mainloop()

        try:
            with open(os.path.join(BASE_DIR, "boot.log"), "a", encoding="utf-8") as f:
                f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] self.root.mainloop() RETURNED!\n")
        except Exception:
            pass


if __name__ == "__main__":
    boot_log = os.path.join(BASE_DIR, "boot.log")
    try:
        with open(boot_log, "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Python executable: {sys.executable}, argv: {sys.argv}\n")
    except Exception:
        pass

    if not acquire_single_instance():
        try:
            with open(boot_log, "a", encoding="utf-8") as f:
                f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Single instance mutex failed (already running). Exiting.\n")
        except Exception:
            pass
        sys.exit(0)

    try:
        with open(boot_log, "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Mutex acquired. Initializing DaemonCommandCenter...\n")
        app = DaemonCommandCenter()
        with open(boot_log, "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] DaemonCommandCenter initialized. Running mainloop...\n")
        app.run()
    except Exception as e:
        import traceback
        crash_path = os.path.join(BASE_DIR, "crash.log")
        with open(crash_path, "w", encoding="utf-8") as f:
            f.write(traceback.format_exc())
        try:
            with open(boot_log, "a", encoding="utf-8") as f:
                f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] CRASH: {traceback.format_exc()}\n")
        except Exception:
            pass
