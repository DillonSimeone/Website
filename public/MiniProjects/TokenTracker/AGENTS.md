# LLM Token Tracker

A Windows system tray application that tracks, aggregates, and visualizes token usage for **AntiGravity/Gemini** and **Cursor**. It dynamically discovers local data sources, parses conversation databases, and displays generation stats with optional Cursor dashboard CSV import for billing accuracy.

## Features

- **Multi-Provider Support**: Tracks AntiGravity and Cursor in one combined tray icon with per-provider breakdown in the popup.
- **Dynamic Source Discovery**: Automatically finds all `~/.gemini/antigravity*` conversation folders and Cursor `state.vscdb` databases — no hardcoded user paths.
- **Account-Switch Safe Caching**: Unified cache at `~/.llm-token-tracker/cache.json` preserves historical usage across account switches.
- **Delta Caching**: Incremental scans by file mtime (AntiGravity) and bubble key tracking (Cursor) for fast refreshes.
- **Cursor CSV Import**: Import dashboard `usage-events-*.csv` exports for billing-accurate totals; auto-scans `~/.llm-token-tracker/cursor-csv/`.
- **Dynamic System Tray Icon**: Color-coded indicator showing today's combined token count.
- **Sleek Stats Popup**: Today/7d/30d/lifetime metrics, per-provider cards, model breakdown, water equivalents.

## Project Components

- **`data_sources.py`**: Dynamic discovery of AntiGravity and Cursor data paths.
- **`models.py`**: Shared `TokenEntry`, `TokenStats`, and aggregation helpers.
- **`antigravity_parser.py`**: Scans AntiGravity `.db` / `.pb` conversation files.
- **`cursor_parser.py`**: Parses Cursor `state.vscdb` bubble token data.
- **`cursor_csv_importer.py`**: Imports Cursor dashboard usage CSV exports.
- **`proto_decoder.py`**: Pure-Python protobuf wire-format decoder.
- **`token_parser.py`**: Backward-compatible shim for AntiGravity parsing.
- **`icon_gen.py`**: PIL-based tray icon generator.
- **`popup_ui.py`**: Tkinter stats popup.
- **`tray_app.py`**: Main application lifecycle.
- **`main.py`**: CLI entry point.

## Usage

```bash
# Track both providers (default)
python main.py

# AntiGravity only
python main.py --providers antigravity

# Custom data directory
python main.py --data-dir ~/.llm-token-tracker

# Import Cursor CSVs from a folder
python main.py --cursor-csv-dir ~/Downloads/cursor-usage
```

### CLI Options

| Flag | Default | Description |
|------|---------|-------------|
| `--providers` | `antigravity,cursor` | Comma-separated providers |
| `--data-dir` | `~/.llm-token-tracker` | Cache and config root |
| `--cursor-csv-dir` | `~/.llm-token-tracker/cursor-csv` | Auto-import CSV folder |
| `--cursor-db-max-mb` | `2048` | Warn if Cursor DB exceeds size |
| `--conversations-dir` | (auto) | Extra AntiGravity conversations path |
| `--refresh-interval` | `60` | Minutes between auto-refresh |
| `--debug` | off | Verbose logging |

## Data Locations

| Provider | Discovered Paths |
|----------|-----------------|
| AntiGravity | `~/.gemini/antigravity*/conversations/*.db` |
| Cursor | `%APPDATA%/Cursor/User/globalStorage/state.vscdb` |
| Cache | `~/.llm-token-tracker/cache.json` |
| CSV import | `~/.llm-token-tracker/cursor-csv/` |

## Build

```bash
pyinstaller LLMTokenTracker.spec
```

Output: `dist/LLMTokenTracker/LLMTokenTracker.exe`
