"""Token usage parser for Antigravity conversation databases."""

from __future__ import annotations

import logging
import sqlite3
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

from data_sources import DataSource
from models import TokenEntry, make_entry_id
from proto_decoder import (
    decode_message,
    get_field,
    get_fields,
    get_nested,
    get_string,
    get_varint,
)

logger = logging.getLogger(__name__)

# Prefer newer IDE folder when the same conversation exists in multiple variants.
_SOURCE_PRIORITY = {
    "antigravity-ide": 0,
    "antigravity": 1,
    "antigravity-backup": 2,
}

_MIN_TOKENS = 10
_MAX_TOKENS = 10_000_000


def _open_readonly(db_path: str | Path) -> sqlite3.Connection:
    uri = f"file:{Path(db_path).as_posix()}?mode=ro"
    return sqlite3.connect(uri, uri=True)


def _extract_timestamp_from_step(step_metadata: bytes | None) -> datetime | None:
    if not step_metadata:
        return None
    try:
        msg = decode_message(step_metadata)
        ts_msg = get_nested(msg, 1)
        if not isinstance(ts_msg, bytes):
            return None
        ts_fields = decode_message(ts_msg)
        seconds = get_varint(ts_fields, 1)
        nanos = get_varint(ts_fields, 2) or 0
        if seconds is None or seconds <= 0:
            return None
        return datetime.fromtimestamp(seconds + nanos / 1e9, tz=timezone.utc)
    except Exception:
        return None


def _extract_gen_metadata(data_blob: bytes) -> dict[str, Any] | None:
    try:
        root = decode_message(data_blob)
    except Exception:
        return None

    f1_bytes = get_nested(root, 1)
    if not isinstance(f1_bytes, bytes):
        return None
    f1 = decode_message(f1_bytes)
    if not f1:
        return None

    f4_bytes = get_nested(f1, 4)
    if not isinstance(f4_bytes, bytes):
        return None
    f4 = decode_message(f4_bytes)
    if not f4:
        return None

    output_tokens = get_varint(f4, 1) or 0
    context_tokens = get_varint(f4, 2) or 0
    text_tokens = get_varint(f4, 10) or 0
    # f4.f2 is often the full context size for a request; summing it across turns
    # massively over-counts. f4.f10 (text_tokens) is the per-turn input increment.
    prompt_tokens = text_tokens if text_tokens > 0 else context_tokens
    cached_tokens = get_varint(f4, 5) or 0
    thinking_tokens = get_varint(f4, 9) or 0
    model_name = get_string(f1, 19) or "unknown"

    if prompt_tokens == 0 and output_tokens == 0:
        return None

    return {
        "model": model_name,
        "prompt_tokens": prompt_tokens,
        "output_tokens": output_tokens,
        "thinking_tokens": thinking_tokens,
        "cached_tokens": cached_tokens,
        "context_tokens": context_tokens,
    }


def _resolve_timestamp(idx: int, step_timestamps: dict[int, datetime]) -> datetime:
    for offset in (0, 1, -1, 2, -2):
        ts = step_timestamps.get(idx + offset)
        if ts is not None:
            return ts
    return datetime.min.replace(tzinfo=timezone.utc)


def _stamp_entry(
    entry: TokenEntry,
    source: DataSource,
    gen_idx: int,
) -> TokenEntry:
    entry.provider = "antigravity"
    entry.source_id = source.source_id
    entry.account_key = source.account_key
    entry.entry_id = make_entry_id(
        "antigravity",
        source.source_id,
        f"{entry.conversation_id}:{gen_idx}",
        entry.timestamp,
        entry.prompt_tokens,
        entry.output_tokens,
    )
    return entry


def _parse_db_file(db_path: Path, source: DataSource) -> list[TokenEntry]:
    conversation_id = db_path.stem
    entries: list[TokenEntry] = []

    try:
        conn = _open_readonly(db_path)
    except sqlite3.Error as exc:
        logger.warning("Cannot open %s: %s", db_path.name, exc)
        return entries

    try:
        cursor = conn.cursor()
        step_timestamps: dict[int, datetime] = {}
        try:
            cursor.execute("SELECT rowid, metadata FROM steps")
            for rowid, metadata_blob in cursor.fetchall():
                ts = _extract_timestamp_from_step(metadata_blob)
                if ts is not None:
                    step_timestamps[rowid] = ts
        except sqlite3.OperationalError:
            pass

        try:
            cursor.execute("SELECT idx, data FROM gen_metadata")
        except sqlite3.OperationalError:
            return entries

        for idx, data_blob in cursor.fetchall():
            if data_blob is None:
                continue
            parsed = _extract_gen_metadata(data_blob)
            if parsed is None:
                continue
            timestamp = _resolve_timestamp(idx, step_timestamps)
            entry = TokenEntry(
                timestamp=timestamp,
                model=parsed["model"],
                prompt_tokens=parsed["prompt_tokens"],
                output_tokens=parsed["output_tokens"],
                thinking_tokens=parsed["thinking_tokens"],
                cached_tokens=parsed["cached_tokens"],
                conversation_id=conversation_id,
            )
            entries.append(_stamp_entry(entry, source, idx))
    except sqlite3.Error as exc:
        logger.warning("Error reading %s: %s", db_path.name, exc)
    finally:
        conn.close()

    return entries


def _is_token_message(msg: dict) -> bool:
    f1 = get_varint(msg, 1)
    f2 = get_varint(msg, 2)
    if f1 is None or f2 is None:
        return False
    return _MIN_TOKENS <= f1 <= _MAX_TOKENS and _MIN_TOKENS <= f2 <= _MAX_TOKENS


def _recursive_find_token_data(
    msg: dict,
    results: list[dict[str, Any]],
    depth: int = 0,
    max_depth: int = 20,
) -> None:
    if depth > max_depth:
        return

    f4 = get_nested(msg, 4)
    if f4 is not None and _is_token_message(f4):
        context_tokens = get_varint(f4, 2) or 0
        text_tokens = get_varint(f4, 10) or 0
        prompt_tokens = text_tokens if text_tokens > 0 else context_tokens
        results.append({
            "model": get_string(msg, 19) or "unknown",
            "prompt_tokens": prompt_tokens,
            "output_tokens": get_varint(f4, 1) or 0,
            "thinking_tokens": get_varint(f4, 9) or 0,
            "cached_tokens": get_varint(f4, 5) or 0,
        })
        return

    if not isinstance(msg, dict):
        return
    for field_number in list(msg.keys()):
        children = get_fields(msg, field_number)
        if children is None:
            continue
        for child in children:
            if isinstance(child, dict):
                _recursive_find_token_data(child, results, depth + 1, max_depth)


def _parse_pb_file(pb_path: Path, source: DataSource) -> list[TokenEntry]:
    conversation_id = pb_path.stem
    entries: list[TokenEntry] = []

    try:
        raw = pb_path.read_bytes()
        if not raw:
            return entries
        root = decode_message(raw)
    except Exception as exc:
        logger.warning("Cannot decode %s: %s", pb_path.name, exc)
        return entries

    results: list[dict[str, Any]] = []
    try:
        _recursive_find_token_data(root, results)
    except Exception as exc:
        logger.warning("Error scanning %s: %s", pb_path.name, exc)
        return entries

    try:
        file_mtime = datetime.fromtimestamp(pb_path.stat().st_mtime, tz=timezone.utc)
    except OSError:
        file_mtime = datetime.min.replace(tzinfo=timezone.utc)

    for i, r in enumerate(results):
        entry = TokenEntry(
            timestamp=file_mtime,
            model=r["model"],
            prompt_tokens=r["prompt_tokens"],
            output_tokens=r["output_tokens"],
            thinking_tokens=r["thinking_tokens"],
            cached_tokens=r["cached_tokens"],
            conversation_id=conversation_id,
        )
        entries.append(_stamp_entry(entry, source, i))

    return entries


def _source_priority(source: DataSource) -> int:
    return _SOURCE_PRIORITY.get(source.path.parent.name, 99)


def scan_source(
    source: DataSource,
    last_scan_time: datetime | None = None,
    existing_entries: list[TokenEntry] | None = None,
    exclude_conversation_ids: set[str] | None = None,
) -> list[TokenEntry]:
    """Scan a single AntiGravity conversations directory."""
    base = source.path
    if not base.is_dir():
        logger.error("Conversations directory does not exist: %s", base)
        return []

    excluded = exclude_conversation_ids or set()
    all_entries: list[TokenEntry] = []
    retained_entries: list[TokenEntry] = []
    files_to_rescan: set[str] = set()

    db_files = sorted(f for f in base.glob("*.db") if f.stem not in excluded)
    pb_files = sorted(f for f in base.glob("*.pb") if f.stem not in excluded)

    cutoff = datetime.min.replace(tzinfo=timezone.utc)
    if last_scan_time is not None:
        cutoff = last_scan_time - timedelta(seconds=10)

    source_existing = [
        e for e in (existing_entries or [])
        if e.source_id == source.source_id
    ]

    for db_file in db_files:
        try:
            mtime = datetime.fromtimestamp(db_file.stat().st_mtime, tz=timezone.utc)
        except OSError:
            mtime = datetime.now(timezone.utc)

        if last_scan_time is None or not source_existing or mtime > cutoff:
            files_to_rescan.add(db_file.stem)
            all_entries.extend(_parse_db_file(db_file, source))

    for pb_file in pb_files:
        try:
            mtime = datetime.fromtimestamp(pb_file.stat().st_mtime, tz=timezone.utc)
        except OSError:
            mtime = datetime.now(timezone.utc)

        if last_scan_time is None or not source_existing or mtime > cutoff:
            files_to_rescan.add(pb_file.stem)
            all_entries.extend(_parse_pb_file(pb_file, source))

    for entry in source_existing:
        if entry.conversation_id not in files_to_rescan:
            retained_entries.append(entry)

    all_entries.extend(retained_entries)
    all_entries.sort(key=lambda e: e.timestamp)
    return all_entries


def scan_all_antigravity(
    sources: list[DataSource],
    last_scan_time: datetime | None = None,
    existing_entries: list[TokenEntry] | None = None,
) -> list[TokenEntry]:
    """Scan all discovered AntiGravity sources, deduplicating by conversation ID."""
    ag_sources = [s for s in sources if s.provider == "antigravity"]
    ag_sources.sort(key=_source_priority)

    seen_conversation_ids: set[str] = set()
    all_entries: list[TokenEntry] = []

    for source in ag_sources:
        entries = scan_source(
            source,
            last_scan_time,
            existing_entries,
            exclude_conversation_ids=seen_conversation_ids,
        )
        all_entries.extend(entries)
        seen_conversation_ids.update(
            f.stem for f in source.path.glob("*.db")
        )
        seen_conversation_ids.update(
            f.stem for f in source.path.glob("*.pb")
        )

    all_entries.sort(key=lambda e: e.timestamp)
    return all_entries
