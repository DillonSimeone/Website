"""Import Cursor dashboard usage CSV exports for billing-accurate totals."""

from __future__ import annotations

import csv
import logging
from datetime import datetime, timezone
from pathlib import Path

from models import TokenEntry, make_entry_id

logger = logging.getLogger(__name__)

CSV_SOURCE_ID = "csv-import"
CSV_PROVIDER = "cursor"

# Common column name variants in Cursor usage CSV exports
_TIMESTAMP_COLS = ("date", "timestamp", "time", "created_at", "event_time")
_MODEL_COLS = ("model", "model_name", "modelName")
_INPUT_COLS = (
    "input_tokens", "inputTokens", "input tokens",
    "prompt_tokens", "promptTokens",
)
_OUTPUT_COLS = (
    "output_tokens", "outputTokens", "output tokens",
    "completion_tokens", "completionTokens",
)
_CACHE_COLS = (
    "cache_read_tokens", "cacheReadTokens", "cached_tokens",
    "cache_write_tokens", "cacheWriteTokens",
)
_THINKING_COLS = ("thinking_tokens", "thinkingTokens")


def _find_column(row: dict[str, str], candidates: tuple[str, ...]) -> str | None:
    keys_lower = {k.lower().strip(): k for k in row.keys()}
    for cand in candidates:
        if cand.lower() in keys_lower:
            return keys_lower[cand.lower()]
    return None


def _parse_int(value: str | None) -> int:
    if value is None or value == "":
        return 0
    try:
        return int(float(value.replace(",", "")))
    except (ValueError, TypeError):
        return 0


def _parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    value = value.strip()
    for fmt in (
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
    ):
        try:
            dt = datetime.strptime(value[:26].rstrip("Z"), fmt.replace("Z", ""))
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def parse_csv_file(csv_path: Path, account_key: str = "") -> list[TokenEntry]:
    """Parse a single Cursor usage-events CSV file."""
    entries: list[TokenEntry] = []
    if not csv_path.is_file():
        return entries

    try:
        with open(csv_path, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row_idx, row in enumerate(reader):
                if not row:
                    continue

                ts_col = _find_column(row, _TIMESTAMP_COLS)
                model_col = _find_column(row, _MODEL_COLS)
                input_col = _find_column(row, _INPUT_COLS)
                output_col = _find_column(row, _OUTPUT_COLS)
                cache_col = _find_column(row, _CACHE_COLS)
                thinking_col = _find_column(row, _THINKING_COLS)

                timestamp = _parse_timestamp(row.get(ts_col or "", ""))
                if timestamp is None:
                    continue

                prompt = _parse_int(row.get(input_col or "", ""))
                output = _parse_int(row.get(output_col or "", ""))
                cached = _parse_int(row.get(cache_col or "", ""))
                thinking = _parse_int(row.get(thinking_col or "", ""))
                model = (row.get(model_col or "", "") or "unknown").strip()

                if prompt == 0 and output == 0:
                    continue

                conv_id = f"csv:{csv_path.stem}:{row_idx}"
                entry = TokenEntry(
                    timestamp=timestamp,
                    model=model,
                    prompt_tokens=prompt,
                    output_tokens=output,
                    thinking_tokens=thinking,
                    cached_tokens=cached,
                    conversation_id=conv_id,
                    provider=CSV_PROVIDER,
                    source_id=CSV_SOURCE_ID,
                    account_key=account_key,
                )
                entry.entry_id = make_entry_id(
                    CSV_PROVIDER,
                    CSV_SOURCE_ID,
                    conv_id,
                    timestamp,
                    prompt,
                    output,
                )
                entries.append(entry)
    except OSError as exc:
        logger.warning("Could not read CSV %s: %s", csv_path, exc)

    logger.info("Imported %d entries from %s", len(entries), csv_path.name)
    return entries


def scan_csv_directory(
    csv_dir: Path,
    account_key: str = "",
) -> list[TokenEntry]:
    """Scan a directory for usage-events-*.csv files."""
    if not csv_dir.is_dir():
        return []

    all_entries: list[TokenEntry] = []
    patterns = ("usage-events-*.csv", "usage_events_*.csv", "*.csv")
    seen_files: set[str] = set()

    for pattern in patterns:
        for csv_path in sorted(csv_dir.glob(pattern)):
            key = csv_path.resolve().as_posix()
            if key in seen_files:
                continue
            seen_files.add(key)
            all_entries.extend(parse_csv_file(csv_path, account_key))

    all_entries.sort(key=lambda e: e.timestamp)
    return all_entries


def merge_csv_over_local(
    local_entries: list[TokenEntry],
    csv_entries: list[TokenEntry],
    window_seconds: int = 60,
) -> list[TokenEntry]:
    """Merge CSV billing data with local estimates.

    CSV entries are authoritative. Local cursor entries within ±window_seconds
    and same model are dropped when a CSV match exists.
    """
    if not csv_entries:
        return local_entries

    csv_cursor = [e for e in csv_entries if e.source_id == CSV_SOURCE_ID]
    if not csv_cursor:
        return local_entries

    def has_csv_match(local: TokenEntry) -> bool:
        if local.provider != "cursor" or local.source_id == CSV_SOURCE_ID:
            return False
        for csv_e in csv_cursor:
            if local.model != csv_e.model:
                continue
            delta = abs((local.timestamp - csv_e.timestamp).total_seconds())
            if delta <= window_seconds:
                return True
        return False

    kept_local = [
        e for e in local_entries
        if not has_csv_match(e)
    ]
    merged = kept_local + csv_cursor
    by_id = {e.entry_id: e for e in merged}
    result = list(by_id.values())
    result.sort(key=lambda e: e.timestamp)
    return result
