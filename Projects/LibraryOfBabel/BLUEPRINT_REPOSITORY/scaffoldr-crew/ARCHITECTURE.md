# SCAFFOLDR-CREW — Architecture

**Project:** Helmet-mounted DHH crane-signal comms node
**Class:** PPE-integrated wearable, ANSI Z89.1 Type II Class E hardhat clip-on
**Primary user:** Deaf / Hard-of-Hearing ironworkers, riggers, signal persons
**Operating environment:** Outdoor elevated steel, 0–95% RH, -20°C to +60°C, dust + impact

---

## 1. System Block Diagram

```
                          +--------------------------------+
                          |        HARDHAT SHELL           |
                          |   (ANSI Z89.1 Type II/Class E) |
                          +--------------------------------+
                                       |
   +-----------------------------------+-----------------------------------+
   |                                                                       |
   |  +-------------------+   +----------------+   +-------------------+   |
   |  | DEPTH / CV MODULE |   | MAIN CONTROL   |   |  COMMS / MESH     |   |
   |  | Arducam ToF B0410 |   | ESP32-S3-WROOM |   |  SX1262 LoRa      |   |
   |  | + OV9281 mono     |==>| -1 N16R8 PSRAM |==>| 868/915 MHz       |   |
   |  | (downward gimbal) |   | dual-core 240M |   | + uFL ant         |   |
   |  +-------------------+   +----------------+   +-------------------+   |
   |          |                       |                      |             |
   |          v                       v                      v             |
   |  +-------------------+   +----------------+   +-------------------+   |
   |  | OAK-D Lite (opt)  |   | DRV2605L x2    |   | BLE 5.0 (S3 int.) |   |
   |  | Myriad-X NPU      |   | LRA haptic     |   | -> phone pairing  |   |
   |  | offboard inference|   | drivers        |   |                   |   |
   |  +-------------------+   +----------------+   +-------------------+   |
   |                                  |                                    |
   |                                  v                                    |
   |                          +-----------------+                          |
   |                          | Bone-Conduction |                          |
   |                          | TX (L + R cups) |                          |
   |                          | Sanwa BTV-2008  |                          |
   |                          +-----------------+                          |
   |                                                                       |
   |  +-------------------+   +----------------+   +-------------------+   |
   |  | INMP441 MEMS mic  |   | IMU: BMI270    |   | BME280 env sensor |   |
   |  | (wind/voice flag) |   | head tilt/fall |   | (T/RH/P)          |   |
   |  +-------------------+   +----------------+   +-------------------+   |
   |                                                                       |
   |  +---------------------------------------------------------------+    |
   |  | POWER: 3.7V 3500 mAh Li-Ion 18650 + TP4056 + MCP1700 + BQ25895|    |
   |  |        Optional 50x70 mm flexible PV strip on crown (250 mW)  |    |
   |  +---------------------------------------------------------------+    |
   +-----------------------------------------------------------------------+
                                       |
                            +--------------------+
                            | USB-C (charge/OTA) |
                            | + magnetic dock    |
                            +--------------------+
```

---

## 2. Functional Overview

1. Downward-facing depth + IR camera observes the **signal person** below the crane operator's POV, or laterally observes a peer signal-giver.
2. On-device CV pipeline classifies one of ~22 standardized **ASME B30.5 crane hand signals** + 8 OSHA 1926.1422 supplemental gestures.
3. Classified signal is encoded as a 1-byte opcode + 1-byte argument + CRC8 and broadcast over a **LoRa mesh** to all helmets within ~2 km LoS.
4. Receiving helmets translate opcode → distinct **haptic pattern** (DRV2605L library + custom waveforms) delivered through bone-conduction transducers seated on the temporal bone behind each ear.
5. A small OLED on the brim (optional SKU) shows the textual gloss of the active signal.

---

## 3. MCU Choice — ESP32-S3-WROOM-1-N16R8

**Selected:** Espressif ESP32-S3-WROOM-1-N16R8 (16 MB flash, 8 MB PSRAM, dual Xtensa LX7 @ 240 MHz)

**Justification vs RP2040:**

| Criterion | ESP32-S3 | RP2040 |
|---|---|---|
| Wi-Fi/BLE on-die | Yes (BLE 5.0, Wi-Fi 4) | No (requires CYW43439) |
| Vector AI acceleration | Yes (LX7 SIMD, AI MAC extensions, ESP-DL) | No |
| PSRAM ceiling | 8 MB octal | ~8 MB QSPI add-on, slower |
| Camera DVP + LCD_CAM | Native peripheral | Bit-bang / PIO |
| TinyML benchmark (10-class CNN, 96x96 grayscale) | ~95 ms | ~480 ms |
| Power, deep sleep | 8 µA RTC | 0.4 mA dormant |
| Toolchain | ESP-IDF, Arduino, MicroPython | C SDK, Arduino, MicroPython |

**Verdict:** ESP32-S3 wins on camera ingress + on-device inference. The deep-sleep gap is acceptable because the node is awake whenever the helmet is donned (capacitive chin-strap switch).

**Alt path:** For the *premium SKU* with full neural inference, offload CV to **OAK-D Lite (Myriad-X)** and demote the S3 to fusion/comms — see §5.

---

## 4. Depth / CV Pipeline

### 4.1 Sensor selection

**Base SKU — Arducam ToF Camera (B0410)**
- Sony IMX556-class iToF, 240×180, 4 m range, 30 fps
- MIPI CSI-2 → ESP32-S3 via SC132 bridge OR direct I2C/SPI on Arducam Mega variant
- $48 ea @ 1k

**Premium SKU — Luxonis OAK-D Lite**
- OV9282 stereo + IMX214 RGB, Myriad-X 4 TOPS NPU
- USB-C / SPI host link to S3
- $149 ea @ 1k (volume), heavier (~70 g)

### 4.2 Model

- Architecture: **MobileNetV3-Small** (α=0.5) → 22-class softmax + "no-signal" reject class
- Input: 96×96 grayscale, depth-masked at 0.8–3.5 m
- Training corpus: synthetic + 4k hand-labeled clips of ASME B30.5 signals from union crane-school footage (data licensing TBD)
- Quantized INT8 (ESP-DL) → 412 KB flash footprint
- Target accuracy: >94% top-1 on held-out signaler, >99% with 3-frame temporal vote

### 4.3 Pipeline stages

```
[ToF frame] -> [depth gate 0.8-3.5 m] -> [bg subtract]
            -> [bbox crop around hands/torso] -> [96x96 resize]
            -> [INT8 MobileNetV3-S] -> [softmax]
            -> [3-frame majority vote] -> [opcode emit]
```

Inference budget: 95 ms + 18 ms preprocessing = **113 ms end-to-end**, well under the 333 ms target (3 Hz signal cadence).

---

## 5. Haptic + Bone-Conduction Audio Path

### 5.1 Transducer

- **Sanwa BTV-2008** bone-conduction transducer pair (8 Ω, 0.5 W, 200 Hz–10 kHz)
- Mount: silicone temple pads on the helmet suspension web, sprung against mastoid process
- Drive: PAM8302A class-D amp (Mono) per channel, fed by ESP32-S3 I2S DAC

### 5.2 Haptic driver

- **TI DRV2605L** (I2C, ROM-library + custom waveform mode)
- Two LRAs (Vybronics VLV101040A, 175 Hz) — one each temple
- Why two: encode signal **directionality** (left LRA = "swing left", right LRA = "swing right", both = "stop")
- Library: 28 custom waveforms loaded into S3 PSRAM, streamed via DRV2605L real-time-playback mode

### 5.3 Signal → haptic encoding

| ASME signal | Haptic L | Haptic R | Bone-conduction tone |
|---|---|---|---|
| Stop | 3× sharp 50 ms pulse | 3× sharp 50 ms pulse | 440 Hz 200 ms |
| Emergency Stop | 5× sustained 100 ms | 5× sustained 100 ms | 880 Hz 500 ms |
| Hoist | ramp up 200ms | ramp up 200ms | rising 200–600 Hz |
| Lower | ramp down 200ms | ramp down 200ms | falling 600–200 Hz |
| Swing left | strong continuous | silent | left-pan tick |
| Swing right | silent | strong continuous | right-pan tick |
| Boom up | double-pulse | double-pulse | 440 Hz dyad |
| Dog everything | slow throb 1 Hz | slow throb 1 Hz | 220 Hz pulse |

---

## 6. LoRa Mesh Design

### 6.1 Radio

- **Semtech SX1262** (Class E PA, +22 dBm, ISM 868/915 MHz region SKU)
- Antenna: Linx ANT-916-CW-RAH right-angle helical (or Molex 47950-0001 PCB trace alt)
- Range target: 2 km LoS site-wide, 600 m through one steel structure

### 6.2 Protocol

- **Meshtastic-compatible firmware fork** OR custom thin-MAC:
  - PHY: SF8, BW 250 kHz, CR 4/5 → ~9 kbps effective, ~80 ms airtime per 12-byte signal frame
  - Duty cycle: <1% (FCC §15.247 / ETSI EN 300 220)
  - Frame: `[preamble][syncword][src_id:2][dst_id:2][opcode:1][arg:1][ttl:1][hmac:4][crc16:2]`
- Mesh: AODV-lite, 3-hop max, signal-person → all helmets within crew
- Latency budget: 113 ms inference + 80 ms TX + 80 ms RX-decode + 30 ms haptic kick = **303 ms perceived end-to-end**

### 6.3 Channel hygiene

- Listen-before-talk on emergency frames
- **Emergency Stop opcode (0xFE)** preempts queue and is rebroadcast by every receiving node (flood)
- Per-site network key, rotated weekly via crew-lead's phone app

---

## 7. Power Budget

### 7.1 Cell

- 1× 18650 Li-Ion, 3500 mAh nominal, Panasonic NCR18650GA (or LCSC equiv.)
- Held in vibration-rated holder (Keystone 1042), aft of helmet crown
- Charge: TI **BQ25895** 5 A buck (USB-C PD 9 V 2 A) — fast-charge 80% in 50 min
- Fuel gauge: **MAX17048G+T10** (I2C, on PCB)

### 7.2 Rails

| Rail | Source | Load | Notes |
|---|---|---|---|
| +5 V | TPS61088 boost | Cameras, PAM8302A | 1.5 A peak |
| +3.3 V (MCU) | MCP1700-3302E | ESP32-S3, sensors | 250 mA avg |
| +3.3 V (RF) | XC6210B332MR-G | SX1262 PA | isolated rail |
| +1.8 V | TLV62568 buck | DRAM/PSRAM (if used externally) | — |

### 7.3 Consumption

| State | Current @ 3.7 V | Hours on 3500 mAh |
|---|---|---|
| Active CV + occasional TX | 180 mA | 19.4 h |
| RX-only listening | 22 mA | 159 h |
| Deep sleep (charging dock) | 0.05 mA | months |

**Shift target: 12 h continuous, 10-hr safety margin → met.**

### 7.4 Energy harvesting (optional)

- Flexible PV: Powerfilm SP3-37 (50×70 mm, ~250 mW peak)
- Buck-boost: SPV1040 MPPT into the battery via BQ25895 VBUS path
- Realistic harvest on a high-iron job site: **~1.2 Wh/day**, extends runtime by ~25%

---

## 8. Mechanical

### 8.1 Hardhat compatibility

- Targets ANSI Z89.1-2014 Type II (top + lateral impact) Class E (electrical) hardhats: **MSA V-Gard 930, Honeywell Fibre-Metal E2, 3M SecureFit X5000**
- Mount: GoPro-style 3-prong + ratchet, bonded with **3M VHB 5952** to crown OR clipped onto accessory slots (industry-standard 30 mm slot)

### 8.2 Enclosure

- Crown pod (electronics + battery): ABS+PC blend, IP65, 95×60×28 mm, ~140 g
- Camera pod (front brim): aluminum 6061 housing, IP67, 45×35×30 mm, gimbal ±15° tilt
- Total added mass: **295 g** — under OSHA-recommended 1.5 lb (680 g) accessory load

### 8.3 Cabling

- Crown ↔ brim: 6-conductor TPU-jacketed cable through helmet suspension channel, JST-GH 1.25 mm connectors
- Temple haptic + bone-conduction: PVC-jacketed 4-cond ribbon, terminated in MX-1.25 board-to-wire

### 8.4 Compliance targets

- **OSHA 1926.100** head protection compatibility
- **ANSI Z87.1** if combined with face shield SKU
- **FCC Part 15 / IC RSS-247** (LoRa)
- **IEC 62133-2** battery cert
- **IP65** ingress

---

## 9. Firmware State Machine

```
            +------------------+
            |    BOOT/POST     |
            +--------+---------+
                     | self-test OK
                     v
            +------------------+
            |   PAIR (BLE)     |<------- phone provisions site key
            +--------+---------+
                     | key loaded
                     v
            +------------------+      no helmet on (chinstrap open)
   +------->|     STANDBY      |---------------------+
   |        +--------+---------+                     |
   |                 | chinstrap closed              |
   |                 v                               |
   |        +------------------+                     |
   |        |   RX-ONLY IDLE   |                     |
   |        +--------+---------+                     |
   |                 | role==signaler                |
   |                 v                               |
   |        +------------------+                     |
   |        |   CV ACTIVE      |                     |
   |        |   (camera on)    |                     |
   |        +--------+---------+                     |
   |                 | gesture classified            |
   |                 v                               |
   |        +------------------+                     |
   |        |   TX MESH FRAME  |                     |
   |        +--------+---------+                     |
   |                 |                               |
   |                 v                               |
   |        +------------------+                     |
   +--------|   HAPTIC PLAY    |                     |
            +--------+---------+                     |
                     | timeout / chinstrap open      |
                     +-------------------------------+
                                     |
                                     v
                          +--------------------+
                          | FAULT / LOW-BATT   |---> red LED + vibrate SOS
                          +--------------------+
```

**Special states:**

- `EMERGENCY_FLOOD`: any received 0xFE preempts; rebroadcasts twice, plays max-amplitude haptic, latches until cleared by crew lead opcode 0x01.
- `OTA`: only entered when docked AND USB-C link AND signed firmware blob present.
- `MAN_DOWN`: BMI270 detects fall (>3 g shock then <0.5 g free-fall residual then horizontal 30 s) → auto-broadcasts 0xFD with helmet ID.

---

## 10. OTA & Security

- ESP-IDF **secure boot v2** + **flash encryption** (AES-256-XTS)
- Signed firmware: ECDSA P-256 (per-fleet key, rotated annually)
- OTA delivery: signed `.bin` over USB-C in dock OR over BLE GATT from crew-lead app
- Network layer: per-site 128-bit AES-CCM on every LoRa frame; HMAC-SHA256(trunc 32-bit) integrity
- No backdoor; recovery requires physical jig + manufacturer key (held in HSM)
- Audit log: rolling 4 MB ring buffer of opcodes (timestamp + src + decoded label) in flash, exportable on dock

---

## 11. PCB / Manufacturing Notes

- 4-layer FR-4, 1.6 mm, ENIG finish, controlled-impedance 50 Ω on RF traces
- Stack-up: SIG / GND / PWR / SIG (RF + crystal isolated on top, GND floods)
- JLCPCB Standard Assembly (≤700 placements), bottom-side hand-finish for SX1262 shielding can + battery holder
- Panelize 2-up with mouse-bites; v-score on the camera daughtercard
- Pi/T LC filters on every external interface; TVS on USB-C (USBLC6-2SC6)

---

## 12. Open Engineering Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | Bone-conduction efficacy varies by skull/hair/PPE liner | Provide gel pads + adjustable spring tension; clinical validation with NIDCD partner |
| 2 | CV false-positive on unrelated arm motion (e.g. waving for water) | Reject class + temporal vote + "intent" wake-gesture |
| 3 | LoRa duty-cycle limits in EU 868 band | Move emergency frames to G3 (869.4–869.65 MHz, 10% allowed) |
| 4 | Helmet-mass fatigue after 8 h | Counter-balance battery aft of crown; field study with IUOE Local 14 |
| 5 | Crane EMI at boom tip | Ferrite beads on all I/O; shielding can over RF; FCC Part 15B pre-scan early |
| 6 | DHH users without prior haptic training | 30-min onboarding module + practice mode |

---

## 13. Bring-Up Plan

1. **Week 1–2:** ESP32-S3 dev kit + Arducam ToF, train MobileNetV3-S on public ASL + synthetic crane-signal corpus
2. **Week 3–4:** SX1262 breakout, mesh stack port from Meshtastic
3. **Week 5–6:** Haptic + bone-conduction breadboard, psychometric study (n=8 DHH, n=8 hearing)
4. **Week 7–10:** Rev-A PCB, JLCPCB SMT, hand assembly of 10 prototypes
5. **Week 11–14:** Field trial with one rigging crew (NDA, IRB-equivalent), iterate
6. **Week 15–20:** Rev-B with FCC/IC pre-scan, IP65 enclosure tooling
7. **Month 6–9:** Pilot 100 units, OSHA + ANSI cert
8. **Month 10–12:** Production run 1k, channel launch

---

## 14. Test & Validation

- **EMC:** FCC Part 15 Subpart B (unintentional) + Subpart C (intentional, LoRa, BLE)
- **Drop:** ANSI Z89.1 Type II — top + side impact with accessory installed
- **Environmental:** MIL-STD-810H 506.6 rain, 510.6 dust, 501.6 high-T, 502.6 low-T
- **Battery:** IEC 62133-2 + UN 38.3 transport
- **Usability:** Task-completion-time vs voice-radio baseline, both DHH and hearing crews
- **Long-haul:** 90-day on a live jobsite (target: zero safety-critical false-negative on Stop)

---

## 15. BOM Summary (See PRODUCTION_BOM.csv)

~34 line items. Target BOM-at-1k ≈ $182. See ROI_ANALYSIS.md.
