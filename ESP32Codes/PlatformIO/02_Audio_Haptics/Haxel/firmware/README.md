# Haxel Firmware

PlatformIO project for the Haxel tactile pattern engine: FreeRTOS haptic tick, optional audio FFT / FastLED / OLED, and either **WiFi** (captive portal + REST/WS) or **BLE** (GATT + Web Bluetooth) per compile environment.

## Flash via Web Uploader (recommended)

The ESP32Codes uploader builds firmware and, for LittleFS projects, uploads `data/` as well.

1. Double-click [`upload.bat`](upload.bat) in this folder  
   *(launches [`_tooling/uploader/start-uploader.bat`](../../../../_tooling/uploader/start-uploader.bat))*  
   **or** start the uploader from `public/ESP32Codes/_tooling/uploader/`.
2. Open **http://localhost:3567**.
3. Select **Haxel/firmware** in the catalog.
4. Choose COM **port** and **ENV** (see table below).
5. Click **BUILD & FLASH DEVICE**.

Uploader docs: [`_tooling/uploader/README.md`](../../../../_tooling/uploader/README.md).

### Useful ENV names

| Env | Meaning |
|-----|---------|
| `c3WIFILED` | **Default** — ESP32-C3, WiFi + FastLED |
| `c3WIFI` | ESP32-C3, WiFi only |
| `c3WIFIAUDIOLED` | WiFi + LED + mic FFT |
| `c3BLULED` | ESP32-C3, BLE + FastLED |
| `c3FULLOLED` | WiFi + LED + Audio + Knobs + OLED |
| `s3WIFILED` / `s3BLULED` | ESP32-S3 profiles |
| `devWIFILED` / `devBLULED` | Classic ESP32 |

Legacy aliases still work: `esp32-c3-wifi` → `c3WIFILED`, `esp32-c3-ble` → `c3BLULED`, etc.

---

## Flash via CLI (manual)

Requires PlatformIO CLI (`pio`).

```bat
cd PlatformIO\02_Audio_Haptics\Haxel\firmware

:: Default profile
pio run -e c3WIFILED -t upload
pio run -e c3WIFILED -t uploadfs
pio device monitor

:: BLE + LED (no AsyncWebServer / no captive portal)
pio run -e c3BLULED -t upload
```

Optional: set `upload_port` / `monitor_port` in `platformio.ini` if auto-detect fails.

### ESP32-C3 download mode

Hold **BOOT** → press/release **RESET** → release **BOOT**, then flash again.

---

## Feature modules (`HAXEL_FEATURE_*`)

| Flag | Enables | Typical env |
|------|---------|-------------|
| `LED` | FastLED strip | `c3WIFILED` |
| `AUDIO` | I2S/ADC FFT | `c3WIFIAUDIOLED` |
| `KNOBS` | ADC knobs | `c3FULLOLED` |
| `OLED` | SSD1306 HUD | `c3FULLOLED` |

Transport is compile-time: `-DHAXEL_WIFI` or `-DHAXEL_BLU`. Shared state JSON is in `StateApi`; WiFi HTTP handlers stay out of BLE builds.

---

## Connection modes

### WiFi (`HAXEL_WIFI`)

- SoftAP SSID `Haxel-XXXX`, captive portal → `http://192.168.4.1`
- REST / WebSocket API; UI served from LittleFS (`data/`)
- Docs / simulator website: `public/Projects/Haxel/index.html`

### Bluetooth (`HAXEL_BLU`)

- BLE GATT as `Haxel-XXXX`
- Control from Chrome/Edge: `public/Projects/Haxel/bluetooth.html` → **CONNECT BLE**
- Do not expect the on-device WiFi portal in BLE builds

---

## Layout

```text
firmware/
├── platformio.ini         Modular envs + feature flags
├── partitions.csv
├── upload.bat             Launches Web Uploader
├── include/Haxel.h
├── src/
│   ├── main.cpp           FreeRTOS tasks / feature gates
│   ├── core/              Engine, Config, patterns, audio, LED
│   ├── hal/               IHapticDriver + drivers
│   ├── patterns/
│   └── web/               WebServer, CaptivePortal, ApiHandlers (WiFi),
│                          BleServer (BLE), StateApi (shared)
└── data/                  LittleFS captive UI (WiFi)
```
