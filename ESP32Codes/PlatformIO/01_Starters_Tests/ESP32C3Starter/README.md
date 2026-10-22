# ESP32-C3 SuperMini Starter

This directory contains resources and starter code for the **ESP32-C3 SuperMini** development board.

## Documentation

See [GEMINI.md](./GEMINI.md) for a comprehensive guide on pinouts, PlatformIO setup, and troubleshooting.

## Quick Start (PlatformIO)

### Option 1: VS Code
1.  Open a project folder (e.g., `src/Blink_Test`) in VS Code.
2.  PlatformIO will auto-detect `platformio.ini` and configure the environment.
3.  Click the **Upload** button (→) in the status bar, or press `Ctrl+Alt+U`.

### Option 2: One-Click Batch Script
1.  Navigate to any project folder with an `upload.bat` file.
2.  **Double-click `upload.bat`**.
3.  The script will:
    *   Auto-detect the ESP32-C3 port.
    *   Build and upload the firmware.
    *   Open the Serial Monitor.

### Option 3: CLI
```bash
cd src/Blink_Test
pio run -t upload && pio device monitor
```

## Project Structure

```
ESP32C3Starter/
├── GEMINI.md           # Hardware reference & setup guide
├── README.md           # This file
├── src/
│   └── Blink_Test/     # Example PlatformIO project
│       ├── platformio.ini
│       ├── src/main.cpp
│       └── upload.bat
└── micropython/        # MicroPython firmware & scripts
```

## Troubleshooting

**Upload Failed?** Enter Download Mode:
1.  Hold **BOOT** button.
2.  Press and release **RESET**.
3.  Release **BOOT**.
4.  Retry upload.
