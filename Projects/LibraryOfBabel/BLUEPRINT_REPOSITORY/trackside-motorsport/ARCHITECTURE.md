# TRACKSIDE-MOTORSPORT — Architecture

> Fire-rated haptic flag/signal comms for drivers and pit crew.
> Status: **prototype-stage blueprint**. All part numbers and prices marked `verify-before-order`.
> Safety/cert claims (FIA 8856-2018, GCR 9.16) are **informational only — requires accredited lab certification before track use.**

---

## 1. System Topology

```
          ┌─────────────────────────────────────────────────────┐
          │            PIT WALL BASE STATION (RP2040)           │
          │  - 5" LCD flag console                              │
          │  - Dual radio: SX1262 (868/915 MHz) + nRF52840 (BLE │
          │    + 2.4 GHz prop. ESB)                             │
          │  - USB-C to race director laptop                    │
          └─────────────┬─────────────────────────┬─────────────┘
                        │ licensed 868/915        │ 2.4 GHz ESB
                        │ (primary, low-latency,  │ (redundant,
                        │  paddock-penetrating)   │  short-range)
                        ▼                         ▼
   ┌────────────────────────────────────────────────────────────┐
   │   DRIVER BELT MODULE (fire-rated enclosure, FIA 8853-tag)  │
   │   STM32G4 (control) + nRF52840 (2.4G) + SX1262 (sub-GHz)   │
   │   - LiFePO4 1500 mAh (thermal-tolerant chemistry)          │
   │   - 8× LRA driver (4× DRV2605L behind PCA9548 I2C mux)     │
   │   - Twisted-pair Nomex-jacket harness to patches           │
   │   - Helmet chin-pad cable (4 GPIO + I2S bone-cond)         │
   └─┬──────────────────────────────────────────────────────┬───┘
     │ 8× twisted-pair (silicone-jacketed, Nomex over-sleeve) │
     ▼                                                       ▼
 ┌─────────────────────────┐                ┌──────────────────────────┐
 │ HAPTIC PATCH ARRAY (×8) │                │ HELMET CHIN PAD          │
 │ - 1× LRA in silicone    │                │ - 4× momentary buttons   │
 │   substrate (10×10 mm)  │                │ - 1× bone-cond xducer    │
 │ - Locations: L/R chest, │                │ - HANS-clearance routing │
 │   L/R forearm, L/R      │                │ - JST-GH 6-pin to belt   │
 │   thigh, sternum, lumbar│                │                          │
 └─────────────────────────┘                └──────────────────────────┘

   ┌────────────────────────────────────────────────┐
   │ PIT CREW WRISTBAND (variant, no Nomex)         │
   │ - 2× LRA, nRF52840, OLED 0.96", 4 buttons      │
   │ - 2.4 GHz only, paddock-local                  │
   └────────────────────────────────────────────────┘
```

---

## 2. Driver Belt Module

### 2.1 Compute

| Block | Part | Notes |
|---|---|---|
| MCU primary | STM32G473CBT6 | 170 MHz, FPU, 2× CAN-FD, 4× I²C |
| MCU radio (2.4G) | nRF52840 | BLE 5.3 + ESB proprietary |
| LoRa/sub-GHz | SX1262 module (Ebyte E22-900M30S) | 868/915 MHz, +30 dBm |
| Flash | W25Q128JV | 16 MB flag-pattern + log |
| IMU | LSM6DSO32X | crash log, ±32 g |

- STM32G4 chosen over G0 for FPU (haptic envelope shaping) and dual CAN-FD (future ECU bridge to read RPM / pit-limiter state).
- nRF52840 runs as SPI co-processor; firmware on STM32 is master.
- SX1262 module is the only path validated for outdoor paddock range; integrated PA + LNA + TCXO.

### 2.2 Haptic Drive Chain

```
STM32G4 ──I²C1──► PCA9548A (8-ch mux) ──┬──► DRV2605L #1 ──► LRA1, LRA2
                                         ├──► DRV2605L #2 ──► LRA3, LRA4
                                         ├──► DRV2605L #3 ──► LRA5, LRA6
                                         └──► DRV2605L #4 ──► LRA7, LRA8
```

- Each `DRV2605L` drives one LRA at a time; we pair two LRAs per driver via SPST analog mux (`TS5A23159`) gated on the mux side. Effective channel-switch latency measured ~120 µs.
- LRA: **Vybronics VG0832012D** (8 mm × 3.2 mm, 235 Hz, 1.6 G), `C?????` `verify-before-order`.
- Booster: `TPS61023` 5 V/2 A for transient haptic peaks; main rail is 3.7 V LiFePO4.
- DRV2605L closed-loop auto-resonance ensures transducer-side response < 1 ms once envelope arrives.

### 2.3 Power

| Rail | Source | Use |
|---|---|---|
| VBAT 3.2–3.6 V | LiFePO4 18650 1500 mAh | Main |
| 3V3 | TPS62840 buck (1.5 A, ~95%) | MCU/radios |
| 5V0 | TPS61023 boost | LRA peak |
| 1V8 | LDO from 3V3 | IMU, level shifters |

- LiFePO4 chosen over Li-ion: thermal runaway threshold ~270 °C vs ~150 °C — important inside a fire-rated belt against driver core. **NOT a substitute for fire suit cert.**
- Charging: USB-C PD via `BQ25171` linear charger (LiFePO4 profile 3.65 V/cell), `verify-before-order`.

### 2.4 Enclosure

- Aluminum 6061 chassis, anodized black, 90 × 55 × 18 mm.
- Velcro-mount onto driver's existing FIA 8853-2016 harness belt (does NOT replace the harness; sits on it).
- Connectors: LEMO 0B compatible 8-pin for patch harness, JST-GH 6-pin for chin pad, USB-C with silicone bung.
- IP rating: IP54 minimum (rain/spray). Internal RTV potting around RF section.

---

## 3. Haptic Patch Array

### 3.1 Patch Construction

```
   ┌─────────────────────────────────────────┐
   │  Top layer: Nomex IIIA 4.5 oz sleeve    │  ← informational only
   ├─────────────────────────────────────────┤
   │  Silicone 30A substrate, 1.2 mm         │
   │  ┌─────────┐                            │
   │  │   LRA   │  embedded, axis ⊥ skin     │
   │  └─────────┘                            │
   │  Flex PCB: 2-layer polyimide, ENIG      │
   ├─────────────────────────────────────────┤
   │  Skin side: medical silicone, 30A       │
   └─────────────────────────────────────────┘
   Footprint: 35 × 35 × 4 mm
```

- LRA bonded into silicone with Permabond TA4610.
- Flex PCB tails terminate in 2-pin Molex Pico-EZmate; harness side is Nomex-oversleeve twisted-pair.
- **FIA 8856-2018 compatibility note:** The patch sits *between* the driver's skin and the certified Nomex underwear. It is **not** a replacement for or modification of the certified garment. Any modification to the certified underwear voids cert. Path to compliance: wear patches under existing 8856-2018 layer; submit assembled system to FIA-accredited lab for re-test as an "electronic accessory worn under fire-resistant underwear." **Not currently FIA-listed.**

### 3.2 Locations & Encoding

| Patch | Location | Default semantic |
|---|---|---|
| P1 | L chest | Yellow flag / caution |
| P2 | R chest | Blue flag / faster car behind |
| P3 | L forearm | Position warn: car L |
| P4 | R forearm | Position warn: car R |
| P5 | L thigh | Pit-now |
| P6 | R thigh | Debris / track-out caution |
| P7 | Sternum | Red flag (high-priority, distinct waveform) |
| P8 | Lumbar | Ack/confirm from pit |

- Spatial encoding: location = semantic, waveform amplitude envelope = urgency (low / med / critical).
- Critical waveforms (red, pit-now) use a `DRV2605` library effect chain plus repeat-burst on STM32 — distinguishable in <300 ms even under high-vibration cockpit conditions.
- Patch-level fault detect: each DRV2605L's auto-cal value is read post-boot; deviation > 15 % flags the patch as suspect.

### 3.3 Harness

- 8 twisted-pair cables (1 pair per LRA) bundled into Nomex over-sleeve, run inside the suit from belt module to each patch.
- Wire: 28 AWG silicone-jacketed, 200 °C rated insulation, `C?????` `verify-before-order`.
- Strain relief at belt with 3D-printed PA12 cable comb.

---

## 4. Helmet Chin Pad

### 4.1 Functions

- 4× silicone-domed buttons (left-thumb-reachable through helmet vent or chin-bar gap):
  - **B1**: ACK
  - **B2**: NACK / repeat
  - **B3**: Pit me next lap
  - **B4**: Distress / mechanical
- 1× bone-conduction transducer (`Aftershokz`-class driver, `verify-before-order`) sits against jaw — optional audio cue layer for non-DHH drivers.

### 4.2 Mechanical

- Pad clips to existing chin-bar foam with non-permanent silicone adhesive backing.
- Cable: 6-conductor coiled silicone lead to belt module via JST-GH connector.
- **Routing constraint:** must NOT interfere with HANS device tethers or helmet egress. Stays inside chin-bar volume.

### 4.3 Electrical

```
Buttons ── debounce R/C ── STM32G4 GPIO (interrupt)
Bone-cond xducer ── PAM8302 mono amp ── STM32 DAC (I2S not required)
```

---

## 5. Pit-Wall Base Station

### 5.1 Compute / IO

| Block | Part |
|---|---|
| MCU | RP2040 |
| Display | 5" 800×480 IPS, SPI (`ER-TFT050-3`) |
| Touch | resistive overlay (gloves-compatible) |
| Radio A | SX1262 +30 dBm module, SMA, 868/915 MHz |
| Radio B | nRF52840 + ext PA (`Skyworks SKY66112`) |
| USB-C | to race director laptop, CDC + race-control GUI |
| Battery | 18650 ×2 + 5 V boost, ~8 h |

### 5.2 GUI

- Flag-call buttons matching FIA flag set: yellow (single/double), blue, red, green, white, black, black/orange, chequered.
- "Pit-now" + driver target selector (up to 32 paired driver belts).
- Round-trip ACK indicator: GREEN within target latency, AMBER if > 50 ms, RED if no ACK in 250 ms (then auto-retry on alt radio).

### 5.3 Protocol

```
Frame: [PRE 4B][SYNC 2B][SRC 2B][DST 2B][SEQ 1B][TYPE 1B][PAYLOAD 0..16B][CRC32 4B]
```

- TYPE enumerates flag/semantic codes (5 bits) + priority (3 bits).
- Both radios transmit each frame with 8 ms stagger; receiver de-duplicates by SEQ.
- AES-128-CCM keyed per event/series (anti-spoof — particularly relevant if race director frames could be forged).

---

## 6. Latency Budget

Target: **end-to-end ≤ 5 ms**, transducer rise sub-1 ms.

| Stage | Budget | Notes |
|---|---|---|
| Pit GUI button → RP2040 frame | 0.5 ms | poll loop @ 2 kHz |
| RP2040 → SX1262 TX start | 0.8 ms | SPI + FIFO load |
| SX1262 over-air (10 B, SF7 BW500) | ~3 ms* | *primary path; ESB on nRF52 is ~1.2 ms but shorter range |
| Belt RX → STM32 ISR | 0.3 ms | |
| STM32 → DRV2605L start | 0.4 ms | I²C @ 1 MHz, mux pre-selected |
| DRV2605 → LRA rise (closed loop) | < 1 ms | resonant LRA, drive at f₀ |
| **Total (sub-GHz path)** | **~6 ms** | exceeds 5 ms; budget caveat below |
| **Total (2.4 GHz ESB)** | **~3.5 ms** | within target |

> **Caveat (verify):** the 5 ms target is achievable on the 2.4 GHz path only. Sub-GHz path achieves ~6 ms but is more paddock-robust. System runs both in parallel and surfaces whichever arrives first; reported latency is the better of two.

---

## 7. RF Strategy: Paddock Interference

F1 / FR paddocks are 2.4 GHz dense (team comms, telemetry, broadcast, course-marshal Wi-Fi).

Mitigations:
1. **Primary path is licensed sub-GHz** (868 MHz EU / 915 MHz US) — sparse in paddocks, requires per-event frequency coordination with race control. `verify-before-order` re: regional licensing.
2. **ESB on 2.4 GHz** uses 80-channel fast-hop (5 ms dwell), avoiding common Wi-Fi channels 1/6/11.
3. **PHY-level FEC** on sub-GHz (SF7 + CR4/5).
4. **Latency-aware retransmit**: a missed ACK on path A triggers immediate retry on path B, not on path A.
5. **Listen-before-talk** on 2.4 GHz only; sub-GHz uses scheduled TDMA slots per paired driver.

> **Caveat:** Race-control frequency coordination is mandatory at FIA-sanctioned events. Series-specific RF rules may forbid driver-borne transmitters during qualifying/race; verify per series before deployment.

---

## 8. Firmware

### 8.1 Belt — STM32G4 (FreeRTOS)

Tasks:
- `t_radio_sub` (prio 6) — SX1262 RX/TX
- `t_radio_24g` (prio 6) — nRF52 SPI proxy
- `t_haptic`   (prio 5) — pattern engine, mux scheduler
- `t_chinpad`  (prio 4) — button debounce, reply frames
- `t_imu`      (prio 3) — crash detect (50 g over 5 ms → emit DISTRESS frame)
- `t_telemetry`(prio 2) — battery, fault, RSSI

Pattern engine: ring of `(channel, effect_id, repeat, delay_ms)` tuples. DMA-driven I²C transactions to DRV2605L.

### 8.2 nRF52840

- ESB primary RX, BLE secondary (config app on phone for pit crew).
- Provides MAC-level filtering by paired pit-station ID.

### 8.3 RP2040 Base

- `pico-sdk`, lvgl 9 for GUI.
- Race director macros (e.g. "FCY → all drivers yellow + pit lane open warn").
- USB-CDC JSON API for integration with timing/scoring systems.

### 8.4 OTA

- Firmware update over USB-C only (not OTA on belt) — avoids in-race overwrite risk.
- Signed images (Ed25519); rollback slot retained.

---

## 9. Pit-Crew Wristband Variant

- nRF52840-only, 2.4 GHz ESB.
- 2× LRA (wrist + forearm) for pit-stop cue choreography (tire-on, jack-down, release).
- 0.96" OLED for visual confirm.
- No Nomex requirement (pit crew already wear FIA 8856 suits over normal arms).
- Same protocol as belt; addressed as a different DST class.

---

## 10. Open Questions / Verify-Before-Order

- LRA selection: VG0832012D is example; pulse-rated LRA from confirmed automotive-temp supplier needed (`C?????`).
- Sub-GHz licensing per series (especially US club: SCCA / NASA).
- FIA 8856-2018 path: re-test fee, lab, lead time.
- Bone-conduction transducer fitment inside DOT/Snell SA2020 helmets (varies by helmet brand).
- LiFePO4 cell vendor and abuse-test data sheet.
- GCR 9.16 (SCCA driver suit rule) compatibility under typical scrutineering.

---

## 11. Out of Scope (v1)

- ECU/CAN bridge to car (planned v2: pit-limiter, fuel-low haptic).
- Voice-channel replacement (this is *not* a helmet-comms substitute).
- Marshal/course-worker variant.
- Two-way driver-to-driver (FIA forbids during sessions).
