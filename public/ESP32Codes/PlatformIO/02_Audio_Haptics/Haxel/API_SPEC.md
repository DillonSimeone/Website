# Haxel — API Specification

Haxel exposes three coordinated surfaces:

1. **JSON REST** — `/json/*` — canonical, modern, the source of truth.
2. **WebSocket** — `/ws` — live state push + low-latency commands.
3. **WLED-compatible shim** — `/win` (HTTP query-string) and `/json/state` payload compatibility — so existing WLED tooling (mobile apps, MQTT bridges, Home Assistant) just works.

All endpoints are unauthenticated by default. Setting `config.auth.enabled = true` requires a bearer token on every mutating request.

---

## 1. Conventions

- Base URL on AP: `http://192.168.4.1`
- Base URL on STA: `http://haxel.local` (or chosen hostname)
- All responses are JSON; the WLED shim is the one exception (query-string in, plain-text or HTML out).
- Times are integer milliseconds since boot unless explicitly `iso`.
- Booleans are JSON `true`/`false`, never `0/1`.
- All numeric fields clamp on the server; out-of-range values produce a warning header `X-Haxel-Warning` but a 200 response.

## 2. State object

This is the canonical structure. Most endpoints read or partially mutate it.

```jsonc
{
  "on": true,                     // master enable
  "mute": false,                  // soft mute; keeps pattern running but writes 0
  "intensity": 0.72,              // master multiplier, 0..1
  "speed": 1.0,                   // pattern time multiplier, 0.25..4.0
  "pattern": "Heartbeat",         // active pattern id (see /json/patterns)
  "params": {                     // pattern-specific params, mirror of ParamMeta
    "bpm": 72,
    "intensity": 0.6
  },
  "channels": [
    { "on": true,  "intensity": 1.0, "patternOverride": null },
    { "on": false, "intensity": 0.0, "patternOverride": null }
  ],
  "audio": {
    "enabled": false,
    "source": "i2s",              // none|adc|i2s
    "gain": 1.0
  },
  "info": {
    "name": "Bedroom Vest",
    "version": "1.0.0",
    "driver": "DRV2605L",
    "actuator": "lra",
    "uptime_ms": 12345,
    "ip": "192.168.4.1",
    "mac": "84:CC:A8:00:11:22"
  },
  "fault": null
}
```

## 3. REST — `/json/*`

### 3.1 `GET /json`
Returns `{ state, patterns, presets, info }` in one shot. Used by the portal on initial load. Heavy — clients should prefer the narrower endpoints below.

### 3.2 `GET /json/state`
Returns just the state object (above).

### 3.3 `POST /json/state` (or `PUT`)
Partial mutation. Body is any subset of the state. Example:

```json
{ "on": true, "pattern": "BassPunch", "intensity": 0.6, "audio": { "enabled": true } }
```

Response: full updated state. Status 200 on success, 409 if a fault is active and `clear` was not set.

Special fields:
- `"clear": true` — clears a latched fault.
- `"savePreset": { "slot": 3, "name": "Concert" }` — persists current state to that slot.
- `"loadPreset": 3` — atomically loads preset slot 3.
- `"reboot": true` — reboot after acknowledging.

### 3.4 `GET /json/patterns`
Returns the array of `PatternMeta` from [PATTERN_LIBRARY.md §8](PATTERN_LIBRARY.md).

### 3.5 `GET /json/presets` / `POST /json/presets`
List / replace user presets. Replace requires the full array (atomic).

### 3.6 `GET /json/config`
Returns hardware config (driver kind, pin map, Wi-Fi credentials redacted).

### 3.7 `POST /json/config`
Mutate hardware config. **Requires reboot** for driver-kind changes; response includes `"rebootRequired": true`.

### 3.8 `GET /json/diag`
See [ARCHITECTURE.md §10](ARCHITECTURE.md).

### 3.9 `POST /json/test`
Run the wizard's "Test buzz" remotely. Useful for production line bring-up.

```json
{ "ms": 500, "intensity": 0.3, "channels": "all" }
```

### 3.10 `POST /update`
ArduinoOTA-style firmware push. Multipart upload, single `firmware` field. Server returns 200 on success and reboots; 400 with descriptive body on signature/size failure.

## 4. WebSocket — `/ws`

Subprotocol: `haxel.v1` (clients SHOULD send this in `Sec-WebSocket-Protocol`; the server is lenient if absent).

### 4.1 Inbound (client → server)

Each message is a JSON object with a `type`:

```jsonc
{ "type": "subscribe", "topics": ["state","audio","diag"] }
{ "type": "state", "patch": { "intensity": 0.4 } }      // same shape as POST /json/state
{ "type": "ping" }
{ "type": "external", "channel": 0, "value": 0.62 }     // direct sample injection (External pattern only)
```

The `external` message is rate-limited to 100 Hz per channel server-side. Above 100 Hz, oldest samples are dropped.

### 4.2 Outbound (server → client)

```jsonc
{ "type": "state",  "data": { /* state object */ } }       // pushed on every change
{ "type": "audio",  "data": { "rms": 0.13, "peakDb": -22, "mags": [/* 32 floats */] } }   // ~30 Hz when subscribed
{ "type": "diag",   "data": { /* diag object */ } }        // 1 Hz when subscribed
{ "type": "fault",  "data": { "code": "OVER_TEMP_EST", "channel": 0, "ts": 12000 } }
{ "type": "pong" }
```

### 4.3 Flow control

- Server queues at most 32 frames per client. On overflow, oldest is dropped silently.
- Clients can `subscribe` / `unsubscribe` selectively to reduce bandwidth.
- Heartbeat: server sends `{ "type": "ping" }` every 30 s; client SHOULD reply within 5 s or be disconnected.

## 5. WLED compatibility — `/win` and `/json/state`

The goal is **not** full WLED API parity (we are not LED-shaped). The goal is: a WLED-aware client can toggle on/off, set "brightness" (intensity), and pick a "preset" (pattern) without rewriting any code.

### 5.1 `/win` query-string commands

| Query                  | Effect                              |
| ---------------------- | ----------------------------------- |
| `?T=1` / `?T=0`        | `on = true / false`                 |
| `?T=2`                 | Toggle on                           |
| `?A=128`               | `intensity = 128/255`               |
| `?FX=14`               | Set pattern by numeric index (in pattern registry order) |
| `?PL=3`                | Load preset 3                       |
| `?SX=192`              | `speed = 192/64` mapped to 0.25..4 (matches WLED FX speed convention) |
| `?RB=1`                | Reboot                              |

Response is the plain string `OK` (WLED parity).

### 5.2 `/json/state` payload aliases

In addition to the native shape, the server accepts WLED's vocabulary:

| WLED field            | Mapped to                  |
| --------------------- | -------------------------- |
| `on`                  | `on`                       |
| `bri`  (0..255)       | `intensity = bri / 255`    |
| `seg[0].fx`           | pattern by index           |
| `seg[0].sx`           | `speed`                    |
| `seg[0].ix`           | `params.intensity`         |
| `ps`                  | load preset                |
| `psave`               | save preset (slot=psave)   |

We never *return* the WLED shape; clients that POST in WLED vocabulary get our native response. This is documented at `/api` in the portal.

### 5.3 What is **not** supported in `/win`

- `&C=` color (no color concept).
- Segment palettes, IR shortcuts, JSON over MQTT (use our native MQTT, post-1.0).

## 6. mDNS / discovery

- Service: `_haxel._tcp` on port 80.
- TXT records: `version`, `driver`, `channels`, `actuator`.
- For WLED tool compatibility, the device **also** advertises `_wled._tcp` on the same port with TXT `compat=haxel` so WLED scanners find it; the WLED app will then see "Haxel (compat)" in its picker.

## 7. Authentication (optional)

```json
{
  "auth": {
    "enabled": true,
    "tokens": [
      { "id": "ha-bridge", "hash": "..." }
    ]
  }
}
```

When enabled, all mutating REST/WS messages require `Authorization: Bearer <token>`. Read endpoints (`GET /json/*`) remain open unless `auth.readProtected = true`.

Tokens are stored as bcrypt hashes (cost 8, fine for ESP32). Plain-text tokens are returned **only** at creation time.

## 8. Error model

```json
{ "error": { "code": "PIN_CONFLICT", "message": "GPIO 5 is assigned to ENA and IN3", "details": { "pin": 5 } } }
```

Common codes:
- `PIN_CONFLICT`
- `INVALID_PATTERN`
- `INVALID_PARAM`
- `DRIVER_INIT_FAILED`
- `FAULT_LATCHED`
- `RATE_LIMITED`
- `AUTH_REQUIRED`

## 9. Examples

### 9.1 Curl: start heartbeat at 80 BPM at 60 % intensity

```bash
curl -X POST http://haxel.local/json/state \
  -H 'content-type: application/json' \
  -d '{ "on": true, "pattern": "Heartbeat", "intensity": 0.6, "params": { "bpm": 80 } }'
```

### 9.2 JS WebSocket: push 50 Hz envelope

```js
const ws = new WebSocket('ws://haxel.local/ws', 'haxel.v1');
ws.onopen = () => ws.send(JSON.stringify({
  type: 'state', patch: { on: true, pattern: 'External' }
}));
setInterval(() => {
  const v = Math.max(0, Math.sin(Date.now()/100) * 0.5 + 0.5);
  ws.send(JSON.stringify({ type: 'external', channel: 0, value: v }));
}, 20);
```

### 9.3 Home Assistant via WLED-compat integration

Add the device by IP in the HA WLED integration. "Brightness" maps to intensity, "Effect" maps to pattern. Speed slider maps to `speed`.

## 10. Versioning

`/json/info.version` follows SemVer. Breaking REST or WS changes bump major. The `haxel.v1` WebSocket subprotocol is the negotiation point — `v2` will be added alongside `v1` and `v1` will be supported for at least one major release.
