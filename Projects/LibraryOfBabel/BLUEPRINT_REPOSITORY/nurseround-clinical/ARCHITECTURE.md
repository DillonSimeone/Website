# nurseround-clinical — Architecture

**Concept:** Autoclave-wipeable pillow-insert IMU pad recognizing a 30-sign ASL request vocabulary from a supine DHH inpatient, paired with a categorized vibrotactile + e-paper puck at the nurse station. Replaces the binary nurse-call button with semantic-level requests.

**Class:** FDA Class II / EU MDR Class IIa (non-life-supporting patient communication aid, 510(k) pathway).

> All part numbers & prices: **verify-before-order**.

---

## 1. System Topology

```
 ┌──────────────────────────────── PATIENT BED ────────────────────────────────┐
 │                                                                              │
 │   ┌────────────── PILLOW MODULE (sealed silicone over-mold) ──────────────┐ │
 │   │                                                                        │ │
 │   │   IMU-A (occiput)  ←─ SPI ─┐                                           │ │
 │   │                            ├──→ nRF5340  ──→ BLE-Mesh 1.1 (encrypted) │ │
 │   │   IMU-B (jaw/temp) ←─ SPI ─┘    │TinyML│                               │ │
 │   │                                  │30sgn │                               │ │
 │   │   Qi RX 5W ──→ LiPo 850mAh ──→ PMIC ──→ 3V3 rail                       │ │
 │   │                                                                        │ │
 │   │   Tamper / wet-sensor / temp-sensor (autoclave detect → wipe keys)    │ │
 │   └────────────────────────────────────────────────────────────────────────┘ │
 │                                  ║ BLE-Mesh                                  │
 └──────────────────────────────────╫───────────────────────────────────────────┘
                                    ║
 ┌──────────────────────────── NURSE STATION ──────────────────────────────────┐
 │                                                                              │
 │   ┌────────────────── PUCK (desktop, PoE-powered) ─────────────────────────┐│
 │   │                                                                        ││
 │   │   ESP32-S3  ── BLE-Mesh proxy ── PoE PD (IEEE 802.3af) ── hospital LAN ││
 │   │       │                                                                ││
 │   │       ├── DRV2605L → LRA (categorized haptic patterns)                 ││
 │   │       ├── 2.9" e-paper → "Bed 12 · WATER" + ASL gloss + timestamp     ││
 │   │       ├── RGB LED ring (priority colour)                               ││
 │   │       └── Capacitive ack button (silences haptic, logs ACK)            ││
 │   └────────────────────────────────────────────────────────────────────────┘│
 │                                  ║                                           │
 │                                  ║ TLS 1.3 / mTLS                            │
 └──────────────────────────────────╫───────────────────────────────────────────┘
                                    ║
                       ┌────────────╨─────────────┐
                       │ Hospital EHR/Nurse-Call  │
                       │  HL7 FHIR observation    │
                       │   + Rauland/Hill-Rom     │
                       │     integration gateway  │
                       └──────────────────────────┘
```

---

## 2. Pillow Module — Hardware

### 2.1 MCU
- **Nordic nRF5340** (dual-core M33 @ 128 MHz app + 64 MHz net).
  - App core runs TFLite-Micro classifier (30-class softmax, ~78 kB model).
  - Net core runs BLE-Mesh 1.1 stack (Nordic SDK certified).
  - ARM TrustZone partitioned: keys + patient-room binding live in secure world.
  - 1 MB flash + 512 kB RAM app, 256 kB + 64 kB net.

### 2.2 IMU array
- **Two × TDK InvenSense ICM-42688-P** placed ~140 mm apart along pillow long-axis (occiput zone + jaw/temple zone).
  - Spaced array catches both head-rotation (sign location) and jaw/cheek micro-motion (signs that brush the face: PAIN at chin, EAT at lips, FAMILY at brow).
  - ±2000 dps / ±16 g, 32 kHz internal ODR, ~200 Hz fused output to MCU.
  - Hardware FIFO with watermark IRQ → MCU stays in DEEP-SLEEP between strokes (~12 µA idle).

### 2.3 Power
- **Qi 1.3 5W receiver** (BQ51013B class) — pillow recharges by resting on a Qi pad slipped between mattress and bedframe; **no exposed contacts** survives wipe-down/IPX7.
- **TP4056A** + **MCP73831** redundant charge path → **LiPo 850 mAh** (sealed, UN38.3-tested cell, verify-before-order).
- **TPS62840** buck @ 1.8 / 3.3 V (60 nA Iq).
- Battery target: **72 h** on a typical inpatient day (≈ 40 sign events + idle telemetry).

### 2.4 Environmental & hygiene
- **Medical-grade silicone over-mold** (50A shore, NuSil MED-4750 or equiv) — fully sealed enclosure, no seams, no buttons.
- **IPX7** (1 m / 30 min) → survives chlorhexidine, quat-amm, bleach 1:10 wipes.
- **Not** steam-autoclave-rated by default (Qi RX coil & LiPo degrade > 90 °C). Instead: documented **single-patient-use sleeve** + intermediate-level disinfection (CDC Spaulding "semicritical"). An **optional puck-only autoclave SKU** (no battery, inductive-only, ETO-sterilizable) is planned in Rev-B.
- **Tamper / autoclave-detect**: NTC thermistor + reed switch on enclosure; if T > 80 °C or seal broken, secure-element wipes patient-room binding & mesh keys.

### 2.5 Connectivity
- **Bluetooth Mesh 1.1** with PB-ADV provisioning at admission, OOB key via QR on disposable sleeve.
- No PHI on device — only an opaque 128-bit room/bed token. Patient identity resolved server-side at the EHR gateway.

---

## 3. Nurse-Station Puck — Hardware

### 3.1 MCU
- **ESP32-S3-WROOM-1-N16R8** (16 MB flash / 8 MB PSRAM).
  - BLE-Mesh proxy + friend node (relays for low-power pillow).
  - Ethernet via SPI → **W5500** + **Si3402-B** PoE PD front-end.

### 3.2 Output
- **2.9" e-paper, 296×128 mono** (Good Display GDEY029T94 or equiv).
  - Renders: bed ID, request gloss ("WATER"), ASL-photo thumbnail, timestamp, priority colour bar, ACK state.
  - Persistent display — last 4 requests visible without power.
- **DRV2605L** haptic driver → **LRA (10×3 mm)**.
  - Library of **categorized vibrotactile waveforms** (see §5).
- **WS2812B ring (12 LEDs)** — priority colour code: green/yellow/red/violet.
- **Capacitive ack** (TTP223 or MCU touch GPIO) under silicone cap.
- **Piezo buzzer** with HW disable jumper (audio backup only; some units acoustic-disabled).

### 3.3 Power & I/O
- **PoE 802.3af Class 2** (max 6.49 W to PD). Si3402-B → 5 V → buck to 3.3 V.
- Optional barrel-jack 12 V fallback.
- USB-C **service** port (CDC-ACM, dev-mode jumper required) — disabled in shipped firmware.

---

## 4. Classifier — TinyML pipeline

### 4.1 On-device (pillow)
- Window: **2.0 s sliding @ 200 Hz, 50 % overlap** → 400 × 12 (gyro+accel ×2 IMUs).
- Pre-processing: per-axis high-pass 0.5 Hz, gravity vector projection (head-tilt-invariant), z-norm.
- Backbone: **1-D depth-wise separable CNN** (~78 kB INT8), 30-class softmax + 1 "null" class.
- Output: **(class_id, confidence, duration_ms)** — broadcast over mesh **only if confidence ≥ 0.80 sustained ≥ 600 ms**.
- Latency budget: **≤ 350 ms** sign-end → mesh publish.

### 4.2 Server-side verification
- Gateway runs a heavier 2-stream Transformer (same features, longer context, ensemble with pillow logits).
- Disagreement protocol:
  - Pillow HIGH + cloud HIGH → fire alert.
  - Pillow HIGH + cloud LOW → "uncertain — see patient" muted alert.
  - Cloud-only escalation forbidden (no PHI inference round-trip allowed by policy).
- All inference telemetry is **room-token-scoped**, never patient-named.

### 4.3 Vocabulary — 30 signs
```
PAIN          WATER         BATHROOM       BLANKET        COLD
HOT           LIGHT-ON      LIGHT-OFF      TV             QUIET
NURSE         DOCTOR        FAMILY         CALL-PHONE     INTERPRETER
YES           NO            MORE           DONE           HELP
MEDICINE      EAT           DRINK          SLEEP          SIT-UP
LIE-DOWN      ITCH          NAUSEA         BREATH         EMERGENCY
```
"EMERGENCY" + "PAIN" + "BREATH" + "NAUSEA" map to **priority 1** (red, escalating haptic).

---

## 5. Nurse Puck — Categorized Haptics

| Category | Examples | Waveform |
|---|---|---|
| P1 critical | EMERGENCY, BREATH, NAUSEA | 3 × 250 ms @ 235 Hz, 1 s gap, repeating until ACK |
| P2 clinical | PAIN, MEDICINE, ITCH | 2 × 180 ms @ 175 Hz, 3 s gap, 5 reps |
| P3 comfort | WATER, BLANKET, BATHROOM, SIT-UP | 1 × 220 ms @ 150 Hz, 5 s gap, 3 reps |
| P4 ambient | LIGHT, TV, QUIET, FAMILY | 1 × 120 ms @ 120 Hz, single |
| ACK pulse | nurse touch ack | 1 × 80 ms ramp |

DRV2605L library slots 1–5; firmware-selectable per hospital policy.

---

## 6. HIPAA / Security Architecture

- **No PHI on pillow.** Only `room_token` (128-bit opaque, rotated at discharge).
- **BLE-Mesh 1.1**: Application Key per care-unit, Device Key per pillow; provisioning OOB via QR on disposable sleeve.
- **Puck → LAN**: TLS 1.3, mTLS client cert burnt into ESP32-S3 eFuse at manufacturing. Cert rotation OTA over signed firmware.
- **EHR gateway**: HL7 FHIR `Observation` resource (LOINC code TBD, custom). All identity join occurs server-side inside hospital VLAN.
- **Audit log**: every alert + ACK signed (Ed25519) and shipped to hospital SIEM; tamper-evident hash chain.
- **OTA**: signed by HSM-held key; rollback-protected via monotonic counter; staged rollout per care-unit.
- **Secure boot** on both MCUs (Nordic immutable bootloader, ESP32-S3 secure-boot v2 + flash-enc).
- **Threat model documented**: §510(k) submission Appendix C (verify-before-order template).

---

## 7. Regulatory Path

### 7.1 FDA 510(k) — US
- **Predicate device**: existing wireless nurse-call augmentation (e.g., Rauland Responder family, K-numbers TBD — verify-before-order).
- **Classification**: 21 CFR 880.6310 ("nurse-call system") — **Class II**, 510(k) required, no PMA.
- **Software level of concern**: Moderate (failure could delay clinical care but not directly injure).
- **Cybersecurity**: FDA premarket cyber guidance Sept-2023 (SBOM, threat model, vuln-mgmt plan).
- **Estimated cost & timeline**: $50–150k consulting + testing, 9–14 mo to clearance — **verify-before-order**.

### 7.2 EU MDR — Class IIa
- Rule 11 (software providing information used for diagnosis or therapy decisions): IIa.
- Notified Body review, ISO 13485 QMS required.
- IFU + UDI labelling, EUDAMED registration.

### 7.3 Standards required
| Standard | Scope |
|---|---|
| IEC 60601-1 (3.2) | General medical electrical safety |
| IEC 60601-1-2 (Ed 4.1) | EMC for ME equipment (hospital environment) |
| IEC 60601-1-6 / 62366-1 | Usability engineering |
| IEC 62304 | Medical-device software lifecycle (Class B) |
| IEC 60601-1-8 | Alarm systems (puck haptics fall here) |
| ISO 14971 | Risk management |
| ISO 10993-1, -5, -10 | Biocompatibility of silicone (skin contact > 24 h) |
| ISO 13485 | QMS |
| EN 50581 / RoHS / REACH | Environmental |

### 7.4 Clinical evaluation
- Bench classifier accuracy on N ≥ 40 DHH signers (target ≥ 95 % top-1 on the 30-sign set).
- Multi-site pilot: 2 hospitals, 6 weeks, ~80 inpatient bed-nights — endpoints: time-to-staff-response, missed-request rate vs. button baseline.

---

## 8. Hygiene & Single-Use Workflow

```
ADMISSION
  ├── Nurse opens sealed pillow-cover sleeve (single-patient-use, disposable, biocompat ISO 10993-10)
  ├── Slides pillow module inside; scans QR on sleeve → provisions room_token via puck
  ├── Pillow charges on Qi mat between mattress + frame
DURING STAY
  ├── Wipe-down with quat-amm or bleach 1:10 per CDC Spaulding "semicritical"
  ├── Sleeve changed at every linen change
DISCHARGE
  ├── Sleeve disposed (red-bag if soiled, regular if not)
  ├── Pillow module: intermediate-level disinfection
  ├── Tamper-detect triggers room_token wipe; pillow re-enrolls at next admission
```

Autoclave-only Rev-B SKU (no LiPo, supercap + wired Qi) is roadmap, not v1.

---

## 9. Firmware

### 9.1 Pillow (nRF5340)
- Zephyr RTOS 3.6 LTS, Nordic Connect SDK.
- Threads: `imu_dma`, `classifier`, `mesh_pub`, `power_mgr`, `tamper`.
- TFLite-Micro 2.14, INT8 ops only. CMSIS-NN kernels.
- BLE-Mesh: vendor model `0xFFFF / 0x0001` "PatientRequest", opcode `0xC1` (request), `0xC2` (heartbeat), `0xC3` (battery).
- Power states: DEEP-SLEEP → IMU-FIFO-WAKE → ACTIVE-CLASSIFY → MESH-PUB → DEEP-SLEEP.

### 9.2 Puck (ESP32-S3)
- ESP-IDF 5.3 + NimBLE-mesh.
- Tasks: `mesh_rx`, `epaper_render`, `haptic_driver`, `eth_tls`, `audit_log`, `ota`.
- LVGL 9 for e-paper compositing (partial refresh on each new request).
- HL7 FHIR client (lwIP + mbedTLS); fallback queue in SPI-NOR if LAN drops.

### 9.3 Build & CI
- West manifest repo; reproducible Docker build; SBOM via CycloneDX (FDA cyber requirement).
- HIL test rack: 4 pillows + 1 puck + Ethernet shaper; nightly regression on classifier corpus.

---

## 10. Bill-of-Materials Summary

See `PRODUCTION_BOM.csv` — split:
- **Pillow module**: ~22 line items, sealed assy.
- **Nurse puck**: ~15 line items, PoE desktop.

---

## 11. Roadmap

- **v1.0**: 30-sign, single-patient pillow sleeve, US 510(k).
- **v1.1**: +12 signs, Spanish-LSE port, expanded clinical eval.
- **v2.0 Rev-B**: ETO-sterilizable supercap variant for ICU.
- **v2.1**: Companion patient-side wrist-LRA for two-way confirm ("I heard you, on my way").

---

## 12. Open Risks

1. Classifier robustness on supine signing vs. seated training data — mitigated by spaced 2-IMU array + supine-specific training set.
2. Predicate-device match for 510(k) — engage FDA Q-Sub early.
3. Silicone biocompat re-test if NuSil formulation changes.
4. BLE-Mesh interference in dense Wi-Fi hospital RF environment — covered by IEC 60601-1-2 testing.
5. Disposable sleeve supply chain & UDI labelling cost.
