"""Token usage parser for Antigravity conversation databases.

Scans SQLite (.db) and protobuf (.pb) conversation files to extract
per-generation token usage data (prompt, output, thinking, cached) along
with model names and timestamps.

Protobuf field mappings (reverse-engineered):
    gen_metadata.data:
        root.f1.f4.f1  = output_tokens
        root.f1.f4.f2  = prompt_tokens
        root.f1.f4.f3  = total_output_tokens (including thinking)
        root.f1.f4.f5  = cached_content_tokens
        root.f1.f4.f9  = thinking_tokens
        root.f1.f4.f10 = text_tokens
        root.f1.f19    = model_name
        root.f1.f20    = repeated key-value metadata
    steps.metadata:
        f1.f1 = unix_timestamp_seconds
        f1.f2 = nanoseconds
"""

from __future__ import annotations

import logging
import sqlite3
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

from proto_decoder import (
    decode_message,
    get_field,
    get_fields,
    get_nested,
    get_string,
    get_varint,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Public data classes
# ---------------------------------------------------------------------------


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


@dataclass
class TokenStats:
    """Aggregate token statistics."""

    total_prompt: int = 0
    total_output: int = 0
    total_thinking: int = 0
    total_cached: int = 0
    total_tokens: int = 0  # prompt + output
    turns: int = 0
    by_model: dict[str, dict[str, Any]] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_DEFAULT_CONVERSATIONS_DIR = (
    r"C:\Users\DoctorNightmares\.gemini\antigravity\conversations"
)

# Plausible range for token counts — used to validate candidates found in
# .pb recursive scanning.
_MIN_TOKENS = 10
_MAX_TOKENS = 10_000_000


# ---------------------------------------------------------------------------
# Internal helpers — SQLite (.db) parsing
# ---------------------------------------------------------------------------


def _open_readonly(db_path: str | Path) -> sqlite3.Connection:
    """Open a SQLite database in read-only mode (safe while Antigravity is running).

    Uses the ``file:`` URI scheme with ``?mode=ro`` so the database can be
    read even when another process holds a write lock.
    """
    uri = f"file:{Path(db_path).as_posix()}?mode=ro"
    return sqlite3.connect(uri, uri=True)


def _extract_timestamp_from_step(step_metadata: bytes | None) -> datetime | None:
    """Decode a ``steps.metadata`` blob to extract a UTC timestamp.

    Expected structure::

        f1.f1 = unix_timestamp_seconds (varint)
        f1.f2 = nanoseconds (varint)
    """
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
    """Decode a ``gen_metadata.data`` protobuf blob.

    Returns a dict with keys: model, prompt_tokens, output_tokens,
    thinking_tokens, cached_tokens, metadata_kv.  Returns ``None`` when the
    blob cannot be decoded or lacks token fields.
    """
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

    # Token usage lives at f1.f4
    f4_bytes = get_nested(f1, 4)
    if not isinstance(f4_bytes, bytes):
        return None
    f4 = decode_message(f4_bytes)
    if not f4:
        return None

    output_tokens = get_varint(f4, 1) or 0
    prompt_tokens = get_varint(f4, 2) or 0
    # f4.f3 = total output including thinking — available but not directly
    # surfaced; we can derive thinking from f4.f9 instead.
    cached_tokens = get_varint(f4, 5) or 0
    thinking_tokens = get_varint(f4, 9) or 0
    # f4.f10 = text_tokens (informational, not surfaced separately)

    # Model name at f1.f19
    model_name = get_string(f1, 19) or "unknown"

    # Repeated key-value metadata at f1.f20
    metadata_kv: dict[str, str] = {}
    kv_msgs = get_fields(f1, 20)
    if kv_msgs:
        for kv_bytes in kv_msgs:
            if isinstance(kv_bytes, bytes):
                kv = decode_message(kv_bytes)
                if kv:
                    key = get_string(kv, 1)
                    value = get_string(kv, 2)
                    if key is not None:
                        metadata_kv[key] = value or ""

    # Skip entries that have zero tokens everywhere — they are likely not
    # real generation records.
    if prompt_tokens == 0 and output_tokens == 0:
        return None

    return {
        "model": model_name,
        "prompt_tokens": prompt_tokens,
        "output_tokens": output_tokens,
        "thinking_tokens": thinking_tokens,
        "cached_tokens": cached_tokens,
        "metadata_kv": metadata_kv,
    }


def _parse_db_file(db_path: Path) -> list[TokenEntry]:
    """Parse a single ``.db`` conversation file and return token entries."""
    conversation_id = db_path.stem
    entries: list[TokenEntry] = []

    try:
        conn = _open_readonly(db_path)
    except sqlite3.Error as exc:
        logger.warning("Cannot open %s: %s", db_path.name, exc)
        return entries

    try:
        cursor = conn.cursor()

        # ------------------------------------------------------------------
        # Pre-load step timestamps keyed by rowid / idx
        # ------------------------------------------------------------------
        step_timestamps: dict[int, datetime] = {}
        try:
            cursor.execute("SELECT rowid, metadata FROM steps")
            for rowid, metadata_blob in cursor.fetchall():
                ts = _extract_timestamp_from_step(metadata_blob)
                if ts is not None:
                    step_timestamps[rowid] = ts
        except sqlite3.OperationalError:
            # Table may not exist in every file.
            pass

        # ------------------------------------------------------------------
        # Read gen_metadata
        # ------------------------------------------------------------------
        try:
            cursor.execute("SELECT idx, data FROM gen_metadata")
        except sqlite3.OperationalError:
            logger.debug("No gen_metadata table in %s", db_path.name)
            return entries

        for idx, data_blob in cursor.fetchall():
            if data_blob is None:
                continue

            parsed = _extract_gen_metadata(data_blob)
            if parsed is None:
                continue

            # Resolve timestamp: try exact idx, then idx+1, idx-1, etc.
            timestamp = _resolve_timestamp(idx, step_timestamps)

            entries.append(
                TokenEntry(
                    timestamp=timestamp,
                    model=parsed["model"],
                    prompt_tokens=parsed["prompt_tokens"],
                    output_tokens=parsed["output_tokens"],
                    thinking_tokens=parsed["thinking_tokens"],
                    cached_tokens=parsed["cached_tokens"],
                    conversation_id=conversation_id,
                )
            )
    except sqlite3.Error as exc:
        logger.warning("Error reading %s: %s", db_path.name, exc)
    finally:
        conn.close()

    return entries


def _resolve_timestamp(
    idx: int, step_timestamps: dict[int, datetime]
) -> datetime:
    """Find the best timestamp for a given gen_metadata ``idx``.

    Tries the exact index first, then nearby indices (±1, ±2).  Falls back
    to ``datetime.min`` (UTC) when nothing is found.
    """
    for offset in (0, 1, -1, 2, -2):
        ts = step_timestamps.get(idx + offset)
        if ts is not None:
            return ts
    return datetime.min.replace(tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# Internal helpers — .pb file parsing (recursive scan)
# ---------------------------------------------------------------------------


def _is_token_message(msg: dict) -> bool:
    """Heuristic: does *msg* look like a token-usage message (field 4 sub)?

    We check that field 1 and field 2 exist as varints within the expected
    token-count range.
    """
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
    """Walk *msg* recursively looking for token-usage + model-name patterns.

    When a sub-message has a field 4 that passes ``_is_token_message``, we
    treat the parent as a generation record.  We also look for field 19
    (model name) on the same parent.
    """
    if depth > max_depth:
        return

    # Check if this message has a field 4 that looks like tokens
    f4 = get_nested(msg, 4)
    if f4 is not None and _is_token_message(f4):
        output_tokens = get_varint(f4, 1) or 0
        prompt_tokens = get_varint(f4, 2) or 0
        cached_tokens = get_varint(f4, 5) or 0
        thinking_tokens = get_varint(f4, 9) or 0
        model_name = get_string(msg, 19) or "unknown"

        results.append(
            {
                "model": model_name,
                "prompt_tokens": prompt_tokens,
                "output_tokens": output_tokens,
                "thinking_tokens": thinking_tokens,
                "cached_tokens": cached_tokens,
            }
        )
        # Don't recurse deeper into this branch — we already captured it.
        return

    # Recurse into all length-delimited (sub-message) fields.
    # get_field returns values by field number; we iterate over all field
    # numbers present in the decoded message.
    if not isinstance(msg, dict):
        return

    for field_number in list(msg.keys()):
        children = get_fields(msg, field_number)
        if children is None:
            continue
        for child in children:
            if isinstance(child, dict):
                _recursive_find_token_data(child, results, depth + 1, max_depth)


def _parse_pb_file(pb_path: Path) -> list[TokenEntry]:
    """Parse a single ``.pb`` conversation file via recursive scanning."""
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

    # .pb files don't carry easily-accessible per-entry timestamps, so we
    # fall back to the file's modification time as a rough estimate.
    try:
        file_mtime = datetime.fromtimestamp(pb_path.stat().st_mtime, tz=timezone.utc)
    except OSError:
        file_mtime = datetime.min.replace(tzinfo=timezone.utc)

    for r in results:
        entries.append(
            TokenEntry(
                timestamp=file_mtime,
                model=r["model"],
                prompt_tokens=r["prompt_tokens"],
                output_tokens=r["output_tokens"],
                thinking_tokens=r["thinking_tokens"],
                cached_tokens=r["cached_tokens"],
                conversation_id=conversation_id,
            )
        )

    return entries


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def scan_conversations(
    conversations_dir: str | None = None,
    last_scan_time: datetime | None = None,
    existing_entries: list[TokenEntry] | None = None,
) -> list[TokenEntry]:
    """Scan all ``.db`` and ``.pb`` conversation files for token usage data.

    If last_scan_time is provided and existing_entries is given, we skip scanning
    files that haven't changed since last_scan_time, only appending new entries.

    Args:
        conversations_dir: Path to the conversations directory.  Defaults to
            the standard Antigravity location.
        last_scan_time: Optional timestamp of the last scan.
        existing_entries: Optional list of previously parsed TokenEntry items.

    Returns:
        All discovered :class:`TokenEntry` objects sorted by timestamp
        (oldest first).
    """
    base = Path(conversations_dir or _DEFAULT_CONVERSATIONS_DIR)
    if not base.is_dir():
        logger.error("Conversations directory does not exist: %s", base)
        return []

    all_entries: list[TokenEntry] = []
    retained_entries: list[TokenEntry] = []

    # If we have existing entries, filter out the ones from files that we are going to re-scan
    files_to_rescan = set()

    # Determine files to scan
    db_files = sorted(base.glob("*.db"))
    pb_files = sorted(base.glob("*.pb"))

    # We always scan files modified after last_scan_time minus a small buffer (e.g. 5 seconds)
    # to account for filesystem timestamp resolution and write delays.
    cutoff = datetime.min.replace(tzinfo=timezone.utc)
    if last_scan_time is not None:
        # Buffer of 10s to handle active writes
        cutoff = last_scan_time - timedelta(seconds=10)

    for db_file in db_files:
        try:
            mtime = datetime.fromtimestamp(db_file.stat().st_mtime, tz=timezone.utc)
        except OSError:
            mtime = datetime.now(timezone.utc)

        if last_scan_time is None or existing_entries is None or mtime > cutoff:
            files_to_rescan.add(db_file.stem)
            logger.debug("Scanning/Rescanning DB: %s", db_file.name)
            all_entries.extend(_parse_db_file(db_file))
        else:
            logger.debug("Skipping DB (unchanged): %s", db_file.name)

    for pb_file in pb_files:
        try:
            mtime = datetime.fromtimestamp(pb_file.stat().st_mtime, tz=timezone.utc)
        except OSError:
            mtime = datetime.now(timezone.utc)

        if last_scan_time is None or existing_entries is None or mtime > cutoff:
            files_to_rescan.add(pb_file.stem)
            logger.debug("Scanning/Rescanning PB: %s", pb_file.name)
            all_entries.extend(_parse_pb_file(pb_file))
        else:
            logger.debug("Skipping PB (unchanged): %s", pb_file.name)

    # Retain existing entries for files that weren't re-scanned
    if existing_entries:
        for entry in existing_entries:
            if entry.conversation_id not in files_to_rescan:
                retained_entries.append(entry)

    all_entries.extend(retained_entries)
    all_entries.sort(key=lambda e: e.timestamp)
    return all_entries


def compute_stats(
    entries: list[TokenEntry],
    since: datetime | None = None,
    until: datetime | None = None,
) -> TokenStats:
    """Compute aggregate token statistics.

    Args:
        entries: List of :class:`TokenEntry` (typically from
            :func:`scan_conversations`).
        since: If given, exclude entries before this datetime.
        until: If given, exclude entries after this datetime.

    Returns:
        A :class:`TokenStats` summarising the (filtered) entries.
    """
    stats = TokenStats()
    by_model: dict[str, dict[str, int]] = defaultdict(
        lambda: {"prompt": 0, "output": 0, "thinking": 0, "turns": 0}
    )

    for entry in entries:
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


def get_daily_breakdown(
    entries: list[TokenEntry],
    days: int = 30,
) -> dict[str, TokenStats]:
    """Compute per-day statistics for the last *days* days.

    Args:
        entries: List of :class:`TokenEntry`.
        days: Number of days to look back from today (UTC).

    Returns:
        A dict mapping ISO date strings (``YYYY-MM-DD``) to
        :class:`TokenStats`.  Only days with at least one entry are included.
    """
    now = datetime.now(tz=timezone.utc)
    cutoff = now.replace(hour=0, minute=0, second=0, microsecond=0)
    # Move cutoff back by (days - 1) so "today" is included.
    from datetime import timedelta

    cutoff -= timedelta(days=days - 1)

    # Bucket entries by date string.
    buckets: dict[str, list[TokenEntry]] = defaultdict(list)
    for entry in entries:
        if entry.timestamp < cutoff:
            continue
        date_key = entry.timestamp.strftime("%Y-%m-%d")
        buckets[date_key].append(entry)

    result: dict[str, TokenStats] = {}
    for date_key in sorted(buckets):
        result[date_key] = compute_stats(buckets[date_key])

    return result
