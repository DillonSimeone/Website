# HapticBlaze firmware

PlatformIO project. This is skeleton code that compiles into a working tracer-bullet
firmware — L298N driving a Sine pattern over Wi-Fi + captive portal — and is
designed to be extended toward the full v1.0 spec without re-architecture.

## Build

```bash
pio run -e esp32dev
pio run -e esp32dev -t uploadfs    # flash the SPA in data/
pio run -e esp32dev -t upload      # flash firmware
pio device monitor
```

For the S3 / C3 envs use `-e esp32-s3` / `-e esp32-c3`.

## Layout

```
firmware/
├── platformio.ini
├── partitions.csv
├── include/
│   └── HapticBlaze.h          umbrella header
├── src/
│   ├── main.cpp               wiring + task layout
│   ├── core/
│   │   ├── Engine.{h,cpp}     1 kHz pattern scheduler
│   │   ├── Config.{h,cpp}     LittleFS-backed JSON config
│   │   ├── Pattern.h          IPattern + meta types
│   │   ├── PatternRegistry.{h,cpp}
│   │   └── AudioAnalyzer.{h,cpp} FFT + envelope follower
│   ├── hal/                   IHapticDriver implementations
│   │   ├── IHapticDriver.h
│   │   ├── DriverFactory.{h,cpp}
│   │   ├── LedcAllocator.{h,cpp}
│   │   ├── PinSanity.{h,cpp}
│   │   ├── L298NDriver.{h,cpp}
│   │   ├── DRV8833Driver.{h,cpp}
│   │   ├── DRV2605LDriver.{h,cpp}
│   │   └── MOSFETDriver.{h,cpp}
│   ├── patterns/
│   │   └── Patterns.{h,cpp}   built-in pattern table
│   └── web/
│       ├── WebServer.{h,cpp}
│       ├── CaptivePortal.{h,cpp}
│       └── ApiHandlers.{h,cpp}
└── data/                       LittleFS image (SPA)
    ├── index.html
    ├── app.js
    └── styles.css
```

## First boot

Power the board. Look for SSID `HapticBlaze-XXXX`. Open the captive portal,
finish the setup wizard, save. The device reboots into normal mode and serves
the SPA at `http://hapticblaze.local` (or the AP IP).

## Where to look

- **Add a driver:** `src/hal/` — implement `IHapticDriver`, register in `DriverFactory.cpp`.
- **Add a pattern:** `src/patterns/Patterns.cpp` — implement `IPattern`, add to `registerAll`.
- **Add an API endpoint:** `src/web/ApiHandlers.cpp`.

See the top-level specs (`../*.md`) for the contracts.
