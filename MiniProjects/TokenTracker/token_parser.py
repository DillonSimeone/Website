"""Backward-compatible re-exports from the refactored parser modules."""

from pathlib import Path

from data_sources import DataSource, discover_antigravity_sources, make_source_id
from models import TokenEntry, TokenStats, compute_stats, get_daily_breakdown
from antigravity_parser import scan_all_antigravity, scan_source

__all__ = [
    "TokenEntry",
    "TokenStats",
    "compute_stats",
    "get_daily_breakdown",
    "scan_conversations",
]


def scan_conversations(
    conversations_dir: str | None = None,
    last_scan_time=None,
    existing_entries=None,
):
    """Scan AntiGravity conversations (backward-compatible API)."""
    if conversations_dir:
        conv_path = Path(conversations_dir)
        source = DataSource(
            provider="antigravity",
            source_id=make_source_id("antigravity", conv_path),
            path=conv_path,
            source_type="conversations",
        )
        return scan_source(source, last_scan_time, existing_entries)
    sources = discover_antigravity_sources()
    return scan_all_antigravity(sources, last_scan_time, existing_entries)
