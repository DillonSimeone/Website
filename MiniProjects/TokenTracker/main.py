"""
LLM Token Tracker — Main Entry Point

A Windows system tray application that tracks and displays
AntiGravity/Gemini and Cursor LLM token usage.
"""

import sys
import os
import argparse
import logging
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tray_app import TokenTrackerApp
from data_sources import discover_all_sources, get_app_data_dir


DEFAULT_REFRESH_INTERVAL_MINUTES = 60
DEFAULT_CONVERSATIONS_DIR = os.path.join(
    os.path.expanduser("~"), ".gemini", "antigravity", "conversations"
)


def main():
    parser = argparse.ArgumentParser(
        description="LLM Token Tracker - System Tray App (AntiGravity + Cursor)"
    )
    parser.add_argument(
        '--data-dir',
        type=str,
        default=None,
        help="App data directory for cache and CSV imports (default: ~/.llm-token-tracker)",
    )
    parser.add_argument(
        '--conversations-dir',
        type=str,
        default=None,
        help="(Deprecated) Extra AntiGravity conversations directory to scan",
    )
    parser.add_argument(
        '--providers',
        type=str,
        default="antigravity,cursor",
        help="Comma-separated providers to track (default: antigravity,cursor)",
    )
    parser.add_argument(
        '--cursor-csv-dir',
        type=str,
        default=None,
        help="Directory to auto-import Cursor usage CSV files from",
    )
    parser.add_argument(
        '--cursor-db-max-mb',
        type=int,
        default=2048,
        help="Warn when Cursor state.vscdb exceeds this size in MB (default: 2048)",
    )
    parser.add_argument(
        '--refresh-interval',
        type=int,
        default=DEFAULT_REFRESH_INTERVAL_MINUTES,
        help=f"Refresh interval in minutes (default: {DEFAULT_REFRESH_INTERVAL_MINUTES})",
    )
    parser.add_argument(
        '--log-file',
        type=str,
        default=None,
        help="Optional log file path",
    )
    parser.add_argument(
        '--debug',
        action='store_true',
        help="Enable debug logging",
    )

    args = parser.parse_args()

    log_level = logging.DEBUG if args.debug else logging.INFO
    handlers = []
    if sys.stdout is not None:
        handlers.append(logging.StreamHandler())

    data_dir = get_app_data_dir(args.data_dir)
    log_path = args.log_file
    if not log_path and sys.stdout is None:
        log_path = str(data_dir / "token_tracker.log")

    if log_path:
        handlers.append(logging.FileHandler(log_path, encoding='utf-8'))

    logging.basicConfig(
        level=log_level,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        handlers=handlers,
        force=True,
    )

    logger = logging.getLogger('token_tracker')
    providers = [p.strip().lower() for p in args.providers.split(",") if p.strip()]

    extra_dirs: list[str] = []
    if args.conversations_dir:
        extra_dirs.append(args.conversations_dir)
    elif os.path.isdir(DEFAULT_CONVERSATIONS_DIR):
        pass  # auto-discovery handles default location

    sources = discover_all_sources(providers, [Path(d) for d in extra_dirs])
    if not sources:
        logger.warning(
            "No data sources found. The app will start but show no data until "
            "AntiGravity or Cursor usage data is available."
        )
        if args.conversations_dir and not os.path.isdir(args.conversations_dir):
            logger.error("Specified conversations directory not found: %s", args.conversations_dir)
            sys.exit(1)

    app = TokenTrackerApp(
        providers=providers,
        data_dir=data_dir,
        refresh_interval_minutes=args.refresh_interval,
        extra_antigravity_dirs=extra_dirs or None,
        cursor_csv_dir=args.cursor_csv_dir,
        cursor_db_max_mb=args.cursor_db_max_mb,
    )

    try:
        app.start()
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
    except Exception as e:
        logger.error("Fatal error: %s", e, exc_info=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
