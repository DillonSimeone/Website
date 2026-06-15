# Google AntiGravity Token Tracker

A premium Windows system tray application that tracks, aggregates, and visualizes token usage statistics for the Antigravity/Gemini client. It parses local SQLite conversation databases and older `.pb` files to display generation stats and details, comparing total consumption to personal water footprints.

## Features
- **Delta Caching System**: Scans local databases incrementally by checking file modification dates against `token_tracker_cache.json` for lightning-fast loads (reducing filesystem scan time from ~1.0s to 0.1s).
- **Dynamic System Tray Icon**: A 32x32 color-coded indicator displaying today's abbreviated token usage count (e.g. `822K`, `1.2M`) directly in the Windows taskbar.
- **Sleek Stats Popup**: Dark-themed custom UI listing today/7d/30d/lifetime metrics, model breakdowns, water equivalents, and user refresh intervals.
- **Auto-Start**: Automatic boot launch integration using a Windows startup shortcut targeting `pythonw.exe`.

## Project Components
- **`proto_decoder.py`**: A custom, pure-Python wire-format protobuf decoder.
- **`token_parser.py`**: Scans and parses conversation history files.
- **`icon_gen.py`**: Dynamic PIL-based 32x32 system tray icon generator.
- **`popup_ui.py`**: Sleek custom Tkinter popup dialog.
- **`tray_app.py`**: Main application lifecycle manager.
- **`main.py`**: Configuration parser and execution entry point.
