# MYT Multi-Device Video Capture Hub & Sync Engine (AGENTS.md)

## 1. Project Overview & Mission
The **MYT Multi-Device Video Capture Hub** is a field-deployable, zero-cloud recording, synchronization, and scorekeeping station designed for disc golf tournaments, casual rounds, and field trips. 

A central host device (laptop, Intel NUC, or mini-PC) acts as the local hub. Multiple filming phones connect over local Wi-Fi, stream synchronized video slices tagged with real-time metadata, and contribute to an authentic UDisc-compatible scorecard. The system automatically aligns and stitches multi-angle footage using microsecond master clock epochs without relying on acoustic sync claps or manual visual alignment.

---

## 2. Architecture & Design Principles

### Role Separation: Simple User Mode vs. Powerful Admin Mode
* **Regular Users (Filmers / Players)**: Get a distraction-free, clean mobile interface.
  - **📹 Record & Score**: Big live viewfinder, large 78px high-contrast thumb shutter button with haptic feedback, hole picker, and instant stroke tracker (+ / - / Par / Birdie / Bogey).
  - **🥏 Scorecard**: Clean UDisc-style overview of strokes and hole standings.
  - **📱 QR Code**: Instant Wi-Fi join card with one-click copy buttons and dynamic SVG QR codes.
* **Admins**: Toggle "Admin Mode" in the top bar to unlock deep orchestration tabs:
  - **🎛️ Smart Sync Studio**: Multi-angle timeline overlap finder, angle selector, and real-time hardware-accelerated canvas mixer (Multi-Grid, PiP, Auto-Director Cuts, Ghost Overlay).
  - **💾 Storage Explorer**: Deep file inspector of all on-disk recordings, discrete slices, stitched takes, and scorecard JSONs, with an OS file manager launcher.
  - **☁️ YouTube Quota**: Monitors daily 10,000-unit API budget and manages publishing queues.
  - **🖥️ Host & Network**: Live telemetry table displaying all connected filming phones, active filming players, Wi-Fi RTT latency, clock offset drift, active hole, and battery levels.
  - **👥 Sessions & Roster**: Add/edit sessions, customize hole counts and pars, manage players and handles.

### Technology Stack
* **Server**: Pure Node.js (`server.js`) with zero npm runtime dependencies for core serving (native `http`, `https`, `crypto`, `dgram` mDNS, child processes).
* **Clock Sync**: RFC 6455 raw WebSocket implementation (`/ws/clock`) delivering 30 Hz sub-millisecond clock sync ping/pongs, backed by `/api/clock/ping` HTTP fallback.
* **Client Front-End**: Vanilla modern HTML5, CSS3 tokens, and JavaScript (`app.js`).
* **Storage Engine**: Chunked MediaRecorder slices stored on disk under `storage/recordings/<player>/<date>/session_<id>/raw/`.
* **Take Merger**: Automated FFmpeg slice stitcher triggered on recording stop or final slice receipt.
* **Offline Resilience**: IndexedDB slice buffering for when phones walk out of Wi-Fi range on long fairways, auto-flushing upon reconnection.
* **Screen Wake Lock**: Continuous `navigator.wakeLock` integration keeping phone viewfinders awake.

---

## 3. Network Architecture & Field Deployments

### Dual-Port Serving Engine
To satisfy varying browser security models and field environments, the hub runs two active endpoints simultaneously:
1. **Normal HTTP Mode (Port 3456)**:
   - **Zero Warnings / Normal Load**: Loads immediately in Firefox, Chrome, Safari, and Android with no security alert screens, no certificate prompts, and no red flags.
   - Recommended for laptops, tablets, scorekeepers, and reviewing footage.
2. **Secure HTTPS Mode (Port 3457)**:
   - Built with auto-generated self-signed certificates containing Subject Alternative Names (SANs) for `myt.local`, `myt-hub.local`, `localhost`, and all discovered LAN IPs.
   - Unlocks mobile browser camera APIs (`navigator.mediaDevices.getUserMedia`) when connecting remotely on devices requiring secure origins.

### Multicast DNS (mDNS)
Embedded UDP responder listening on `224.0.0.251:5353` resolves:
- `http://myt.local:3456`
- `https://myt.local:3457`

### Windows Firewall Configuration
Inbound connections from external phones on Windows require ports 3456, 3457, and 5353 to be permitted:
- Run `scripts/setup_firewall.bat` as Administrator to automatically configure Windows Defender Firewall rules.

---

## 4. Key Directory & File Layout

```text
public/Projects/VideoRecordingPlatform/
├── GEMINI.md                    # Agent entry point pointing to AGENTS.md
├── AGENTS.md                    # Core project documentation & technical specs (this file)
├── TODO.md                      # Immediate action items, testing plans & roadmap
├── MergeSlices.bat              # 1-click batch script to merge 5-second slices across all folders & log merged.md
├── index.html                   # Modular single-page interface (Users & Admin panels)
├── app.js                       # Comprehensive client-side logic & engines
├── style.css                    # Professional dark theme & responsive layouts
├── server.js                    # Multi-protocol server, WS sync, APIs, & mDNS
├── scripts/
│   ├── merge_slices.bat         # Companion batch script for slice merging
│   ├── merge_slices.js          # FFmpeg slice merger engine & markdown manifest generator
│   ├── setup_firewall.bat       # 1-click Windows Firewall configurator for ports 3456/3457/5353
│   ├── start_hub.bat            # Windows startup script (port cleanup + dependency checks)
│   ├── start_hub.sh             # Linux / macOS startup script
│   ├── check_environment.py     # Python dependency & FFmpeg verification
│   └── ffmpeg_sync.py           # Standalone post-processing video aligner
└── storage/
    ├── certs/                   # Auto-generated SSL/TLS keys and certificates
    ├── recordings/              # Hierarchical video takes, slices, and metadata
    ├── roster.json              # Persistent player registry
    └── sessions.json            # Persistent sessions, hole definitions, and pars
```

---

## 5. Ongoing Tasks & Next Steps
See [TODO.md](TODO.md) for the active checklist, including laptop field testing, router isolation verification, and native app packaging plans.
