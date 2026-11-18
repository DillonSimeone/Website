# Ember

A high-performance pattern engine for the ESP32-C3, evolved from WebFastLed.

- **Stack-based bytecode VM** — patterns compile once, run thousands of times per second.
- **New builtins** — `time()`, `wave()`, `triangle()`, `square()`, `perlin1D()`, `perlin2D()`.
- **FreeRTOS-isolated render task** — the web server cannot stutter the LEDs.
- **Single-file dashboard** — code editor with syntax highlighting, live JS preview, pattern library.

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the design rationale and benchmark numbers.

## Layout

```
ARCHITECTURE.md      Why the new VM looks the way it does
DEMO_PATTERNS.json   28 showcase patterns
firmware/            Flash to ESP32-C3 with `pio run -t upload` then `-t uploadfs`
web_ui/              Canonical UI source (also lives in firmware/data/)
```

## Build & flash

```sh
cd firmware
pio run -e audio -t upload      # or -e esp32c3 for standard build
pio run -e audio -t uploadfs    # flash the LittleFS image (UI + demo patterns)
```

The device defaults to a unique per-chip SoftAP (`Ember-XXXX` or `Ember-Audio-XXXX`, password **`ember123`**, portal `http://192.168.4.1`). Standard `esp32c3` builds can also join home Wi-Fi via the Settings tab.

## Default Settings & Wi-Fi Password

Restoring defaults via **Settings → Reset Settings to Defaults** (or clean LittleFS flash) resets configuration to:

| Setting | `audio` env default | `esp32c3` env default |
|---------|---------------------|-----------------------|
| **SoftAP SSID** | `Ember-Audio-XXXX` (MAC suffix, AP-only) | `Ember-XXXX` (MAC suffix) |
| **SoftAP Password** | `ember123` | `ember123` |
| **Portal URL / mDNS** | `http://192.168.4.1` / `http://ember-audio-xxxx.local` | `http://192.168.4.1` / `http://ember.local` |
| **LED Data Pin** | `GPIO 5` | `GPIO 5` |
| **Pixel Count** | `100` | `30` |
| **Brightness** | `128` (`0..255`) | `128` (`0..255`) |
| **Mic Source** | `2` (`MAX4466` analog ADC1) | `0` (`Off`) |
| **MAX4466 Pins** | OUT `GPIO 3`, Soft GND `GPIO 4` | OUT `GPIO 3`, Soft GND `GPIO 4` |
| **INMP441 I2S Pins** | BCLK `GPIO 6`, WS `GPIO 7`, DATA `GPIO 2` | BCLK `GPIO 6`, WS `GPIO 7`, DATA `GPIO 2` |
| **Mic Gain / Smoothing** | `1.50×` / `0.60` | `1.50×` / `0.60` |
| **Audio Gate Fade** | Enabled (`true`), Threshold `2500` MAD | Disabled (`false`), Threshold `2500` MAD |
| **Auto Cycle Showcase** | Enabled (`true`), every `5` s | Disabled (`false`), every `5` s |

## Pattern language quick reference

```js
// Built-in variables: i, index, n, pixelCount, t, time, gate, fade, PI, TAU
h = i/n + time(8);     // hue drifts across the strip; cycles every 8s
hsv(h, 1, 1);          // set the pixel
```

| Function          | Effect |
|-------------------|--------|
| `time(s)`         | sawtooth 0→1 every `s` seconds |
| `wave(v)`         | 0→1 sine of `v` cycles |
| `triangle(v)`     | 0→1→0 triangle of `v` cycles |
| `square(v, duty)` | square wave, `duty` defaults to 0.5 |
| `perlin1D(x)`     | smooth organic noise, 0→1 |
| `perlin2D(x, y)`  | 2D noise |
| `hash(x)`         | stable pseudo-random per `x` |
