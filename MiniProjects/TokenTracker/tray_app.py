"""
System Tray Application for LLM Token Tracker.

Manages the tray icon, tooltip, refresh timer, and popup lifecycle.
Supports AntiGravity and Cursor token tracking with unified caching.
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
import threading
import time
import tkinter as tk
from datetime import datetime, timezone, timedelta
from pathlib import Path
from tkinter import filedialog

import pystray
from pystray import MenuItem as Item

from antigravity_parser import scan_all_antigravity
from cursor_csv_importer import (
    CSV_SOURCE_ID,
    merge_csv_over_local,
    parse_csv_file,
    scan_csv_directory,
)
from cursor_parser import scan_all_cursor, DEFAULT_CURSOR_DB_MAX_MB
from data_sources import (
    DataSource,
    discover_all_sources,
    get_app_data_dir,
    get_default_cursor_csv_dir,
)
from icon_gen import create_tray_icon, create_default_icon, format_token_count
from models import (
    TokenEntry,
    SourceScanState,
    compute_stats,
    entry_from_dict,
    entry_to_dict,
    get_daily_breakdown,
    local_day_start,
    local_today_start,
    merge_entries,
)
from popup_ui import TokenPopup

logger = logging.getLogger('token_tracker')

CACHE_VERSION = 3


class TokenTrackerApp:
    """Main system tray application."""

    def __init__(
        self,
        providers: list[str] | None = None,
        data_dir: str | Path | None = None,
        refresh_interval_minutes: int = 60,
        extra_antigravity_dirs: list[str] | None = None,
        cursor_csv_dir: str | Path | None = None,
        cursor_db_max_mb: int = DEFAULT_CURSOR_DB_MAX_MB,
    ):
        self.providers = providers or ["antigravity", "cursor"]
        self.data_dir = get_app_data_dir(data_dir)
        self.refresh_interval_minutes = refresh_interval_minutes
        self.cursor_db_max_mb = cursor_db_max_mb
        self.cursor_csv_dir = Path(cursor_csv_dir) if cursor_csv_dir else get_default_cursor_csv_dir(self.data_dir)

        extra = [Path(d) for d in (extra_antigravity_dirs or [])]
        self.extra_antigravity_dirs = extra
        self.sources: list[DataSource] = discover_all_sources(self.providers, extra)
        self.entries: list[TokenEntry] = []
        self.last_scan_time: datetime | None = None
        self.source_states: dict[str, SourceScanState] = {}
        self.popup: TokenPopup | None = None
        self.tray_icon: pystray.Icon | None = None
        self._stop_event = threading.Event()
        self._refresh_thread: threading.Thread | None = None

        self.root = tk.Tk()
        self.root.withdraw()

        self._cache_file = self.data_dir / "cache.json"
        self._legacy_cache_files = self._find_legacy_cache_files()

    def _find_legacy_cache_files(self) -> list[Path]:
        """Locate v1 cache files for one-time migration."""
        legacy: list[Path] = []
        gemini_root = Path.home() / ".gemini"
        if gemini_root.is_dir():
            for variant in gemini_root.iterdir():
                cache = variant / "token_tracker_cache.json"
                if cache.is_file():
                    legacy.append(cache)
        return legacy

    def _load_cache(self) -> None:
        if self._cache_file.exists():
            self._load_cache_v2(self._cache_file)
            return

        for legacy_path in self._legacy_cache_files:
            if legacy_path.exists():
                logger.info("Migrating legacy cache from %s", legacy_path)
                self._load_cache_v1(legacy_path)
                return

        logger.info("No cache file found. A full scan will be performed.")

    def _load_cache_v1(self, path: Path) -> None:
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            for item in data.get("entries", []):
                entry = entry_from_dict(item)
                if not entry.provider or entry.provider == "antigravity":
                    entry.provider = "antigravity"
                if not entry.source_id and self.sources:
                    ag = next((s for s in self.sources if s.provider == "antigravity"), None)
                    if ag:
                        entry.source_id = ag.source_id
                        entry.account_key = ag.account_key
                self.entries.append(entry)
            if data.get("last_scan_time"):
                self.last_scan_time = datetime.fromisoformat(data["last_scan_time"])
            logger.info("Migrated %d entries from v1 cache", len(self.entries))
        except Exception as exc:
            logger.error("Error loading legacy cache: %s", exc, exc_info=True)

    def _load_cache_v2(self, path: Path) -> None:
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)

            cache_version = data.get("version", 1)
            if cache_version < CACHE_VERSION:
                logger.info(
                    "Cache version %s is outdated (current: %s); forcing full rescan",
                    cache_version, CACHE_VERSION,
                )
                return

            self.entries = [entry_from_dict(item) for item in data.get("entries", [])]

            for sid, src_data in data.get("sources", {}).items():
                lst = src_data.get("last_scan_time")
                self.source_states[sid] = SourceScanState(
                    provider=src_data.get("provider", ""),
                    path=src_data.get("path", ""),
                    account_key=src_data.get("account_key", ""),
                    last_scan_time=datetime.fromisoformat(lst) if lst else None,
                    last_db_mtime=src_data.get("last_db_mtime"),
                    seen_entry_ids=src_data.get("seen_entry_ids", []),
                    seen_bubble_keys=src_data.get("seen_bubble_keys", []),
                )

            if data.get("last_scan_time"):
                self.last_scan_time = datetime.fromisoformat(data["last_scan_time"])

            logger.info(
                "Loaded %d cached entries from v2 cache. Last scan: %s",
                len(self.entries), self.last_scan_time,
            )
        except Exception as exc:
            logger.error("Error loading cache file: %s", exc, exc_info=True)

    def _save_cache(self) -> None:
        try:
            sources_data = {}
            for sid, state in self.source_states.items():
                sources_data[sid] = {
                    "provider": state.provider,
                    "path": state.path,
                    "account_key": state.account_key,
                    "last_scan_time": state.last_scan_time.isoformat() if state.last_scan_time else None,
                    "last_db_mtime": state.last_db_mtime,
                    "seen_entry_ids": state.seen_entry_ids[-5000:],
                    "seen_bubble_keys": state.seen_bubble_keys[-50000:],
                }

            payload = {
                "version": CACHE_VERSION,
                "last_scan_time": self.last_scan_time.isoformat() if self.last_scan_time else None,
                "sources": sources_data,
                "entries": [entry_to_dict(e) for e in self.entries],
            }

            self.data_dir.mkdir(parents=True, exist_ok=True)
            with open(self._cache_file, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2, ensure_ascii=False)
            logger.info("Saved %d entries to %s", len(self.entries), self._cache_file)
        except Exception as exc:
            logger.error("Error saving cache: %s", exc, exc_info=True)

    def start(self) -> None:
        logger.info("Starting LLM Token Tracker...")
        logger.info("Providers: %s", ", ".join(self.providers))
        logger.info("Data dir: %s", self.data_dir)
        logger.info("Discovered %d data sources", len(self.sources))
        for src in self.sources:
            logger.info("  [%s] %s (%s)", src.provider, src.path, src.account_key or "unknown account")
        logger.info("Refresh interval: %d minutes", self.refresh_interval_minutes)

        self._load_cache()
        self._refresh_data()

        icon_image = self._get_current_icon()
        self.tray_icon = pystray.Icon(
            name="LLMTokenTracker",
            icon=icon_image,
            title=self._get_tooltip_text(),
            menu=self._build_menu(),
        )

        self._refresh_thread = threading.Thread(target=self._refresh_loop, daemon=True)
        self._refresh_thread.start()

        self.tray_thread = threading.Thread(
            target=self.tray_icon.run,
            kwargs={"setup": self._on_tray_setup},
            daemon=True,
        )
        self.tray_thread.start()

        logger.info("Starting main Tkinter event loop...")
        self.root.mainloop()

    def _on_tray_setup(self, icon) -> None:
        icon.visible = True
        self._update_tray()

    def _build_menu(self) -> pystray.Menu:
        items = [
            Item('📊 Show Stats', self._on_left_click, default=True),
            Item('🔄 Refresh Now', self._on_refresh_click),
            pystray.Menu.SEPARATOR,
            Item('📥 Import Cursor CSV...', self._on_import_csv),
            Item('📂 Open Data Folder', self._on_open_data_folder),
            pystray.Menu.SEPARATOR,
        ]

        for provider in self.providers:
            count = sum(1 for s in self.sources if s.provider == provider)
            items.append(Item(f'{provider.title()}: {count} source(s)', None, enabled=False))

        items.extend([
            pystray.Menu.SEPARATOR,
            Item('❌ Exit', self._on_exit),
        ])
        return pystray.Menu(*items)

    def _get_current_icon(self):
        if not self.entries:
            return create_default_icon()
        today_start = local_today_start()
        today_stats = compute_stats(self.entries, since=today_start)
        return create_tray_icon(today_stats.total_tokens)

    def _get_tooltip_text(self) -> str:
        if not self.entries:
            return "Token Tracker — Loading..."
        today_start = local_today_start()
        today_stats = compute_stats(self.entries, since=today_start)
        return f"Today: {format_token_count(today_stats.total_tokens)} tokens"

    def _refresh_data(self) -> None:
        logger.info("Scanning all data sources...")
        start = time.time()

        try:
            self.sources = discover_all_sources(self.providers, self.extra_antigravity_dirs)

            all_entries: list[TokenEntry] = []

            ag_sources = [s for s in self.sources if s.provider == "antigravity"]
            if ag_sources and "antigravity" in self.providers:
                ag_entries = scan_all_antigravity(
                    ag_sources,
                    last_scan_time=self.last_scan_time,
                    existing_entries=self.entries,
                )
                all_entries.extend(ag_entries)
                now = datetime.now(timezone.utc)
                for src in ag_sources:
                    self.source_states[src.source_id] = SourceScanState(
                        provider="antigravity",
                        path=str(src.path),
                        account_key=src.account_key,
                        last_scan_time=now,
                    )

            cursor_sources = [s for s in self.sources if s.provider == "cursor"]
            if cursor_sources and "cursor" in self.providers:
                bubble_states = {
                    sid: set(state.seen_bubble_keys)
                    for sid, state in self.source_states.items()
                    if state.seen_bubble_keys
                }
                cursor_entries, updated_bubbles = scan_all_cursor(
                    cursor_sources,
                    source_states=bubble_states,
                    existing_entries=self.entries,
                    db_max_mb=self.cursor_db_max_mb,
                )
                all_entries.extend(cursor_entries)
                now = datetime.now(timezone.utc)
                for src in cursor_sources:
                    if src.source_type == "chat_store":
                        continue
                    try:
                        mtime = src.path.stat().st_mtime
                    except OSError:
                        mtime = None
                    self.source_states[src.source_id] = SourceScanState(
                        provider="cursor",
                        path=str(src.path),
                        account_key=src.account_key,
                        last_scan_time=now,
                        last_db_mtime=mtime,
                        seen_bubble_keys=updated_bubbles.get(src.source_id, []),
                    )

            # Retain entries from sources no longer discovered (account switch history)
            active_source_ids = {s.source_id for s in self.sources}
            active_source_ids.add(CSV_SOURCE_ID)
            historical = [
                e for e in self.entries
                if e.source_id and e.source_id not in active_source_ids
            ]
            all_entries.extend(historical)

            # CSV import
            cursor_account = next(
                (s.account_key for s in cursor_sources if s.account_key), ""
            )
            csv_entries = scan_csv_directory(self.cursor_csv_dir, cursor_account)
            merged = merge_entries(all_entries)
            merged = merge_csv_over_local(merged, csv_entries)

            self.entries = merged
            self.last_scan_time = datetime.now(timezone.utc)
            self._save_cache()

            elapsed = time.time() - start
            logger.info("Scan complete: %d entries in %.1fs", len(self.entries), elapsed)
        except Exception as exc:
            logger.error("Error scanning data sources: %s", exc, exc_info=True)

    def _update_tray(self) -> None:
        if self.tray_icon:
            try:
                self.tray_icon.icon = self._get_current_icon()
                self.tray_icon.title = self._get_tooltip_text()
                self.tray_icon.menu = self._build_menu()
            except Exception as exc:
                logger.error("Error updating tray icon: %s", exc)

    def _refresh_loop(self) -> None:
        while not self._stop_event.is_set():
            wait_seconds = self.refresh_interval_minutes * 60
            if self._stop_event.wait(timeout=wait_seconds):
                break
            logger.info("Auto-refreshing data...")
            self._refresh_data()
            self._update_tray()

    def _get_stats_dict(self, stats, entries: list[TokenEntry] | None = None) -> dict:
        result = {
            'total_prompt': stats.total_prompt,
            'total_output': stats.total_output,
            'total_thinking': stats.total_thinking,
            'total_cached': stats.total_cached,
            'total_tokens': stats.total_tokens,
            'turns': stats.turns,
            'by_model': stats.by_model,
        }
        if entries is not None:
            from collections import defaultdict
            by_model: dict[str, dict] = defaultdict(
                lambda: {"prompt": 0, "output": 0, "thinking": 0, "turns": 0}
            )
            for entry in entries:
                key = f"[{entry.provider}] {entry.model}"
                m = by_model[key]
                m["prompt"] += entry.prompt_tokens
                m["output"] += entry.output_tokens
                m["thinking"] += entry.thinking_tokens
                m["turns"] += 1
            result['by_model'] = dict(by_model)
        return result

    def _get_provider_info(self) -> dict[str, dict]:
        """Build per-provider summary for the popup."""
        today_start = local_today_start()
        info: dict[str, dict] = {}

        for provider in ("antigravity", "cursor"):
            if provider not in self.providers:
                continue
            today = compute_stats(self.entries, since=today_start, provider=provider)
            lifetime = compute_stats(self.entries, provider=provider)
            accounts = sorted({
                s.account_key for s in self.sources if s.provider == provider and s.account_key
            })
            paths = [str(s.path) for s in self.sources if s.provider == provider]
            info[provider] = {
                "today_tokens": today.total_tokens,
                "lifetime_tokens": lifetime.total_tokens,
                "accounts": accounts,
                "paths": paths,
                "disclaimer": (
                    "Local estimate; import CSV for billing accuracy"
                    if provider == "cursor" else ""
                ),
            }
        return info

    def _on_left_click(self, icon=None, item=None) -> None:
        self.root.after(0, self._show_popup)

    def _show_popup(self) -> None:
        if self.popup:
            try:
                self.popup.close()
            except Exception:
                pass

        today_start = local_today_start()
        seven_days_ago = local_day_start(6)
        thirty_days_ago = local_day_start(29)

        stats_today = compute_stats(self.entries, since=today_start)
        stats_7d = compute_stats(self.entries, since=seven_days_ago)
        stats_30d = compute_stats(self.entries, since=thirty_days_ago)
        stats_lifetime = compute_stats(self.entries)
        daily = get_daily_breakdown(self.entries, days=30)

        daily_dicts = {
            date_str: self._get_stats_dict(day_stats)
            for date_str, day_stats in daily.items()
        }

        def on_interval_change(minutes):
            self.refresh_interval_minutes = minutes
            logger.info("Refresh interval changed to %d minutes", minutes)

        def on_refresh_now():
            self._refresh_data()
            self._update_tray()
            if self.popup:
                self.popup.close()
            self._show_popup()

        try:
            self.popup = TokenPopup(
                stats_today=self._get_stats_dict(stats_today),
                stats_7d=self._get_stats_dict(stats_7d),
                stats_30d=self._get_stats_dict(stats_30d),
                stats_lifetime=self._get_stats_dict(stats_lifetime, self.entries),
                daily_breakdown=daily_dicts,
                provider_breakdown=self._get_provider_info(),
                refresh_interval_minutes=self.refresh_interval_minutes,
                on_refresh_interval_change=on_interval_change,
                on_refresh_now=on_refresh_now,
                last_scan_time=self.last_scan_time,
                parent=self.root,
            )
            self.popup.run()
        except Exception as exc:
            logger.error("Error showing popup: %s", exc, exc_info=True)

    def _on_refresh_click(self, icon=None, item=None) -> None:
        threading.Thread(target=self._do_refresh, daemon=True).start()

    def _do_refresh(self) -> None:
        self._refresh_data()
        self._update_tray()

    def _on_import_csv(self, icon=None, item=None) -> None:
        def _pick():
            path = filedialog.askopenfilename(
                parent=self.root,
                title="Import Cursor Usage CSV",
                filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
            )
            if path:
                entries = parse_csv_file(Path(path))
                self.entries = merge_csv_over_local(self.entries, entries)
                self._save_cache()
                self._update_tray()
                logger.info("Imported CSV: %s", path)
        self.root.after(0, _pick)

    def _on_open_data_folder(self, icon=None, item=None) -> None:
        folder = str(self.data_dir)
        if sys.platform == "win32":
            os.startfile(folder)
        elif sys.platform == "darwin":
            subprocess.run(["open", folder], check=False)
        else:
            subprocess.run(["xdg-open", folder], check=False)

    def _on_exit(self, icon=None, item=None) -> None:
        logger.info("Exiting Token Tracker...")
        self._stop_event.set()
        if self.popup:
            try:
                self.popup.close()
            except Exception:
                pass
        if self.tray_icon:
            self.tray_icon.stop()
        try:
            self.root.quit()
        except Exception:
            pass
