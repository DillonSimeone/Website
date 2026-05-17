# HapticBlaze — Session Summary

**Date:** 2026-05-16
**Hardware on bench:** ESP32-C3 SuperMini (MAC `8c:d0:b2:a8:1d:17`) on `COM4`, native USB-Serial/JTAG.
**Motor driver:** Modern "mini" H-bridge (MX1508 / L9110S / DRV8833 mini-class), IN1 → GPIO 0, IN2 → GPIO 1.

---

## 1. What was built

### 1.1 Product blueprint (eight spec documents)

| Doc | What it contains |
|---|---|
| `PRODUCT_SPEC.md` | Vision, target users, MVP scope, success metrics, brand. |
| `ARCHITECTURE.md` | 5-layer model, FreeRTOS task topology, 1 kHz engine tick, boot sequence, safety subsystem, memory budget. |
| `HAL_SPEC.md` | `IHapticDriver` contract + per-chip details for L298N, DRV8833, DRV2605L, MOSFET, including a Mini H-Bridge variant. |
| `PATTERN_LIBRARY.md` | 40+ patterns across Pulse / Rhythm / Reactive / Music / Alert / Ambient categories. |
| `PORTAL_UI_SPEC.md` | Captive-portal SPA design, screens, components, captive-detection probes, accessibility. |
| `API_SPEC.md` | REST `/json/*`, WebSocket `/ws` (subprotocol `hapticblaze.v1`), WLED-compatible `/win` shim, mDNS discovery. |
| `ROADMAP.md` | v0.1 tracer → v1.0 production → v2.0 Lua scripting. |
| `SUMMARY.md` | This document. |

### 1.2 Firmware skeleton (`firmware/`)

Real PlatformIO project. **Builds clean on ESP32, ESP32-S3, ESP32-C3.** Binary size ~1.0 MB / 1.5 MB partition (66 %), 55 KB RAM.

```
firmware/
├── platformio.ini              ESP32 / S3 / C3 envs; ESP32Async AsyncTCP+ESPAsyncWebServer forks
├── partitions.csv              4 MB layout, A/B OTA + 0.9 MB LittleFS
├── data/                       SPA assets (LittleFS image)
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── include/HapticBlaze.h       umbrella header
└── src/
    ├── main.cpp                FreeRTOS task wiring, Wi-Fi STA/AP bring-up, mDNS
    ├── core/
    │   ├── Engine.{h,cpp}      1 kHz scheduler, double-buffered staged state, jitter sampling
    │   ├── Config.{h,cpp}      LittleFS-backed JSON config, debounced writes
    │   ├── Pattern.h           IPattern interface, PatternMeta, ParamMeta
    │   ├── PatternRegistry.{h,cpp}
    │   └── AudioAnalyzer.{h,cpp}  I2S + ADC, arduinoFFT, 32-band spectrum, envelope
    ├── hal/
    │   ├── IHapticDriver.h     interface + DriverKind enum (incl. MINI_HBRIDGE alias)
    │   ├── DriverFactory.{h,cpp}
    │   ├── L298NDriver.{h,cpp} supports both separate-PWM and sign-magnitude modes; optional STBY pin
    │   ├── DRV8833Driver.{h,cpp}
    │   ├── DRV2605LDriver.{h,cpp}  RTP + ROM library trigger
    │   ├── MOSFETDriver.{h,cpp}
    │   ├── LedcAllocator.{h,cpp}  chip-aware (C3:6, S3:8, classic:16 channels)
    │   └── PinSanity.{h,cpp}    target-aware strapping/input-only checks
    ├── patterns/
    │   └── Patterns.{h,cpp}    7 built-ins registered (Sine, Pulse, Breath, Heartbeat, EnvelopeFollow, BassPunch, External)
    └── web/
        ├── WebServer.{h,cpp}   AsyncWebServer, captive-probe redirects, no-store static cache
        ├── CaptivePortal.{h,cpp}  DNS hijack to AP IP
        └── ApiHandlers.{h,cpp} JSON REST + WLED shim + WebSocket dispatch
```

### 1.3 Hardware bring-up so far

- ESP32-C3 SuperMini flashed successfully via `python -m platformio run -e esp32-c3 -t upload -t uploadfs`.
- Wi-Fi AP `HapticBlaze-XXXX` comes up reliably.
- Captive portal redirect works on phone — opens automatically on join.
- SPA loads.
- Tab navigation (`Play / Library / Setup / Device`) works.
- GPIO dropdowns populate from `GET /json/gpios` (C3 list: `0,1,3,4,5,6,7,10,20,21` — strapping pins 2/8/9 and USB 18/19 excluded).
- Setup screen renders motor cards with Forward / Backward / Speed dropdowns and `+ Add motor` button.

---

## 2. Current blocker (NOT resolved)

### 2.1 Symptom

POST requests to `/json/config` (and previously `/json/buzz`) return `200` with the contents of `index.html` instead of a JSON response. The SPA throws:

```
Save and reboot failed: Unexpected token 'v', "<!doctype..." is not valid JSON
```

The same error appeared on `/json/buzz` earlier in the session.

### 2.2 What was tried (in order)

1. **Reordered handler mount sequence.** Originally `serveStatic` mounted first; reordered to: `mountWebsocket_` → `mountJsonApi_` → `mountWlenApi_` → `mountCaptiveProbes_` → `mountStatic_` (last). API routes register before the catch-all static handler.
2. **Disabled static cache.** Changed `setCacheControl("max-age=3600")` to `"no-store, max-age=0"` to rule out stale assets.
3. **Hardened `onNotFound`.** Now returns `404` JSON for any URL beginning with `/json`, `/win`, or `/ws` — never an HTML redirect. Only unknown SPA paths get the 302 → `/`.
4. **Converted `/json/buzz` to a query-param handler** (no body, both GET and POST). This worked — buzz endpoint now responds correctly. **Strongly suggests the root cause is in the JSON-body path, not routing.**
5. **Replaced both `/json/state` and `/json/config` POST handlers with `AsyncCallbackJsonWebHandler`** from `<AsyncJson.h>` — the canonical pattern for JSON POSTs in ESPAsyncWebServer. Used `setMethod(HTTP_POST | HTTP_PUT)` and `server.addHandler(...)`.
6. **Bumped `ESP.restart()` flush window** 250 ms → 800 ms to ensure the response is on the wire before reboot.
7. **Clean rebuild + reflash** (firmware + LittleFS) to flush SCons / browser caches.

**After all of the above, `/json/config` POST still returns HTML.** Buzz still works.

### 2.3 Probable root causes (in priority order)

1. **ESP32Async ESPAsyncWebServer `AsyncCallbackJsonWebHandler` quirk.** The fork's behavior may differ from upstream — `setMethod()` may not be filtering correctly, or `canHandle()` may not be matching against the registered URI. The fact that query-param POSTs work but JSON-body POSTs do not strongly points here.
2. **Firmware partition didn't update on the most recent flash.** The `pio` build output was clean and uploads reported success, but the symptom hasn't changed across multiple reflashes — open question whether the C3 actually reloaded the new app0 image vs. running an older slot.
3. **Browser is following a 302 from a previous response that's still in the cache.** Less likely after the no-store change, but mobile browsers can hold cached redirects aggressively.
4. **Some intermediate handler (the WebSocket handler, an mDNS redirect, the DNS server) is intercepting POSTs to specific paths.** Buzz is GET/POST; config is POST-only with a body. Some interception path could be method-specific.

---

## 3. What's left to do

### 3.1 Diagnosis — do these first (10 minutes)

1. **Verify the running firmware is actually the latest.** With the board plugged in:
   ```bash
   python -m platformio device monitor -p COM4 -b 115200
   ```
   Reset the board (unplug-replug or `EN` button). Watch the boot log. Confirm the route-registration log lines appear from `ApiHandlers::install`. If they don't, the firmware partition isn't running the latest binary — try `pio run -t erase` then re-flash.

2. **Curl `/json/config` POST from the laptop** with `-v` to see headers:
   ```bash
   curl -v -X POST http://192.168.4.1/json/config \
        -H "content-type: application/json" \
        -d '{"driver":{"kind":5,"pins":[-1,0,1,-1,-1,-1,-1,-1],"pwmHz":20000}}'
   ```
   - If response is `200` + HTML: routing problem (firmware-side).
   - If response is `404` + JSON: the AsyncCallbackJsonWebHandler isn't matching (handler-registration problem).
   - If response is `200` + `{"ok":true,...}`: the firmware is fine, the browser SPA is the problem.

3. **Curl with no body** (to see how the framework handles it):
   ```bash
   curl -v -X POST http://192.168.4.1/json/config
   ```

### 3.2 Likely fixes (depending on diagnosis result)

| Diagnosis | Fix |
|---|---|
| Returns HTML from curl too | Replace `AsyncCallbackJsonWebHandler` with a manual handler that buffers `data` chunks into a per-request String and calls `deserializeJson` in the request handler (not body handler). Already proven to work via `/json/buzz`. |
| Returns 404 JSON | `AsyncCallbackJsonWebHandler` registration order or method-mask issue. Try registering it as a single-method handler (POST only, then a second one for PUT) or omit `setMethod()` and let it accept all default methods. |
| Returns correct JSON from curl | Browser issue — clear iOS Safari "Website Data" for the captive portal IP, or use Chrome in incognito. |

### 3.3 Easiest "make it work" path (recommended)

**Convert `/json/config` to a query-param endpoint** like `/json/buzz`, which we already know works in this fork:

```
POST /json/config?kind=5&pin0=-1&pin1=0&pin2=1&pin3=-1&pin4=-1&pin5=-1&pin6=-1&pin7=-1&pwmHz=20000
```

It's less elegant than JSON-body POST, but it bypasses the broken path entirely. The SPA changes one line; the firmware changes one handler. ~15 minutes of work and the user can save config and move on.

### 3.4 Remaining roadmap work (not blocked by §3.3)

- **Patterns:** 33 of the 40+ patterns from `PATTERN_LIBRARY.md` are speced but not implemented yet (only 7 built-ins registered).
- **Driver work:** DRV8833, DRV2605L, MOSFET drivers exist but are untested on hardware. DRV2605L auto-cal flow and ROM library trigger needs a real LRA on hand to verify.
- **Audio reactive:** Code exists but isn't wired into the engine config flow — `AudioConfig` defaults to disabled.
- **Multi-channel:** Engine supports up to 4 channels but the SPA's per-channel routing UI from `PORTAL_UI_SPEC.md §3.2` is not implemented.
- **Presets:** Spec says 16 user presets — not implemented.
- **WebSocket subscription topics:** Server pushes state on change but the `audio` and `diag` topics are not actively pushed (clients see only `state`).
- **OTA:** `/update` endpoint exists but is untested.
- **CI:** `[env:native-test]` is declared in `platformio.ini` but no host-side tests have been written.

---

## 4. Hardware checklist for the user (when save eventually works)

For the modern mini H-bridge (MX1508 / L9110S / similar):

1. **Common ground.** ESP32 `GND` and driver `GND` must be the same wire — not just both "grounded."
2. **Driver VCC powered.** Mini drivers need ≥ 3 V on logic, motor supply on `VM`/`VMOT` if separate.
3. **IN1 = GPIO 0, IN2 = GPIO 1**, motor leads on the OUT side.
4. **In Setup:** Driver = `Mini H-Bridge`, Forward = `GPIO 0`, Backward = `GPIO 1`, Standby = `— jumper / +5V —`.
5. **Test buzz** from Setup OR curl `http://192.168.4.1/json/buzz?ms=400&intensity=0.8` from the laptop.
6. If still nothing: multimeter on GPIO 0 while a `Pulse` pattern is playing. Should read ~1.6–2 V average (PWM duty × 3.3 V). 0 V or 3.3 V flat = firmware isn't writing to that pin.

---

## 5. Files in this deliverable

```
output/hapticblaze/
├── PRODUCT_SPEC.md           product vision and scope
├── ARCHITECTURE.md            system architecture
├── HAL_SPEC.md                driver layer spec
├── PATTERN_LIBRARY.md         40+ pattern catalog
├── PORTAL_UI_SPEC.md          captive-portal UI spec
├── API_SPEC.md                REST / WS / WLED-compat API
├── ROADMAP.md                 phased delivery plan
├── SUMMARY.md                 ← you are here
├── README.md                  index
└── firmware/                  PlatformIO project (compiles + runs)
    ├── platformio.ini
    ├── partitions.csv
    ├── data/                  SPA: index.html, app.js, styles.css
    ├── include/HapticBlaze.h
    └── src/                   core/, hal/, patterns/, web/, main.cpp
```

**Spec docs are production-quality and complete.** The firmware is functional through Wi-Fi + SPA loading + GET endpoints; the one outstanding bug (JSON POST returning HTML) is well-characterized and has a documented workaround in §3.3.
