# WifiTracker ? Network Health & Bandwidth Monitor

A Windows system tray application that continuously monitors Wi-Fi connection health, local router and DNS latency, and automated bandwidth speed tests to detect anomalies, log degradation incidents, and identify background process bandwidth hogs.

Similar in architecture and design philosophy to [`TokenTracker`](../TokenTracker/).

---

## Key Features

1. **Dual-Tier Polling Engine**:
   - **Continuous Light Probes (every 45s)**: Zero-overhead querying of Wi-Fi RSSI signal strength %, operating frequency band (2.4 GHz vs 5 GHz), channel, link rate, default gateway ping, DNS jitter, and active network-heavy process sockets.
   - **Automated Speed Tests (configurable, default 30 min)**: Non-blocking bandwidth test measuring real-world Download Mbps, Upload Mbps, latency, and jitter via Cloudflare edge endpoints.
2. **Proactive Anomaly Alerts**:
   - Fires non-intrusive Windows toast notifications when speeds drop below threshold (e.g. $< 5\text{ Mbps}$) or when local gateway latency spikes ($> 80\text{ ms}$).
   - Identifies culprit processes (e.g. `qbittorrent.exe`, background game downloads, Windows updates) active at the time of degradation.
3. **Dynamic System Tray Icon**:
   - ?? **Green**: Healthy speed & low latency ($> 25\text{ Mbps}$, $< 40\text{ ms}$).
   - ?? **Yellow**: Elevated latency, degraded signal, or moderate speed drop.
   - ?? **Red**: Severe speed collapse ($< 1\text{ Mbps}$) or disconnection.
   - ?? **Animated Spinner**: Speed test in progress.
   - **Tooltip**: Hover to view live SSID, signal %, current download speed, and router ping.
4. **Dark-Mode Control Dashboard**:
   - **Live Telemetry & Socket Inspector**: Real-time socket count per active application.
   - **Speed History & 24h Aggregates**: Min/Avg/Max download, upload, and latency trends.
   - **Incident Log**: Complete chronological table of drop events, severity, and root causes.
   - **1-Click Network Stack Repair**: One-click flush DNS cache and Winsock / IP catalog reset.

---

## Project Structure

```
WifiTracker/
??? AGENTS.md                  # Complete technical specs & docs
??? requirements.txt           # Python dependencies (pystray, Pillow, requests)
??? main.py                    # Application entry point & CLI diagnostic flags
??? tray_app.py                # System tray lifecycle & background daemon
??? speed_tester.py            # Fast multi-stream bandwidth test engine
??? wifi_probe.py              # OS netsh & gateway latency parser
??? alert_manager.py           # Anomaly detector & Windows toast dispatcher
??? icon_gen.py                # Dynamic PIL 32x32 RGBA icon renderer
??? popup_ui.py                # Dark-mode dashboard GUI
??? storage.py                 # SQLite time-series logger & JSON config
??? create_startup.py          # Auto-start shortcut generator
??? run.bat                    # Silent background launcher
??? run_console.bat            # Console launcher for debugging
```

---

## Quick Usage

### Start in System Tray:
```bash
python main.py
# Or double-click run.bat (silent background launch)
```

### CLI Diagnostics:
```bash
# Run single quick probe (Wi-Fi details, gateway ping, top socket consumers):
python main.py --test-probe

# Run single speed test:
python main.py --test-speed

# Test desktop toast notification:
python main.py --test-alert

# Launch dashboard GUI directly without tray:
python main.py --dashboard
```

### Enable Auto-Start on Windows Boot:
```bash
python create_startup.py
# Or double-click create_startup.bat
```
