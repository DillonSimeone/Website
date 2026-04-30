# ESP32 WROVER Camera Streaming Server

A PlatformIO project for the **Freenove ESP32-WROVER-DEV** board with OV2640 camera, featuring mDNS discovery and a premium Glassmorphism web interface.

![Freenove ESP32-WROVER-DEV](https://www.freenove.com/img/product/600/FNK0060/FNK0060-01.jpg)

## Features

- 📡 **mDNS Discovery** - Access via `http://esp32cam.local` instead of IP address
- 🎥 **MJPEG Streaming** - Real-time video stream at `/stream`
- 📸 **Still Capture** - Capture individual frames at `/capture`
- 🎨 **Glassmorphism UI** - Modern, premium web interface with blur effects and animations
- 🔧 **Built-in Diagnostics** - I2C bus scanner to verify camera connectivity
- 💾 **PSRAM Support** - Utilizes 4MB PSRAM for higher resolution streaming

## Quick Start

### 1. Configure WiFi
Edit `src/main.cpp` and update your WiFi credentials:
```cpp
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
```

### 2. Build & Upload
Simply run the batch file:
```batch
.\upload.bat
```

### 3. Access the Stream
- Open `http://esp32cam.local` in your browser, OR
- Check the serial monitor for the IP address

## Hardware Requirements

| Component | Details |
|-----------|---------|
| Board | Freenove ESP32-WROVER-DEV (V1.6 or newer) |
| Camera | OV2640 (included with board) |
| USB Cable | USB Micro-B with data lines |
| Power | 5V 500mA+ (USB or external) |

## Pin Configuration

The camera uses the following GPIO pins (defined in `main.cpp`):

| Function | GPIO |
|----------|------|
| XCLK | 21 |
| SIOD (SDA) | 26 |
| SIOC (SCL) | 27 |
| Y9-Y2 | 39, 35, 34, 19, 18, 5, 4, 2 |
| VSYNC | 25 |
| HREF | 23 |
| PCLK | 22 |
| PWDN | -1 (not used) |
| RESET | -1 (not used) |

## Troubleshooting

### Camera Error 0x105 (ESP_ERR_NOT_FOUND)

This error means the camera was not detected on the I2C/SCCB bus. The project includes a built-in I2C scanner that runs before camera init to help diagnose.

**Check the serial monitor output:**

✅ **Working camera:**
```
--- I2C Bus Scan ---
SDA: GPIO26, SCL: GPIO27
I2C device found at 0x30 <-- OV2640 Camera!
Found 1 I2C device(s)
--- End I2C Scan ---
Camera probe successful!
```

❌ **Dead/disconnected camera:**
```
--- I2C Bus Scan ---
SDA: GPIO26, SCL: GPIO27
NO I2C devices found! Camera may be dead or disconnected.
--- End I2C Scan ---
Camera init failed with error 0x105
```

**If no I2C devices found:**
1. **Ribbon cable** - Reseat the FPC ribbon cable (gold contacts face the PCB)
2. **Cable lock** - Ensure the FPC connector latch is closed
3. **Power** - Try a better USB cable or powered hub
4. **Camera module** - The OV2640 module may be dead (replace for ~$3-5)
5. **Board traces** - The camera interface on the board may have failed

### PSRAM Not Found

If PSRAM isn't detected, the camera will still work but at lower resolution. Check:
- Board selection in `platformio.ini` is correct (`freenove_esp32_wrover`)
- Build flags include `-DBOARD_HAS_PSRAM`

### mDNS Not Working

Some networks block mDNS. Use the IP address shown in serial monitor instead:
```
Camera Ready! Use 'http://192.168.x.x' or 'http://esp32cam.local' to connect
```

## Project Structure

```
FreeNoveESP32WroverDev/
├── src/
│   └── main.cpp          # Main application code
├── include/
│   └── index_html.h      # Glassmorphism web interface
├── platformio.ini        # PlatformIO configuration
├── upload.bat            # Build & upload script
└── README.md             # This file
```

## Development Notes

### Challenges Encountered (January 2026)

During initial development with a V1.6 board, we encountered persistent `0x105` camera probe failures. After extensive debugging:

1. **Verified PSRAM worked** ✅ - Board itself was functional
2. **Tried multiple pin configurations** - Official Freenove pinout confirmed correct
3. **Lowered XCLK from 20MHz to 10MHz** - Some OV2640 modules need slower clock
4. **Added XCLK pre-initialization pulse** - Helps wake up stubborn cameras
5. **Implemented I2C bus scan** - Definitive diagnostic tool
6. **Result**: I2C scan found NO devices - confirmed hardware failure

**Conclusion**: The camera port on that specific V1.6 board had failed. The board was recycled for other projects (still has working WiFi, Bluetooth, PSRAM, GPIOs).

### Key Configuration for Older Boards

For V1.x boards, these settings have helped:
```cpp
config.xclk_freq_hz = 10000000;  // 10MHz instead of 20MHz
config.sccb_i2c_port = 0;        // Explicit I2C port 0
config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
```

### Web Interface

The `index_html.h` contains a self-contained Glassmorphism UI featuring:
- Backdrop blur effects (`backdrop-filter: blur(20px)`)
- Gradient backgrounds
- Status indicator with pulse animation
- Responsive design
- Auto-reconnect on stream error

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `/` | Main web interface |
| `/stream` | MJPEG video stream |
| `/capture` | Single JPEG frame capture |

## License

This project is provided as-is for educational and personal use.

## Credits

- **Freenove** - For the ESP32-WROVER-DEV board
- **Espressif** - For the ESP32 camera driver
- **Random Nerd Tutorials** - For ESP32-CAM documentation inspiration
