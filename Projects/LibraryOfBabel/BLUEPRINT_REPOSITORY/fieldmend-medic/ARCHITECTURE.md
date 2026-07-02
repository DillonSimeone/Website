# FieldMend Medic — Architecture Blueprint

**Elevator:** A wrist-worn forearm pad that lets a deaf casualty fingerspell ASL onto the combat medic's arm, converts strokes to text via on-MCU ML, and relays the message to the triage tablet over LoRa — no input device on the casualty required.

---

## Problem Statement

Three scenarios share a single failure mode: a deaf or hearing-impaired person in a medical emergency cannot communicate with a responder who does not know sign language, and the casualty's hands are too damaged, restrained, or cold to produce legible signs.

**Combat medic with a deaf casualty — wounded or restrained hands.** A 68W medic in a forward operating environment treats a deaf soldier whose hands are bandaged, splinted, or flex-cuffed as a precaution. Standard ASL is unavailable. Written notes require a free hand and a clean surface. Text-to-speech apps require a working phone and the casualty's voice. The medic has seconds, not minutes, to understand chief complaint, allergy flags, or last medication. TCCC card data entry is manual and verbal; there is no existing pathway for a non-speaking, non-signing casualty to push structured data into the triage loop.

**Wilderness SAR medic with a deaf hiker — hypothermic stiffening.** A search-and-rescue team reaches a deaf hiker with core temp below 32°C. Finger dexterity is severely compromised; the hiker cannot produce clean handshapes. Even if the medic knew sign language, the hiker cannot form recognizable signs. Pen and paper are unavailable or impractical in rain or snow. The medic needs to establish pain location, consciousness level, and relevant history before packaging for evacuation.

**ER triage nurse with a deaf patient post-stroke.** A deaf patient presents with acute right-side hemiparesis. Their dominant hand has reduced motor control; signing is garbled. The hospital interpreter service has a 40-minute wait. The nurse must triage pain scale, chief complaint, and allergy status. Gross finger movements — one fingertip pressing and dragging — are preserved even when fine motor control is not. The patient can fingerspell slowly on any surface.

In all three cases the casualty retains at least one fingertip capable of pressing and dragging on a flat surface. FieldMend Medic relocates the input surface to the medic's forearm and makes the pad the smart device, not the casualty's phone or glove.

---

## System Block Diagram (ASCII)

```
CASUALTY SIDE                      MEDIC SIDE
─────────────────────────────────────────────────────────────────────

  [ One fingertip ]
       │  drag / tap trace
       ▼
┌─────────────────────┐
│  Capacitive Surface  │  ← 80×40 mm ITO-on-PET sensor array
│  (ITO traces, 6×12  │    mounted under TPU over-laminate
│   mutual-cap nodes) │    (glove-permittivity tolerant)
└────────┬────────────┘
         │ raw CapSense data
         ▼
┌─────────────────────┐
│   Infineon PSoC 6   │  ← Cortex-M4 + Cortex-M0+
│   (CY8C6247BZI-D54) │    CapSense middleware (mutual cap)
│                     │    FreeRTOS, stroke-shape ML (Edge Impulse
│   Stroke Classifier │    ONNX int8 on M4 @ 150 MHz)
│   (letter → char)   │    letter buffer, message assembler
└──┬──────────┬───────┘
   │          │
   │ I2C      │ SPI
   ▼          ▼
┌──────────┐  ┌──────────────────┐     SPI       ┌────────────────────┐
│ DRV2605L │  │  SX1262 LoRa     │ ──────────►   │  Triage Tablet     │
│ (×4 LRA  │  │  868/915 MHz     │  CBOR packet  │  (Android/iPadOS   │
│  haptic  │  │  rubber-duck ant)│               │   LoRa USB dongle) │
│  confirm)│  └──────────────────┘               └────────────────────┘
└──────────┘
   │
   ▼
┌──────────────────────────┐
│  WaveShare 2.13" e-paper  │  ← partial refresh, 250×122 px
│  (GDEY0213B74)            │    displays assembled string
└──────────────────────────┘

┌──────────────────────────┐
│  Power: CR123A 3V Li     │  ← LDO + boost regulator
│  (or 18650 hot-swap bay) │    wake-on-touch < 100 µA sleep
└──────────────────────────┘
```

---

## Subsystem Breakdown

### 1. Capacitive Trace Surface and Cover

The sensor layer is a 6-column × 12-row mutual-capacitance grid on 0.1 mm ITO-on-PET film, spanning 80 × 40 mm. Node pitch is approximately 6.7 mm, sufficient to resolve a single fingertip centroid with sub-4 mm accuracy after centroid interpolation. The cover material is 0.8 mm TPU (Shore 60A) laminated over the sensor with optical-clear adhesive. TPU provides IP67 sealing at the perimeter gasket, blood and saline resistance, and a smooth trace surface without concentrating heat from a cold finger.

**Glove-permittivity tolerance:** Mutual-capacitance mode is inherently more permeable to low-permittivity overlayers (latex, nitrile, leather gloves) than self-capacitance. PSoC 6 CapSense CSD2 hardware supports tunable sensitivity per electrode; the firmware autotunes thresholds on power-on using the built-in SmartSense algorithm. Validated target: consistent detection through 1 mm nitrile surgical glove and 2 mm leather work glove. Blood and sweat on the cover surface increase effective permittivity and improve sensitivity rather than degrading it — a deliberate design choice.

### 2. PSoC 6 CapSense + On-MCU Stroke ML

The Infineon CY8C6247BZI-D54 provides a Cortex-M4 running the stroke classifier at up to 150 MHz and a Cortex-M0+ handling CapSense scanning and peripheral I/O at lower power. CapSense middleware (Infineon v3.x) runs the mutual-cap scan loop at 100 Hz, producing a 6×12 centroid frame. The M4 runs an Edge Impulse-trained int8 ONNX model (MobileNet-style 1D CNN over stroke trajectory features: direction histogram, aspect ratio, crossing count, endpoint distance). Training corpus: 500 repetitions × 26 letters × 3 writers = 39,000 strokes, augmented with noise and partial occlusion.

Inference latency target: < 50 ms per letter on M4 at 150 MHz. The classifier emits a letter token with a confidence score; tokens below 0.6 confidence are flagged with a haptic "uncertain" double-pulse and held in a correction buffer. The message assembler on the M0+ concatenates confirmed letters with a 2-second inter-letter gap timeout acting as a word space. A long-press (> 1.5 s) on the top-right corner deletes the last character.

FreeRTOS (V10.x) manages three tasks: CapSense scan (highest priority), ML inference (normal priority), and comms/display update (low priority). Wake-on-touch uses the CapSense proximity widget in low-power hardware scan mode; draw in sleep is < 80 µA.

### 3. Haptic Confirmation — DRV2605L and LRA Selection

Four LRAs (linear resonant actuators) are arranged in a 2×2 grid under the sensor surface, spaced 20 mm apart. Each LRA is driven by a dedicated TI DRV2605L ERM/LRA driver on a shared I2C bus with separate address-select pins. The DRV2605L's internal waveform library provides letter-confirm (single 20 ms pulse at 175 Hz), uncertain (double pulse 20–50 ms gap), delete (reverse-direction 40 ms), and word-space (sustained 60 ms sweep) cue waveforms.

**LRA selection:** Jinlong Z10SC3B (10 mm diameter, 175 Hz resonance, 0.75 mm peak displacement) selected for flat profile (2.8 mm height) fitting within the enclosure without increasing pad thickness beyond 6 mm total. **Glove-feedback resonance issue:** When the medic wears a thick glove, tactile resolution drops; the four-actuator spatial layout ensures at least one LRA is within 10 mm of the medic's radial forearm skin regardless of pad positioning. Resonant frequency shift with glove damping is compensated by the DRV2605L closed-loop LRA mode, which tracks back-EMF to maintain amplitude.

### 4. E-Paper Display — WaveShare GDEY0213B74

The WaveShare 2.13-inch e-paper module (GDEY0213B74, 250×122 px, SPI, partial-refresh capable) mounts flush on the dorsal face of the enclosure with a hardcoat polycarbonate window. Partial refresh (< 0.5 s) updates only the message text region, leaving the medic's name and unit callsign in a static header. Full refresh (< 2 s) is triggered only on power-on or display clear. The display draws zero power when static — critical for 24-hour battery budget. The panel operates to -20°C without heater; Waveshare rates the GDEY0213B74 to -25°C storage. Font: bitmap 8×16 px monospace, fitting 31 characters per row × 7 rows = 217 character message capacity before scroll.

### 5. LoRa — SX1262 with Rubber Duck Antenna

The Semtech SX1262 transceiver (via a Waveshare SX1262 LoRa HAT-equivalent module or equivalent breakout) operates at 915 MHz (US) or 868 MHz (EU/NATO). Configuration: SF7, BW125, CR4/5 for short-range triage-net use (< 500 m, building-penetrating); upgrades to SF10/BW125 for rural wilderness scenarios (< 5 km line of sight). Payload is CBOR-encoded: unit ID (4 bytes), timestamp (4 bytes), message string (variable), confidence bitmap (1 byte/letter). Total packet < 64 bytes. A rubber duck SMA antenna (105 mm, quarter-wave at 915 MHz) mounts to the enclosure side through an IP67 SMA bulkhead. The LoRa link is one-way broadcast with ACK from the tablet app; unacknowledged messages are retried up to 3 times with 500 ms spacing.

### 6. Enclosure and Strap

The enclosure is injection-molded 30% glass-filled nylon (PA66-GF30), FR-rated (UL94 V-0). Dimensions: 90 × 50 × 12 mm (pad plus electronics stack). IP67 seal: perimeter O-ring (Viton, -20/+200°C rated) compressed by six M2 stainless screws into a machined groove. The display window is 2.5 mm hardcoat polycarbonate bonded with structural silicone. Strap: 38 mm wide, 300 mm long ballistic nylon webbing with stainless D-ring and MOLLE-compatible pass-through loop on the reverse side. MOLLE tabs accept standard PALS attachment. Connector: IP67-rated Micro-USB B port (Amphenol UX60SC-MB-5ST) for charging and firmware update only; LoRa is the operational data link.

### 7. Power

Primary: CR123A 3V lithium (Streamlight, 1500 mAh, -20°C rated). The cell feeds a TI TPS63051 buck-boost regulator providing 3.3 V regulated. A hot-swap socket allows field replacement without tools. Optional second bay accepts a protected 18650 (3000 mAh) for extended 48-hour deployment; the bay selector switch routes to TPS63051 without firmware change.

---

## Power Budget

| Subsystem | Active (mW) | Duty Cycle | Avg (mW) |
|---|---|---|---|
| PSoC 6 M4 (inference active) | 38 | 5% | 1.9 |
| PSoC 6 M0+ (CapSense scan) | 12 | 20% | 2.4 |
| PSoC 6 sleep (wake-on-touch) | 0.26 | 75% | 0.2 |
| DRV2605L × 4 (haptic active) | 280 | 2% | 5.6 |
| DRV2605L × 4 (standby) | 4 | 98% | 3.9 |
| E-paper refresh (partial) | 26 | 1% | 0.3 |
| E-paper static hold | 0 | 99% | 0 |
| SX1262 TX (20 dBm) | 120 | 0.5% | 0.6 |
| SX1262 RX (ACK listen) | 5.4 | 5% | 0.3 |
| TPS63051 quiescent | 0.7 | 100% | 0.7 |
| **Total average** | | | **~16 mW** |

CR123A at 1500 mAh × 3V = 4500 mWh / 16 mW = **~281 hours.** Conservative derating (temperature, aging, transient peaks): 24-hour target achieved with >4× margin on CR123A; >8× margin on 18650.

---

## Environmental Qualification Targets

| Standard | Test | Requirement |
|---|---|---|
| IP67 | IEC 60529 §14.2.7 | 1 m immersion, 30 min |
| Dust | IEC 60529 §13.4 | Total dust ingress protection |
| Vibration | MIL-STD-810H Method 514.8 | Cat 4 (ground vehicle) |
| Shock | MIL-STD-810H Method 516.8 | 40 g, 11 ms half-sine |
| Sand/Dust | MIL-STD-810H Method 510.7 | 1.5 g/m³, 6 h |
| Temperature | MIL-STD-810H Method 501/502 | -20°C to +50°C operational |
| Fluid resistance | Internal | Blood (simulated), 0.9% saline, IPA wipe |

Gasket material (Viton) and PA66-GF30 shell rated across full range. E-paper panel GDEY0213B74 self-rated to -25°C.

---

## Firmware Overview

**RTOS:** FreeRTOS V10.5, three tasks plus idle.

**CapSense task (M0+, 100 Hz):** Runs mutual-cap scan, applies SmartSense auto-tuning on first boot, publishes centroid (x, y, pressure-proxy) to a FreeRTOS queue. Manages wake-on-touch from deep sleep using hardware proximity widget.

**ML inference task (M4, event-driven):** Consumes centroid stream, segments strokes using velocity-threshold end-detection, extracts 22-feature vector (trajectory histogram 8-bin, aspect ratio, crossing count ×2, start/end endpoint normalized, stroke duration), runs int8 CNN inference, emits (letter, confidence) token to message queue. Confidence < 0.6: triggers uncertain haptic and holds for retry. Long-press corner gesture: delete last character.

**Comms/display task (M0+, low priority):** Aggregates letter tokens into UTF-8 string, triggers DRV2605L confirm pulse on each accepted letter via I2C, refreshes e-paper partial region, packages CBOR LoRa payload, transmits via SX1262 SPI, listens for ACK up to 1.5 s, retries up to 3×.

**LoRa protocol (CBOR, 64-byte max):**
```
{unit_id: uint32, ts: uint32, msg: tstr, conf: bstr}
```
**Low-power:** Device spends >75% of operational time in PSoC 6 Deep Sleep (1.3 µA core, CapSense hardware scan active at 280 µA effective draw). Full wake triggered by CapSense touch threshold crossing.

---

## Top 5 Risks and Mitigations

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| 1 | **Gloved-finger capacitive sensing failure** — thick leather or double-gloved hands may fall below detection threshold | High | Mutual-cap mode + autotune threshold; validated test protocol requires certification through 2 mm leather glove; minimum detection area relaxed from 1-finger to palm-edge drag |
| 2 | **Blood/sweat shorting or noise** — conductive fluid on the TPU surface couples interference into CapSense electrodes | Medium | Firmware noise floor adaptive baseline update at 4 Hz; TPU perimeter raised lip channels fluid away from center trace zone; hardware RC filter on each electrode line |
| 3 | **Casualty cognitive state limiting fingerspelling accuracy** — shock, hypoxia, TBI, or non-DHH users may produce garbled strokes | High | Classifier includes "unknown" reject class with retry haptic; system degrades gracefully to Y/N single-letter triage mode; medic UI shows confidence bars; training includes partial/slurred strokes |
| 4 | **Learning curve for casualty and medic** — ASL fingerspelling is not universal; non-DHH casualties may not know it | Medium | Backup protocol: medic physically guides casualty finger through number-trace (1–9 pain scale, body-region code); printed trace-guide card on enclosure back; 5-minute training included in kit |
| 5 | **Military procurement and TCCC gatekeeping** — US Army Institute of Surgical Research controls TCCC card format; new device requires TCCC Working Group endorsement | Medium-High | Position as TCCC-adjacent supplement, not replacement; LoRa output maps to existing triage tablet formats (MEDEVAC 9-line fields); pursue SOFWERX rapid prototype pathway and civilian SAR/ER pilots in parallel |
