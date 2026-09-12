"""Dynamic discovery of AntiGravity and Cursor data sources."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import sqlite3
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

logger = logging.getLogger(__name__)

Provider = Literal["antigravity", "cursor"]

ANTIGRAVITY_VARIANT_PREFIXES = (
    "antigravity",
    "antigravity-ide",
    "antigravity-backup",
    "Antigravity",
    "Antigravity IDE",
)

CURSOR_AUTH_EMAIL_KEY = "cursorAuth/cachedEmail"


@dataclass
class DataSource:
    """A discovered token data location."""

    provider: Provider
    source_id: str
    path: Path
    account_key: str = ""
    source_type: str = ""
    extra_paths: list[Path] = field(default_factory=list)


def _detect_runtime_root() -> Path:
    """Resolve a writable app root relative to the running executable/script.

    Preference order:
    1) If frozen exe: nearest parent containing index.html (project root)
    2) Frozen exe directory
    3) Source checkout root (directory containing this module)
    """
    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).resolve().parent
        # Walk up a few levels to find the website/project root.
        for candidate in [exe_dir, *exe_dir.parents[:5]]:
            if (candidate / "index.html").is_file():
                return candidate
        return exe_dir
    return Path(__file__).resolve().parent


def get_app_data_dir(data_dir: str | Path | None = None) -> Path:
    """Return the app config/cache root.

    Defaults to a runtime-relative folder so the EXE writes cache.json beside the
    project files when available, rather than in the user home directory.
    """
    if data_dir:
        root = Path(data_dir).expanduser()
    else:
        root = _detect_runtime_root()
    root.mkdir(parents=True, exist_ok=True)
    return root


def get_default_cursor_csv_dir(data_dir: Path | None = None) -> Path:
    """Default folder for Cursor dashboard CSV imports."""
    root = data_dir or get_app_data_dir()
    csv_dir = root / "cursor-csv"
    csv_dir.mkdir(parents=True, exist_ok=True)
    return csv_dir


def make_source_id(provider: str, path: Path) -> str:
    """Stable short hash for a data source path."""
    key = f"{provider}:{path.resolve().as_posix().lower()}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def _open_readonly(db_path: Path) -> sqlite3.Connection:
    uri = f"file:{db_path.as_posix()}?mode=ro"
    return sqlite3.connect(uri, uri=True)


def read_vscdb_string(db_path: Path, table: str, key: str) -> str | None:
    """Read a string value from state.vscdb ItemTable or cursorDiskKV."""
    if not db_path.is_file():
        return None
    try:
        conn = _open_readonly(db_path)
        try:
            cur = conn.cursor()
            cur.execute(f"SELECT value FROM {table} WHERE key = ?", (key,))
            row = cur.fetchone()
            if not row or row[0] is None:
                return None
            raw = row[0]
            if isinstance(raw, bytes):
                text = raw.decode("utf-8", errors="replace").strip()
            else:
                text = str(raw).strip()
            if text.startswith('"') and text.endswith('"'):
                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    return text.strip('"')
            return text or None
        finally:
            conn.close()
    except (sqlite3.Error, OSError) as exc:
        logger.debug("Could not read %s from %s: %s", key, db_path, exc)
        return None


def _has_conversation_files(conversations_dir: Path) -> bool:
    if not conversations_dir.is_dir():
        return False
    return any(conversations_dir.glob("*.db")) or any(conversations_dir.glob("*.pb"))


def _antigravity_account_key(variant_dir: Path, conversations_dir: Path) -> str:
    """Best-effort account identity for an AntiGravity variant folder."""
    for name in ("antigravity_state.pbtxt", "user_settings.pb"):
        state_file = variant_dir / name
        if not state_file.is_file():
            continue
        try:
            text = state_file.read_text(encoding="utf-8", errors="replace")
            email_match = re.search(
                r'[\w.+-]+@[\w.-]+\.\w+', text
            )
            if email_match:
                return email_match.group(0)
        except OSError:
            pass

    # Check Antigravity IDE state.vscdb for auth email
    appdata = os.environ.get("APPDATA")
    if appdata:
        for app_name in ("Antigravity IDE", "Antigravity"):
            state_db = Path(appdata) / app_name / "User" / "globalStorage" / "state.vscdb"
            email = read_vscdb_string(state_db, "ItemTable", "cursorAuth/cachedEmail")
            if email:
                return email

    # Fallback: path + newest conversation mtime
    try:
        mtimes = [
            f.stat().st_mtime
            for pattern in ("*.db", "*.pb")
            for f in conversations_dir.glob(pattern)
        ]
        if mtimes:
            return f"{variant_dir.name}@{int(max(mtimes))}"
    except OSError:
        pass
    return variant_dir.name


def discover_antigravity_sources(
    extra_dirs: list[Path] | None = None,
) -> list[DataSource]:
    """Find all AntiGravity conversation directories on this machine."""
    sources: list[DataSource] = []
    seen_paths: set[str] = set()

    gemini_root = Path.home() / ".gemini"
    candidates: list[Path] = []

    if gemini_root.is_dir():
        for child in sorted(gemini_root.iterdir()):
            if not child.is_dir():
                continue
            name_lower = child.name.lower()
            if any(
                name_lower == prefix.lower() or name_lower.startswith(prefix.lower())
                for prefix in ANTIGRAVITY_VARIANT_PREFIXES
            ):
                candidates.append(child / "conversations")

    if extra_dirs:
        for d in extra_dirs:
            candidates.append(Path(d).expanduser())

    for conv_dir in candidates:
        conv_resolved = conv_dir.resolve()
        path_key = conv_resolved.as_posix().lower()
        if path_key in seen_paths:
            continue
        if not _has_conversation_files(conv_resolved):
            continue
        seen_paths.add(path_key)
        variant_dir = conv_resolved.parent
        account = _antigravity_account_key(variant_dir, conv_resolved)
        sources.append(
            DataSource(
                provider="antigravity",
                source_id=make_source_id("antigravity", conv_resolved),
                path=conv_resolved,
                account_key=account,
                source_type="conversations",
            )
        )
        logger.info("Discovered AntiGravity source: %s (account: %s)", conv_resolved, account)

    return sources


def discover_cursor_sources() -> list[DataSource]:
    """Find Cursor state databases that may contain token usage."""
    sources: list[DataSource] = []
    seen_ids: set[str] = set()

    appdata = os.environ.get("APPDATA")
    if not appdata:
        logger.warning("APPDATA not set; cannot discover Cursor sources on this platform")
        return sources

    cursor_user = Path(appdata) / "Cursor" / "User"
    global_db = cursor_user / "globalStorage" / "state.vscdb"
    if global_db.is_file():
        email = read_vscdb_string(global_db, "ItemTable", CURSOR_AUTH_EMAIL_KEY) or ""
        sid = make_source_id("cursor", global_db)
        if sid not in seen_ids:
            seen_ids.add(sid)
            sources.append(
                DataSource(
                    provider="cursor",
                    source_id=sid,
                    path=global_db,
                    account_key=email,
                    source_type="global_state",
                )
            )
            logger.info("Discovered Cursor global source: %s (account: %s)", global_db, email or "unknown")

    workspace_root = cursor_user / "workspaceStorage"
    if workspace_root.is_dir():
        for ws_dir in sorted(workspace_root.iterdir()):
            if not ws_dir.is_dir():
                continue
            ws_db = ws_dir / "state.vscdb"
            if not ws_db.is_file():
                continue
            sid = make_source_id("cursor", ws_db)
            if sid in seen_ids:
                continue
            seen_ids.add(sid)
            sources.append(
                DataSource(
                    provider="cursor",
                    source_id=sid,
                    path=ws_db,
                    account_key=email if global_db.is_file() else "",
                    source_type="workspace_state",
                )
            )

    # Newer chat store layer
    chats_root = Path.home() / ".cursor" / "chats"
    if chats_root.is_dir():
        for store_db in sorted(chats_root.rglob("store.db")):
            sid = make_source_id("cursor", store_db)
            if sid in seen_ids:
                continue
            seen_ids.add(sid)
            sources.append(
                DataSource(
                    provider="cursor",
                    source_id=sid,
                    path=store_db,
                    account_key=email if global_db.is_file() else "",
                    source_type="chat_store",
                )
            )

    return sources


def discover_all_sources(
    providers: list[str] | None = None,
    extra_antigravity_dirs: list[Path] | None = None,
) -> list[DataSource]:
    """Discover all enabled data sources."""
    enabled = {p.lower() for p in (providers or ["antigravity", "cursor"])}
    sources: list[DataSource] = []
    if "antigravity" in enabled:
        sources.extend(discover_antigravity_sources(extra_antigravity_dirs))
    if "cursor" in enabled:
        sources.extend(discover_cursor_sources())
    return sources
