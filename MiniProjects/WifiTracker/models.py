"""
Data models and dataclasses for WifiTracker.
"""

from __future__ import annotations
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any


@dataclass
class WifiMetrics:
    ssid: str = ""
    bssid: str = ""
    signal_pct: int = 0
    radio_type: str = ""       # e.g. 802.11ac, 802.11ax, 802.11n
    channel: int = 0
    band: str = ""             # "2.4 GHz", "5 GHz", or "6 GHz"
    rx_rate_mbps: float = 0.0
    tx_rate_mbps: float = 0.0
    interface_name: str = ""
    adapter_desc: str = ""
    state: str = "disconnected" # "connected", "disconnected"

    @property
    def is_connected(self) -> bool:
        return self.state.lower() == "connected" and bool(self.ssid)


@dataclass
class LatencyMetrics:
    gateway_ip: str = ""
    gateway_ping_ms: Optional[float] = None
    gateway_loss_pct: float = 0.0
    public_dns_ping_ms: Optional[float] = None  # e.g. ping to 1.1.1.1 or 8.8.8.8
    public_dns_loss_pct: float = 0.0
    jitter_ms: Optional[float] = None
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class ProcessNetworkItem:
    process_name: str
    pid: int
    connection_count: int


@dataclass
class ProbeSnapshot:
    wifi: WifiMetrics = field(default_factory=WifiMetrics)
    latency: LatencyMetrics = field(default_factory=LatencyMetrics)
    top_processes: List[ProcessNetworkItem] = field(default_factory=list)
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class SpeedTestResult:
    download_mbps: float = 0.0
    upload_mbps: float = 0.0
    ping_ms: float = 0.0
    jitter_ms: float = 0.0
    server_info: str = "Cloudflare Edge"
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    bytes_downloaded: int = 0
    bytes_uploaded: int = 0
    is_success: bool = True
    error_message: str = ""


@dataclass
class Incident:
    id: Optional[int] = None
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    severity: str = "WARNING"       # "WARNING", "CRITICAL"
    issue_type: str = "SPEED_DROP"   # "SPEED_DROP", "HIGH_LATENCY", "PACKET_LOSS", "SIGNAL_DROP", "OFFLINE"
    description: str = ""
    download_mbps: Optional[float] = None
    gateway_ping_ms: Optional[float] = None
    signal_pct: Optional[int] = None
    culprit_process: str = ""
    resolved: bool = False
    resolved_at: Optional[str] = None


@dataclass
class AppConfig:
    probe_interval_seconds: int = 45
    speedtest_interval_minutes: int = 30
    enable_auto_speedtest: bool = True
    speed_drop_threshold_mbps: float = 5.0
    critical_speed_threshold_mbps: float = 1.0
    gateway_latency_threshold_ms: float = 80.0
    public_latency_threshold_ms: float = 150.0
    signal_low_threshold_pct: int = 45
    enable_notifications: bool = True
    notification_cooldown_minutes: int = 15
    data_dir: str = ""
    speedtest_size_mb: int = 10  # Lightweight test payload size
