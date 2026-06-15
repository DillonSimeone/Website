"""
LLM Token Tracker — Main Entry Point

A Windows system tray application that tracks and displays
your Antigravity/Gemini LLM token usage.
"""

import sys
import os
import argparse
import logging
from pathlib import Path

# Add this directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tray_app import TokenTrackerApp


# Default configuration
DEFAULT_CONVERSATIONS_DIR = os.path.join(
    os.path.expanduser("~"), ".gemini", "antigravity", "conversations"
)
DEFAULT_REFRESH_INTERVAL_MINUTES = 60


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="LLM Token Tracker - System Tray App"
    )
    parser.add_argument(
        '--conversations-dir',
        type=str,
        default=DEFAULT_CONVERSATIONS_DIR,
        help=f"Path to Antigravity conversations directory "
             f"(default: {DEFAULT_CONVERSATIONS_DIR})"
    )
    parser.add_argument(
        '--refresh-interval',
        type=int,
        default=DEFAULT_REFRESH_INTERVAL_MINUTES,
        help=f"Refresh interval in minutes (default: {DEFAULT_REFRESH_INTERVAL_MINUTES})"
    )
    parser.add_argument(
        '--log-file',
        type=str,
        default=None,
        help="Optional log file path"
    )
    parser.add_argument(
        '--debug',
        action='store_true',
        help="Enable debug logging"
    )

    args = parser.parse_args()

    # Configure logging
    log_level = logging.DEBUG if args.debug else logging.INFO
    handlers = [logging.StreamHandler()]

    if args.log_file:
        handlers.append(logging.FileHandler(args.log_file))

    logging.basicConfig(
        level=log_level,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        handlers=handlers,
        force=True  # Override any existing config
    )

    logger = logging.getLogger('token_tracker')

    # Validate conversations directory
    conv_dir = args.conversations_dir
    if not os.path.isdir(conv_dir):
        logger.error(f"Conversations directory not found: {conv_dir}")
        logger.info("Make sure Antigravity is installed and has been used at least once.")
        sys.exit(1)

    # Start the app
    app = TokenTrackerApp(
        conversations_dir=conv_dir,
        refresh_interval_minutes=args.refresh_interval
    )

    try:
        app.start()
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
