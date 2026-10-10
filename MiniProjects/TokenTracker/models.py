"""Shared data models and statistics helpers for the LLM Token Tracker."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any


@dataclass
class TokenEntry:
    """A single generation's token usage."""

    timestamp: datetime
    model: str
    prompt_tokens: int
    output_tokens: int
    thinking_tokens: int
    cached_tokens: int
    conversation_id: str
    provider: str = "antigravity"
    source_id: str = ""
    account_key: str = ""
    entry_id: str = ""

    def __post_init__(self) -> None:
        if not self.entry_id:
            self.entry_id = make_entry_id(
                self.provider,
                self.source_id,
                self.conversation_id,
                self.timestamp,
                self.prompt_tokens,
                self.output_tokens,
            )


def make_entry_id(
    provider: str,
    source_id: str,
    conversation_id: str,
    timestamp: datetime,
    prompt_tokens: int,
    output_tokens: int,
) -> str:
    """Build a stable unique id for deduplication."""
    ts = int(timestamp.timestamp()) if timestamp else 0
    return f"{provider}:{source_id}:{conversation_id}:{ts}:{prompt_tokens}:{output_tokens}"


@dataclass
class TokenStats:
    """Aggregate token statistics."""

    total_prompt: int = 0
    total_output: int = 0
    total_thinking: int = 0
    total_cached: int = 0
    total_tokens: int = 0
    turns: int = 0
    by_model: dict[str, dict[str, Any]] = field(default_factory=dict)


@dataclass
class SourceScanState:
    """Per-source scan metadata stored in the cache."""

    provider: str
    path: str
    account_key: str = ""
    last_scan_time: datetime | None = None
    last_db_mtime: float | None = None
    seen_entry_ids: list[str] = field(default_factory=list)
    seen_bubble_keys: list[str] = field(default_factory=list)


def entry_to_dict(entry: TokenEntry) -> dict[str, Any]:
    return {
        "timestamp": entry.timestamp.isoformat(),
        "model": entry.model,
        "prompt_tokens": entry.prompt_tokens,
        "output_tokens": entry.output_tokens,
        "thinking_tokens": entry.thinking_tokens,
        "cached_tokens": entry.cached_tokens,
        "conversation_id": entry.conversation_id,
        "provider": entry.provider,
        "source_id": entry.source_id,
        "account_key": entry.account_key,
        "entry_id": entry.entry_id,
    }


def entry_from_dict(item: dict[str, Any]) -> TokenEntry:
    ts = datetime.fromisoformat(item["timestamp"])
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return TokenEntry(
        timestamp=ts,
        model=item["model"],
        prompt_tokens=item["prompt_tokens"],
        output_tokens=item["output_tokens"],
        thinking_tokens=item.get("thinking_tokens", 0),
        cached_tokens=item.get("cached_tokens", 0),
        conversation_id=item["conversation_id"],
        provider=item.get("provider", "antigravity"),
        source_id=item.get("source_id", ""),
        account_key=item.get("account_key", ""),
        entry_id=item.get("entry_id", ""),
    )


def compute_stats(
    entries: list[TokenEntry],
    since: datetime | None = None,
    until: datetime | None = None,
    provider: str | None = None,
) -> TokenStats:
    """Compute aggregate token statistics, optionally filtered by provider."""
    stats = TokenStats()
    by_model: dict[str, dict[str, int]] = defaultdict(
        lambda: {"prompt": 0, "output": 0, "thinking": 0, "turns": 0}
    )

    for entry in entries:
        if provider and entry.provider != provider:
            continue
        if since and entry.timestamp < since:
            continue
        if until and entry.timestamp > until:
            continue

        stats.total_prompt += entry.prompt_tokens
        stats.total_output += entry.output_tokens
        stats.total_thinking += entry.thinking_tokens
        stats.total_cached += entry.cached_tokens
        stats.turns += 1

        m = by_model[entry.model]
        m["prompt"] += entry.prompt_tokens
        m["output"] += entry.output_tokens
        m["thinking"] += entry.thinking_tokens
        m["turns"] += 1

    stats.total_tokens = stats.total_prompt + stats.total_output
    stats.by_model = dict(by_model)
    return stats


def local_now() -> datetime:
    """Current time in the system's local timezone."""
    return datetime.now().astimezone()


def local_today_start() -> datetime:
    """Midnight today in the system's local timezone."""
    now = local_now()
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def local_day_start(days_ago: int = 0) -> datetime:
    """Midnight local time *days_ago* days before today."""
    return local_today_start() - timedelta(days=days_ago)


def entry_local_date_key(entry: TokenEntry) -> str:
    """ISO date string for an entry in local time."""
    ts = entry.timestamp
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.astimezone().strftime("%Y-%m-%d")


def get_daily_breakdown(
    entries: list[TokenEntry],
    days: int = 30,
    provider: str | None = None,
) -> dict[str, TokenStats]:
    """Compute per-day statistics for the last *days* days (local timezone)."""
    cutoff = local_day_start(days - 1)

    buckets: dict[str, list[TokenEntry]] = defaultdict(list)
    for entry in entries:
        if provider and entry.provider != provider:
            continue
        ts = entry.timestamp
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if ts.astimezone() < cutoff:
            continue
        date_key = entry_local_date_key(entry)
        buckets[date_key].append(entry)

    return {date_key: compute_stats(buckets[date_key]) for date_key in sorted(buckets)}


def merge_entries(*entry_lists: list[TokenEntry]) -> list[TokenEntry]:
    """Merge entry lists, deduplicating by entry_id (later wins)."""
    by_id: dict[str, TokenEntry] = {}
    for entries in entry_lists:
        for entry in entries:
            by_id[entry.entry_id] = entry
    merged = list(by_id.values())
    merged.sort(key=lambda e: e.timestamp)
    return merged
