# Haxel

ESP32 haptic pattern engine: HAL drivers, declarative patterns, captive-portal (WiFi) or Web Bluetooth control, optional FastLED / mic FFT / OLED modules.

| | |
|--|--|
| **Firmware** | [`firmware/`](firmware/) — PlatformIO (modular envs) |
| **Website / BLE portal** | [`public/Projects/Haxel/`](../../../../Projects/Haxel/) |
| **Default flash profile** | `c3WIFILED` (ESP32-C3 + WiFi + FastLED) |

## Flash firmware

### Recommended: Web Uploader

The ESP32Codes visual flasher builds firmware **and** LittleFS UI in one click.

1. Run [`firmware/upload.bat`](firmware/upload.bat), **or** start [`_tooling/uploader/start-uploader.bat`](../../../_tooling/uploader/start-uploader.bat).
2. Open **http://localhost:3567**.
3. Select **Haxel/firmware** → COM port → ENV (e.g. `c3WIFILED` or `c3BLULED`).
4. Click **BUILD & FLASH DEVICE**.

Full uploader docs: [`_tooling/uploader/README.md`](../../../_tooling/uploader/README.md).

### Manual (PlatformIO CLI)

```bat
cd firmware
pio run -e c3WIFILED -t upload
pio run -e c3WIFILED -t uploadfs
pio device monitor
```

BLE + LED profile:

```bat
pio run -e c3BLULED -t upload
```

(BLE builds skip the WiFi portal filesystem; `uploadfs` is optional for that env.)

See [`firmware/README.md`](firmware/README.md) for all envs and feature flags.

### Connect after flash

- **WiFi (`*WIFI*` envs):** Join AP `Haxel-XXXX` → captive portal / `http://192.168.4.1` (on-device UI from LittleFS). Marketing/docs site: [Projects/Haxel/index.html](../../../../Projects/Haxel/index.html).
- **BLE (`*BLU*` envs):** Open [Projects/Haxel/bluetooth.html](../../../../Projects/Haxel/bluetooth.html) in Chrome/Edge → **CONNECT BLE**.

## Spec documents

These describe product intent; firmware has leapfrogged early roadmap checkboxes — trust code + [`AGENTS.md`](AGENTS.md) for current behavior.

- [PRODUCT_SPEC.md](PRODUCT_SPEC.md) — vision, scope, success metrics
- [ARCHITECTURE.md](ARCHITECTURE.md) — layer model, tasks, boot, safety
- [HAL_SPEC.md](HAL_SPEC.md) — `IHapticDriver` contract
- [PATTERN_LIBRARY.md](PATTERN_LIBRARY.md) — built-in patterns
- [PORTAL_UI_SPEC.md](PORTAL_UI_SPEC.md) — captive portal UI
- [API_SPEC.md](API_SPEC.md) — REST + WebSocket (+ WLED-compat ideas)
- [ROADMAP.md](ROADMAP.md) — historical phased plan

## Status

**Active firmware (~1.2.0-dev):** Engine + pattern library, MOSFET/HAL drivers, WiFi captive portal *or* BLE GATT (compile-time), modular LED/audio/knobs/OLED flags, shared `StateApi` for WiFi/BLE JSON, on-device LittleFS portal + hosted BLE/WiFi marketing UIs under `Projects/Haxel`.
