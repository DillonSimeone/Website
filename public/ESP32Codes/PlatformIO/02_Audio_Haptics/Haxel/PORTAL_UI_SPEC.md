# Haxel — Captive Portal UI Specification

The portal is a single-page web app served from LittleFS at `/`. It is the only UI most users will ever see. It must be: mobile-first, dark by default, work fully offline (captive AP), and reflect engine state in real time over WebSocket.

---

## 1. Tech stack

- **Framework:** Vanilla JS + Web Components. **No React, Vue, or build chain in v1.0.** Reason: zero-Node-toolchain build, single HTML+JS+CSS bundle ≤ 200 KB, future contributors can edit with a text editor.
- **Styling:** Single `styles.css`, CSS custom properties, no preprocessor. Dark theme is default; light is opt-in.
- **Charts:** Tiny `<canvas>`-based spark renderer (~3 KB). Chart.js etc. are too heavy for a captive portal.
- **Transport:** WebSocket at `/ws` for live state; REST `/json/state` for mutations. Fallback to long-poll only if WS handshake fails.

Bundle target: index.html + `main.js` + styles.css + companion modules (`haptics.js`, `compiler.js`, …). No separate `app.js`. All served from LittleFS on WiFi builds.

## 2. Information architecture

```
/ (root SPA — tabbed portal, not hash-router in current UI)
├── Play (intensity / speed / floor + transport)
├── Library (pattern browser + custom patterns)
├── Pattern Studio (expression editor → /json/custom-patterns or BLE chunked upload)
├── Audio-Reactive (mic / bins; works with browser mic or on-device FFT builds)
└── Device (hardware config, diag, OTA on WiFi builds)
```

Navigation is a top tab bar in the Bauhaus portal (Play / Library / Studio / Audio / Device).

> **Deferred:** dedicated `#/presets` slots (16 named user presets) and bearer-token `#/api` panel — not in the shipped UI. Studio templates and motor floor chips are lightweight local helpers, not flash preset slots.

## 3. Screens

### 3.1 `#/setup` — First-run wizard

Forced when `config.firstRun == true`. Four steps:

1. **Welcome.** One-paragraph explanation of Haxel. Big "Get started".
2. **Choose your driver.** Visual cards: L298N, DRV8833, DRV2605L, MOSFET. Each card includes a thumbnail diagram of expected wiring.
3. **Assign pins.** Driver-specific form. Each pin slot is a dropdown filtered to *valid* GPIOs for that role (output-only pins hidden when the slot is an input). A live "pin conflict?" banner watches for collisions in real time.
4. **Test buzz.** A big button labeled "Buzz" plays a 500 ms Sine at 30 % intensity through every channel in turn. Confirms wiring is good. Below it: a "Something's wrong" link that opens `#/device` for diagnostics.

The wizard ends with optional steps:
5. **Join Wi-Fi.** SSID list + manual entry. Skippable — AP mode is a valid permanent operating mode.
6. **Name your device.** Used for mDNS, AP name, and `state.info.name`.

### 3.2 `#/play` — Daily driver

Mobile layout (≤ 600 px):

```
+--------------------------------+
| Haxel (●) Playing |
| -- pattern: Heartbeat -- |
+--------------------------------+
| [ 4x4 grid of pattern tiles ] |
| Each tile shows: name + tiny |
| envelope spark. |
+--------------------------------+
| Intensity [—●—————] 72% |
| Speed [——●————] 1.0x |
| Channels [1] [2] [3] [4] |
+--------------------------------+
| ⏵ Play ⏹ Stop Mute |
+--------------------------------+
```

- Grid is virtualized for the full library (≥ 40 tiles).
- Per-channel chip enables routing the active pattern to that channel (for multi-channel hardware). Single-channel hardware hides this row.
- The status pill in the header reflects engine state: gray=IDLE, green pulse=PLAYING, blue pulse=AUDIO_REACTIVE, red=FAULT.

### 3.3 `#/library` — Pattern browser

- Search box (filters by name + tag).
- Tag chips: pulse / rhythm / reactive / music / alert / ambient / lra-friendly / library-rom.
- Each pattern card expands inline to show:
 - One-sentence description.
 - Live envelope spark over the last 4 s (uses the same WebSocket sample stream).
 - Parameters as labeled controls (rendered from `ParamMeta`).
 - Edit / delete for custom patterns.

### 3.4 Presets (deferred)

Named 16-slot user presets are **not shipped**. Pattern Studio saves custom expressions; Play/Library restore last runtime via `/runtime.json`.

### 3.5 `#/audio` — Audio-reactive panel

- **Source dropdown:** None / ADC line-in / I2S MEMS. Pins for I2S configurable if MEMS selected.
- **Gain slider** with peak-meter visualization (drawn from WS audio frames).
- **32-band live spectrum** rendered as a row of small vertical bars at ~30 Hz.
- **Routing:** map each channel to a band range or to RMS. Defaults shown for `BassPunch`, `SpectrumChannels`, etc.
- **Latency display:** rolling estimate (audio frame → engine tick → driver write) — important for music production users.

### 3.6 `#/api` — Developer panel

- **Endpoint cheat sheet** (auto-generated from `API_SPEC.md`).
- **Live request console** that POSTs JSON to `/json/state` and shows the response. Pre-filled with the current state for quick iteration.
- **WebSocket inspector** showing raw incoming frames.
- **Token management:** generate / revoke long-lived bearer tokens. Used only if `config.auth.enabled` (off by default).
- **WLED compatibility toggle.** When on, `/win` is mounted and tools like WLED Companion can talk to the device.

### 3.7 `#/device` — Diagnostics & ops

- Uptime, heap free, FS used, RSSI, IP, MAC.
- Tick jitter spark.
- "Run self-test" button — replays the wizard's "Test buzz" + reads back audio loopback.
- **OTA upload** (drag-and-drop a .bin).
- **Restart** / **Factory reset** (the latter wipes `/config.json` + `/runtime.json` + `/custom_patterns.json` and reboots).

## 4. Components (Web Components)

| Tag | Purpose |
| -------------------- | ---------------------------------------------------------------- |
| `<hb-status-pill>` | Engine state badge with animated indicator. |
| `<hb-slider>` | Touch-friendly range slider with numeric badge & double-tap reset. |
| `<hb-pattern-tile>` | Tile in the play grid; renders envelope spark. |
| `<hb-spark>` | Tiny canvas chart, append-only, ring buffer. |
| `<hb-pin-select>` | Dropdown filtered by GPIO role; emits `conflict` events. |
| `<hb-toast>` | Snack-bar notifications, max 1 visible. |
| `<hb-modal>` | Accessible modal with focus trap. |

All components emit standard `CustomEvent`s — no global state library.

## 5. State management

A single `Store` module holds:

```js
{
 connected: bool,
 state: { /* mirror of /json/state */ },
 patterns: [...PatternMeta],
 audio: { rms, peakDb, mags[32] },
 diag: { ... }
}
```

> Named `presets[]` slots are deferred (not in the store today).
`Store.subscribe(path, fn)` notifies subscribers on change. WebSocket frames are merged into the store; user actions debounce (200 ms) into `POST /json/state` writes; on response the store re-syncs to authoritative server state. Optimistic UI is allowed for sliders but **not** for pattern selection (it must round-trip to avoid double-fire).

## 6. Captive portal redirect behavior

When the device is in AP mode, the embedded DNS server resolves *every* hostname to its own IP. The web server matches these well-known captive-detection URLs and 302s them to `/#/play` (or `/#/setup` on first run):

| Probe | Source |
| --------------------------------- | ------------------------ |
| `/generate_204` | Android, Chrome OS |
| `/gen_204` | Older Android |
| `/hotspot-detect.html` | iOS, macOS |
| `/library/test/success.html` | iOS legacy |
| `/connectivity-check.*` | Windows, Ubuntu |
| `/ncsi.txt` | Windows NCSI |

On STA mode (joined to a real Wi-Fi network), these endpoints are **not** hijacked — they pass through 404 so the OS knows the network has real Internet.

## 7. Accessibility

- All controls reachable by keyboard; `Tab` order matches visual order.
- All interactive elements ≥ 44×44 px on touch.
- ARIA roles set on tabs (`role=tablist`), modals (`role=dialog`), and the engine status pill (`role=status aria-live=polite`).
- Color contrast meets WCAG AA against `--bg`. The default palette has been spot-checked.
- Patterns expose a textual description — readable via screen reader when the tile is focused.

A specific user constituency cares about this: **D/HoH users using Haxel for audio→tactile substitution**. They will navigate the audio panel without hearing the source. The audio panel must be useful with sound muted — peak meters and band bars are the affordance.

## 8. Theming

CSS custom properties make a single recolor possible:

```css
:root {
 --bg: #0d0e10;
 --bg-2: #15171b;
 --fg: #f5f6f8;
 --fg-dim: #9aa1ad;
 --accent: #ff6a3d; /* flame orange */
 --accent-2: #ffb627;
 --success: #2ec27e;
 --warn: #f5b400;
 --error: #e5484d;
}
```

Light theme is `@media (prefers-color-scheme: light)` plus a manual toggle stored in localStorage.

## 9. i18n

v1.0 ships English-only. Strings live in `data/strings/en.json`. Adding a locale: drop a new JSON; the bundle auto-loads via `Accept-Language`.

## 10. Performance budget

| Metric | Target |
| --------------------------------------- | ------------------------------- |
| Time to first interactive (Play screen) | < 1.5 s on first load over AP |
| WebSocket reconnect on link drop | < 2 s |
| Pattern grid scroll FPS (60 tiles) | ≥ 50 fps on a 2019 mid-range phone |
| JS heap | < 12 MB |

These are enforced by manual Lighthouse runs at PR time; automated CI checks via `playwright` come post-1.0.
