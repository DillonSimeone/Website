# DeafDoorbell

**A low-latency visual & tactile doorbell alert system for deaf individuals, powered by ESP-NOW on the ESP32-C3.**

When your door chime rings, a microphone-equipped **Leader** ESP32-C3 detects the acoustic signature in ~10ms and broadcasts an ESP-NOW alert to every **Follower** ESP32-C3 in your home—flashing an 8×8 WS2812B LED matrix and buzzing a vibration motor with near-zero delay.

---

## Hardware & Wiring

### Leader (mounted next to the door chime)

| Component          | ESP32-C3 GPIO | Notes                              |
|--------------------|---------------|------------------------------------|
| MAX4466 `OUT`      | `GPIO 3`      | Analog ADC input (`ADC1_CH3`)      |
| MAX4466 `GND`      | `GPIO 4`      | Soft ground (driven `LOW`) or `GND`|
| MAX4466 `VCC`      | `3.3V`        | Clean 3.3V supply                  |
| Onboard Status LED | `GPIO 8`      | Live audio level / alert indicator |

### Follower (placed anywhere in your home)

| Component          | ESP32-C3 GPIO | Notes                              |
|--------------------|---------------|------------------------------------|
| WS2812B `DIN`      | `GPIO 5`      | 8×8 LED matrix (64 LEDs default)   |
| Vibration Motor    | `GPIO 3`      | Via transistor/MOSFET to GND       |
| Onboard Status LED | `GPIO 8`      | Heartbeat / alert indicator        |
| Boot Button        | `GPIO 9`      | Hold 3s to reset pairing           |

---

## Project Architecture

```text
DeafDoorbell/
├── shared/
│   └── DoorbellProtocol.h       # Single source of truth for ESP-NOW packet structs
├── Leader/
│   ├── platformio.ini           # Builds with -I../shared
│   ├── compile_bin.bat          # Compiles Leader/firmware.bin for Web OTA
│   ├── upload.bat               # USB-C build, flash & monitor
│   └── src/
│       ├── main.cpp             # High-level setup() and loop() orchestrator
│       ├── Config.h             # Pins, constants, NVS settings & paired peers
│       ├── AudioEngine.h        # Single-pass MAX4466 ADC + IIR DC blocker + 3-chunk leaky debounce
│       ├── EspNowManager.h      # Zero-stall broadcast bursts & pairing state machine
│       ├── TelemetryLog.h       # 24h audio buckets, trigger history & ESP-NOW sniffer logs
│       ├── WebPortal.h          # Batched zero-heap HTTP handlers & OTA endpoints
│       ├── PortalHtml.h         # Studio control portal UI
│       ├── LogHtml.h            # Live audio & telemetry dashboard UI
│       └── UpdateHtml.h         # Web OTA upload UI (/update)
└── Follower/
    ├── platformio.ini           # Builds with -I../shared & FastLED
    ├── compile_bin.bat          # Compiles Follower/firmware.bin
    ├── upload.bat               # USB-C build, flash & monitor
    └── src/
        ├── main.cpp             # Non-blocking ESP-NOW RX, mesh relay & state loop
        ├── FollowerConfig.h     # Pins, NVS storage & anti-storm deduplication cache
        └── Animations.h         # Phase-aligned 60 FPS FastLED matrix patterns
```

---

## Low-Latency Engineering on ESP32-C3

1. **Modem Sleep Disabled (`WIFI_PS_NONE`):** Both Leader and Follower disable ESP32-C3 Wi-Fi power saving so Follower radios stay continuously awake on Channel 1 (~1ms RX wake time instead of 50–150ms DTIM lag).
2. **Single-Pass ADC + 3-Chunk (~9.6ms) Leaky Debounce:** The Leader filters DC offset inline during the 64-sample (`~3.2ms`) ADC window and triggers after 3 chunks (`~9.6ms`), tolerating up to 1 brief acoustic dip while rejecting `<6ms` pops/clicks.
3. **Pure Broadcast Alert Bursts:** Alerts are transmitted as a 4-packet broadcast burst (`FF:FF:FF:FF:FF:FF` spaced 12ms apart) so offline Followers never stall the ESP32-C3 Wi-Fi TX queue with 802.11 unicast MAC ACK retries.
4. **0ms Haptic + Immediate Frame 0 LED Render:** Followers assert `MOTOR_PIN` immediately inside `onDataRecv()` and render Frame 0 on the very next `loop()` tick with phase-aligned patterns that start at 100% peak brightness.
5. **Mid-Trigger Network Gate & Batched HTTP:** If chunk 1 of a chime crosses the threshold, HTTP processing is deferred for 6.4ms until the 3-chunk verification finishes and Packet 1 is on the air.
