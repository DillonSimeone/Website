# cyclecall-peloton — ARCHITECTURE

> Pro / club cycling team DHH rider tactical comms. Capacitive bar-tape tap pad + saddle-rail haptic puck + bone-conduction collar + DS-car tablet dongle. 2.4 GHz team mesh. UCI-rulebook aware.

All part numbers, LCSC IDs, and prices: **verify-before-order**.

---

## 0. Why this exists

UCI 1.3 technical regulations and event-specific rulebooks variably restrict **voice race radios** (notably U23, women's WT until recent reforms, some national federations). Hearing-aid use under helmet straps is regulated and frequently impractical at race pace (wind noise, sweat, helmet vent turbulence at 50+ km/h destroys SNR).

**Result:** Deaf / Hard-of-Hearing (DHH) riders are functionally excluded from elite peloton tactics. Hearing riders also lose tactical info when radios are banned.

Haptic / capacitive comms is **not currently classified as voice radio** under UCI 1.3.024 (radio communication). This is a regulatory gap. We design to it explicitly and ship a rulebook-compliance dossier with every team kit.

---

## 1. System topology

```
  ┌─────────────────────────── RIDER (per rider) ───────────────────────────┐
  │                                                                          │
  │  BAR PAD (L)         BAR PAD (R)                                         │
  │  5-ch cap touch      5-ch cap touch                                      │
  │  under bar tape      under bar tape                                      │
  │     │ I2C+pwr           │ I2C+pwr                                        │
  │     └────────┬──────────┘                                                │
  │              │  internal stem cable (1.5 mm OD, kevlar jacket)           │
  │     ┌────────▼─────────┐                                                 │
  │     │   TOP-TUBE HUB   │  nRF52840 + LRA + GNSS + ANT+ + IMU + 850 mAh   │
  │     │   "race brain"   │  IPX7. Bottle-cage adjacent, magnetic mount.    │
  │     └──┬──────────┬────┘                                                 │
  │        │ BLE mesh │ BLE LE-Audio                                         │
  │        │          │                                                      │
  │   ┌────▼────┐  ┌──▼────────────┐                                         │
  │   │ SADDLE  │  │ COLLAR EARP.  │  bone-conduction, jersey collar clip    │
  │   │ PUCK    │  │ (opt., hearing│  Riders mix: full-DHH = no collar.      │
  │   │ rail-clip│  │  teammates)   │                                        │
  │   └─────────┘  └───────────────┘                                         │
  └──────────────────────────────────────────────────────────────────────────┘
                            │  2.4 GHz BT Mesh 1.1 (LE 1M PHY)
                            │  fallback: Nordic Enhanced ShockBurst (ESB)
                            ▼
  ┌─────────────────── DS (DIRECTEUR SPORTIF) CAR ──────────────────────────┐
  │                                                                          │
  │   ANDROID TABLET (off-the-shelf, ruggedized)                             │
  │   ─ CycleCall DS app: voice → encoded haptic packet                      │
  │   ─ Live rider map (GNSS up-link)                                        │
  │   ─ Power/HR via ANT+ pickup                                             │
  │                          │ USB-C                                         │
  │                ┌─────────▼──────────┐                                    │
  │                │   DS DONGLE        │  nRF52840 + ext. 2.4 GHz PA/LNA    │
  │                │   external antenna │  +20 dBm legal in most regions     │
  │                │   roof-mag mount   │  verify per ETSI/FCC region        │
  │                └────────────────────┘                                    │
  └──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Node 1 — Bar Pad (L + R, identical)

### 2.1 Form factor

Flex PCB strip, **8 mm × 95 mm × 0.4 mm**. Wraps under bar tape on the **drop ramps** (where hands rest on hoods, not where they grip during sprint). Pads are **conductive copper teardrops** with EMI ground guard ring. Bar-tape (Supacaz, Lizard Skins, Fizik Vento) is ~2.5–3.5 mm thick — capacitive coupling tested through tape + nitrile glove + sweat.

**Must-not:**
- Interfere with Shimano Di2 / SRAM AXS / Campy EPS shifter wiring routed through bars.
- Interfere with hydraulic brake hose routing.
- Add detectable mass at the lever (UCI 1.3.019 — bike weight 6.8 kg minimum, no upper limit for the *pad*, but team mechanics will revolt over 50 g).

Target mass per pad (L or R): **≤ 9 g** including flex PCB, IC, glue, encapsulant.

### 2.2 Electronics

| Block | Part (verify-before-order) | LCSC | Notes |
|---|---|---|---|
| Cap touch | AT42QT1070-SSU (5-key + slider mode) | C?????  | I2C, ~1.6 mA active, 9 µA sleep |
| Local MCU | none — pad is a slave to hub | — | reduces flex-PCB ICs to 1 |
| ESD | TPD4E004 | C?????  | I2C lines + power |
| Flex | 8 mm × 95 mm × 0.4 mm, polyimide, 2L | custom | LCSC/JLCPCB flex order |
| Connector | Molex Pico-EZmate 2-pin (pwr) + 2-pin (I2C) on stem-end | C?????  | quick-detach for mechanic swap |
| Encapsulant | conformal urethane + Scotch 33+ overwrap under tape | — | sweat / salt-water survival |

5 logical buttons mapped (under-tape teardrops, ~12 mm pitch):

```
  [1: SCROLL UP / ATTACK ACK]
  [2: SCROLL DN / DROP-BACK ACK]
  [3: SELECT / "NEED FEED"]
  [4: PANIC / "PUNCTURE"]
  [5: TALK-TO-CAR / hold 1.5 s]
```

Tap, double-tap, long-press, swipe (slider mode on QT1070) → ~12 distinct gestures per side, 24 total. Plenty for a tactical vocab.

### 2.3 Validation

- **Wet test:** spray bottle + saline (3% NaCl) every 30 s for 60 min, no false trigger > 1/min.
- **Glove test:** thin road glove, full-finger winter glove, full-finger lobster glove. Last one is marginal — document in user guide.
- **Vibration:** Belgian cobble simulator (5–500 Hz random, 4 G RMS, 4 h). No connector unseating.
- **Heat:** 70 °C tarmac surface for 4 h. Encapsulant Tg ≥ 90 °C.

---

## 3. Node 2 — Top-Tube Hub ("race brain")

### 3.1 Form factor

**60 × 28 × 12 mm**, 32 g target (incl. battery). Magnetic + mechanical safety-tether mount to top tube via a glued-on aluminum puck (one-time install per bike). Looks like a small Wahoo/Garmin computer mount but mounted *behind* the stem, not on it (UCI 1.3.024 again — no aero shielding).

### 3.2 Electronics

| Block | Part (verify-before-order) | LCSC | Notes |
|---|---|---|---|
| SoC | nRF52840 (QIAA) | C?????  | BT Mesh 1.1, BLE LE Audio, ANT+ via softdevice |
| Flash | MX25R6435F 8 MB | C?????  | logs, OTA stage |
| LRA | Vybronics VLV101040A | C?????  | linear resonant, 235 Hz, 1.4 G — clear on top tube even in sprint |
| LRA driver | DRV2605L | C?????  | ERM/LRA, library of 123 waveforms |
| GNSS | u-blox MAX-M10S | C?????  | low power, multi-constellation; 1 Hz fix uplinked to DS |
| IMU | LSM6DSO32 (±32 g) | C?????  | crash detect (> 25 G or > 90° tilt for > 4 s) |
| ANT+ pickup | shared nRF52840 radio (multiprotocol) | — | reads team's existing power meter, HRM |
| PMIC | BQ25180 | C?????  | 1S Li-Po charger, USB-C input |
| Battery | 850 mAh LiPo, 3.7 V, soft-pack 50×30×4 mm | C?????  | 12–14 h race-day runtime target |
| USB-C | GCT USB4105 + TVS | C?????  | IPX7 needs cap or gland |
| Antenna | 2.4 GHz chip ant., Johanson 2450AT43A100 | C?????  | tuned ground plane on 4L PCB |
| Status LED | 1× side-fire RGB | C?????  | minimal — DHH riders don't want visual chaos in peripheral vision |

### 3.3 GNSS / telemetry uplink

Mesh-relay to DS car at **1 Hz position + 4 Hz haptic ack/event**. In peloton, the rider stack itself becomes a mesh — packets hop rider-to-rider until one is in DS-dongle range (typically 50–500 m). BT Mesh 1.1 directed forwarding handles this.

### 3.4 Crash detect

```
if accel_mag > 25 G OR
   (tilt > 90° for > 4 s AND speed < 5 km/h):
       broadcast CRASH packet, rider_id, last_gps
       fire 2 s "are you ok?" haptic confirm
       if no double-tap on bar pad within 15 s:
           escalate to DS: "rider X — no response"
```

Same logic class as Garmin Edge crash detect, tuned tighter (peloton crashes are slower-tilt because riders pile up at low relative speeds).

---

## 4. Node 3 — Saddle-Rail Haptic Puck

### 4.1 Form factor

Clips between saddle rails (Ti, carbon, hollow Cromoly all supported), under the rear of the saddle shell. **45 × 22 × 9 mm**, 14 g target. Driver presses against the *underside* of the saddle shell — couples haptic into the rider's sit bones via the saddle itself, no skin contact, works through bib shorts and chamois.

### 4.2 Electronics

| Block | Part (verify-before-order) | LCSC |
|---|---|---|
| SoC | ESP32-C3-MINI-1 | C?????  |
| Haptic driver | DRV2605L | C?????  |
| LRA | TDK PowerHap 1313H013 | C?????  |
| Battery | 350 mAh LiPo | C?????  |
| PMIC | BQ25180 | C?????  |
| USB-C | GCT USB4105 | C?????  |
| Encl. | ASA 3D-print, TPU shock collar | — |

### 4.3 Pairing & isolation

Bonds to hub over BLE (not mesh — point-to-point). If hub fails, saddle puck **does not** try to mesh-relay to other riders' hubs (avoid leaking comms onto wrong rider).

---

## 5. Node 4 — Bone-Conduction Collar Earpiece (optional)

For **hearing teammates** on a mixed-hearing team — gives them the same encoded info as DHH riders, in a form opponents can't overhear (no over-ear earpieces, no exposed transducer).

### 5.1 Form factor

**Two transducers**, one each side of jersey collar, magnetic-clipped onto the standard cycling jersey collar fabric. Cable runs inside the jersey to a small pod between the shoulder blades (battery + BLE module).

### 5.2 Electronics

| Block | Part (verify-before-order) | LCSC |
|---|---|---|
| Bone-cond transducer | TDK / Sonion BCA-30 class (verify) | C?????  |
| Amp | TAS2563 | C?????  |
| SoC | nRF52840 (LE Audio) | C?????  |
| Codec | LC3 over LE Audio | — |
| Battery | 300 mAh LiPo | C?????  |
| PMIC | BQ25180 | C?????  |

### 5.3 What it plays

- Pre-recorded coach voice clips ("attack now," "wait," team-custom).
- Race radio relay (where legal).
- Anti-eavesdrop: AES-CCM over LE Audio isochronous channel, key rotated per stage.

---

## 6. Node 5 — DS Car Dongle

### 6.1 Form factor

**95 × 55 × 18 mm**, magnetic roof mount with through-window USB-C cable to in-car tablet. External SMA whip antenna (3 dBi) for 2.4 GHz, switchable to mag-mount roof antenna.

### 6.2 Electronics

| Block | Part (verify-before-order) | LCSC |
|---|---|---|
| SoC | nRF52840 | C?????  |
| 2.4 GHz PA/LNA | Skyworks SE2438T | C?????  |
| Antenna | SMA-to-roof mag mount, 3 dBi | — |
| MCU helper | RP2040 (USB-C HID + audio class to tablet) | C?????  |
| USB-C | GCT USB4105 | C?????  |
| Encl. | machined Al + ASA top | — |
| Region notes | EIRP +20 dBm OK in most ETSI/FCC zones — **verify per stage country** | — |

### 6.3 DS-side software

Android tablet app:
- Voice-to-haptic encoder (offline ASR — Vosk, or Picovoice — privacy + works in mountain dead zones).
- Pre-built tactical phrase library, single-button send.
- Rider map (GNSS uplink) + power/HR overlays.
- "Comms-legal" toggle for stages where voice radio is banned — only haptic codes leave the dongle.

---

## 7. Team mesh — protocol stack

```
APP            CycleCall tactical packets (8-byte payload)
ENCRYPTION     AES-CCM, per-stage key (rotated at sign-on)
TRANSPORT      Bluetooth Mesh 1.1, directed forwarding
PHY            BLE LE 1M (default), 2M (option), Coded S=8 (race-start fallback)
RADIO          nRF52840 internal radio
                + DS dongle: SE2438T FEM, +20 dBm
FALLBACK       Nordic ESB (Enhanced ShockBurst) on ch 80, 81, 82 if mesh fails
```

### 7.1 Why Mesh 1.1 (not LoRa, not LTE)

- Peloton is **dense** (180 riders within 30 m) — mesh hops over teammates naturally.
- 2.4 GHz BT is **license-free worldwide**, no carrier dependency.
- LoRa is too slow (sub-kbps) for 4 Hz event traffic across 8 riders × 22 teams.
- LTE has dead zones on mountain stages (Stelvio, Tourmalet — verified problem zones).

### 7.2 Packet rate budget

| Stream | Rate | Bytes | Notes |
|---|---|---|---|
| Haptic event DS→rider | on event | 8 | "attack," "feed," "puncture" |
| Ack rider→DS | on tap | 4 | bar pad ID + gesture code |
| GNSS uplink rider→DS | 1 Hz | 12 | lat/lon/speed |
| Power/HR rider→DS | 1 Hz | 6 | optional, ANT+ → mesh |
| Crash event rider→all | on event | 16 | rider_id, gps, severity |

Total per-rider uplink: ~18 B/s. Mesh capacity headroom: ~100×.

---

## 8. Survival

| Hazard | Spec | Test |
|---|---|---|
| Crash impact | 40 G shock survival, hub + saddle puck | drop fixture, 6 axes, 5 hits each |
| Rain / wet | IPX7 on hub & dongle, IPX5 on bar pad (under tape it's effectively IPX8) | spray + 30 min 1 m submersion |
| Sweat / salt | 3% NaCl mist, 96 h, no corrosion on pad pins | salt-fog chamber |
| Heat | 70 °C tarmac storage, 4 h | oven soak, then function test |
| Cold | -10 °C alpine descent, full function | freezer + function test |
| Vibration | Belgian cobble profile, 4 h | shaker table |
| UV | 500 h xenon arc, no embrittlement | weatherometer |

---

## 9. UCI 1.3 rulebook considerations

- **1.3.019** — bike weight 6.8 kg min. Hub + mount + bar pads + saddle puck total ~70 g — well within typical pro-bike weight margin (riders often add lead to reach minimum).
- **1.3.020** — bike geometry. Nothing in CycleCall alters wheelbase, seat tube angle, or bar position.
- **1.3.024** — **race radios.** Voice radio is the regulated thing. Haptic tactile is **not currently named.** We file a compliance dossier with each national federation before team deployment. We do **not** ship voice playback to the bar pad — only the collar earpiece, and the collar is **off** for stages where federations have banned earpieces.
- **1.3.031 (helmets)** — no mods to helmet. Bone-conduction sits on jersey collar, not helmet.
- **Anti-doping mechanical** — UCI X-ray scans bikes for hidden motors. Hub is **visibly externally mounted,** signed-off by commissaire at sign-on. No frame-internal electronics.

**Compliance dossier ships with every team kit.** Legal review by sports-law firm per major federation (UCI, USA Cycling, British Cycling, FFC, FCI, RFEC, KNWU).

---

## 10. Firmware

### 10.1 Targets

| Node | MCU | Toolchain | RTOS |
|---|---|---|---|
| Hub | nRF52840 | Zephyr 3.x + nRF Connect SDK | Zephyr |
| Saddle | ESP32-C3 | ESP-IDF | FreeRTOS |
| Collar | nRF52840 | Zephyr + LE Audio sample | Zephyr |
| DS dongle | nRF52840 + RP2040 | Zephyr + pico-sdk | Zephyr / bare |
| Bar pad | (no MCU) | — | — |

### 10.2 Boot

1. PMIC up, 3.3 V rail stable.
2. Watchdog armed, 4 s timeout.
3. Radio init, scan for team-key beacon from hub (saddle / collar) or DS (hub).
4. AES-CCM key derived from per-stage seed.
5. IMU calibration check (hub).
6. Bar-pad I2C scan, QT1070 self-cal.
7. Status LED → solid green, 200 ms, then off (riders don't want LEDs).

### 10.3 OTA

- USB-C tethered, MCUBoot signed dual-bank, 8 MB flash → A/B slots.
- Pre-race only — never OTA during a stage. DS app enforces.

### 10.4 Logging

- Hub stores last 24 h of events at 4 Hz → ~3 MB.
- Post-race export to DS tablet for tactical review.

---

## 11. Open questions

1. **Anti-doping concern:** does a 2.4 GHz mesh radio in a bike trigger the UCI motor-doping X-ray protocol? Probably not (no motor), but verify with a commissaire walk-through before first race.
2. **Stage country roaming:** EIRP limits vary. Need a region-locked firmware build per Grand Tour route.
3. **Helmet bone-conduction integration:** future rev — collar form factor is rev-1. Helmet integration needs CE EN 1078 re-cert.
4. **Women's WT vs men's WT:** rule differences on radios. Ship per-federation default config.

---

## 12. Roadmap

- **Rev A (this doc):** bar pad + hub + saddle + DS dongle. Collar optional. Club / training use.
- **Rev B:** UCI compliance dossier + first national-team pilot (ParaCycling DHH-category likely first adopter).
- **Rev C:** WorldTour pilot stage, 1 team, 8 riders, 1 Grand Tour.
- **Rev D:** consumer gran-fondo SKU — same hardware, simplified DS app → "ride leader" app on phone.
