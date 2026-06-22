# Haxel — System Architecture

**Audience:** firmware contributors, hardware integrators.
**Companion docs:** [HAL_SPEC.md](HAL_SPEC.md), [PATTERN_LIBRARY.md](PATTERN_LIBRARY.md), [API_SPEC.md](API_SPEC.md), [PORTAL_UI_SPEC.md](PORTAL_UI_SPEC.md).

---

## 1. Layer model

```
+--------------------------------------------------------------+
|  EXTERNAL CLIENTS                                            |
|  Captive portal UI · REST · WebSocket · WLED /win · mDNS     |
+--------------------------------------------------------------+
|  APPLICATION LAYER                                           |
|  ApiHandlers · CaptivePortal · WebServer · OTA               |
+--------------------------------------------------------------+
|  CORE LAYER                                                  |
|  Engine (scheduler) · Pattern instances · Config · Presets   |
|  · AudioAnalyzer (FFT + envelope) · DiagBus                  |
+--------------------------------------------------------------+
|  HARDWARE ABSTRACTION LAYER (HAL)                            |
|  IHapticDriver · L298N · DRV8833 · DRV2605L · MOSFET         |
|  · GPIO map · LEDC channel allocator · I2C bus               |
+--------------------------------------------------------------+
|  PLATFORM                                                    |
|  ESP-IDF / Arduino-ESP32 · FreeRTOS · LittleFS · WiFi        |
+--------------------------------------------------------------+
```

The arrows are strictly downward. The HAL never knows what pattern is playing; the pattern engine never knows what chip it is driving. This is what makes "any actuator, any driver" tractable.

## 2. Concurrency model

Haxel runs four cooperating FreeRTOS tasks pinned across the two ESP32 cores:

| Task             | Core | Pri  | Stack | Period            | Owns                                                 |
| ---------------- | ---- | ---- | ----- | ----------------- | ---------------------------------------------------- |
| `engine_task`    | 1    | 5    | 4 KB  | 1 kHz tick        | Pattern evaluation, HAL writes.                      |
| `audio_task`     | 1    | 4    | 6 KB  | I2S DMA driven    | ADC/I2S read, windowing, FFT, envelope.              |
| `web_task`       | 0    | 3    | 8 KB  | event driven      | HTTP, WebSocket, captive DNS.                        |
| `housekeeping`   | 0    | 1    | 4 KB  | 10 Hz             | Wi-Fi watchdog, mDNS keepalive, persisted writes.    |

The two real-time-ish tasks (engine + audio) live on core 1 and never touch the network stack. The web + housekeeping tasks live on core 0 with the LwIP / Wi-Fi driver, exactly as Arduino-ESP32 expects.

### 2.1 Inter-task communication

- `engine_task` reads a single `EngineState` struct guarded by a portMUX critical section. Writers (web layer) call `Engine::stageState()` which double-buffers; the engine commits on the next tick boundary. **No mutex blocking on the hot path.**
- `audio_task` writes the latest analysis frame (`AudioFrame`: 32 mag bins + RMS + peak + onset flag) into a single-producer/single-consumer atomic slot read by the engine. Stale reads are acceptable — at 1 kHz the engine reads many times per audio frame (~43 Hz at 1024-sample windows / 44.1 kHz).
- `web_task` posts mutations to a 16-slot FreeRTOS queue (`engine_cmd_q`) consumed by the engine on each tick. This makes every API call append-only and non-blocking.

### 2.2 Timing budget per engine tick (1 ms)

| Stage                                  | Budget   |
| -------------------------------------- | -------- |
| Pull staged commands from queue        | 50 µs    |
| Evaluate active pattern                | 300 µs   |
| Compose multi-channel output           | 100 µs   |
| HAL write (LEDC / I2C deferred)        | 250 µs   |
| Slack / interrupts                     | 300 µs   |

Patterns that exceed 300 µs (e.g., FFT-walk) are required to declare a coarser internal rate and interpolate.

## 3. Module catalog

### `core::Engine`
The scheduler. Holds an array of `Channel` (default 4). Each tick it:
1. Drains the command queue.
2. For each active channel: pulls the bound `IPattern::sample(t, ctx)` → 0..1 float.
3. Applies per-channel intensity, master mute, soft-start ramp.
4. Calls `driver->write(channelIdx, value)`.

The engine owns no I/O directly. It only owns *time* and *state*.

### `core::Pattern` and `core::PatternRegistry`
Patterns are pure functions of `(t, params, audio)`. They are registered at boot from a static table. See [PATTERN_LIBRARY.md](PATTERN_LIBRARY.md). The registry is the single source of truth for what `GET /json/patterns` returns.

### `core::AudioAnalyzer`
Wraps `arduinoFFT` (or `esp-dsp` on S3) plus an envelope follower. Configurable input:
- ADC1 channel (DC-coupled line-in via voltage divider, ~3.3 Vpp max).
- I2S MEMS (INMP441) on configurable BCLK / WS / SD pins.
- Software-injected test signal (for offline pattern dev).

### `hal::IHapticDriver`
Strict interface, see [HAL_SPEC.md](HAL_SPEC.md). Every concrete driver implements:

```cpp
class IHapticDriver {
public:
    virtual bool begin(const DriverConfig& cfg) = 0;
    virtual void write(uint8_t ch, float value) = 0;   // value: 0.0..1.0
    virtual void writeSigned(uint8_t ch, float v) = 0; // -1.0..1.0 (bidirectional)
    virtual uint8_t channelCount() const = 0;
    virtual DriverCaps capabilities() const = 0;
    virtual void end() = 0;
    virtual ~IHapticDriver() = default;
};
```

`DriverCaps` advertises: bidirectional, brake mode, library-based (DRV2605L), max PWM frequency, on-chip closed-loop.

### `hal::DriverFactory`
Selects + constructs the driver from the persisted `Config::driverKind` value. Adding a new driver is a single switch-case here plus a registration in the build.

### `web::WebServer`
`AsyncWebServer` on port 80. Serves the SPA from LittleFS, mounts `/json`, `/win`, `/ws`, `/update`, `/diag`. Hosts the captive portal DNS hijack when in AP mode.

### `web::CaptivePortal`
A `DNSServer` that resolves every name to the AP IP, plus 302 redirects from `/generate_204`, `/hotspot-detect.html`, `/connectivity-check.*` to `/`. This is what makes the phone auto-pop the UI on join.

### `core::Config` + `core::Presets`
Two LittleFS-backed JSON documents:
- `/config.json` — hardware setup, Wi-Fi, names, pin map.
- `/presets.json` — array of up to 16 named user presets.

Writes are debounced 1 s; flash wear is bounded by deduplication (don't write if equal).

## 4. Boot sequence

```
1. NVS init                         ~ 30 ms
2. LittleFS mount                   ~ 50 ms
3. Config::load()                   ~ 10 ms
4. HAL = DriverFactory::create()    ~ 20 ms
5. Engine::begin(HAL)               ~ 10 ms
6. AudioAnalyzer::begin(if enabled) ~ 50 ms
7. Wi-Fi: STA attempt (3 s timeout)  ≤ 3000 ms
8. If STA fail: AP up + DNS hijack  ~ 200 ms
9. WebServer::begin()               ~ 100 ms
10. mDNS announce                    ~ 100 ms
11. engine_task scheduled
```

Cold boot to "engine ticking and serving HTTP" target: **< 4 s** on Wi-Fi success path, **< 1.5 s** on AP-fallback path.

## 5. State model

```
                +-----------+   API: state.on=true
                |  IDLE     +-----------------+
                +-----+-----+                 |
                      |                       v
                      |               +-------+--------+
                      |               |   PLAYING      |
                      |               | pattern=N      |
                      |               | intensity=v    |
                      |               +-------+--------+
                      |                       |
                      |                       | safety: temp ok, current ok
                      |                       v
                      |               +-------+--------+
                      |               | AUDIO-REACTIVE |
                      |               +----------------+
                      |
                      | safety: over-temp, over-current, e-stop
                      v
                +-----+-----+
                |  FAULT    |  (latches; cleared by /json/state {"clear":true})
                +-----------+
```

The engine is always in one of `IDLE | PLAYING | AUDIO_REACTIVE | FAULT`. State is exposed verbatim at `GET /json/state`.

## 6. Safety subsystem

- **Soft-start ramp:** every `write()` is rate-limited to 0→1 in ≥ 20 ms by default (configurable per pattern). Prevents the first tick from slamming the actuator and back-EMF spiking the driver.
- **Duty cap:** per-channel max duty (configurable 0.0..1.0). LRAs in particular benefit from ≤ 0.7 to avoid clipping the resonance.
- **Watchdog:** software WDT 4 s. Engine kicks it every tick.
- **Thermal estimate:** integrating I²·t per channel; soft fault at threshold. Heuristic only — no current sense in v1.0.
- **E-stop:** holding `/json/state {"on":false}` from any client, or pulling GPIO `E_STOP_PIN` low, drops all channels to zero in ≤ 5 ms.

## 7. Memory budget (ESP32 classic, 4 MB flash, 320 KB SRAM)

| Region                | Budget   | Notes                                                    |
| --------------------- | -------- | -------------------------------------------------------- |
| .text                 | ≤ 1.0 MB | App binary, includes patterns table.                     |
| LittleFS partition    | 1.5 MB   | SPA assets + config + presets.                           |
| OTA partition (×2)    | 1.5 MB   | A/B slots for safe OTA.                                  |
| Heap free at idle     | ≥ 100 KB | Reserved for WebSocket buffers + FFT.                    |
| FFT work buffer       | 8 KB     | 1024-sample float window + mag bins.                     |

Partition table: see `firmware/partitions.csv` (skeleton).

## 8. Extension points

Adding a new actuator driver:
1. Implement `IHapticDriver` in `src/hal/MyDriver.cpp`.
2. Register in `DriverFactory::create()` and add a `DriverKind::MY_DRIVER` enum.
3. Add UI option in `data/setup.html` driver dropdown.
4. Add HAL conformance tests in `test/test_hal_mydriver.cpp`.

Adding a new pattern:
1. Implement `IPattern` (single virtual `float sample(t, ctx)`).
2. Register in `Patterns::registerAll()`.
3. Add params metadata so the portal can render sliders.

Both are deliberately additive — no central enum sprawl.

## 9. Failure modes & recovery

| Failure                             | Detection                          | Response                                                  |
| ----------------------------------- | ---------------------------------- | --------------------------------------------------------- |
| Driver `begin()` returns false      | At boot                            | Engine stays IDLE, portal forces `/setup`.                |
| I2C NAK (DRV2605L)                  | Each transfer; >3 consecutive      | Mark driver faulted, fall back to channel 0 mute.         |
| Wi-Fi STA loses link                | `WiFi.onEvent`                     | Re-attempt 5×; on persistent fail, raise AP alongside.    |
| WebSocket flood                     | Backpressure on queue              | Drop oldest, log; client sees stale state.                |
| Pattern overruns tick budget        | Engine measures `micros()`         | Log to DiagBus, skip frame, do not crash.                 |

## 10. Diagnostics

`GET /json/diag` returns:
```json
{
  "uptime_ms": 123456,
  "tick_jitter_us": {"p50": 8, "p99": 87, "max": 412},
  "queue_depth": 0,
  "heap_free": 154200,
  "fs_used_pct": 31,
  "rssi": -54,
  "driver": "DRV2605L",
  "channels": 1,
  "fault": null
}
```

This endpoint is the contract that lets us regression-test in CI on the ESP32-S3 dev board.
