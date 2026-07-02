# Haxel

ESP32 haptic pattern engine. Any motor driver, any actuator. Captive
portal UI, 40+ patterns, WLED-compatible API, sound-reactive modes.

This directory is the **product blueprint + firmware skeleton**.

## Spec documents

- [PRODUCT_SPEC.md](PRODUCT_SPEC.md) — vision, scope, success metrics.
- [ARCHITECTURE.md](ARCHITECTURE.md) — layer model, task layout, boot, safety.
- [HAL_SPEC.md](HAL_SPEC.md) — `IHapticDriver` contract and per-chip details
  (L298N, DRV8833, DRV2605L, raw MOSFET).
- [PATTERN_LIBRARY.md](PATTERN_LIBRARY.md) — 40+ built-in patterns.
- [PORTAL_UI_SPEC.md](PORTAL_UI_SPEC.md) — captive portal UI.
- [API_SPEC.md](API_SPEC.md) — REST + WebSocket + WLED-compat shim.
- [ROADMAP.md](ROADMAP.md) — phased v0.1 → v2.0 plan.

## Firmware

`firmware/` is a PlatformIO project (ESP32 / ESP32-S3 / ESP32-C3 envs). See
[firmware/README.md](firmware/README.md) for build instructions.

## Status

Spec-locked. Firmware skeleton compiles into the v0.1 tracer bullet (L298N +
`Sine` pattern + portal). Implement remaining patterns and drivers per
[ROADMAP.md](ROADMAP.md).
