"""Token usage parser for Cursor IDE state databases."""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from data_sources import DataSource
from models import TokenEntry, make_entry_id

logger = logging.getLogger(__name__)

DEFAULT_CURSOR_DB_MAX_MB = 2048


def _open_readonly(db_path: Path) -> sqlite3.Connection:
    uri = f"file:{db_path.as_posix()}?mode=ro"
    return sqlite3.connect(uri, uri=True)


def _parse_json_value(raw: bytes | str | None) -> dict | None:
    if raw is None:
        return None
    try:
        if isinstance(raw, bytes):
            text = raw.decode("utf-8", errors="replace")
        else:
            text = str(raw)
        return json.loads(text)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        text = value.replace("Z", "+00:00")
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


def _ms_to_datetime(ms: int | float | None) -> datetime | None:
    if ms is None:
        return None
    try:
        return datetime.fromtimestamp(float(ms) / 1000.0, tz=timezone.utc)
    except (OSError, OverflowError, ValueError):
        return None


def _load_composer_models(conn: sqlite3.Connection) -> dict[str, str]:
    """Map composerId -> model name from composerData keys."""
    models: dict[str, str] = {}
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%'"
        )
        for key, value in cur.fetchall():
            composer_id = key.split(":", 1)[-1] if ":" in key else ""
            data = _parse_json_value(value)
            if not data:
                continue
            model = (
                data.get("lastUsedModel")
                or data.get("model")
                or data.get("modelName")
            )
            if model:
                models[composer_id] = str(model)
    except sqlite3.Error as exc:
        logger.debug("Could not load composer models: %s", exc)
    return models


def _extract_bubble_tokens(
    key: str,
    data: dict,
    composer_models: dict[str, str],
    source: DataSource,
) -> TokenEntry | None:
    if not key.startswith("bubbleId:"):
        return None

    parts = key.split(":")
    if len(parts) < 3:
        return None
    composer_id = parts[1]
    bubble_id = parts[2]

    token_count = data.get("tokenCount") or {}
    prompt = int(token_count.get("inputTokens") or 0)
    output = int(token_count.get("outputTokens") or 0)

    if prompt == 0 and output == 0:
        ctx = data.get("contextWindowStatusAtCreation") or {}
        prompt = int(ctx.get("tokensUsed") or 0)

    if prompt == 0 and output == 0:
        return None

    timing = data.get("timingInfo") or {}
    timestamp = (
        _ms_to_datetime(timing.get("clientRpcSendTime"))
        or _ms_to_datetime(timing.get("clientEndTime"))
        or _parse_iso_datetime(data.get("createdAt"))
    )
    if timestamp is None:
        return None

    model = composer_models.get(composer_id, "unknown")
    if model == "unknown":
        usage = data.get("usageData") or {}
        if isinstance(usage, dict) and usage:
            model = next(iter(usage.keys()), "unknown")

    cached = int(token_count.get("cachedTokens") or token_count.get("cacheReadTokens") or 0)
    thinking = int(token_count.get("thinkingTokens") or 0)

    entry = TokenEntry(
        timestamp=timestamp,
        model=str(model),
        prompt_tokens=prompt,
        output_tokens=output,
        thinking_tokens=thinking,
        cached_tokens=cached,
        conversation_id=composer_id,
        provider="cursor",
        source_id=source.source_id,
        account_key=source.account_key,
    )
    entry.entry_id = make_entry_id(
        "cursor",
        source.source_id,
        f"{composer_id}:{bubble_id}",
        timestamp,
        prompt,
        output,
    )
    return entry


def _scan_state_vscdb(
    source: DataSource,
    seen_bubble_keys: set[str] | None = None,
    db_max_mb: int = DEFAULT_CURSOR_DB_MAX_MB,
) -> tuple[list[TokenEntry], set[str]]:
    """Parse bubbleId entries from a Cursor state.vscdb file."""
    entries: list[TokenEntry] = []
    new_seen: set[str] = set(seen_bubble_keys or [])

    db_path = source.path
    if not db_path.is_file():
        return entries, new_seen

    size_mb = db_path.stat().st_size / (1024 * 1024)
    if size_mb > db_max_mb:
        logger.warning(
            "Cursor DB %s is %.0f MB (limit %d MB); scan may be slow",
            db_path.name, size_mb, db_max_mb,
        )

    try:
        conn = _open_readonly(db_path)
    except sqlite3.Error as exc:
        logger.warning("Cannot open Cursor DB %s: %s", db_path, exc)
        return entries, new_seen

    try:
        composer_models = _load_composer_models(conn)
        cur = conn.cursor()

        # Only fetch bubbles we haven't seen (delta scan)
        if new_seen:
            placeholders = ",".join("?" * len(new_seen))
            query = (
                f"SELECT key, value FROM cursorDiskKV "
                f"WHERE key LIKE 'bubbleId:%' AND key NOT IN ({placeholders})"
            )
            cur.execute(query, list(new_seen))
        else:
            cur.execute(
                "SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'"
            )

        for key, value in cur.fetchall():
            new_seen.add(key)
            data = _parse_json_value(value)
            if not data:
                continue
            entry = _extract_bubble_tokens(key, data, composer_models, source)
            if entry:
                entries.append(entry)
    except sqlite3.Error as exc:
        logger.warning("Error reading Cursor DB %s: %s", db_path.name, exc)
    finally:
        conn.close()

    entries.sort(key=lambda e: e.timestamp)
    return entries, new_seen


def scan_source(
    source: DataSource,
    seen_bubble_keys: set[str] | None = None,
    existing_entries: list[TokenEntry] | None = None,
    db_max_mb: int = DEFAULT_CURSOR_DB_MAX_MB,
) -> tuple[list[TokenEntry], set[str]]:
    """Scan a single Cursor data source."""
    if source.source_type in ("global_state", "workspace_state"):
        new_entries, new_seen = _scan_state_vscdb(source, seen_bubble_keys, db_max_mb)
    elif source.source_type == "chat_store":
        # store.db format is session metadata; bubble data lives in state.vscdb
        return list(existing_entries or []), set(seen_bubble_keys or [])
    else:
        new_entries, new_seen = _scan_state_vscdb(source, seen_bubble_keys, db_max_mb)

    source_existing = [
        e for e in (existing_entries or [])
        if e.source_id == source.source_id
    ]

    if seen_bubble_keys:
        # Delta mode: keep old entries and append new ones
        by_id = {e.entry_id: e for e in source_existing}
        for entry in new_entries:
            by_id[entry.entry_id] = entry
        merged = list(by_id.values())
        merged.sort(key=lambda e: e.timestamp)
        return merged, new_seen

    return new_entries, new_seen


def scan_all_cursor(
    sources: list[DataSource],
    source_states: dict[str, set[str]] | None = None,
    existing_entries: list[TokenEntry] | None = None,
    db_max_mb: int = DEFAULT_CURSOR_DB_MAX_MB,
) -> tuple[list[TokenEntry], dict[str, list[str]]]:
    """Scan all Cursor sources. Returns entries and updated seen_bubble_keys per source."""
    all_entries: list[TokenEntry] = []
    updated_states: dict[str, list[str]] = {}

    cursor_sources = [s for s in sources if s.provider == "cursor" and s.source_type != "chat_store"]
    # Prefer global state; workspace DBs often duplicate or lack token data
    global_sources = [s for s in cursor_sources if s.source_type == "global_state"]
    workspace_sources = [s for s in cursor_sources if s.source_type == "workspace_state"]

    scan_order = global_sources + workspace_sources

    for source in scan_order:
        seen = set((source_states or {}).get(source.source_id, []))
        entries, new_seen = scan_source(
            source,
            seen_bubble_keys=seen,
            existing_entries=existing_entries,
            db_max_mb=db_max_mb,
        )
        updated_states[source.source_id] = list(new_seen)
        all_entries.extend(entries)

    # Deduplicate across global + workspace
    by_id: dict[str, TokenEntry] = {}
    for entry in all_entries:
        by_id[entry.entry_id] = entry

    merged = list(by_id.values())
    merged.sort(key=lambda e: e.timestamp)
    return merged, updated_states
