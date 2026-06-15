"""
System Tray Application for LLM Token Tracker.

Manages the tray icon, tooltip, refresh timer, and popup lifecycle.
"""

import threading
import time
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pystray
from pystray import MenuItem as Item

from token_parser import scan_conversations, compute_stats, get_daily_breakdown, TokenEntry
from icon_gen import create_tray_icon, create_default_icon, format_token_count
from popup_ui import TokenPopup

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(),
    ]
)
logger = logging.getLogger('token_tracker')


class TokenTrackerApp:
    """Main system tray application."""

    def __init__(self, conversations_dir: str, refresh_interval_minutes: int = 60):
        self.conversations_dir = conversations_dir
        self.refresh_interval_minutes = refresh_interval_minutes
        self.entries: list[TokenEntry] = []
        self.last_scan_time: datetime | None = None
        self.popup: TokenPopup | None = None
        self.tray_icon: pystray.Icon | None = None
        self._stop_event = threading.Event()
        self._refresh_thread: threading.Thread | None = None
        
        # Determine path to persistence cache file
        self._cache_file = Path(conversations_dir).parent / "token_tracker_cache.json"

    def _load_cache(self):
        """Load scanned entries and last scan time from JSON cache file."""
        if not self._cache_file.exists():
            logger.info("No cache file found. A full scan will be performed.")
            return

        import json
        try:
            with open(self._cache_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            entries_list = []
            for item in data.get("entries", []):
                # Parse timestamp back to datetime
                ts = datetime.fromisoformat(item["timestamp"])
                entries_list.append(TokenEntry(
                    timestamp=ts,
                    model=item["model"],
                    prompt_tokens=item["prompt_tokens"],
                    output_tokens=item["output_tokens"],
                    thinking_tokens=item["thinking_tokens"],
                    cached_tokens=item["cached_tokens"],
                    conversation_id=item["conversation_id"]
                ))
            
            self.entries = entries_list
            if data.get("last_scan_time"):
                self.last_scan_time = datetime.fromisoformat(data["last_scan_time"])
            
            logger.info(f"Loaded {len(self.entries)} cached entries. Last scan time: {self.last_scan_time}")
        except Exception as e:
            logger.error(f"Error loading cache file: {e}", exc_info=True)

    def _save_cache(self):
        """Save scanned entries and last scan time to JSON cache file."""
        import json
        try:
            entries_data = []
            for entry in self.entries:
                entries_data.append({
                    "timestamp": entry.timestamp.isoformat(),
                    "model": entry.model,
                    "prompt_tokens": entry.prompt_tokens,
                    "output_tokens": entry.output_tokens,
                    "thinking_tokens": entry.thinking_tokens,
                    "cached_tokens": entry.cached_tokens,
                    "conversation_id": entry.conversation_id
                })
            
            payload = {
                "last_scan_time": self.last_scan_time.isoformat() if self.last_scan_time else None,
                "entries": entries_data
            }
            
            with open(self._cache_file, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2, ensure_ascii=False)
            logger.info(f"Saved {len(self.entries)} entries to cache log file: {self._cache_file}")
        except Exception as e:
            logger.error(f"Error saving cache file: {e}", exc_info=True)

    def start(self):
        """Start the tray application."""
        logger.info("Starting Token Tracker...")
        logger.info(f"Conversations dir: {self.conversations_dir}")
        logger.info(f"Refresh interval: {self.refresh_interval_minutes} minutes")

        # Load existing log cache if it exists
        self._load_cache()

        # Perform scan (delta if cached, full otherwise)
        self._refresh_data()

        # Create tray icon
        icon_image = self._get_current_icon()
        self.tray_icon = pystray.Icon(
            name="token_tracker",
            icon=icon_image,
            title=self._get_tooltip_text(),
            menu=self._build_menu()
        )

        # Start background refresh thread
        self._refresh_thread = threading.Thread(
            target=self._refresh_loop, daemon=True
        )
        self._refresh_thread.start()

        # Run the tray icon (blocking)
        logger.info("Tray icon ready.")
        self.tray_icon.run(setup=self._on_tray_setup)

    def _on_tray_setup(self, icon):
        """Called when the tray icon is set up."""
        icon.visible = True

    def _build_menu(self) -> pystray.Menu:
        """Build the right-click context menu."""
        return pystray.Menu(
            Item('📊 Show Stats', self._on_left_click, default=True),
            Item('🔄 Refresh Now', self._on_refresh_click),
            pystray.Menu.SEPARATOR,
            Item('❌ Exit', self._on_exit)
        )

    def _get_current_icon(self):
        """Generate the current tray icon based on today's usage."""
        if not self.entries:
            return create_default_icon()

        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_stats = compute_stats(self.entries, since=today_start)
        return create_tray_icon(today_stats.total_tokens)

    def _get_tooltip_text(self) -> str:
        """Generate tooltip text showing today's token count."""
        if not self.entries:
            return "Token Tracker — Loading..."

        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_stats = compute_stats(self.entries, since=today_start)
        return f"Today: {format_token_count(today_stats.total_tokens)} tokens"

    def _refresh_data(self):
        """Scan conversations and update data."""
        logger.info("Scanning conversations...")
        start = time.time()
        try:
            self.entries = scan_conversations(
                self.conversations_dir,
                last_scan_time=self.last_scan_time,
                existing_entries=self.entries
            )
            self.last_scan_time = datetime.now(timezone.utc)
            self._save_cache()
            elapsed = time.time() - start
            logger.info(
                f"Scan complete: {len(self.entries)} entries in {elapsed:.1f}s"
            )
        except Exception as e:
            logger.error(f"Error scanning conversations: {e}", exc_info=True)

    def _update_tray(self):
        """Update the tray icon and tooltip."""
        if self.tray_icon:
            try:
                self.tray_icon.icon = self._get_current_icon()
                self.tray_icon.title = self._get_tooltip_text()
            except Exception as e:
                logger.error(f"Error updating tray icon: {e}")

    def _refresh_loop(self):
        """Background thread that refreshes data periodically."""
        while not self._stop_event.is_set():
            # Wait for the refresh interval
            wait_seconds = self.refresh_interval_minutes * 60
            if self._stop_event.wait(timeout=wait_seconds):
                break  # Stop event was set

            logger.info("Auto-refreshing data...")
            self._refresh_data()
            self._update_tray()

    def _get_stats_dict(self, stats) -> dict:
        """Convert a TokenStats to a dict for the popup."""
        return {
            'total_prompt': stats.total_prompt,
            'total_output': stats.total_output,
            'total_thinking': stats.total_thinking,
            'total_cached': stats.total_cached,
            'total_tokens': stats.total_tokens,
            'turns': stats.turns,
            'by_model': stats.by_model,
        }

    def _on_left_click(self, icon=None, item=None):
        """Handle left click — show the popup."""
        # Close existing popup
        if self.popup:
            try:
                self.popup.close()
            except Exception:
                pass

        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        seven_days_ago = now - timedelta(days=7)
        thirty_days_ago = now - timedelta(days=30)

        stats_today = compute_stats(self.entries, since=today_start)
        stats_7d = compute_stats(self.entries, since=seven_days_ago)
        stats_30d = compute_stats(self.entries, since=thirty_days_ago)
        stats_lifetime = compute_stats(self.entries)
        daily = get_daily_breakdown(self.entries, days=30)

        # Convert daily breakdown to dicts
        daily_dicts = {}
        for date_str, day_stats in daily.items():
            daily_dicts[date_str] = self._get_stats_dict(day_stats)

        def on_interval_change(minutes):
            self.refresh_interval_minutes = minutes
            logger.info(f"Refresh interval changed to {minutes} minutes")

        def on_refresh_now():
            self._refresh_data()
            self._update_tray()
            logger.info("Manual refresh triggered")
            # Close and reopen popup with fresh data
            if self.popup:
                self.popup.close()
            self._on_left_click()

        # Launch popup in a new thread (since it has its own event loop)
        def show_popup():
            try:
                self.popup = TokenPopup(
                    stats_today=self._get_stats_dict(stats_today),
                    stats_7d=self._get_stats_dict(stats_7d),
                    stats_30d=self._get_stats_dict(stats_30d),
                    stats_lifetime=self._get_stats_dict(stats_lifetime),
                    daily_breakdown=daily_dicts,
                    refresh_interval_minutes=self.refresh_interval_minutes,
                    on_refresh_interval_change=on_interval_change,
                    on_refresh_now=on_refresh_now,
                    last_scan_time=self.last_scan_time,
                )
                self.popup.run()
            except Exception as e:
                logger.error(f"Error showing popup: {e}", exc_info=True)

        popup_thread = threading.Thread(target=show_popup, daemon=True)
        popup_thread.start()

    def _on_refresh_click(self, icon=None, item=None):
        """Handle refresh menu click."""
        logger.info("Manual refresh requested via menu")
        refresh_thread = threading.Thread(target=self._do_refresh, daemon=True)
        refresh_thread.start()

    def _do_refresh(self):
        """Perform a refresh and update the tray."""
        self._refresh_data()
        self._update_tray()

    def _on_exit(self, icon=None, item=None):
        """Handle exit."""
        logger.info("Exiting Token Tracker...")
        self._stop_event.set()
        if self.popup:
            try:
                self.popup.close()
            except Exception:
                pass
        if self.tray_icon:
            self.tray_icon.stop()
