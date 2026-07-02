# Haxel — Roadmap

Phased plan from spec-locked (this commit) through v2.0 (community-driven scripting). Each milestone has a single "we ship this" gate.

---

## v0.1 — Tracer Bullet (Week 1–2)

**Gate:** L298N can be configured via the portal and play `Sine` for 1 hour without a hang.

- [x] Repo skeleton, PlatformIO project, partition layout.
- [ ] `IHapticDriver` interface + `L298NDriver`.
- [ ] `Engine` with 1 kHz tick + 1 hard-coded pattern (`Sine`).
- [ ] Wi-Fi STA + AP fallback + DNS captive portal.
- [ ] `AsyncWebServer` serving `index.html` + `app.js`.
- [ ] `GET /json/state`, `POST /json/state` (subset: `on`, `intensity`, `pattern`).
- [ ] Persistence of pin map in `/config.json`.

Out of scope for v0.1: audio, multi-channel, additional drivers, presets.

---

## v0.2 — Pattern Foundation (Week 3–4)

**Gate:** 10 patterns playable from the portal. Hot-swap with no audible artifact.

- [ ] `IPattern` interface + `PatternRegistry`.
- [ ] 10 patterns: Pulse, Sine, Triangle, Sawtooth, Breath, Heartbeat, Click, Notification, Warning, Drone.
- [ ] `GET /json/patterns` (with full `ParamMeta`).
- [ ] Portal renders a pattern grid + intensity slider.
- [ ] Soft-start ramps + master mute.
- [ ] Watchdog + E-stop GPIO.

---

## v0.3 — HAL Breadth (Week 5–6)

**Gate:** DRV8833 + MOSFET pass HAL conformance tests. DRV2605L passes RTP mode.

- [ ] `DRV8833Driver`, `MOSFETDriver`, `DRV2605LDriver` (RTP only).
- [ ] `DriverFactory` + setup wizard with all four cards.
- [ ] Pin sanity rules + portal pin-conflict UI.
- [ ] `POST /json/config` triggers safe driver swap (reboot required).
- [ ] HAL conformance test suite (manual harness + scope).

---

## v0.4 — Audio Reactive (Week 7–8)

**Gate:** I2S MEMS mic drives `BassPunch` with < 30 ms perceived latency.

- [ ] `AudioAnalyzer` with ADC + INMP441 I2S sources.
- [ ] `arduinoFFT` integration on ESP32, `esp-dsp` on S3 build.
- [ ] Patterns: `EnvelopeFollow`, `BassPunch`, `SpectrumChannels`, `BeatPulse`, `Vocoder`, `KickSnareSplit`.
- [ ] Portal `#/audio` panel with live FFT preview.
- [ ] WebSocket pushes audio frames at 30 Hz when subscribed.

---

## v0.5 — Presets & API hardening (Week 9–10)

**Gate:** Home Assistant can drive the device through the WLED-compat integration.

- [ ] 16 user presets persisted to LittleFS with import/export.
- [ ] `/win` shim + `_wled._tcp` mDNS advertisement.
- [ ] `_haxel._tcp` native mDNS service.
- [ ] WebSocket subprotocol negotiation (`haxel.v1`).
- [ ] Optional bearer-token auth.
- [ ] `/json/diag` with tick-jitter, heap, fault history.

---

## v0.6 — Multi-channel & DRV2605L ROM (Week 11–12)

**Gate:** 4-channel L298N + L298N stack drives `Cascade`, `Ripple`, `Volley`. DRV2605L ROM effects fire via library mode.

- [ ] Channel framework (per-channel `intensity`, `patternOverride`).
- [ ] Multi-channel patterns: `Cascade`, `Ripple`, `Volley`, `BackAndForth`, `KickSnareSplit`.
- [ ] DRV2605L library-mode trigger (`rom:01`..`rom:123`).
- [ ] Portal multi-channel routing UI.

---

## v0.9 — Beta (Week 13–14)

**Gate:** External maker testers receive boards. Bug list bounded.

- [ ] OTA via `/update` + A/B partition layout.
- [ ] Full Reactive + Ambient categories (40+ patterns total).
- [ ] Captive portal redirect probes verified on iOS, Android, macOS, Windows.
- [ ] Documentation site (mkdocs) auto-built from these specs.
- [ ] 10 outside testers signed off.

---

## v1.0 — Production (Week 15–16)

**Gate:** SemVer 1.0.0 tag pushed; release-binary signed; community announce.

- [ ] All targets in [PRODUCT_SPEC.md §7](PRODUCT_SPEC.md) hit.
- [ ] CI: ESP32-C3 + S3 + classic build matrix.
- [ ] Hardware reference design open-sourced (KiCad).
- [ ] Tutorial videos (3): "first flash", "audio reactive", "build a wearable".

---

## v1.1 — Quality of life (post-launch)

- [ ] BLE control profile (parallel to Wi-Fi; one or the other).
- [ ] MQTT bridge.
- [ ] Per-channel current sense (DRV8833 fault pin).
- [ ] Signed OTA updates.

## v1.2 — Spatial patterns

- [ ] 8-channel boards (PCA9685 or shift-register-fanout PWM expansion).
- [ ] Patterns aware of physical channel layout (1D strip, 2D grid).
- [ ] Pattern `Wave2D`, `Ripple2D`, `TouchOriginRipple`.

## v2.0 — Scripting

- [ ] Lua VM (eLua or wasm3 + AssemblyScript).
- [ ] User-authored patterns hot-loaded from `/littlefs/patterns/*.lua`.
- [ ] Sandbox: 256 KB heap, 5 ms per-tick CPU budget, no FS write.
- [ ] Pattern marketplace concept: signed JSON manifests pulled from a community index.

---

## Cross-cutting concerns (every phase)

- **Memory budget:** see [ARCHITECTURE.md §7](ARCHITECTURE.md). Block any PR that pushes `.text` over 1.0 MB or steals from the 100 KB heap floor.
- **Boot time:** the 4 s cold-boot target is regression-protected by serial-log timestamp parsing in CI.
- **Tick jitter:** the p99 target of 2 ms is asserted on hardware at the end of each milestone.
- **Documentation:** every PR that changes the API touches `API_SPEC.md` in the same commit. Specs and code ship together.
