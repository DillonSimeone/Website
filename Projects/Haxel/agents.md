# Haxel Documentation

[Haxel](./index.html) is an open-source ESP32 haptic pattern engine with a captive-portal WiFi UI and a Chrome Web Bluetooth portal.

This document is a high-level overview for agents. Prefer the live firmware tree and [AGENTS.md](../../ESP32Codes/PlatformIO/02_Audio_Haptics/Haxel/AGENTS.md) when behavior disagrees with older specs.

---

## 1. Split: hosted site vs firmware

| Surface | Path | Role |
|---------|------|------|
| **Hosted WiFi / docs** | [`public/Projects/Haxel/`](./index.html) | Marketing, manual, browser simulator (`index.html` + `main.js`) |
| **Hosted BLE portal** | [`bluetooth.html`](./bluetooth.html) + **`bluetooth.js`** | Web Bluetooth control (Chrome / Edge). Must load `bluetooth.js` (safe sync), not `main.js`. |
| **Firmware** | [`ESP32Codes/PlatformIO/02_Audio_Haptics/Haxel/firmware/`](../../ESP32Codes/PlatformIO/02_Audio_Haptics/Haxel/firmware/) | Device engine, HAL, WiFi/BLE/ESP-NOW stacks, LittleFS captive UI |

**Source of truth for WiFi portal behavior:** `firmware/data/` (`main.js`, `haptics.js`, etc.). After portal logic changes there, sync the shared files into this folder (`main.js`, `haptics.js`, `compiler.js`, `emulator.js`, `manual.html` as needed).

---

## 2. Transport modes (compile-time)

Flash a PlatformIO env with either `-DHAXEL_WIFI` or `-DHAXEL_BLU` (mutually exclusive). Default: `c3WIFILED`.

- **WiFi:** open SoftAP `Haxel-XXXX` (MAC suffix), captive DNS → `192.168.4.1`, LittleFS UI.
- **BLE:** advertises the **same** `Haxel-XXXX` name as the SoftAP SSID; control from this site’s `bluetooth.html` + `bluetooth.js`. Standalone BLE units are **not** part of a Command Mode fleet.
- **Command Mode:** flash `c3WIFILED_MASTER` (SoftAP portal + ESP-NOW leader) and `c3WIFILED_FOLLOWER` (ESP-NOW only). Master **Fleet** tab claims followers, syncs state/audio, and can push config epochs. Details in firmware [AGENTS.md](../../ESP32Codes/PlatformIO/02_Audio_Haptics/Haxel/AGENTS.md).
- **Rename:** Device menu changes the shared WiFi/BLE name, then saves and reboots.
- **Safe BLE hydration:** the BLE portal remains locked until `sync-request` returns both current runtime state and multipart hardware config. Browser defaults must never be written during connection.

Flash via [`_tooling/uploader`](../../ESP32Codes/_tooling/uploader/README.md) or `firmware/upload.bat`.

---

## 3. Runtime architecture (firmware)

FreeRTOS tasks coordinate a ~1 kHz haptic engine, optional audio FFT, FastLED, and either AsyncWebServer or BLE GATT (Nordic UART-style UUIDs). Shared JSON helpers live in `web/StateApi.*`.

Default HAL: **MOSFET** PWM on GPIO 6; optional LED strip on GPIO 5. Pattern IDs must stay aligned across firmware `Patterns.cpp`, `firmware/data/haptics.js`, and this folder’s `haptics.js`.

Driver kind enums sent from any UI must match `hal::DriverKind` (`MOSFET=4`, `DRV2605L=3`, …).

---

## 4. Docs & manual

- **Reference manual:** [`manual.html`](./manual.html) (also shipped in LittleFS).
- **Firmware maintainer guide:** [AGENTS.md](../../ESP32Codes/PlatformIO/02_Audio_Haptics/Haxel/AGENTS.md)
- Specs under the firmware tree (`PRODUCT_SPEC.md`, `API_SPEC.md`, …) may lag; trust code + AGENTS when they disagree. User slot presets (`/json/presets`) are **not** shipped yet — custom patterns + runtime state are the persistence model.
