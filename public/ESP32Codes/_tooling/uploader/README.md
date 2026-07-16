# PlatformIO Web Uploader

Browser UI for compiling, flashing, and serial-monitoring any PlatformIO project under `public/ESP32Codes`. For projects with a `data/` folder (LittleFS), a full flash runs **`upload` then `uploadfs`** so firmware and the captive-portal UI stay in sync.

## Quick start

1. Prerequisites: **Node.js**, **PlatformIO CLI** (`pio` on `PATH` or under `~/.platformio/penv`).
2. Double-click [`start-uploader.bat`](start-uploader.bat), **or** from this folder:

```bat
npm install
node start-wrapper.js
```

3. Open **http://localhost:3567** (the wrapper picks the next free port if 3567 is busy).
4. Pick a project from the catalog → choose a COM **port** → choose an **ENV** → **BUILD & FLASH DEVICE**.

`firmware/upload.bat` inside Haxel (and similar projects) launches this same tool.

## UI walkthrough

| Control | What it does |
|--------|----------------|
| Project list | Scans `PlatformIO/` (+ MicroPython) for `platformio.ini` projects |
| ENV dropdown | PlatformIO environments from that project's `platformio.ini` |
| Port / Baud | Target serial port and monitor baud |
| **BUILD & FLASH DEVICE** | `pio run -t upload` (and `-t uploadfs` when LittleFS is configured) |
| **QUICK FLASH** | Reuses an existing `.pio/build/<env>/` binary when present |
| Serial monitor tab | Live `pio device monitor`; paused during flash, auto-resumes after |
| Kill | Stops the active build/monitor process |

## Manual PlatformIO (no uploader)

From any project directory that has a `platformio.ini`:

```bat
pio run -e <env> -t upload
pio run -e <env> -t uploadfs
pio device monitor
```

Example (Haxel default WiFi + LED profile):

```bat
cd PlatformIO\02_Audio_Haptics\Haxel\firmware
pio run -e c3WIFILED -t upload
pio run -e c3WIFILED -t uploadfs
pio device monitor
```

### Download mode (ESP32-C3)

If upload fails or the COM port vanishes:

1. Hold **BOOT**
2. Press/release **RESET**
3. Release **BOOT**
4. Retry the flash

## Notes

- Workspace root for scanning is four levels above this folder (`public/ESP32Codes`’s parent context as resolved by `server.js`).
- The server forces UTF-8 for PlatformIO/esptool so Windows consoles do not choke on Unicode progress bars.
- Port default: `3567` (`PORT` env var overrides).
