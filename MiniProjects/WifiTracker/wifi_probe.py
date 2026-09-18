"""
Wi-Fi and Network Diagnostic Probing Module.

Provides fast, low-overhead hardware and latency diagnostics:
- Wi-Fi signal, channel, band, negotiated rates via netsh
- Default gateway discovery & local router latency/loss
- Public DNS latency (1.1.1.1) & jitter
- Top external network-heavy processes via netstat / TCP connection inspections
"""

from __future__ import annotations

import os
import re
import subprocess
import time
from typing import List, Optional, Tuple

from models import LatencyMetrics, ProcessNetworkItem, ProbeSnapshot, WifiMetrics


def _get_startupinfo():
    if os.name == 'nt':
        si = subprocess.STARTUPINFO()
        si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        si.wShowWindow = 0
        return si
    return None


def get_wifi_interface_info() -> WifiMetrics:
    """Query Windows netsh for current Wi-Fi adapter connection state."""
    metrics = WifiMetrics()
    try:
        res = subprocess.run(
            ["netsh", "wlan", "show", "interfaces"],
            capture_output=True,
            text=True,
            timeout=5,
            startupinfo=_get_startupinfo(),
            encoding='utf-8',
            errors='ignore'
        )
        for line in res.stdout.splitlines():
            line_str = line.strip()
            if not line_str or ":" not in line_str:
                continue
            key, _, val = line_str.partition(":")
            key = key.strip()
            val = val.strip()

            if key == "Name":
                metrics.interface_name = val
            elif key == "Description":
                metrics.adapter_desc = val
            elif key == "State":
                metrics.state = val
            elif key == "SSID":
                metrics.ssid = val
            elif key == "BSSID":
                metrics.bssid = val
            elif key == "Radio type":
                metrics.radio_type = val
            elif key == "Channel":
                try:
                    ch = int(val)
                    metrics.channel = ch
                    if 1 <= ch <= 14:
                        metrics.band = "2.4 GHz"
                    elif 32 <= ch <= 177:
                        metrics.band = "5 GHz"
                    elif ch > 177:
                        metrics.band = "6 GHz"
                except ValueError:
                    pass
            elif key == "Signal":
                try:
                    metrics.signal_pct = int(val.replace("%", "").strip())
                except ValueError:
                    pass
            elif key == "Receive rate (Mbps)":
                try:
                    metrics.rx_rate_mbps = float(val)
                except ValueError:
                    pass
            elif key == "Transmit rate (Mbps)":
                try:
                    metrics.tx_rate_mbps = float(val)
                except ValueError:
                    pass

    except Exception:
        pass

    return metrics


def get_default_gateway() -> str:
    """Discover the default IPv4 gateway IP."""
    try:
        res = subprocess.run(
            ["route", "print", "0.0.0.0"],
            capture_output=True,
            text=True,
            timeout=5,
            startupinfo=_get_startupinfo(),
            encoding='utf-8',
            errors='ignore'
        )
        lines = res.stdout.splitlines()
        for line in lines:
            parts = line.split()
            if len(parts) >= 5 and parts[0] == "0.0.0.0" and parts[1] == "0.0.0.0":
                gw = parts[2]
                if re.match(r"^\d{1,3}(\.\d{1,3}){3}$", gw) and gw != "0.0.0.0":
                    return gw
    except Exception:
        pass
    return "192.168.1.1"


def ping_target(target: str, count: int = 3, timeout_ms: int = 800) -> Tuple[Optional[float], float, Optional[float]]:
    """
    Ping a target IP or host.
    Returns (avg_latency_ms, packet_loss_pct, jitter_ms)
    """
    if not target:
        return None, 100.0, None

    try:
        cmd = ["ping", "-n", str(count), "-w", str(timeout_ms), target]
        res = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=int((count * timeout_ms / 1000) + 4),
            startupinfo=_get_startupinfo(),
            encoding='utf-8',
            errors='ignore'
        )
        out = res.stdout

        times = []
        for match in re.finditer(r"time[=<](\d+)ms", out, re.IGNORECASE):
            times.append(float(match.group(1)))

        lost_match = re.search(r"\((\d+)%\s+loss\)", out, re.IGNORECASE)
        loss_pct = float(lost_match.group(1)) if lost_match else (0.0 if times else 100.0)

        if not times:
            return None, loss_pct, None

        avg_ms = sum(times) / len(times)
        jitter_ms = 0.0
        if len(times) > 1:
            diffs = [abs(times[i] - times[i - 1]) for i in range(1, len(times))]
            jitter_ms = sum(diffs) / len(diffs)

        return avg_ms, loss_pct, jitter_ms

    except Exception:
        return None, 100.0, None


def get_top_network_processes(limit: int = 6) -> List[ProcessNetworkItem]:
    """
    Inspect active established TCP connections to EXTERNAL endpoints.
    Filters out local loopback (127.0.0.1) IPC so local IDE / app services
    are not misidentified as internet bandwidth hogs.
    """
    items: List[ProcessNetworkItem] = []
    try:
        res = subprocess.run(
            ["netstat", "-ano", "-p", "tcp"],
            capture_output=True,
            text=True,
            timeout=4,
            startupinfo=_get_startupinfo(),
            encoding='utf-8',
            errors='ignore'
        )

        pid_counts: dict[int, int] = {}
        for line in res.stdout.splitlines():
            parts = line.split()
            if len(parts) >= 5 and parts[0].upper() == "TCP":
                remote_addr = parts[2]
                state = parts[3].upper()

                # Filter out local loopback connections (127.0.0.1, [::1], 0.0.0.0)
                if (
                    remote_addr.startswith("127.0.0.1")
                    or remote_addr.startswith("[::1]")
                    or remote_addr.startswith("0.0.0.0")
                    or remote_addr.startswith("*:")
                ):
                    continue

                if state in ("ESTABLISHED", "SYN_SENT", "TIME_WAIT"):
                    try:
                        pid = int(parts[4])
                        if pid > 4:  # exclude System / Idle
                            pid_counts[pid] = pid_counts.get(pid, 0) + 1
                    except ValueError:
                        pass

        if not pid_counts:
            return []

        top_pids = sorted(pid_counts.items(), key=lambda x: x[1], reverse=True)[:limit]

        tasklist_res = subprocess.run(
            ["tasklist", "/FO", "CSV", "/NH"],
            capture_output=True,
            text=True,
            timeout=3,
            startupinfo=_get_startupinfo(),
            encoding='utf-8',
            errors='ignore'
        )

        pid_to_name: dict[int, str] = {}
        for row in tasklist_res.stdout.splitlines():
            row_clean = row.strip()
            if row_clean and row_clean.startswith('"'):
                cols = [c.strip('"') for c in row_clean.split('","')]
                if len(cols) >= 2:
                    try:
                        p_name = cols[0]
                        p_id = int(cols[1])
                        pid_to_name[p_id] = p_name
                    except ValueError:
                        pass

        for pid, count in top_pids:
            name = pid_to_name.get(pid, f"PID-{pid}")
            items.append(ProcessNetworkItem(process_name=name, pid=pid, connection_count=count))

    except Exception:
        pass

    return items


def run_full_light_probe(gateway_ip: Optional[str] = None) -> ProbeSnapshot:
    """
    Execute a full lightweight probe (< 1.5 seconds) combining:
    - Wi-Fi signal, band, rates
    - Gateway ping & jitter
    - Public DNS ping & jitter
    - Top external network connection processes
    """
    wifi = get_wifi_interface_info()
    gw = gateway_ip or get_default_gateway()

    gw_avg, gw_loss, gw_jitter = ping_target(gw, count=3, timeout_ms=600)
    dns_avg, dns_loss, dns_jitter = ping_target("1.1.1.1", count=3, timeout_ms=800)

    latency = LatencyMetrics(
        gateway_ip=gw,
        gateway_ping_ms=gw_avg,
        gateway_loss_pct=gw_loss,
        public_dns_ping_ms=dns_avg,
        public_dns_loss_pct=dns_loss,
        jitter_ms=gw_jitter if gw_jitter is not None else dns_jitter
    )

    top_procs = get_top_network_processes(limit=6)

    return ProbeSnapshot(
        wifi=wifi,
        latency=latency,
        top_processes=top_procs
    )
