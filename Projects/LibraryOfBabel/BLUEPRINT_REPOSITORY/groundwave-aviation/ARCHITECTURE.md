# GroundWave Aviation — Architecture

> Hi-vis ANSI/ISEA 107 Type R Class 3 vest with a 4-node 9-axis IMU constellation
> that recognizes ICAO Annex 2 / FAA AC 120-57 / JO 7110.65 marshalling signals
> performed by the wearer and broadcasts them as structured telemetry to the
> flight deck (EFB tablet) and to nearby ramp crew over a sub-GHz mesh.
>
> Reverse channel: tower / captain / lead-agent text-class alerts arrive as
> patterned haptic on the shoulder pads, giving DHH marshallers the same
> situational awareness that voice radios give a hearing agent.

**Class:** Wearable / Personal Protective Equipment overlay
**Wearer-outbound** signal recognition (vest reads its OWN user's gestures) —
this is the key differentiator from `handshake-kiosk` (inbound ASL recognition)
and from `vibeweld-helmet` (inbound siren detection).

---

## 1. Problem framing

US airport ramps run at 120–140 dB peak during jet-engine spool-up. Voice radio
inside a hearing-protection muff is degraded; lip-reading is impossible at
night or in low-vis. Current FAA AC 120-57B / IATA AHM 621 mandates that the
marshaller be visually clear to the flight deck, but DHH ramp agents are
operationally disqualified by most major-carrier ops manuals because they
"cannot monitor voice radio" — even though the marshalling task itself is
100% gestural.

GroundWave inverts the channel: the *marshaller's body* becomes the radio. The
flight deck's EFB app receives a structured event (`SIGNAL=STOP, CONF=0.94`)
synchronized to the visual signal the captain is already watching, and the
crew chief sees the same event on a wrist tablet. Inbound text alerts ("hold
position, follow-me truck inbound") arrive as haptic codes on the shoulders,
not as audio.

---

## 2. System block diagram

```
                  ┌──────────────────────────────────────────────┐
                  │   ANSI/ISEA 107 Type R Class 3 vest shell    │
                  │   (fluorescent yellow-green, retroreflective)│
                  └──────────────────────────────────────────────┘

   LEFT WRIST IMU       LEFT ELBOW IMU        RIGHT ELBOW IMU      RIGHT WRIST IMU
   ICM-42688-P #1       ICM-42688-P #2        ICM-42688-P #3       ICM-42688-P #4
   + MMC5983MA mag      (gyro+accel only)     (gyro+accel only)    + MMC5983MA mag
        │                     │                       │                     │
        └──────────I2C bus A (SCL/SDA, 1 MHz Fm+)─────┘                     │
                              │                                              │
                              │           ┌──────────────────────────────────┘
                              │           │
                              ▼           ▼
                   ┌─────────────────────────────────┐
                   │ CHEST HUB (sternum pocket)      │
                   │                                 │
                   │  ESP32-S3-WROOM-1-N16R8         │  (Xtensa LX7 dual, 240 MHz)
                   │    - TinyML classifier (12 sig) │
                   │    - sensor fusion (Madgwick)   │
                   │    - LoRa stack + AES-128       │
                   │                                 │
                   │  CHEST IMU #5 BMI270 (torso ref)│
                   │  BMP390 baro (altitude/heading) │
                   │  SX1262 LoRa 915 MHz, +22 dBm   │
                   │  nRF52833 BLE 5.4 secondary     │
                   │  USB-C PD sink (BQ25798)        │
                   │  5000 mAh 1S Li-poly, fused     │
                   │  4× DRV2605L haptic drivers     │
                   │     ↓ to L/R shoulder LRA       │
                   │     ↓ to L/R lumbar  LRA        │
                   │  IP66 over-mold, flame-retard.  │
                   └─────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
        ┌─────────────┐               ┌─────────────────┐
        │ EFB tablet  │ ◄── LoRa ──►  │ Crew-chief wrist│
        │ ForeFlight  │   915 MHz     │ tablet / phone  │
        │ plugin      │   AES-128     │ companion app   │
        └─────────────┘               └─────────────────┘
              ▲                               ▲
              │       BLE 5.4 fallback        │
              └───────────────────────────────┘
```

---

## 3. MCU selection

**Selected:** Espressif **ESP32-S3-WROOM-1-N16R8**

| Criterion              | ESP32-S3-N16R8           | nRF5340 (alt)          |
|------------------------|--------------------------|------------------------|
| Cores                  | 2× LX7 @ 240 MHz         | M33 app + M33 net      |
| RAM                    | 512 KB SRAM + 8 MB PSRAM | 512 KB + 64 KB net     |
| Flash                  | 16 MB                    | 1 MB + 256 KB net      |
| Vector ML extensions   | Yes (ESP-DL int8)        | Helium / CMSIS-NN      |
| LoRa attach            | Native SPI               | Native SPI             |
| BLE 5.4                | BLE 5.0 (S3 limit)       | 5.4 native             |
| Cost @ 1k              | ~$3.40                   | ~$8.20                 |
| Toolchain maturity     | ESP-IDF / Arduino        | nRF Connect SDK        |
| Unit-cost driver       | Wins on $/MAC for TinyML | Wins on BLE-only SKUs  |

The N16R8 gives 8 MB external PSRAM, which lets us hold the full 60-frame
sliding-window IMU buffer (5 IMUs × 9 axes × 60 frames × int16 = ~5.4 KB) plus
the int8-quantized TCN classifier (~280 KB weights) plus an OTA staging slot
without thrashing flash. The S3's vector pipeline halves inference latency on
the temporal-convolutional path versus a stock M4F.

---

## 4. IMU constellation

12 standard marshalling signals from FAA JO 7110.65 / ICAO Doc 9870 Appendix B
require differentiation across both arms, both elbows, and torso orientation.
A single chest IMU cannot resolve "wingwalker / wing-clear" (arms held at 45°
extended) from "all clear / OK" (one arm raised, thumbs up) without an arm
reference.

| #  | Location        | Part                 | Bus           | Role                                    |
|----|-----------------|----------------------|---------------|-----------------------------------------|
| 1  | Left wrist      | ICM-42688-P + MMC5983| I2C-A @ 0x68  | Distal endpoint, heading-stabilized     |
| 2  | Left elbow      | ICM-42688-P          | I2C-A @ 0x69  | Mid-arm angular velocity                |
| 3  | Right elbow     | ICM-42688-P          | I2C-B @ 0x68  | Mid-arm angular velocity                |
| 4  | Right wrist     | ICM-42688-P + MMC5983| I2C-B @ 0x69  | Distal endpoint, heading-stabilized     |
| 5  | Sternum (hub)   | BMI270               | SPI (chest MCU)| Torso reference frame                  |

Two I2C buses (one per arm) keep total bus capacitance under 400 pF on the
flat-flex routed through the vest seams, and let each arm run independent
EN-pin power-cycle for fault recovery if a sleeve cable is yanked.

### Sample rates
- IMU primary: 400 Hz raw → decimated to 100 Hz for the classifier
- Magnetometer: 100 Hz (heading drift correction)
- Baro: 25 Hz (not used in classifier; logged for incident replay)

### Calibration
- 30-second "T-pose" gyro-bias + magnetometer hard-iron capture on first boot
- Stored in NVS; re-prompted if torso IMU detects vest removal (>45° tilt for >5 min with no motion)

---

## 5. Gesture vocabulary — 12 ICAO signals + custom

Per ICAO Annex 2 / FAA AC 120-57B, the marshaller's vocabulary the classifier
must resolve:

| ID  | Signal                       | Both arms? | Key kinematic feature                       |
|-----|------------------------------|------------|---------------------------------------------|
| 01  | Wingwalker / Clear           | Both up    | Arms vertical, palms inward, static         |
| 02  | Identify gate / Proceed      | Right up   | Right arm raised, point with wand-hand      |
| 03  | Proceed to next signalman    | Both       | Arms extended, point to next marshaller     |
| 04  | Straight ahead               | Both       | Arms repeatedly bent up, palms toward face  |
| 05  | Turn left (pilot's PoV)      | Both       | Right arm down/static, left arm waves       |
| 06  | Turn right (pilot's PoV)     | Both       | Left arm down/static, right arm waves       |
| 07  | Slow down                    | Both       | Arms down, palms toward ground, push motion |
| 08  | Stop                         | Both       | Arms crossed above head                     |
| 09  | Emergency stop               | Both       | Arms crossed above head, RAPID              |
| 10  | Set brakes                   | Hands      | Open hand → closed fist, raised             |
| 11  | Release brakes               | Hands      | Closed fist → open hand, raised             |
| 12  | All clear / OK               | One        | Thumbs-up, single arm                       |
| C01 | Custom: pushback             | Configurable, learned in calibration mode   |
| C02 | Custom: tow approval         | Configurable                                |
| C03 | Custom: hold position        | Configurable                                |

Signals 08 and 09 share a static pose; the classifier discriminates on angular
velocity magnitude — emergency stop is a >4 rad/s entry. The flight-deck
plugin must surface this as a tier-1 alert regardless of confidence.

---

## 6. TinyML pipeline

```
   5 IMU × 9 axes  ─►  Pre-proc  ─►  60-frame ring buf  ─►  TCN  ─►  Softmax (15)
   @ 100 Hz            (q15 → q8     (600 ms window,         ↓        ↓
                        + per-ch     20-frame slide)      argmax    threshold
                        z-score)                            ↓        ↓
                                                        signal_id  confidence
                                                            └────┬────┘
                                                                 ▼
                                                    debounce FSM (§7)
                                                                 ▼
                                                       RF event (§8)
```

- **Pre-processing**: per-channel mean/var from calibration NVS; output int8
- **Model**: 4-block dilated temporal CNN (TCN), dilations 1/2/4/8, 32 filters,
  ~280 KB int8 weights, ~7.1 M MACs/inference
- **Latency target**: ≤ 45 ms inference on S3 @ 240 MHz w/ ESP-DL
- **Training set**: 50 hr in-house captures from 18 subjects (mix DHH + hearing,
  mix dominant/non-dominant arm) + 200 hr augmented (rotation jitter, sleeve
  slip 0–15°, drop frames 0–5%)
- **Acceptance**: > 95% top-1 on held-out subjects for signals 01–08, 10–12;
  ≥ 99% for 08/09 (stop / e-stop) which are safety-critical
- **False-positive cap**: < 0.5 events/hr during ambient walking, refueling
  motion, hand-cart pushing

Custom signals (C01–C03) are added via few-shot adapter (10 demos), stored as
LoRA-style delta weights in NVS, not retrained on-device.

---

## 7. Firmware state machine

```
                   ┌───────────────┐
                   │  POWER_OFF    │
                   └───────┬───────┘
                           │ long-press chest btn 2s
                           ▼
                   ┌───────────────┐
                   │  BOOT / SELF  │  IMU WHOAMI, LoRa join, batt check
                   │  TEST         │  haptic 1-pulse OK / 3-pulse fail
                   └───────┬───────┘
                           │ all OK
                           ▼
                   ┌───────────────┐
                   │  CALIBRATE    │  T-pose 30 s (only if NVS empty)
                   └───────┬───────┘
                           │
                           ▼
                   ┌───────────────┐◄────────────────┐
                   │  IDLE         │                 │
                   │  100 Hz scan  │                 │
                   └───────┬───────┘                 │
                           │ motion energy > thr     │
                           ▼                         │
                   ┌───────────────┐                 │
                   │  ACQUIRING    │ buffer 600 ms   │
                   └───────┬───────┘                 │
                           │ buffer full             │
                           ▼                         │
                   ┌───────────────┐                 │
                   │  CLASSIFYING  │ TCN inference   │
                   └───────┬───────┘                 │
                           │ conf > 0.80             │
                           ▼                         │
                   ┌───────────────┐                 │
                   │  DEBOUNCE     │ 2 consecutive   │
                   │               │ same-class wins │
                   └───────┬───────┘                 │
                           │ confirmed               │
                           ▼                         │
                   ┌───────────────┐                 │
                   │  EMIT         │ LoRa TX + BLE   │
                   │               │ + haptic ACK    │
                   └───────┬───────┘                 │
                           └─────────────────────────┘

   INBOUND ALERT (any state ≥ IDLE):
       LoRa RX → CRC + AES → haptic pattern (§9) → log
```

E-stop (signal 09) bypasses the 2-frame debounce and emits on first frame
above 0.85 confidence.

---

## 8. RF link — LoRa vs DECT-2020

| Criterion         | LoRa SX1262 915 MHz ISM   | DECT-2020 NR (NR+)        |
|-------------------|---------------------------|---------------------------|
| Module cost @ 1k  | ~$3.20                    | ~$11.50 (limited supply)  |
| FCC path          | Part 15.247 (well-trod)   | Part 15 D / certified     |
| Range, line-sight | 1–3 km                    | ~500 m                    |
| Latency           | 80–250 ms (SF7, 125 kHz)  | < 30 ms                   |
| Multi-node mesh   | Custom (LoRaMesher / our) | Native NR+                |
| Airport spectrum  | ISM, no coord             | 1.9 GHz, coordinated      |
| EMI risk to AVx   | Low (per RTCA DO-292)     | Lower, but unproven       |
| Pick for v1       | **YES**                   | Roadmap v2                |

**v1 ships LoRa.** Reasoning: a ramp gesture event is 12 bytes payload
(`signal_id, confidence, seq, hmac-trunc`), so SF7 BW125 with payload <16 B
gives ~50 ms airtime — well inside the 250 ms ramp-marshalling reaction-time
budget per FAA AC 120-57B §7. We also keep dwell time well under FCC §15.247
0.4 s limit, so frequency-hopping is optional.

DECT-2020 (NR+) is the right answer for v2 once Nordic nRF9151 or similar gets
better availability and once we have a fleet large enough to absorb the
coordinated-spectrum overhead.

### LoRa frame
```
| preamble | sync 0x34 | hdr | dev_id(2) | seq(2) | sig_id(1) | conf(1) | flags(1) | hmac8(8) | CRC |
```
AES-128-CTR keyed at provisioning; HMAC-SHA256 truncated to 64 bits for
authentication. Replay window 32 frames.

### BLE 5.4 fallback
A small nRF52833 co-processor (or S3's BLE 5.0 if cost-constrained) advertises
GATT `0xF00D / 0xBEEF` with the same payload, for the rare case where the EFB
tablet is in the cockpit but the LoRa gateway is down. Range ~30 m, which
covers gate-area only.

---

## 9. Haptic / inbound channel

Four LRAs (linear resonant actuators) — left shoulder, right shoulder, left
lumbar, right lumbar — driven by 4× DRV2605L over I2C-C. Patterns:

| Code | Meaning                       | Pattern                              |
|------|-------------------------------|--------------------------------------|
| H01  | ACK from cockpit              | Single 80 ms pulse, both shoulders   |
| H02  | "Hold position"               | 3× 200 ms pulses, both shoulders     |
| H03  | "Follow-me truck inbound"     | Lumbar L→R sweep, 2 cycles           |
| H04  | "Engine start imminent"       | Both shoulders 1 Hz buzz, 5 s        |
| H05  | EMERGENCY — clear ramp        | All 4 LRAs full-amp, 1 s on / 0.5 off, until ACK |
| H06  | Battery low                   | Single lumbar 200 ms every 60 s      |
| H07  | Lost RF                       | Both lumbar 50 ms every 10 s         |
| H08  | Custom (programmable)         | DRV2605 ROM library index 1–123      |

All patterns are tuned against ANSI/ISEA 107 vest fabric padding — the
on-skin amplitude is verified at the LRA face, not at the driver output,
because the foam layer absorbs ~6 dB.

---

## 10. Power

| Item             | Spec                                       |
|------------------|--------------------------------------------|
| Pack             | 1S 5000 mAh Li-poly, sternum pocket        |
| Protection       | DW01 + 8205A FET pair, 3 A trip            |
| Charge           | BQ25798 buck-boost, USB-C PD 5–9 V, 2 A    |
| Charger location | Right hip pocket, IP54 magnetic flap       |
| Run time         | 14 h continuous classify + 200 TX/hr       |
| Standby          | 96 h (chest IMU only, 1 Hz wake)           |
| Low-batt cutoff  | 3.30 V, with H06 alert at 3.55 V (~15%)    |
| Cell chemistry   | LiPo (not Li-ion 18650) for crush-safety   |
| Fuse             | 3 A polyfuse + 30 A pulse-rated DC fuse    |

### Power budget @ avg
| Block              | Avg current |
|--------------------|------------:|
| ESP32-S3 (mixed)   | 60 mA       |
| 5× IMU             | 4 mA        |
| LoRa idle / TX 5%  | 8 mA        |
| BLE 5.4 adv 1 Hz   | 0.3 mA      |
| Haptics (5% duty)  | 12 mA       |
| LEDs / status      | 2 mA        |
| Regulator losses   | 15 mA       |
| **Total**          | **~101 mA** |

5000 mAh × 0.85 efficiency / 101 mA ≈ 42 h theoretical, derate to 14 h
realistic with cold-weather (-10 °C) capacity loss and peak-TX bursts.

---

## 11. Mechanical / vest integration

- **Base garment**: ANSI/ISEA 107-2020 Type R Class 3, FR-treated polyester
  mesh, fluorescent yellow-green with 2" silver retroreflective bands.
  Sourced as a stock vest (e.g. Radians SV59 series); we add an inner liner.
- **Inner liner**: ripstop nylon, washable, holds IMU pods and flat-flex.
- **IMU pods**: 22 × 14 × 5 mm injection-mold ABS, snap-on to liner via Velcro
  + retention strap. User-removable for washing.
- **Cable**: 28 AWG silicone-jacket flat-flex from sleeve cuff → elbow → hub.
  Strain-relieved at each pod with kevlar pull-thread. Tested 5000 flex cycles
  at 5 mm bend radius per IPC-FC-234.
- **Hub housing**: IP66 over-mold (polyurethane), front panel with 1 button,
  1 RGB LED, USB-C flap. Removable from vest via 4× snap fasteners for laundering.
- **Color**: black, low-vis, mounted inside the high-vis vest shell.
- **Flame**: vest meets ANSI/ISEA 107 FR; hub housing meets UL 94 V-0.
- **Cleaning**: vest machine-washable (40 °C) after hub removal. Pods
  splash-rated only, hand-wipe.

---

## 12. Certification path

| Cert                          | Required? | Effort   | Notes                                      |
|-------------------------------|-----------|----------|--------------------------------------------|
| FCC Part 15.247 (LoRa, BLE)   | Yes       | 4 weeks  | Standard intentional-radiator              |
| ISED RSS-247 (Canada)         | Yes       | piggyback| Same test data                             |
| CE-RED EN 300 220 / 301 489   | v1.5      | 6 weeks  | EU launch                                  |
| RoHS / REACH                  | Yes       | 1 week   | Materials declaration                      |
| UN 38.3 (Li-poly transport)   | Yes       | 3 weeks  | Cell supplier provides; we re-test pack    |
| ANSI/ISEA 107 (vest)          | Yes       | piggyback| Use ANSI-certified base vest, add liner    |
| DO-160 (RTCA airborne env)    | **NO**    | n/a      | Vest is NOT installed equipment            |
| RTCA DO-292 (PED on aircraft) | Advisory  | 2 weeks  | Informal compatibility study               |
| FAA AC 91.21-1D (PED policy)  | Advisory  | 2 weeks  | Brief per airline                          |
| Airport-side approval         | Per-port  | varies   | Each airport's ops directive               |
| FAA AC 120-57B alignment      | Yes       | docs     | Document mapping of classifier vocab → AC  |

The killer detail: because the vest is *not* installed on the aircraft and is
worn outside the cabin, DO-160 does not apply. We do voluntary DO-292 PED
compatibility testing because airline ops will ask. The harder path is
**airline ops-manual approval** — that's a business-development gate, not a
hardware gate, and is identical to what Sonim or Peltor face for ramp use.

---

## 13. Open hardware questions for v1.1

1. Can we replace 4× ICM-42688-P with 2× ICM-45686 (newer, integrated mag)
   once availability stabilizes? Saves 2 BOM lines and ~$3.
2. Is a single nRF5340 (BLE 5.4 + LE Audio) enough to drop the SX1262 for
   in-gate-only deployments? Different SKU.
3. Should the chest IMU be on a separate FPC tail to decouple torso flex from
   PCB strain, or is on-board fine? — current plan: on-board, BMI270 is small.
4. Wash-cycle endurance: pods are removable, but the flat-flex stays. Need
   100-wash accelerated test.

---

## 14. Repo / firmware layout

```
firmware/
├── main/
│   ├── app_main.c
│   ├── fsm.c              # §7 state machine
│   ├── imu_drv.c          # 5× ICM/BMI driver, dual-I2C
│   ├── fusion.c           # Madgwick per limb
│   ├── classifier.c       # TCN runtime wrapper (ESP-DL)
│   ├── lora_link.c        # SX1262 + AES-CTR + HMAC
│   ├── ble_adv.c          # GATT advertiser
│   ├── haptic.c           # 4× DRV2605L sequencer
│   ├── power.c            # BQ25798 + fuel gauge
│   └── nvs_cfg.c          # calibration & custom-signal storage
├── model/
│   ├── tcn_int8.tflite    # 280 KB
│   └── labels.json
├── tools/
│   ├── capture/           # IMU capture rig firmware
│   └── train/             # PyTorch → TFLite int8 pipeline
└── test/
    ├── hw_loopback/
    └── classifier_replay/
```

---

## 15. Risks

| Risk                                                | Mitigation                                       |
|-----------------------------------------------------|--------------------------------------------------|
| Sleeve slip rotates wrist IMU by 10–30°             | Magnetometer + augmented training; cuff strap    |
| False emergency-stop in heavy hand-cart use         | E-stop classifier requires arms-crossed AND >4 rad/s; lab-tuned threshold |
| LoRa collision at busy hub (8+ marshallers)         | LBT before TX, ALOHA backoff, channel-hop on collide |
| Cold weather LiPo capacity loss                     | Derate run-time spec to 14 h; self-heating cell for v2 |
| Airline ops-manual rejection                        | DO-292 study, FAA AC 120-57B mapping doc, pilot at one regional carrier first |
| ESD on sleeve cable (ramp static can hit 15 kV)     | TVS at each pod, 2 kV HBM tested                 |
| Vest laundered with hub installed                   | Tag + hub auto-detects water (chest baro humidity proxy), refuses to power on |

---

## 16. Scope boundary (what this concept does NOT do)

- Does **NOT** recognize ASL — that's `handshake-kiosk`.
- Does **NOT** translate inbound voice — that's a captioning task, out-of-scope.
- Does **NOT** replace the visual marshalling itself — flight crew still sees
  the marshaller. We add a structured event channel **alongside** the visual.
- Does **NOT** require modification to the aircraft. EFB tablet is a Class 1 PED.
- Does **NOT** target lavatory / cabin crew — wholly different cert path.
