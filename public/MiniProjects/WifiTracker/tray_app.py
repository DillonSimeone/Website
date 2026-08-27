"""
System Tray Application for WifiTracker.

Manages background periodic telemetry probing, scheduled speed tests,
tray icon states (Green/Yellow/Red/Animated testing), tooltips, and dashboard lifecycle.
"""

from __future__ import annotations

import os
import sys
import threading
import time
import tkinter as tk
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import pystray
from pystray import MenuItem as Item, Menu

from alert_manager import AlertManager, send_windows_toast
from icon_gen import create_tray_icon
from models import AppConfig, ProbeSnapshot, SpeedTestResult
from popup_ui import WifiTrackerDashboard
from speed_tester import run_speed_test
from storage import StorageManager
from wifi_probe import run_full_light_probe


class WifiTrackerApp:
    """Main System Tray background application."""

    def __init__(self, data_dir: Optional[str | Path] = None, speedtest_interval: Optional[int] = None):
        self.storage = StorageManager(data_dir)
        self.config = self.storage.load_config()
        if speedtest_interval is not None:
            self.config.speedtest_interval_minutes = speedtest_interval

        self.alert_manager = AlertManager(self.storage, self.config, notify_fn=self._notify_user)
        self.dashboard = WifiTrackerDashboard(
            storage=self.storage,
            config=self.config,
            on_run_speed_test=self.trigger_speed_test_now,
            on_probe_updated=self._on_probe_updated,
            on_config_changed=self._on_config_changed
        )

        self.tray_icon: Optional[pystray.Icon] = None
        self._stop_event = threading.Event()
        self._bg_thread: Optional[threading.Thread] = None

        self._latest_probe: Optional[ProbeSnapshot] = None
        self._latest_speed: Optional[SpeedTestResult] = self.storage.get_latest_speed_test()
        self._is_testing = False
        self._test_frame = 0
        self._pause_auto_test_until: float = 0.0

        # Hidden Tkinter root for GUI popup events
        self.tk_root = tk.Tk()
        self.tk_root.withdraw()

    def _notify_user(self, title: str, message: str):
        if self.tray_icon and hasattr(self.tray_icon, "notify"):
            try:
                self.tray_icon.notify(message, title)
                return
            except Exception:
                pass
        send_windows_toast(title, message)

    def _on_probe_updated(self, snap: ProbeSnapshot):
        self._latest_probe = snap
        self._update_tray_state()

    def _on_config_changed(self, cfg: AppConfig):
        self.config = cfg
        self.alert_manager.config = cfg

    def _calculate_health_status(self) -> str:
        if not self._latest_probe or not self._latest_probe.wifi.is_connected:
            return "OFFLINE"

        gw_ping = self._latest_probe.latency.gateway_ping_ms
        gw_loss = self._latest_probe.latency.gateway_loss_pct
        sig = self._latest_probe.wifi.signal_pct

        if self._latest_speed and self._latest_speed.is_success:
            if self._latest_speed.download_mbps < self.config.critical_speed_threshold_mbps:
                return "CRITICAL"
            elif self._latest_speed.download_mbps < self.config.speed_drop_threshold_mbps:
                return "WARNING"

        if (gw_loss > 30.0) or (gw_ping is not None and gw_ping > self.config.gateway_latency_threshold_ms) or (sig < self.config.signal_low_threshold_pct):
            return "WARNING"

        return "HEALTHY"

    def _update_tray_state(self):
        if not self.tray_icon:
            return

        status = self._calculate_health_status()
        down_mbps = self._latest_speed.download_mbps if (self._latest_speed and self._latest_speed.is_success) else None

        icon_img = create_tray_icon(
            status=status,
            download_mbps=down_mbps,
            is_testing=self._is_testing,
            test_frame=self._test_frame
        )
        self.tray_icon.icon = icon_img

        # Build informative tooltip
        if self._latest_probe and self._latest_probe.wifi.is_connected:
            w = self._latest_probe.wifi
            l = self._latest_probe.latency
            gw_str = f"{l.gateway_ping_ms:.0f}ms" if l.gateway_ping_ms is not None else "--"
            speed_str = f"{self._latest_speed.download_mbps:.1f}M DL" if (self._latest_speed and self._latest_speed.is_success) else "Speed: --"
            tooltip = f"WifiTracker: {w.ssid} ({w.signal_pct}%) | {speed_str} | Ping: {gw_str}"
        else:
            tooltip = "WifiTracker: Disconnected / No Wi-Fi"

        self.tray_icon.title = tooltip[:127]

    def trigger_speed_test_now(self):
        """Manually initiate a speed test in background."""
        if self._is_testing:
            return
        threading.Thread(target=self._run_speed_test_worker, daemon=True).start()

    def _run_speed_test_worker(self):
        self._is_testing = True
        self._update_tray_state()

        # Start animation updater
        def animate():
            while self._is_testing:
                self._test_frame += 1
                self._update_tray_state()
                time.sleep(0.12)

        anim_th = threading.Thread(target=animate, daemon=True)
        anim_th.start()

        try:
            res = run_speed_test(
                download_mb=self.config.speedtest_size_mb,
                upload_mb=4,
                stop_check=lambda: self._stop_event.is_set()
            )
            if res.is_success:
                self.storage.record_speed_test(res)
                self._latest_speed = res
                self.alert_manager.evaluate_speed_test(res, self._latest_probe)
        finally:
            self._is_testing = False
            self._update_tray_state()
            if self.dashboard.window and tk.Toplevel.winfo_exists(self.dashboard.window):
                self.tk_root.after(0, self.dashboard.refresh_all_data)

    def _background_loop(self):
        """Background monitoring worker loop."""
        last_speed_test_time = 0.0

        while not self._stop_event.is_set():
            try:
                # 1. Run low-overhead hardware / latency probe
                snap = run_full_light_probe()
                self.storage.record_probe(snap)
                self._latest_probe = snap
                self.alert_manager.evaluate_probe(snap)
                self._update_tray_state()

                # Refresh dashboard if open
                if self.dashboard.window and tk.Toplevel.winfo_exists(self.dashboard.window):
                    self.tk_root.after(0, self.dashboard.refresh_all_data)

                # 2. Check if scheduled speed test is due
                now = time.time()
                interval_sec = self.config.speedtest_interval_minutes * 60.0
                is_paused = (now < self._pause_auto_test_until)

                if self.config.enable_auto_speedtest and not is_paused:
                    if (now - last_speed_test_time >= interval_sec) and not self._is_testing:
                        last_speed_test_time = now
                        self.trigger_speed_test_now()

            except Exception:
                pass

            # Sleep in small increments for graceful shutdown
            for _ in range(max(1, self.config.probe_interval_seconds * 2)):
                if self._stop_event.is_set():
                    break
                time.sleep(0.5)

    def _on_open_dashboard(self):
        self.tk_root.after(0, lambda: self.dashboard.show(self.tk_root, self._latest_probe))

    def _toggle_pause_auto_test(self):
        now = time.time()
        if now < self._pause_auto_test_until:
            self._pause_auto_test_until = 0.0
            self._notify_user("Auto Speed Test Resumed", "Scheduled bandwidth tests are now active.")
        else:
            self._pause_auto_test_until = now + 3600.0  # Pause for 1 hour
            self._notify_user("Auto Speed Test Paused", "Speed tests paused for 1 hour.")

    def _run_network_reset(self):
        try:
            subprocess.run(["ipconfig", "/flushdns"], capture_output=True)
            subprocess.run(["netsh", "int", "ip", "reset"], capture_output=True)
            subprocess.run(["netsh", "winsock", "reset"], capture_output=True)
            self._notify_user("Network Reset Complete", "DNS flushed and Winsock catalog reset.")
        except Exception as e:
            self._notify_user("Network Reset Error", str(e))

    def _build_menu(self) -> Menu:
        return Menu(
            Item("?? Open Dashboard & History", lambda: self._on_open_dashboard(), default=True),
            Item("? Run Speed Test Now", lambda: self.trigger_speed_test_now()),
            Item("?? Quick Wi-Fi Probe", lambda: self._background_step_instant()),
            Item("?? 1-Click Network Reset", lambda: self._run_network_reset()),
            Menu.SEPARATOR,
            Item("? Pause Auto-Tests (1 Hour)", lambda: self._toggle_pause_auto_test()),
            Menu.SEPARATOR,
            Item("? Quit WifiTracker", lambda: self.quit())
        )

    def _background_step_instant(self):
        def job():
            snap = run_full_light_probe()
            self.storage.record_probe(snap)
            self._latest_probe = snap
            self._update_tray_state()
            if self.dashboard.window and tk.Toplevel.winfo_exists(self.dashboard.window):
                self.tk_root.after(0, self.dashboard.refresh_all_data)
        threading.Thread(target=job, daemon=True).start()

    def run(self):
        """Start the system tray icon and background thread."""
        initial_img = create_tray_icon("HEALTHY")
        self.tray_icon = pystray.Icon(
            "WifiTracker",
            initial_img,
            "WifiTracker ? Initializing...",
            menu=self._build_menu()
        )

        self._bg_thread = threading.Thread(target=self._background_loop, daemon=True)
        self._bg_thread.start()

        # Run initial speed test in background on launch
        threading.Thread(target=self._run_speed_test_worker, daemon=True).start()

        # Run tray icon in a dedicated thread so Tkinter mainloop can process UI events
        def tray_worker():
            self.tray_icon.run()

        tray_th = threading.Thread(target=tray_worker, daemon=True)
        tray_th.start()

        try:
            self.tk_root.mainloop()
        except KeyboardInterrupt:
            self.quit()

    def quit(self):
        """Gracefully stop background threads and exit."""
        self._stop_event.set()
        if self.tray_icon:
            self.tray_icon.stop()
        try:
            self.tk_root.quit()
            self.tk_root.destroy()
        except Exception:
            pass
        sys.exit(0)
