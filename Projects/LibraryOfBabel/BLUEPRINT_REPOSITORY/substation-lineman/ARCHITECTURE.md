# substation-lineman — ARCHITECTURE

**Domain:** Electric utility HV bucket-truck DHH lineman comms
**Form factor:** Forearm tactile cuff (Class-2/3 rubber-glove compatible) + ground-crew wearable tablet
**Regulatory frame:** OSHA 1910.269 (Electric Power Generation, Transmission, and Distribution), IEEE 516-2021 (Live-Line Work), ASTM F496 (in-service electrical testing of insulating gloves/sleeves), ASTM F18 committee scope, NFPA 70E (arc flash adjacency), FCC Part 90 (Land Mobile, utility VHF).
**Mission window:** Energized line work up to 17 kV phase-to-ground (Class 2 worker rating), distribution feeders 4 kV–25 kV typical, transmission live-line approach per IEEE 516 MAD tables.

> ⚠ All part numbers and prices: **verify-before-order**. LCSC `C?????` placeholders pending vendor confirmation. ASTM F18 dielectric witness testing required before any field deployment. Not a substitute for primary protective equipment.

---

## 0. Why this exists

A 30-year substation/transmission lineman who has lost 40–60 dB across speech frequencies (cumulative exposure to transformer hum, switchgear arc, generator cooling, helicopter platform work) is told to retire or move to dispatch. The accumulated hazard-recognition skill walks out the door. Meanwhile:

- The single highest-fatality category in IBEW/NECA loss data is **inadvertent contact with energized conductor**, often during phase identification or sleeve-up.
- The ground-crew foreman shouts approach warnings to the bucket. A lineman who cannot hear the shout is exposed.
- ASL-fluent linemen exist (children of Deaf adults, late-deafened workers) but the bucket-to-ground channel is voice-only.

This cuff converts the two missing channels into tactile + visual:

1. **HV proximity → vibration pattern.** On-cuff capacitive E-field sensor reads the 60 Hz field gradient. Vibration intensity and pattern map to distance from energized conductor, well outside MAD per IEEE 516.
2. **Bucket ↔ ground ASL.** Downward-facing depth cam on the cuff watches the lineman's gloved hands signing; ground tablet renders. Ground foreman signs back on the tablet; lineman sees rendered avatar on cuff OLED or wrist HUD.

Class-2 glove envelope is **never breached**. Cuff sits over the gauntlet sleeve, not under it.

---

## 1. Block diagram (cuff side)

```
                          ┌────────────────────────────────────────────────┐
                          │           FORE-ARM CUFF (worn over             │
                          │           Class-2/3 rubber sleeve)             │
                          │                                                │
   60 Hz E-field   ──►   ┌┴┐ Cap. plate (PCB)                              │
                         │ │  ──► LMC662 unity buffer (Hi-Z)               │
                         │ │       ──► PGA (MCP6S91, 1×–32×)               │
                         │ │            ──► band-pass 45–75 Hz             │
                         │ │                 ──► ADC (MCP3564R, 24-bit)    │
                         │ │                      ──► MCU                  │
                         │ │                                               │
   AD8232-style          │ │  alt path: AFE for transient impulse          │
   front-end             │ │  detection (capacitive switching events)      │
                         │ │                                               │
   Arducam Mega 5MP ─────┤ │ SPI ──► MCU  (320×240 ROI @ 10 fps for ASL)   │
   (downward, IR-cut)    │ │                                               │
                         │ │                                               │
   IMU BNO085 ───────────┤ │ I²C ──► MCU  (arm pose, anti-false-trigger)    │
                         │ │                                               │
   6× LRA driven by      │ │ I²C ──► DRV2605L ×3 (two LRA per driver,      │
   DRV2605L array        │ │           mux'd through TS5A23159)            │
                         │ │                                               │
   VHF radio module      │ │ UART ──► CMX901 PA front-end + SA868-V        │
   136–174 MHz, 500 mW   │ │           (or RDA1846-based) ── λ/4 helical   │
                         │ │                                               │
   3.7 V 2000 mAh LiPo   │ │  ──► TPS61023 boost + TPS62840 buck rail      │
   (intrinsically        │ │       fuel gauge MAX17048                     │
   protected pouch)      │ │                                               │
                          └┬┘                                              │
                           │                                               │
                          MCU: ESP32-S3-WROOM-1 (preferred — Wi-Fi off,    │
                                BLE off in normal op, MCPWM for LRA,       │
                                LCD_CAM peripheral for Arducam)            │
                          alt: RP2040 + W5500 if hard-RT determinism       │
                                                                           │
                          OLED 0.96" SSD1306 (status), 4× tactile buttons, │
                          dead-man squeeze sensor (FSR402)                 │
                          └────────────────────────────────────────────────┘
```

## 2. Block diagram (ground side)

```
   ┌─────────────────────────────────────────────┐
   │  Ruggedized Android tablet (Samsung XCover  │
   │  Pro / Zebra ET40 / CAT T20) — IP68         │
   │                                             │
   │   USB-C ──► VHF dongle:                     │
   │             • SA868-V module                │
   │             • CMX901 PA, 500 mW             │
   │             • SAW filter (VHF utility band) │
   │             • λ/4 whip on dongle, SMA       │
   │             • CP2102N USB-UART bridge       │
   │             • LiPo backup for dongle TX     │
   │                                             │
   │   App: ASL render pipeline (MediaPipe       │
   │   Holistic on-device), waveform overlay     │
   │   of cuff E-field telemetry, MAD alarm      │
   │   mirror, foreman sign-back keyboard +      │
   │   front-cam capture for return ASL.         │
   └─────────────────────────────────────────────┘
```

---

## 3. E-field sensing chain

### 3.1 Physical sensor

Two copper pours on the **outer** layer of the cuff PCB, isolated from the inner shield by ≥ 4 mm creepage, conformal-coated with parylene-C (5 µm) and over-molded in silicone (Shore A 40). One pour acts as sense plate; the second is a driven guard fed back from the LMC662 output to cancel cable + glove capacitance drift.

- Plate area: ~ 12 cm² (per plate, 2 plates differential)
- Expected coupling: **1–10 fF** to ambient 60 Hz field
- Input bias current target: < 5 fA → LMC662 (or LMC6042 / OPA124 alt)
- Differential pair feeds an INA826 instrumentation amp, CMRR > 100 dB at 60 Hz.

### 3.2 Calibration model

Field strength at the cuff is **not** the field at the fingertip. We calibrate:

```
E_fingertip(V/m) = α · V_adc + β · (arm_extension from BNO085) + γ · (humidity from SHT41)
```

α, β, γ fitted at a utility training yard against a Greenlee-style certified FieldSense (or HD Electric LineRanger) over a 4 kV / 13.8 kV / 25 kV ladder. **No factory shipment without per-unit calibration log.**

### 3.3 Alarm thresholds (per IEEE 516 / OSHA 1910.269 Table R-6)

| Phase-to-ground (kV) | MAD (in) | Vibration mode    | LRA pattern               |
|----------------------|----------|-------------------|---------------------------|
| 0.05–0.30            | avoid contact | green     | none                      |
| 0.30–0.75            | 1' 1"    | yellow            | 1 Hz double-tap           |
| 0.75–5.0             | 2' 2"    | yellow            | 2 Hz double-tap           |
| 5.0–15.0             | 2' 4"    | orange            | 4 Hz triple-tap           |
| 15.0–36.0            | 2' 7"    | orange→red        | 8 Hz continuous + buzz    |
| 36.0–46.0            | 2' 9"    | red               | 12 Hz emergency clench    |
| > 46.0               | per 516  | red lock          | continuous max + radio TX |

Field-strength thresholds derived per-unit; voltage class table is the *user-visible mapping*, not the sensing primitive.

### 3.4 Self-test

Cuff carries a **driven test plate** on the inner shield wall — a 60 Hz square wave at 100 mV pk drives a known coupling cap. On every power-on and every 90 s in service, MCU asserts the test signal and confirms ADC sees the expected response within ±15 %. Failure → red OLED + 3 Hz alarm + radio fault report to ground tablet.

---

## 4. Mechanical / dielectric design

### 4.1 Stack-up (cuff body, fingertip-to-elbow)

```
   skin
    │
   Nomex IIIA liner            (FR base layer, sweat wick)
   Class-2/3 rubber sleeve     (Salisbury 122 series — primary insulator)
   Leather protector (ASTM F696)
   ── interface ──
   CUFF: silicone outer shell  (Shore A 40, parylene-C inner)
         internal Faraday cage (copper mesh, bonded only to MCU GND,
                                NOT to user, NOT to truck chassis)
         PCB stack (4-layer, FR-4, 1.6 mm)
         antenna chamber (PTFE block, λ/4 helical)
   nothing exposed > 2 mm² of any conductor on the outside
```

**Critical rule:** the cuff is electrically a floating Faraday'd object. Internal ground is a local star, isolated from any external surface by ≥ 4 mm + parylene + silicone. No exposed metal: USB-C charge port is recessed under a Class-2 silicone plug, and is **disabled** by hall-effect switch when the plug is removed and battery is not on dock.

### 4.2 Dielectric witness test (per ASTM F496 / F18 scope)

Pre-ship, every cuff:

1. 5-min soak, AC withstand test: **20 kV rms, 60 Hz, 1 minute, no flashover, leakage < 12 mA** (Class 2 worker rating retest envelope).
2. Lightning-impulse: 1.2/50 µs, **75 kV pk, three shots positive, three negative**, no puncture.
3. Surface-leak measurement after 24 h salt-fog (ASTM B117).

Lab pass certificate sticks inside the cuff lid, QR-linked to serial.

### 4.3 What this is NOT

- NOT a replacement for rubber gloves, sleeves, or hot-sticks.
- NOT certified for direct contact work — it is **proximity warning + comms**, worn outside the primary PPE.
- NOT to be used as an arc-flash PPE category contributor. Cuff is incidental wearable, not arc-rated.

---

## 5. RF link

### 5.1 Band

Utility VHF Land Mobile (FCC Part 90), licensed per utility's existing FCC license. Default 152–174 MHz block, NB FM 12.5 kHz channel mask, 2.5 kHz deviation, CTCSS / NAC squelch.

### 5.2 Why VHF, not Wi-Fi / LoRa / BLE

- Substation RF noise floor at 2.4 GHz is brutal (PLC carrier, transformer corona, switching transients).
- VHF penetrates the steel/concrete substation envelope and reaches the ground truck reliably at 500 mW.
- Utility already owns spectrum + repeaters.
- LoRa 915 is unlicensed and unreliable for safety-critical Tx in this environment; cannot be primary.

### 5.3 Module choice

- **Primary:** SA868-V (VHF SA868-VHF-S, 134–174 MHz, 1 W max, UART control). LCSC `C?????` verify-before-order.
- **PA front-end:** CMX901 (or SKY65111-348LF) for clean 500 mW + harmonic filter (low-pass π at 174 MHz cutoff).
- **Antenna:** λ/4 helical, base-loaded, encapsulated in PTFE block. Bondable to ground side only at RF return.

### 5.4 Protocol

Slotted ALOHA, 100 ms frame, fields:

```
[ preamble 16 b | cuff_id 24 b | seq 8 b | field_strength_mV 16 b |
  IMU_quat 64 b | ASL_frame_idx 16 b | ASL_chunk 512 b | CRC32 ]
```

ASL video stream is **NOT** transmitted full-rate over VHF. Cuff runs MediaPipe-lite on ESP32-S3 (or P4 co-processor variant), extracts 21-landmark hand pose at 10 Hz, transmits landmarks (~ 600 B/s) — well within VHF NB FM data capacity (~ 1200–4800 baud after FEC).

Ground tablet renders the avatar from landmarks. Full video is logged to cuff SD for post-incident review only.

---

## 6. Firmware

### 6.1 Tasks (FreeRTOS on ESP32-S3)

| Task          | Prio | Period   | Notes                                 |
|---------------|------|----------|---------------------------------------|
| efield_sample | 6    | 1 ms     | ADC drain, FFT bin @ 60 Hz, threshold |
| efield_alarm  | 6    | event    | drives DRV2605L pattern               |
| imu_fuse      | 4    | 10 ms    | BNO085 quat → arm geometry            |
| cam_landmark  | 3    | 100 ms   | Arducam ROI → landmark extract        |
| radio_tx      | 5    | 100 ms   | slotted ALOHA frame                   |
| radio_rx      | 5    | always   | RSSI + ground ASL ingest              |
| self_test     | 2    | 90 s     | driven plate verify                   |
| ui            | 2    | 50 ms    | OLED + button + dead-man              |
| watchdog      | 7    | 250 ms   | hardware WDT pet                      |

### 6.2 Failsafes

- Dead-man squeeze release > 5 s → cuff transmits "DOWN" packet repeatedly.
- E-field self-test fail → red lock, refuse to clear without re-dock.
- VHF link loss > 30 s → cuff continues E-field alarm locally, OLED shows "LINK LOST".
- Battery < 15 % → reduce TX to landmark+alarm only, no full ASL frames.
- IMU detects free-fall > 400 ms → "FALL" packet, ground tablet sirens.

### 6.3 OTA

Firmware OTA only via docking station on truck (USB-C through silicone plug). No over-the-air firmware — too easy to brick a cuff over noisy VHF.

---

## 7. Power budget

| Subsystem            | Avg mA @ 3.7 V | Peak mA |
|----------------------|----------------|---------|
| ESP32-S3 (Wi-Fi/BLE off) | 40         | 240     |
| Arducam Mega (10 fps ROI) | 35        | 90      |
| LMC662 + INA826 + ADC | 8             | 12      |
| BNO085               | 4              | 6       |
| OLED SSD1306         | 6              | 18      |
| DRV2605L ×3 + 6 LRA  | 12 (avg, 4 % duty) | 380 |
| VHF TX (500 mW, 10 % duty) | 90       | 800     |
| VHF RX               | 30             | 30      |
| Misc / leakage       | 6              | —       |
| **Total avg**        | **~231 mA**    | —       |

2000 mAh pouch → **~ 8.6 h** mission. Two-pouch dock + hot-swap covers a full 12 h shift. Charge: 4.2 V CC/CV at 1 A through magnetic dock (no exposed contacts when worn).

---

## 8. What we deliberately did not build

- Not a glove. Glove is Salisbury's. We don't compete; we sit over it.
- Not a hot-stick sensor. Hot-stick gets Greenlee FieldSense; this is wearable.
- Not arc-rated PPE. We don't add an arc rating claim.
- Not a replacement for ground-foreman line-of-sight; it augments.
- Not satellite/cellular. Substations eat cellular. VHF only.

---

## 9. Open risks

1. **F18 lab queue.** ASTM F18 / Kinectrics / Doble dielectric labs are backed up 4–6 months. Schedule before tape-out, not after.
2. **PA harmonic compliance.** 500 mW PA must hit FCC Part 90 emission mask; SAW + π filter sim before fab.
3. **Glove fitment.** Class-3 sleeve OD varies by manufacturer (Salisbury vs Honeywell vs Cementex). Need three-SKU cuff inner diameter or adjustable strap.
4. **DRV2605L through silicone over-mold.** LRA coupling drops ~3 dB through 4 mm silicone; verify haptic perception with IBEW DHH apprentice cohort, not on engineers.
5. **Glove inspection cycle.** Cuff must not interfere with the 6-month F496 retest of the underlying glove/sleeve. Quick-release strap required.
6. **Lithium near energized work.** Pouch must pass UL 1642 + utility internal review; some IOUs ban Li primary cells aloft. LiFePO4 alt SKU may be required.

---

## 10. Bench bring-up order

1. E-field front-end on coupon PCB at a 4 kV calibration ladder (utility training yard).
2. LMC662 + INA826 noise floor verify in shielded room.
3. Dielectric withstand on bare cuff shell (no electronics) at lab.
4. VHF link budget at 500 mW from substation yard to truck @ 200 m.
5. Full assembly F496-equivalent in-service retest at host utility.
6. IBEW DHH apprentice user trial — closed yard, de-energized first, then 4 kV training feeder.
