"""
Storage and Database Layer for WifiTracker.

Manages SQLite time-series telemetry (probes, speed tests, incident logs)
and JSON configuration with automated schema migration and pruning.
"""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from models import AppConfig, Incident, LatencyMetrics, ProbeSnapshot, SpeedTestResult, WifiMetrics


def get_default_data_dir() -> Path:
    """Return ~/.wifi-tracker or local fallback."""
    p = Path.home() / ".wifi-tracker"
    p.mkdir(parents=True, exist_ok=True)
    return p


class StorageManager:
    """Handles SQLite persistence and configuration storage."""

    def __init__(self, data_dir: Optional[str | Path] = None):
        self.data_dir = Path(data_dir) if data_dir else get_default_data_dir()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.data_dir / "wifi_history.db"
        self.config_path = self.data_dir / "config.json"
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            c = conn.cursor()

            # Probes table
            c.execute("""
                CREATE TABLE IF NOT EXISTS probes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    ssid TEXT,
                    bssid TEXT,
                    signal_pct INTEGER,
                    channel INTEGER,
                    band TEXT,
                    rx_rate REAL,
                    tx_rate REAL,
                    gateway_ping REAL,
                    gateway_loss REAL,
                    public_ping REAL,
                    public_loss REAL,
                    jitter REAL,
                    top_process TEXT
                )
            """)

            # Speed tests table
            c.execute("""
                CREATE TABLE IF NOT EXISTS speed_tests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    download_mbps REAL NOT NULL,
                    upload_mbps REAL NOT NULL,
                    ping_ms REAL,
                    jitter_ms REAL,
                    server_info TEXT,
                    is_success INTEGER DEFAULT 1,
                    error_message TEXT
                )
            """)

            # Incidents table
            c.execute("""
                CREATE TABLE IF NOT EXISTS incidents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    issue_type TEXT NOT NULL,
                    description TEXT NOT NULL,
                    download_mbps REAL,
                    gateway_ping_ms REAL,
                    signal_pct INTEGER,
                    culprit_process TEXT,
                    resolved INTEGER DEFAULT 0,
                    resolved_at TEXT
                )
            """)

            # Indexes for fast historical queries
            c.execute("CREATE INDEX IF NOT EXISTS idx_probes_ts ON probes (timestamp)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_speed_ts ON speed_tests (timestamp)")
            c.execute("CREATE INDEX IF NOT EXISTS idx_incidents_ts ON incidents (timestamp)")
            conn.commit()

    def load_config(self) -> AppConfig:
        config = AppConfig(data_dir=str(self.data_dir))
        if self.config_path.exists():
            try:
                with open(self.config_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for k, v in data.items():
                        if hasattr(config, k):
                            setattr(config, k, v)
            except Exception:
                pass
        return config

    def save_config(self, config: AppConfig):
        try:
            with open(self.config_path, "w", encoding="utf-8") as f:
                json.dump(config.__dict__, f, indent=2)
        except Exception:
            pass

    def record_probe(self, snapshot: ProbeSnapshot):
        top_proc_str = ""
        if snapshot.top_processes:
            p = snapshot.top_processes[0]
            top_proc_str = f"{p.process_name} ({p.connection_count} sockets)"

        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO probes (
                    timestamp, ssid, bssid, signal_pct, channel, band,
                    rx_rate, tx_rate, gateway_ping, gateway_loss,
                    public_ping, public_loss, jitter, top_process
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    snapshot.timestamp,
                    snapshot.wifi.ssid,
                    snapshot.wifi.bssid,
                    snapshot.wifi.signal_pct,
                    snapshot.wifi.channel,
                    snapshot.wifi.band,
                    snapshot.wifi.rx_rate_mbps,
                    snapshot.wifi.tx_rate_mbps,
                    snapshot.latency.gateway_ping_ms,
                    snapshot.latency.gateway_loss_pct,
                    snapshot.latency.public_dns_ping_ms,
                    snapshot.latency.public_dns_loss_pct,
                    snapshot.latency.jitter_ms,
                    top_proc_str
                )
            )
            conn.commit()

    def record_speed_test(self, result: SpeedTestResult):
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO speed_tests (
                    timestamp, download_mbps, upload_mbps, ping_ms,
                    jitter_ms, server_info, is_success, error_message
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    result.timestamp,
                    result.download_mbps,
                    result.upload_mbps,
                    result.ping_ms,
                    result.jitter_ms,
                    result.server_info,
                    1 if result.is_success else 0,
                    result.error_message
                )
            )
            conn.commit()

    def record_incident(self, incident: Incident) -> int:
        with self._get_connection() as conn:
            cur = conn.execute(
                """
                INSERT INTO incidents (
                    timestamp, severity, issue_type, description,
                    download_mbps, gateway_ping_ms, signal_pct,
                    culprit_process, resolved, resolved_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    incident.timestamp,
                    incident.severity,
                    incident.issue_type,
                    incident.description,
                    incident.download_mbps,
                    incident.gateway_ping_ms,
                    incident.signal_pct,
                    incident.culprit_process,
                    1 if incident.resolved else 0,
                    incident.resolved_at
                )
            )
            conn.commit()
            return cur.lastrowid

    def get_latest_speed_test(self) -> Optional[SpeedTestResult]:
        with self._get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM speed_tests ORDER BY id DESC LIMIT 1"
            ).fetchone()
            if row:
                return SpeedTestResult(
                    download_mbps=row["download_mbps"],
                    upload_mbps=row["upload_mbps"],
                    ping_ms=row["ping_ms"] or 0.0,
                    jitter_ms=row["jitter_ms"] or 0.0,
                    server_info=row["server_info"] or "",
                    timestamp=row["timestamp"],
                    is_success=bool(row["is_success"]),
                    error_message=row["error_message"] or ""
                )
        return None

    def get_recent_speed_tests(self, limit: int = 30) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM speed_tests ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
            return [dict(r) for r in rows]

    def get_recent_probes(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM probes ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
            return [dict(r) for r in rows]

    def get_incidents(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM incidents ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
            return [dict(r) for r in rows]

    def get_stats_summary(self, hours: int = 24) -> Dict[str, Any]:
        """Compute aggregated min, avg, max for the given time window."""
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
        stats = {
            "avg_download": 0.0,
            "min_download": 0.0,
            "max_download": 0.0,
            "avg_upload": 0.0,
            "avg_ping": 0.0,
            "incident_count": 0,
            "test_count": 0
        }

        with self._get_connection() as conn:
            speed_row = conn.execute(
                """
                SELECT
                    AVG(download_mbps) as avg_down,
                    MIN(download_mbps) as min_down,
                    MAX(download_mbps) as max_down,
                    AVG(upload_mbps) as avg_up,
                    AVG(ping_ms) as avg_ping,
                    COUNT(*) as count
                FROM speed_tests
                WHERE timestamp >= ? AND is_success = 1
                """,
                (cutoff,)
            ).fetchone()

            if speed_row and speed_row["count"]:
                stats["avg_download"] = round(speed_row["avg_down"] or 0.0, 2)
                stats["min_download"] = round(speed_row["min_down"] or 0.0, 2)
                stats["max_download"] = round(speed_row["max_down"] or 0.0, 2)
                stats["avg_upload"] = round(speed_row["avg_up"] or 0.0, 2)
                stats["avg_ping"] = round(speed_row["avg_ping"] or 0.0, 1)
                stats["test_count"] = speed_row["count"]

            inc_row = conn.execute(
                "SELECT COUNT(*) as count FROM incidents WHERE timestamp >= ?",
                (cutoff,)
            ).fetchone()
            if inc_row:
                stats["incident_count"] = inc_row["count"]

        return stats

    def prune_old_data(self, days: int = 30):
        """Clean up entries older than the retention window."""
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        with self._get_connection() as conn:
            conn.execute("DELETE FROM probes WHERE timestamp < ?", (cutoff,))
            conn.execute("DELETE FROM speed_tests WHERE timestamp < ?", (cutoff,))
            conn.execute("DELETE FROM incidents WHERE timestamp < ?", (cutoff,))
            conn.commit()
