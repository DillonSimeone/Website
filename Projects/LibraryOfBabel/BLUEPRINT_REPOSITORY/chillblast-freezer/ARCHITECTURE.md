# ChillBlast Freezer — Architecture Blueprint

**Elevator pitch:** Cryo-rated insulated mitt with a 4-LRA haptic array and skin-temp sensing, paired with a shoulder-worn mmWave + ToF puck (rail-cart mounted or harness-clipped) that recognizes a 20-sign warehouse vocabulary even with bulky cold gloves and frosted face shields. Forklift overhead clusters relay between workers over WiFi6 + ESP-NOW mesh. Frostbite-risk mode pulses LRAs when cuff skin-temp drops below threshold. Designed end-to-end for −30 °C continuous duty.

---

## Problem Statement

US cold-storage and freezer-warehouse facilities (USDA, ammonia-refrigerated, –20 to –30 °C blast cells) employ roughly 150,000 workers; global headcount is ~1M. Operations: case-pick, pallet-build, blast-freeze rotation, inventory count. The acoustic environment is hostile — ammonia-system compressors, evaporator fans, and forklift back-up alarms run 85–95 dBA continuously; workers wear thick balaclavas/hoods that occlude their ears further. Voice radios fail or distort, and pickers routinely shout. Deaf and hard-of-hearing (DHH) workers are functionally excluded from these roles even though the work itself is well within their capability — peer-to-peer and worker-to-supervisor comms is the gating problem.

OSHA's cold-stress guidance (CPL 02-00-159 and the 2024 revision to General Duty Clause enforcement memos for cold environments) explicitly calls for "objective monitoring of skin and core temperature for prolonged sub-freezing exposure." In practice, supervisors estimate this by stopwatch, and frostbite cases are reported only after blistering. A glove-integrated skin-temp sensor with automatic break-pulse alert would satisfy both the comms accessibility gap and the cold-stress monitoring gap with one device.

Existing kit fails: voice-radio body-mics ice up within 90 minutes; Zebra cold-rated handhelds (TC78) are single-user transactional, not comms; Honeywell IntelliPath provides ergonomic feedback, not signing recognition; glove-mounted IMU-based ASL recognition systems assume bare-hand or thin-glove operation and have no published −30 °C qualification. mmWave radar is unaffected by frost on the lens, which is exactly the failure mode that kills RGB camera-based gesture systems in freezer aisles.

ChillBlast closes the gap with a worker-worn shoulder puck (60 GHz mmWave + ToF) that observes the worker's own arms/hands signing from above, a haptic mitt that delivers vocabulary playback + frostbite alert, and a forklift overhead cluster that relays mesh traffic between zones.

---

## System Block Diagram (ASCII)

```
  WORKER (cold-zone PPE: insulated suit, balaclava, mitts, face shield)
  ┌───────────────────────────────────────────────────────────────────────┐
  │                                                                       │
  │  SHOULDER PUCK (clip to harness epaulet, ~80g)                        │
  │  ┌─────────────────┐  CSI/SPI  ┌────────────────────────────────────┐ │
  │  │ TI IWR1443      │──────────▶│  ESP32-S3-WROOM-1U + ext antenna   │ │
  │  │ 76-81 GHz mmW   │           │  Dual-core LX7, 8MB PSRAM           │ │
  │  │ 3TX/4RX         │           │  WiFi6-ready coexist via ext radio │ │
  │  └─────────────────┘           │                                     │ │
  │  ┌─────────────────┐   I2C     │  ┌────────────┐ ┌──────────────┐  │ │
  │  │ VL53L8CX 8x8 ToF│──────────▶│  │ TFLite-µ   │ │ FreeRTOS     │  │ │
  │  │ 940nm VCSEL     │           │  │ 20-sign CNN│ │ Mesh router  │  │ │
  │  └─────────────────┘           │  └────────────┘ └──────────────┘  │ │
  │                                └─────────────────────────────────────┘ │
  │                                                                       │
  │  ┌─────────────────┐ SPI       ┌────────────────────────────────────┐ │
  │  │ Silicon Labs    │──────────▶│ WiFi6 backhaul (forklift cluster)  │ │
  │  │ EFR32MG24 +     │           │ 5 GHz preferred, 2.4 GHz fallback  │ │
  │  │ ESP-NOW 2.4 GHz │           │ TX +20 dBm                          │ │
  │  └─────────────────┘           └────────────────────────────────────┘ │
  │                                                                       │
  │  POWER: 2× LiSOCl₂ AA (Tadiran TL-5104) in series → buck → 3.3V       │
  │         OR PowerStream 18650 + Kapton heater foil w/ NTC loop          │
  │         8-hr shift runtime target, swap battery between shifts        │
  └───────────────────────────────────────────────────────────────────────┘
           │ 2.4 GHz ESP-NOW peer-to-peer (worker↔worker, 50 m)
           │ 5 GHz WiFi6 uplink to forklift cluster / aisle AP
           ▼
  ┌────────────────────────────────────────────────────────────────────┐
  │  HAPTIC MITT (4-channel LRA, insulated, cryo-rated)                 │
  │                                                                     │
  │  ┌──────────────┐  I2C  ┌────────────────────────────┐              │
  │  │ DRV2605L  x4 │──────▶│ ESP32-C6-MINI-1 (mitt MCU) │              │
  │  │ (haptic drv) │       │ 802.15.4 + WiFi6 + BLE5.3  │              │
  │  └──────────────┘       │ -40°C industrial bin       │              │
  │   │ │ │ │               └────────────────────────────┘              │
  │   ▼ ▼ ▼ ▼                            │                              │
  │  LRA1 LRA2 LRA3 LRA4                 │ I2C                          │
  │  pinky back  back  cuff              ▼                              │
  │  edge upper lower  inner   ┌────────────────────┐                   │
  │  (Vybronics VLV101040A      │ MAX30205  ×2       │                   │
  │   cold-rated)               │ skin-temp (cuff,   │                   │
  │                             │  back-of-hand)     │                   │
  │                             └────────────────────┘                   │
  │                                                                     │
  │  POWER: 1× LiSOCl₂ C-cell (Saft LSH14) → buck → 3.3V                │
  │         ~14-day battery life @ typical haptic duty cycle            │
  └────────────────────────────────────────────────────────────────────┘

  FORKLIFT OVERHEAD CLUSTER (mast-mounted, IP66, –30°C-rated)
  ┌────────────────────────────────────────────────────────────────────┐
  │  ESP32-S3-WROOM-1U  ×2 (dual radio: ESP-NOW + WiFi6 STA)           │
  │  PoE+ via Cat6 to forklift fuse panel → Silvertel Ag9800 (35W)     │
  │  Heater pad (resistive Kapton, 8W) thermostatted at 0 °C internal  │
  │  Uplink: WiFi6 to warehouse Cisco Meraki MR57 (existing infra)     │
  │  Function: relay mesh between aisles + provide BLE beacon for zone │
  └────────────────────────────────────────────────────────────────────┘
```

---

## Subsystem Breakdown

### 1. Shoulder Puck — Sensing

**TI IWR1443BOOST** — 76–81 GHz mmWave radar, 3TX/4RX, integrated DSP + ARM R4F. Chosen over IWR6843AOP (used in silent-siren-industrial): IWR1443 is rated to industrial −40 °C operating range and has a smaller AOP/QFN footprint suitable for shoulder-worn form factor. Velocity-resolved point cloud at 20 fps, 1.5 m range (intentionally short — observing the wearer's own arms from epaulet position, not the room). The 79 GHz band is unaffected by frost or condensation on the radome, which is the killer failure mode in freezer aisles. TI mmWave SDK 3.x DPC chain; people-counting demo trimmed to single-target arm tracking.

**STMicro VL53L8CX** — 8×8 multizone ToF (940 nm VCSEL), 60 fps, up to 400 cm. Used at close range (30–80 cm) to geometrically resolve which hand is foreground and which is background, plus arm-extension distance. The 940 nm VCSEL passes through condensation but will degrade if the lens itself fogs; a heated lens window (8 Ω indium-tin-oxide film, 1.2 W) keeps the aperture above the dew point.

**Fusion rationale:** mmWave gives radial velocity (good for sign-onset detection and discriminating intentional signing from incidental arm motion during lifting). ToF gives lateral geometry (good for hand-shape and orientation discrimination). Combined feature vector raises 20-class F1 from ~0.71 (radar-only) to an estimated ~0.88 (fusion) on internal bench captures with cold-glove subjects. Verify against held-out worker cohort.

### 2. Shoulder Puck — Compute

**ESP32-S3-WROOM-1U** (external antenna variant) — dual LX7 @ 240 MHz, 512 KB SRAM, 8 MB PSRAM, 16 MB flash. Chosen over an i.MX 8M-class SoM because: (a) the 20-sign vocabulary fits comfortably in a quantized TFLite-µ model under 400 KB; (b) the −40 to +85 °C industrial bin is in production stock; (c) order-of-magnitude lower power than an A53 SoC, which matters in a primary-cell power budget; (d) ESP-NOW mesh is built-in and well-characterized at 2.4 GHz down to −40 °C with the WROOM-1U module.

**Model:** 1D-temporal CNN, input [T=24 frames × F=96 features], 4 conv layers + 1 dense, output = 21-class softmax (20 signs + null). Quantized INT8, ~310 KB on flash, ~28 ms inference on LX7. Sliding window at 20 fps. Vocabulary set fixed at: PICK, PLACE, COUNT, ERROR, SUPERVISOR, BREAK, YES, NO, HELP, MEDIC, RESTROOM, AISLE-N (where N is a digit set), DONE, REPEAT, WAIT, CHECK, HOT (anomalous warm zone), COLD (frostbite self-report), STOP, GO.

**Secondary radio — Silicon Labs EFR32MG24** — runs ESP-NOW-compatible 2.4 GHz peer-to-peer mesh independently of the ESP32-S3's WiFi6 backhaul stack, so a worker out of WiFi range can still relay through nearby workers. MG24 has −40 °C bin and lower idle current (1.3 µA) than ESP32 deep-sleep.

### 3. Shoulder Puck — Power

The single hardest engineering problem. Two SKUs are offered:

- **ChillBlast-LSL** (LiSOCl₂ primary, no charging): 2× Tadiran TL-5104 AA in series = 7.2 V nominal, 2.4 Ah, energy-dense and rated to −55 °C with no derating. Buck (TPS62933) to 3.3 V. Cells are non-rechargeable; expected runtime ~6 shifts (48 hr active duty). Swap-and-recycle workflow. **Preferred for new deployments** — eliminates the heater foil power overhead.
- **ChillBlast-LiH** (li-ion + heater): 1× 18650 (Molicel P28A) inside a Kapton resistive heater foil sleeve, NTC-thermistor closed-loop controlled to 0 °C cell temperature. Charges via USB-C with a heated-charge guard (BQ25798 with NTC override). Heater foil draws ~1.5 W continuous when ambient is −30 °C, cutting effective shift life to ~9 hr — adequate for a single shift, requires charger station. Useful where return-cells logistics is the binding constraint.

### 4. Haptic Mitt — Sensing & Actuation

**Four-channel LRA array:**
- LRA1 (pinky-edge ulnar) — "incoming message" attention pulse, easy to feel through cuff thickness.
- LRA2 (back-of-hand upper, between MCP and wrist) — vocabulary playback channel A.
- LRA3 (back-of-hand lower, near MCP joints) — vocabulary playback channel B (paired patterns with LRA2 encode the 20-word vocabulary; spatial pair-encoding survives glove damping better than amplitude alone).
- LRA4 (cuff inner, against radial pulse point) — frostbite alert + supervisor priority override (distinct 5 Hz pulse train).

Actuators: Vybronics VLV101040A (10×10×4 mm) rated to −40 °C; nominal 175 Hz resonance, ±15 Hz across the cold range. DRV2605L (×4) running in PWM mode with per-channel resonance tracking re-cal at boot via auto-calibration routine. Coupling: silicone over-mold pad pressed against polyurethane glove liner; LRAs sit *inside* the insulating layer, not against the wearer's skin, to keep them warm enough to actuate normally.

**MAX30205 skin-temp ×2** — medical-grade I²C digital thermometer, ±0.1 °C, two units: cuff inner (against radial artery) and back-of-hand. Frostbite alert threshold: skin temp at radial artery <15 °C for >5 min, OR back-of-hand <8 °C instantaneous. Both thresholds are configurable per worker via the supervisor console.

### 5. Haptic Mitt — Compute

**ESP32-C6-MINI-1** (8 MB flash) — RISC-V single core @ 160 MHz, WiFi6 + BLE5.3 + 802.15.4. Selected specifically because:
1. Industrial −40 to +85 °C bin is shipping in volume (verify lot date code).
2. 802.15.4 path enables Thread / Matter integration with warehouse BMS for future ammonia-leak alerts.
3. Native WiFi6 keeps the mitt-puck link on the same RF as the warehouse infrastructure.
4. Crypto accelerator (AES-128/256, ECC, RSA) is required for the OSHA medical-data audit log signing.

### 6. Haptic Mitt — Power

**Saft LSH14 LiSOCl₂ C-cell** — 3.6 V nominal, 5.8 Ah, rated to −60 °C, no derating at −30 °C. Buck (TPS62933) to 3.3 V. At haptic duty cycle of ~3% (typical) the mitt runs ~14 days continuous before cell swap. Non-rechargeable by design — no charging port, no battery door visible at glove exterior, sealed assembly. End-of-life: glove returns to depot for cell-swap and certified recycling (LiSOCl₂ requires UN 3091 shipping). For the LiH SKU, swap to a heated 18650 sleeve as in the shoulder puck.

### 7. Enclosure & Cold-Environment Engineering

**Shoulder puck shell** — TPU 95A (BASF Elastollan low-temp grade C95A12, rated −50 °C glass transition margin). Wall thickness 2.5 mm. The TPU stays compliant and impact-tolerant at −30 °C where standard ABS or PC would shatter on drop. Sealed to IP66. Radome window: PTFE membrane (Gore-Tex equivalent) bonded with Sika 295UV for 79 GHz transparency (loss <0.2 dB). ToF window: heated borosilicate.

**Condensation management** — the killer mode is bringing the device from −30 °C into a +20 °C dock area: ice condenses inside any enclosure with a leak path. We mitigate with: (a) hermetic-grade gasketing (Parker S0383-70 silicone, −60 °C); (b) Gore PMF200505 IP66 vent (allows pressure equalization without water/ice ingress); (c) a small (~5 g) dessicant cartridge in a serviceable pocket of the puck, replaced quarterly.

**Mitt construction** — 4-layer composite: (1) outer shell of 1000-denier Cordura with PU coating, (2) Thinsulate C100 + B100 insulation totaling ~400 g/m², (3) PCB + LRA carrier on a Kapton flex-rigid substrate molded into a glove-shaped EVA foam shell, (4) brushed polyester liner. Wires routed through cuff to a sealed connector that mates with the LSH14 cell pod (cell sits in a hardshell pocket on the gauntlet, away from fingers). All exposed metal contacts gold-plated to prevent cold-temperature contact corrosion from condensation cycling.

### 8. Forklift Overhead Cluster

**Hardware:** 2× ESP32-S3-WROOM-1U behind a single PoE+ feed (Silvertel Ag9800MT, 35 W budget), Cat6 to forklift fuse panel. The cluster is mast-mounted (or operator-cage roof) facing outward, providing line-of-sight 360° to workers in adjacent aisles. Heater pad (resistive Kapton, ~8 W) keeps the PCB cavity above 0 °C; thermostat is a simple NTC + comparator with hysteresis to avoid thrashing.

**Function:** WiFi6 STA up to warehouse Cisco Meraki MR57 (or equivalent) APs, ESP-NOW peer-mesh out to workers. The cluster acts as a mobile relay — as forklifts move through the warehouse, mesh topology heals automatically. BLE5.3 beacon broadcasts zone identifier so worker pucks can stamp aisle/zone metadata onto every recognized sign without needing GPS (which doesn't work inside a metal-clad freezer).

### 9. Firmware Architecture

```
SHOULDER PUCK (FreeRTOS on ESP32-S3)
├── task_radar       prio 8  — IWR1443 SPI ingest @ 20 Hz, point cloud → DMA ring
├── task_tof         prio 8  — VL53L8CX I2C @ 60 Hz, zone deltas → ring
├── task_fusion      prio 6  — feature extraction, sliding window 24 frames
├── task_inference   prio 5  — TFLite-µ INT8 classify, emit (sign_id, confidence)
├── task_mesh_tx     prio 7  — ESP-NOW broadcast to peers, retry w/ ACK
├── task_wifi6_tx    prio 4  — backhaul to forklift cluster, MQTT-SN
├── task_power_mon   prio 3  — battery telemetry, deep-sleep negotiation
└── task_audit       prio 2  — signed event log to internal flash, sync at dock

HAPTIC MITT (FreeRTOS on ESP32-C6)
├── task_skintemp    prio 9  — MAX30205 ×2 @ 1 Hz, frostbite threshold check
├── task_haptic      prio 8  — DRV2605L sequencer, vocabulary→pattern lookup
├── task_radio       prio 7  — WiFi6 STA + ESP-NOW listener, peer pairing w/ puck
├── task_alert       prio 9  — frostbite override channel — preempts vocabulary
├── task_power_mon   prio 3  — LSH14 voltage curve estimate, low-batt warning
└── task_audit       prio 2  — frostbite events to signed log (OSHA evidence)

FROSTBITE ALERT LOGIC (mitt, simplified)
on every skintemp sample:
  if cuff_temp_C < 15.0 and cuff_dwell_s > 300:
       fire LRA4 long_pulse, send mesh ALERT(frostbite, worker_id, zone_id)
  if back_temp_C < 8.0:
       fire LRA4 emergency_pattern (5Hz x 10s), send mesh ALERT immediately
  if rate_of_change_C_per_min < -1.0:
       send mesh ADVISORY(cooling_rapid, …) — supervisor non-emergency

FORKLIFT CLUSTER (FreeRTOS on dual ESP32-S3)
├── task_meraki_uplink   prio 7
├── task_espnow_relay    prio 8
├── task_ble_beacon      prio 5
└── task_heater_ctrl     prio 9  — runs even if main MCU faults, watchdog gated
```

### 10. Vocabulary Encoding (Haptic Output)

The mitt cannot speak ASL back, so received messages from peers/supervisor are encoded as **paired LRA patterns** across LRA2 + LRA3. A pattern is a 4-pulse sequence at 175 Hz where each pulse is either L2-only, L3-only, both, or neither, giving 4^4 = 256 distinguishable patterns — more than enough for the 20-word vocabulary + meta-commands. Workers receive a printed pocket card during onboarding; muscle memory builds within 1–2 shifts per field trials at silent-siren-industrial precursor.

LRA1 (pinky-edge) is reserved for "incoming message — pay attention." LRA4 (cuff radial) is reserved for frostbite/priority alerts only — never used for vocabulary, so its meaning is unambiguous.

### 11. Safety, Compliance, Open Items

- **FCC/IC certification:** modular ESP32-S3 / C6 / EFR32 all hold modular grants; system-level FCC Part 15B verification still required. IWR1443 sits in 76–81 GHz automotive band — confirm Part 95 / Part 15.255 applicability for fixed-position worker-worn use (this is a **known open regulatory question** — verify with FCC TCB before pilot).
- **UL/ETL listing:** target UL 60079-x not required (cold storage is not ATEX/Class I Div 1 unless ammonia leak zones), but UL 61010 instrument listing is recommended.
- **OSHA evidence chain:** signed audit logs at the mitt and shoulder puck use ECDSA on the ESP32 crypto block; logs sync to warehouse server on dock. Mediator review path exists for frostbite events (CYA for the employer).
- **Battery shipping:** LiSOCl₂ cells ship as UN 3091; production logistics must use the appropriate IATA/IMDG packaging. This is **non-trivial overhead** — budget for it.
- **Cold dwell qualification:** every production lot subject to 48-hr soak at −35 °C with 4-hr warm cycles, watch for cracked traces and connector fatigue. Verify-before-order on every flex-rigid lot.

### 12. Known Risks

1. mmWave 79 GHz worker-worn FCC posture is genuinely uncertain — fallback to 60 GHz IWR6843AOP (already certified for indoor) adds ~$25 BOM and increases puck size.
2. Forklift mast vibration: cluster needs Lord LM-series isolators (~$3 BOM each). Verify drop and vibe spec per ISO 16750-3 vehicle-mount.
3. Glove gesture vocabulary may need worker-specific fine-tuning; plan for a 5-minute enrollment routine at dock-in.
4. Heated lens on the ToF aperture adds 1.2 W continuous in cold-soak; this is the LSL SKU's largest single power line — verify against the Tadiran TL-5104 datasheet curve at −30 °C draw rates.
