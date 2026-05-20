# HapticBlaze — Product Specification

**Version:** 1.0.0-spec
**Status:** Production design
**Owner:** Core firmware team
**Last revised:** 2026-05-16

---

## 1. Vision

HapticBlaze is to haptic actuators what WLED is to addressable LEDs: a free, open-source firmware that turns a commodity ESP32 board plus any motor driver into a programmable, web-controllable haptic engine — with a massive built-in pattern library, sound-reactive modes, and a captive-portal UI that requires zero code to use.

A maker should be able to:
1. Flash one binary onto any ESP32 dev board.
2. Connect a power supply and an actuator (ERM, LRA, solenoid, voice coil).
3. Join the `HapticBlaze-XXXX` Wi-Fi network from a phone.
4. Pick the driver chip and pinout in a captive portal.
5. Browse 40+ patterns, tweak intensity/speed, save presets, expose an API.

No IDE, no toolchain, no firmware recompile.

## 2. Why this exists

Haptics today is fragmented:

| Pain                                                   | Status quo                                            | HapticBlaze answer                                          |
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
- Not BLE-first in v1.0. Wi-Fi is the primary transport; BLE is roadmapped (see [ROADMAP.md](ROADMAP.md)).

## 5. MVP scope (v1.0)

| Pillar         | In scope (v1.0)                                                                       | Deferred                              |
| -------------- | ------------------------------------------------------------------------------------- | ------------------------------------- |
| Hardware       | ESP32 (classic, S3, C3). L298N mini, DRV8833, DRV2605L, raw MOSFET PWM. Up to 4 ch.   | ESP32-P4, RP2040, STM32 ports.        |
| Patterns       | 40+ built-ins across 6 categories. User-savable presets.                              | Pattern marketplace, scripting (Lua). |
| UI             | Captive portal, mobile-first, dark theme, real-time preview.                          | Native iOS/Android apps.              |
| API            | REST (`/json`), WebSocket (`/ws`), WLED-compatible `/win` shim, mDNS discovery.       | gRPC, MQTT bridge (roadmap).          |
| Audio reactive | ADC line-in + INMP441 I2S mic. FFT (32-band) + envelope follower.                     | Multi-band sidechaining, beat sync.   |
| Persistence    | LittleFS-backed config + 16 user presets.                                             | Cloud sync.                           |
| OTA            | ArduinoOTA + HTTP push update.                                                        | Signed updates.                       |

## 6. User journeys

### 6.1 First boot
1. User powers the board. LED breathes amber.
2. ESP32 starts AP `HapticBlaze-XXXX` (last 4 of MAC), open network.
3. User joins; captive portal auto-opens to `/setup`.
4. User picks driver chip, assigns pins, names the device.
5. (Optional) User joins their home Wi-Fi. Device falls back to AP if STA fails.
6. Device reboots into normal mode. Status LED breathes green.

### 6.2 Daily use
1. User opens `hapticblaze.local` (or saved IP).
2. Lands on **Play** screen: pattern grid, intensity/speed sliders, mute.
3. Taps a pattern → engine starts; LED pulses to pattern.
4. Edits preset → saves → preset persisted to flash.

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

- **Project name:** HapticBlaze
- **Pronoun:** Always lowercase `hapticblaze` in code, namespaces, mDNS, JSON keys.
- **Default hostname:** `hapticblaze.local`
- **Default AP SSID:** `HapticBlaze-XXXX`
- **Logo treatment:** Flame mark + waveform underline. Not in v1.0 deliverables.

## 9. Open questions (tracked, not blocking)

- License: leaning **MIT for firmware, CC-BY-SA for pattern data**. Confirm before tag.
- Hardware reference design: do we ship a HapticBlaze-branded carrier board, or strictly bring-your-own ESP32?
- Telemetry: opt-in version pingback for upgrade nags?

---
See also: [ARCHITECTURE.md](ARCHITECTURE.md) · [ROADMAP.md](ROADMAP.md) · [API_SPEC.md](API_SPEC.md)
