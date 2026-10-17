# Haxel — Product Specification

**Version:** 1.2.0-dev (align with firmware `HAXEL_VERSION_STR`)
**Status:** Shipped core; specs may lag — prefer AGENTS.md + firmware code
**Owner:** Core firmware team
**Last revised:** 2026-07-15

---

## 1. Vision

Haxel is to haptic actuators what WLED is to addressable LEDs: a free, open-source firmware that turns a commodity ESP32 board plus any motor driver into a programmable, web-controllable haptic engine — with a massive built-in pattern library, sound-reactive modes, and a captive-portal UI that requires zero code to use.

A maker should be able to:
1. Flash one binary onto any ESP32 dev board.
2. Connect a power supply and an actuator (ERM, LRA, solenoid, voice coil).
3. Join the `Haxel-XXXX` Wi-Fi network from a phone.
4. Pick the driver chip and pinout in a captive portal.
5. Browse ~37 built-in patterns (plus custom expression patterns), tweak intensity/speed, expose an API.

No IDE, no toolchain, no firmware recompile.

## 2. Why this exists

Haptics today is fragmented:

| Pain                                                   | Status quo                                            | Haxel answer                                          |
| ------------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------- |
| Every driver has a different SDK (DRV2605L, DRV8833…). | Devs reimplement low-level code per project.          | Hardware Abstraction Layer (HAL) — one pattern, any driver. |
| Patterns are coded by hand per project.                | Loops in Arduino sketches.                            | Declarative pattern library + runtime engine.               |
| No live UI for non-coders.                             | Serial monitor, hard-coded constants.                 | Captive-portal web UI, mobile-first.                        |
| No interoperability across devices/apps.               | Bespoke BLE/Serial protocols.                         | WLED-compatible JSON/WebSocket API.                         |
| Sound-reactive haptics requires DSP code.              | MAX/MSP, TouchDesigner, custom DSP firmware.          | Built-in FFT + envelope follower modes.                     |

## 3. Target users

- **Makers / hobbyists** building wearables, props, accessibility devices, sex tech, kinetic art.
- **UX prototypers** who need a tactile MVP without firmware engineers.
- **Accessibility researchers** mapping audio → vibration for D/HoH users (see related work in `legacy/` Sonic Agency reference).
- **Game / VR developers** wanting a cheap, networkable rumble peripheral.
- **Educators** teaching embedded systems, signal processing, or HCI.

## 4. Non-goals

- Not a medical or therapeutic device. The spec explicitly does not certify safety claims.
- Not a real-time deterministic controller (latency target is **~10 ms**, not microseconds).
- Not a replacement for purpose-built haptic ICs in shipping consumer products — it is a development and deployment platform.
- Transport is **compile-time**: flash either a WiFi (`HAXEL_WIFI`) or BLE (`HAXEL_BLU`) env — not both in one binary.

## 5. MVP scope (v1.0)

| Pillar         | In scope (v1.0)                                                                       | Deferred                              |
| -------------- | ------------------------------------------------------------------------------------- | ------------------------------------- |
| Hardware       | ESP32 (classic, S3, C3). L298N mini, DRV8833, DRV2605L, raw MOSFET PWM. Up to 4 ch.   | ESP32-P4, RP2040, STM32 ports.        |
| Patterns       | ~37 built-ins across pulse / rhythm / alert / ambient / music / time. Custom expression patterns (Pattern Studio). | Pattern marketplace, scripting (Lua). Named user preset slots (future). |
| UI             | Captive portal (WiFi) + hosted Web Bluetooth portal. Mobile-first Bauhaus UI, real-time preview. | Native iOS/Android apps.              |
| API            | REST (`/json`), WebSocket (`/ws`), thin WLED-compatible `/win` shim, mDNS discovery. BLE JSON over Nordic UART GATT. | gRPC, MQTT bridge (roadmap).          |
| Audio reactive | Optional build flag: ADC line-in + INMP441 I2S mic. FFT + envelope / music patterns. | Multi-band sidechaining.              |
| Persistence    | LittleFS `/config.json` + `/runtime.json` + `/custom_patterns.json`. | Cloud sync; 16 named user preset slots (spec reserve only — not shipped). |
| OTA            | HTTP multipart `POST /update`.                                                      | Signed updates.                       |

## 6. User journeys

### 6.1 First boot
1. User powers the board. LED breathes amber.
2. ESP32 starts AP `Haxel-XXXX` (last 4 of MAC), open network.
3. User joins; captive portal auto-opens to `/setup`.
4. User picks driver chip, assigns pins, names the device.
5. (Optional) User joins their home Wi-Fi. Device falls back to AP if STA fails.
6. Device reboots into normal mode. Status LED breathes green.

### 6.2 Daily use
1. User opens `haxel.local` (or saved IP).
2. Lands on **Play** screen: pattern grid, intensity/speed sliders, mute.
3. Taps a pattern → engine starts; LED pulses to pattern.
4. Saves a custom Pattern Studio expression → persisted in `/custom_patterns.json` (and localStorage on the hosted UI).

### 6.3 Integration
1. Developer hits `POST /json/state` with WLED-style payload.
2. Or opens a WebSocket and streams `{"i": 0.8, "p": "heartbeat"}` at 10 Hz.
3. Or sends a sound source → device runs sound-reactive mode autonomously.

## 7. Success metrics

| Metric                            | Target              | How measured                                           |
| --------------------------------- | ------------------- | ------------------------------------------------------ |
| First-pattern time (out of box)   | < 3 min             | New-user funnel timing on portal.                      |
| Pattern engine jitter             | < 2 ms p99 at 1 kHz | FreeRTOS instrumentation, exposed at `/json/diag`.     |
| Concurrent WebSocket clients      | ≥ 4 stable          | Stress test, 10 Hz updates each, 1 hr.                 |
| Driver coverage                   | 4 drivers shipped   | HAL conformance tests pass.                            |
| Boot to AP-ready                  | < 4 s               | Serial log timestamps.                                 |
| Community patterns 6 mo post-1.0  | ≥ 25                | GitHub PRs to `patterns/`.                             |
| Bin size                          | < 1.4 MB            | `pio run -t size` budget.                              |

## 8. Brand & naming

- **Project name:** Haxel
- **Pronoun:** Always lowercase `haxel` in code, namespaces, mDNS, JSON keys.
- **Default hostname:** `haxel.local`
- **Default AP SSID:** `Haxel-XXXX`
- **Logo treatment:** Flame mark + waveform underline. Not in v1.0 deliverables.

## 9. Open questions (tracked, not blocking)

- License: leaning **MIT for firmware, CC-BY-SA for pattern data**. Confirm before tag.
- Hardware reference design: do we ship a Haxel-branded carrier board, or strictly bring-your-own ESP32?
- Telemetry: opt-in version pingback for upgrade nags?

---
See also: [ARCHITECTURE.md](ARCHITECTURE.md) · [ROADMAP.md](ROADMAP.md) · [API_SPEC.md](API_SPEC.md)
