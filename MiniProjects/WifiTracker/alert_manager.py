"""
Anomaly Detection & Desktop Alerting System.

Analyzes probe snapshots and speed test results against configured thresholds,
identifies culprit processes (e.g., active torrents or background updates),
and delivers non-intrusive Windows toast notifications with cooldown protection.
"""

from __future__ import annotations

import os
import subprocess
import time
from datetime import datetime, timezone
from typing import Optional, List, Callable

from models import AppConfig, Incident, ProbeSnapshot, SpeedTestResult
from storage import StorageManager


def send_windows_toast(title: str, message: str):
    """Deliver a native Windows 10/11 toast notification via PowerShell."""
    try:
        clean_title = title.replace('"', '`"').replace("'", "''")
        clean_msg = message.replace('"', '`"').replace("'", "''")
        
        ps_cmd = (
            "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null; "
            "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null; "
            "$xml = New-Object Windows.Data.Xml.Dom.XmlDocument; "
            f"$xml.LoadXml('<toast><visual><binding template=\"ToastGeneric\"><text>{clean_title}</text><text>{clean_msg}</text></binding></visual></toast>'); "
            "$toast = New-Object Windows.UI.Notifications.ToastNotification $xml; "
            "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('WifiTracker').Show($toast);"
        )

        startupinfo = None
        if os.name == 'nt':
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = 0

        subprocess.Popen(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_cmd],
            startupinfo=startupinfo,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
    except Exception:
        pass


class AlertManager:
    """Manages threshold evaluation, culprit attribution, and alert dispatch."""

    def __init__(self, storage: StorageManager, config: AppConfig, notify_fn: Optional[Callable[[str, str], None]] = None):
        self.storage = storage
        self.config = config
        self.notify_fn = notify_fn or send_windows_toast
        self._last_alert_times: dict[str, float] = {}

    def _can_alert(self, alert_key: str) -> bool:
        """Enforce cooldown period between alerts of the same category."""
        cooldown_sec = self.config.notification_cooldown_minutes * 60.0
        now = time.time()
        last = self._last_alert_times.get(alert_key, 0.0)
        if now - last >= cooldown_sec:
            self._last_alert_times[alert_key] = now
            return True
        return False

    def evaluate_probe(self, snapshot: ProbeSnapshot) -> Optional[Incident]:
        """Check light probe telemetry for latency spikes, packet loss, or weak signal."""
        if not snapshot.wifi.is_connected:
            if self._can_alert("OFFLINE"):
                inc = Incident(
                    severity="CRITICAL",
                    issue_type="OFFLINE",
                    description="Wi-Fi interface is disconnected or has lost connection to SSID."
                )
                self.storage.record_incident(inc)
                if self.config.enable_notifications:
                    self.notify_fn("Wi-Fi Disconnected", "Your computer lost connection to the Wi-Fi network.")
                return inc
            return None

        # 1. High Gateway Latency / Packet Loss
        gw_ping = snapshot.latency.gateway_ping_ms
        gw_loss = snapshot.latency.gateway_loss_pct

        if (gw_loss >= 25.0) or (gw_ping is not None and gw_ping > self.config.gateway_latency_threshold_ms):
            if self._can_alert("GATEWAY_LATENCY"):
                culprit = ""
                if snapshot.top_processes:
                    top = snapshot.top_processes[0]
                    if top.connection_count > 10:
                        culprit = f"{top.process_name} (PID {top.pid}, {top.connection_count} sockets)"

                desc = f"Local router latency high ({gw_ping:.1f} ms, {gw_loss:.0f}% loss)."
                if culprit:
                    desc += f" High socket activity from {culprit}."

                inc = Incident(
                    severity="WARNING" if gw_loss < 50 else "CRITICAL",
                    issue_type="HIGH_LATENCY",
                    description=desc,
                    gateway_ping_ms=gw_ping,
                    signal_pct=snapshot.wifi.signal_pct,
                    culprit_process=culprit
                )
                self.storage.record_incident(inc)
                if self.config.enable_notifications:
                    self.notify_fn("Wi-Fi Router Latency Spike", desc)
                return inc

        # 2. Wi-Fi Weak Signal
        sig = snapshot.wifi.signal_pct
        if 0 < sig < self.config.signal_low_threshold_pct:
            if self._can_alert("WEAK_SIGNAL"):
                desc = f"Wi-Fi signal dropped to {sig}% on SSID '{snapshot.wifi.ssid}' (Channel {snapshot.wifi.channel})."
                inc = Incident(
                    severity="WARNING",
                    issue_type="SIGNAL_DROP",
                    description=desc,
                    signal_pct=sig
                )
                self.storage.record_incident(inc)
                if self.config.enable_notifications:
                    self.notify_fn("Wi-Fi Signal Degraded", desc)
                return inc

        return None

    def evaluate_speed_test(self, result: SpeedTestResult, last_snapshot: Optional[ProbeSnapshot] = None) -> Optional[Incident]:
        """Evaluate a completed speed test for severe speed collapses."""
        if not result.is_success:
            if self._can_alert("SPEED_FAIL"):
                desc = f"Speed test failed: {result.error_message or 'Timeout connecting to speed test server'}"
                inc = Incident(
                    severity="WARNING",
                    issue_type="SPEED_DROP",
                    description=desc
                )
                self.storage.record_incident(inc)
                if self.config.enable_notifications:
                    self.notify_fn("Speed Test Failed", desc)
                return inc
            return None

        # Check for speed drops
        down_mbps = result.download_mbps
        if down_mbps < self.config.speed_drop_threshold_mbps:
            alert_key = "SPEED_CRITICAL" if down_mbps < self.config.critical_speed_threshold_mbps else "SPEED_WARNING"
            if self._can_alert(alert_key):
                culprit = ""
                if last_snapshot and last_snapshot.top_processes:
                    top = last_snapshot.top_processes[0]
                    if top.connection_count > 8:
                        culprit = f"{top.process_name} (PID {top.pid}, {top.connection_count} sockets)"

                severity = "CRITICAL" if down_mbps < self.config.critical_speed_threshold_mbps else "WARNING"
                desc = f"Download speed dropped to {down_mbps:.2f} Mbps (Upload: {result.upload_mbps:.2f} Mbps, Ping: {result.ping_ms:.0f} ms)."
                if culprit:
                    desc += f" Heavy local socket activity from {culprit}."

                inc = Incident(
                    severity=severity,
                    issue_type="SPEED_DROP",
                    description=desc,
                    download_mbps=down_mbps,
                    gateway_ping_ms=last_snapshot.latency.gateway_ping_ms if last_snapshot else None,
                    signal_pct=last_snapshot.wifi.signal_pct if last_snapshot else None,
                    culprit_process=culprit
                )
                self.storage.record_incident(inc)
                if self.config.enable_notifications:
                    self.notify_fn(
                        f"Internet Speed Alert ({down_mbps:.2f} Mbps)",
                        desc
                    )
                return inc

        return None
