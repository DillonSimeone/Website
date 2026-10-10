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
DEMO_PATTERNS.json   20 showcase patterns
firmware/            Flash to ESP32-C3 with `pio run -t upload` then `-t uploadfs`
web_ui/              Canonical UI source (also lives in firmware/data/)
```

## Build & flash

```sh
cd firmware
pio run -t upload      # flash the program
pio run -t uploadfs    # flash the LittleFS image (UI + demo patterns)
```

The device defaults to an `ember` AP (password `ember`) until you set Wi-Fi via the settings tab.

## Pattern language quick reference

```js
// Built-in variables: i, n, t, PI, TAU
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
