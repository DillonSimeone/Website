# 3D Printer Camera - ESP32-S3 WROOM N16R8

A camera streaming project for monitoring 3D prints with integrated LED strip control.

## Hardware

- **Board**: ESP32-S3 WROOM N16R8 CAM Development Board
- **Camera**: OV5640 module
- **Memory**: 16MB Flash, 8MB PSRAM
- **LED Strip**: WS2812B on GPIO 14

## Features

- **MJPEG Video Streaming** - Real-time camera feed
- **mDNS Discovery** - Access via `http://3DprinterCam.local`
- **Glassmorphism Web UI** - Modern, beautiful interface
- **Advanced Post-Processing** (Browser-side):
  - **Dead Pixel Fix (V6)**: Optimized cached removal of sensor defects.
  - **Temporal Smoothing**: Real-time noise reduction.
  - **Live Enhancements**: Brightness, Contrast, and Saturation.
  - See [README_PROCESSING.md](README_PROCESSING.md) for technical details.
- **FastLED Control** - RGB LED strip control with:
  - Power on/off toggle
  - LED count configuration (1-300)
  - HTML5 color picker
  - Brightness slider (0-100%)
  - Apply settings button

## Configuration

Edit `src/config.h` to change:
- WiFi credentials
- mDNS hostname
- LED pin and default settings
- Camera resolution and quality

## Pin Configuration

### Camera Pins (camera_pins.h)
| Function | GPIO |
|----------|------|
| XCLK     | 15   |
| SIOD     | 4    |
| SIOC     | 5    |
| D0-D7    | 11, 9, 8, 10, 12, 18, 17, 16 |
| VSYNC    | 6    |
| HREF     | 7    |
| PCLK     | 13   |

### LED Strip
| Function | GPIO |
|----------|------|
| Data     | 14   |

## Build & Upload

### Using upload.bat
```batch
upload.bat
```

### Using PlatformIO CLI
```bash
pio run --target upload
pio device monitor
```

## Web Interface

### Camera Tab
- Live video stream
- Resolution selection (QVGA to UXGA)
- Quality adjustment
- Special effects (Negative, Grayscale, Sepia, etc.)

### Lights Tab
- Power toggle switch
- LED count input with +/- buttons
- Color wheel picker
- Brightness slider
- Apply settings button

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Main web interface |
| `/stream` | GET | MJPEG video stream |
| `/control?var=X&val=Y` | GET | Camera control |
| `/led/power?state=1/0` | GET | LED power toggle |
| `/led/settings?count=X&color=RRGGBB&brightness=Y` | GET | LED settings |

## Troubleshooting

### Camera not initializing
- Check pin definitions in `camera_pins.h`
- Ensure camera ribbon cable is properly connected
- Try reducing resolution in config

### WiFi not connecting
- Verify SSID and password in `config.h`
- Check WiFi signal strength
- Ensure 2.4GHz network (ESP32 doesn't support 5GHz)

### LEDs not working
- Verify GPIO 14 connection
- Check LED strip power supply
- Ensure correct LED type in config (WS2812B/GRB)
