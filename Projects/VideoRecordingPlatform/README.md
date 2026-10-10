# MYT Video Capture Hub & Automated Sync Engine

**Architecture Model:** Local-First Capture, Asynchronous Background Ingestion, Quota-Managed Cloud Distribution.

Designed to run on **any Wi-Fi capable computer** (Laptops, Desktops, Mini PCs, or Intel NUCs) running **Windows**, **macOS**, or **Linux**.

---

## Quick Start (Any Computer)

### 1. Run the Environment & Dependency Checker
The safety checker inspects Node.js, Python 3, FFmpeg, and attempts automatic installation of missing pip packages with clear warnings:
```bash
node check_environment.js
```
*(Or on Python: `python scripts/check_environment.py`)*

### 2. Start the Hub Gateway Server
```bash
# Windows
scripts\start_hub.bat

# macOS / Linux
chmod +x scripts/start_hub.sh
./scripts/start_hub.sh
```
Or directly with Node.js (zero external npm dependencies required):
```bash
node server.js
```

The gateway displays your local network Wi-Fi IP addresses (e.g. `http://192.168.1.150:3457`), allowing phones and tablets to connect immediately.

### 3. Batch Merge Video Slices
When filming is complete, run the slice merger to combine all 5-second video slices into complete takes across all folders and log them in `merged.md`:
```bash
# Windows (Double-click or run from terminal)
MergeSlices.bat

# Or directly with Node:
node scripts/merge_slices.js
```

---

## Core Capabilities

### 📹 1. Field Capture Engine (PWA)
- **Zero-Loss Capture**: Captures video directly to device RAM and buffers incrementally to **IndexedDB in 5-second slice blobs**.
- **Crash Safety**: Network disconnects or browser refreshes do not lose footage; slices persist until explicitly flushed to the Hub.
- **Master Clock Synchronization**: Calculates sub-millisecond Round-Trip Time (RTT) and master clock offset ($\Delta t$) via WebSocket ping-pong or Chrony NTP.
- **Acoustic & Optical Sync Strobe**: Generates a synchronized white frame flash and 1kHz audio pulse to establish acoustic clapboard synchronization across multi-angle cameras.
- **Fallback Synthetic Stream**: Generates a 60 FPS disc golf fairway test animation with live millisecond timecode for testing when camera permissions are unavailable.

### 🥏 2. UDisc-Compatible Disc Golf Scorecard
- **Full 18-Hole Support**: Par 3, 4, and 5 hole configurations with distance in feet/meters.
- **Score Color Badging**: Ace (Gold 🌟), Eagle/Albatross (Blue), Birdie (Cyan), Par (Gray), Bogey (Orange), Double Bogey+ (Red).
- **Official UDisc CSV Export/Import**: Compatible with the official UDisc CSV export schema (`PlayerName, CourseName, LayoutName, Date, Total, +/-, Hole1...Hole18`).
- **Video Sync Timestamps**: Every drive, approach, and putt bookmarks the exact millisecond video epoch directly to the scorecard, enabling automated highlight reel generation.

### 🎛️ 3. Multi-Angle Sync Studio & Post-Processing
- **Synchronized Multi-Feed Player**: Simultaneously plays multiple camera feeds (e.g. Baseline Tee Pad vs Side Fairway/Basket) aligned using device `clock_offset_ms`.
- **Scrubbing & Slow-Motion**: 1.0x, 0.5x, and 0.25x slow-motion playback with frame-by-frame scrubbing.
- **Automated FFmpeg Alignment**: `scripts/ffmpeg_sync.py` parses `session_meta.json`, applies `setpts` and `adelay` filters, and stitches a side-by-side composite (`synced_composite.mp4`) with **0 YouTube API quota cost**.

### ☁️ 4. YouTube Data API v3 Quota Daemon
- **10,000 Units/Day Budget Tracker**: Automatically tracks consumption against the free tier daily quota (resets 00:00 PST).
  - `videos.insert`: 1,600 units
  - `playlistItems.insert`: 50 units
  - `synced_composite.mp4` render: 0 units
- **Persistent SQLite3 Queue**: Managed by `daemon/sync_daemon.py`.
- **Exponential Backoff**: Pauses uploads when public WAN is unreachable or remaining quota falls below 1,650 units.

---

## File & Storage Hierarchy (Section 5 Spec)

Recordings written to disk follow the deterministic schema:
```text
/storage/recordings/
└── {player_slug}/
    └── {YYYY-MM-DD}/
        └── session_{session_uuid}/
            ├── session_meta.json      <-- Device IDs, clock offsets, status
            ├── scorecard.json         <-- UDisc round data & stamped throws
            ├── raw/
            │   ├── dev_{id}_angle1.webm
            │   └── dev_{id}_angle2.webm
            └── processed/
                └── synced_composite.mp4
```

---

## Safety & Dependency Installation

| Dependency | Purpose | How to Install |
| :--- | :--- | :--- |
| **Node.js** (v16+) | Hub Gateway Server | [nodejs.org](https://nodejs.org/) |
| **Python** (v3.8+) | YouTube Quota Daemon & FFmpeg Script | [python.org](https://www.python.org/) |
| **FFmpeg** | Multi-angle video alignment & rendering | Windows: `winget install Gyan.FFmpeg`<br>macOS: `brew install ffmpeg`<br>Linux: `sudo apt install -y ffmpeg` |
| **Google API Client** | YouTube OAuth2 & Uploads | Auto-installed by `check_environment.js` or `pip install google-api-python-client google-auth-oauthlib` |
