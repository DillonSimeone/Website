# GripLogic ATEX — Architecture Blueprint

**Elevator:** An output-only electrotactile work glove for ATEX Zone 1 petrochemical operators that translates DCS alarm states into ASL-morphology fingertip pulse patterns, giving deaf and hearing workers a hands-free, eyes-free, hearing-independent alarm channel.

---

## Problem Statement

Petrochemical refineries and chemical processing plants run continuous operations in Zone 1 explosive atmospheres where a single missed alarm can escalate to a fatality. Current alarm delivery relies on audible horns (masked by PPE, background noise, hearing loss), visual strobes (obscured by equipment, fog, operator orientation), and radio voice (requires undivided attention, language barriers). Deaf and hard-of-hearing operators are structurally excluded from the primary alarm channel — a direct ADA and EU equality compliance gap that plant safety managers cannot paper over.

The target user is the front-line process operator: someone wearing FR Nomex coveralls, bump cap, hearing protection, and chemical-resistant gloves who is physically moving through a congested plant floor handling manual valve operations or sampling tasks. This person cannot look at an HMI panel. They cannot hear a horn through foam earplugs and a full-face respirator. They need a channel that requires zero divided attention and zero dexterity — an alarm that arrives at the skin and is instantly decoded by trained muscle memory.

Vibrotactile wristbands exist (Neosensory, etc.) but carry no semantic structure beyond a simple buzz or pattern. GripLogic maps each alarm class onto the handshape morphology of American Sign Language — the fingertip electrode activation sequence for a FIRE alarm literally traces the ASL "F" handshape across the palm in electrotactile pulses. After 2-3 hours of training, operators report immediate subconscious recognition because the pattern is already stored as a motor/sensory unit in anyone with ASL familiarity, and is learnable by non-signers through short spaced-repetition sessions (similar to Braille training curves).

The system is output-only: the glove carries no microphone, no camera, no operator input switch. Alarm data flows one-way from the plant DCS through an IS-certified RF bridge to a belt-mounted controller to the glove. This unidirectional architecture dramatically simplifies the ATEX intrinsic-safety certification path because there are no user-actuatable switching events on the hazardous-area side that could produce sparks.

---

## System Block Diagram

```
  PLANT CONTROL NETWORK (Safe Area)
  ┌─────────────────────────────┐
  │  DCS / Safety PLC           │
  │  (Honeywell Experion /      │
  │   Emerson DeltaV / ABB 800xA│
  └────────────┬────────────────┘
               │ Modbus TCP / OPC-UA (LAN)
               ▼
  ┌─────────────────────────────┐
  │  IS Gateway / Field Bridge  │  ← Safe-area side, IS barrier board
  │  WirelessHART AP or         │    (Zener/galvanic isolator on power)
  │  IS 868 MHz proprietary TX  │
  └────────────┬────────────────┘
               │ IS RF link (WirelessHART 2.4 GHz or 868 MHz, ≤10 mW ERP)
               ▼  (Zone 1 boundary)
  ┌─────────────────────────────┐
  │  BELT-PACK IS CONTROLLER    │  ATEX Ex ia IIC T4 enclosure
  │  MCU: STM32L4 (ultra-low    │  IS-certified Li-Ion pack
  │  power Cortex-M4)           │  Zener barriers on all I/O
  │  WirelessHART modem or      │
  │  IS 868 RF module           │
  └────────────┬────────────────┘
               │ IS flex cable (current-limited, ≤25 mA per conductor)
               ▼
  ┌─────────────────────────────┐
  │  GLOVE FLEX PCB             │  Kapton substrate, FR Nomex shell
  │  HV boost converter         │  Max electrode voltage: ±50 V
  │  (IS-current-limited)       │  (below IS spark-energy threshold)
  │  4×4 electrode mux IC       │
  │  16× AgCl surface electrodes│
  └─────────────────────────────┘
```

---

## Subsystem Breakdown

### Belt-Pack IS Controller

**MCU: STM32L432KC** (ST Microelectronics, UFQFPN32 package).
Selected for its ultra-low active current (100 µA/MHz), 256 KB flash sufficient for the full ASL pulse library, hardware AES-128 for alarm authentication, and availability in ITAR-free supply chain. The MCU runs at 4 MHz during idle polling, boosting to 32 MHz during a pattern-drive event. Total MCU active power during alarm playback: ~3.2 mW. The enclosure is a GRP (glass-reinforced polyester) IP66/IP67 box rated for Zone 1, Ex ia IIC T4 — IIC covers hydrogen, the most stringent group. A surface-mount IS Zener barrier array (MTL787+ or equivalent) clamps all glove cable conductors to safe voltage and current before they leave the enclosure. A supervisory watchdog (STWD100) resets the MCU on lockup and logs the event to a 2 MB SPI flash chip for post-incident download. Belt clip and carabiner loop on enclosure exterior; total belt-pack mass target: 280 g including battery.

### IS RF Channel

**Primary option: WirelessHART (IEC 62591)** — already deployed in most major refineries on the same 2.4 GHz DSSS/FHSS mesh as field instrument networks. GripLogic subscribes to alarm multicast groups from the existing WirelessHART AP; no new RF infrastructure needed in plants already on WirelessHART. The onboard modem is a **Dust Networks (Silicon Labs) MGM210L** WirelessHART module, which is pre-certified IS (ATEX Ex ia IIC) at module level, dramatically reducing the belt-pack cert scope. Maximum OTA data rate required: <1 kbps for alarm state telemetry.

**Secondary/fallback: IS 868 MHz proprietary** using a **SPIRIT1** (ST) sub-GHz transceiver running at 10 mW ERP, IS-certified per EN 60079-11 via a Zener barrier supply. This path is preferred in greenfield sites or where WirelessHART mesh density is insufficient. One IS 868 base station per ~500 m radius covers most process units.

### Electrotactile Driver

Electrotactile stimulation requires brief (200–500 µs) biphasic charge-balanced pulses at 10–80 V to overcome skin impedance (1–100 kΩ depending on hydration and callusing). Two ICs drive the array:

1. **HV Boost: LT3571 (Analog Devices)** — piezo/electrotactile boost converter, adjustable 10–80 V output, 1.5 A peak switch, operates from 3.7 V Li-Ion. IS current compliance achieved by series resistor network (R_limit per electrode = 2 kΩ, caps maximum electrode current to 25 mA at 50 V). The LT3571 is not natively IS-rated; it operates inside the IS enclosure on the belt-pack, with only the current-limited output conductors crossing into the glove. This topology keeps high-voltage generation inside the certified belt-pack and routes only safe current to the hazardous-area glove.

2. **Electrode Mux: MAX14661 (Maxim/Analog Devices)** — 16-channel analog switch, ±50 V analog bus capability, SPI control, Ron < 100 Ω. The MCU sequences electrode pairs via SPI to produce the handshape pattern timing sequences. Two MAX14661 ICs in cascade cover all 16 electrodes plus ground return.

### Glove Flex PCB

**Substrate:** 50 µm Kapton HN polyimide, single-layer copper (35 µm), ENIG finish. Flex routed from wrist connector down each finger in three branches. Electrode pads: 8 mm diameter AgCl-coated copper (16 pads, 4×4 grid across palm and proximal phalanges). AgCl coating reduces DC offset and improves charge injection safety.

**Glove shell:** FR Nomex IIIA fabric outer layer, 4.5 oz/yd² weight, Arc Rating = 8 cal/cm² (ATPV), meets NFPA 70E Category 1. Inner layer is a thin nitrile chemical-splash barrier. Flex PCB is laminated to the inner surface of the palm panel and sewn in with non-conductive Nomex thread. Wrist connector: Omnetics NPD-9-AA-GS nano circular connector (9-pin, IP67, rated to 125°C); cable is a 9-conductor shielded IS flex loom, maximum 1 m length.

Glove is sized S/M/L/XL; the flex PCB electrode pitch scales 15% between sizes to maintain palm coverage. Glove is wash-cycle-rated to 25 industrial laundry cycles; flex PCB is encapsulated with conformal coating (Humiseal 1A33) to survive detergent exposure.

### Power — IS Battery

**Cell:** Ultralife UBBL10-I IS-certified Li-Ion cylindrical cell (26650 format), 4.9 Ah, rated for ATEX Ex ia IIC. IS approval covers the cell, not just a protection circuit — essential for Zone 1. Pack configuration: 1S1P (single cell, 3.6 V nominal). Pack PCB includes: IS-rated PTC resettable fuse (200 mA hold), IS Zener clamp (5.1 V), and a MAX17048 coulomb counter for SOC readout via I2C to MCU.

Charging is performed outside Zone 1 only (Ex ia rules forbid in-zone charging of this pack class without additional certification). Magnetic pogo-pin IS-rated charge port on belt-pack underside. Estimated runtime: 14 hours continuous monitoring (typical alarm frequency < 2 per shift). Full recharge: 3 hours at 1A CC/CV from IS charger dock at safe-area locker.

### Mechanical / FR Shell

Belt-pack enclosure: ATEX-rated GRP box (e.g., Weidmuller KLIPPON TK series modified), IP66/IP67, stainless steel M4 fasteners with anti-tamper Torx heads. A silicone gasket seals the lid; cable glands are IS-rated (Hawke 501/453/A2 or equivalent). Operating temperature: -20°C to +55°C (T4 surface temp limit = 135°C; worst-case enclosure external surface measured at +62°C in summer desert ambient — within T4). Glove shell: Nomex as above. Drop test: 1.5 m onto concrete (IEC 60068-2-31). Enclosure color: safety yellow RAL 1023 with retroreflective "GripLogic ALARM" label.

---

## Power Budget

| Rail / Load              | Typical (mW) | Worst Case (mW) |
|--------------------------|-------------|-----------------|
| STM32L432 @ 4 MHz idle   | 1.5         | 3.2 (32 MHz)    |
| WirelessHART modem RX    | 18          | 45 (TX burst)   |
| IS 868 RF (alt)          | 12          | 34 (TX)         |
| LT3571 HV boost (alarm)  | 0 (idle)    | 85 (all 16 ch)  |
| MAX14661 mux (×2)        | 0.4         | 1.2             |
| MAX17048 coulomb counter  | 0.6         | 0.6             |
| MCU flash + SPI          | 0.3         | 1.0             |
| Quiescent leakage, barriers | 2.0      | 4.0             |
| **TOTAL**                | **~35 mW**  | **~174 mW**     |

Battery capacity at typical: 4.9 Ah × 3.6 V = 17.6 Wh → ~500 hours. Derated to 14 hours accounting for alarm bursts (2 min/hour at worst-case power), coulombic efficiency 0.92, end-of-life capacity 80%.

---

## Compliance

| Standard            | Requirement                                    | Status         |
|---------------------|------------------------------------------------|----------------|
| ATEX Directive      | 2014/34/EU, Ex ia IIC T4 Gb                   | Design target  |
| IECEx               | IEC 60079-0, -11 (intrinsic safety)            | Design target  |
| EN 60079-11         | IS energy limits (< 20 µJ in IIC group)        | Zener + R limit|
| IEC 62591           | WirelessHART protocol                          | Module-level   |
| NFPA 70E            | Category 1 FR arc flash (8 cal/cm²)           | Nomex shell    |
| EN 11612            | FR protective clothing (A1, B1, C1)            | Nomex shell    |
| IP66 / IP67         | IEC 60529 ingress protection (belt-pack)       | Enclosure spec |
| IEC 60068-2-31      | Drop test 1.5 m                                | Mechanical req |
| FCC Part 15 / ETSI  | RF emissions (WirelessHART / 868 MHz)          | Module-level   |
| IEC 61508 SIL2      | Functional safety alarm delivery (aspirational)| Phase 2        |

---

## Firmware Architecture

**RTOS:** FreeRTOS on STM32L432. Three tasks:

1. **RF Listener Task** (highest priority): polls WirelessHART modem via SPI; parses HART PDU for alarm class and severity; pushes alarm event to xQueue.
2. **Pattern Engine Task** (medium priority): dequeues alarm event; looks up ASL pulse pattern from flash-resident pattern library; drives LT3571 enable and MAX14661 channel select via SPI at timed intervals.
3. **Supervisory Task** (low priority): updates SOC via MAX17048, logs events to SPI flash, monitors inter-alarm intervals for storm detection (suppresses repeat patterns > 3/min to avoid sensory overload).

**ASL-Handshape Pulse Pattern Library:**
Stored as a compact binary array in flash. Each entry: `{alarm_id: u8, num_steps: u8, steps[16]: {electrode_mask: u16, duration_us: u16, amplitude_dac: u8}}`. The electrode mask selects which of the 16 electrodes fire simultaneously; duration and amplitude encode pulse width and intensity.

| Alarm Class | ASL Letter | Pattern Description                               | Steps |
|-------------|------------|---------------------------------------------------|-------|
| FIRE        | F          | Thumb + index + middle pinch cluster, then spread | 6     |
| EVAC        | E          | All four fingertips sequential sweep              | 5     |
| MEDIC       | M          | Index+middle+ring over thumb, triple pulse        | 4     |
| GAS (toxic) | G          | Index horizontal sweep + thumb lateral            | 5     |
| SPILL       | S          | Fist-pulse (all palm electrodes simultaneous)     | 3     |
| GENERAL     | A          | Thumb-side pulse, single long duration            | 2     |

Repeat cadence: each alarm pattern plays 3 times at 1-second inter-pattern gap, then holds until DCS clears the alarm. Severity escalation doubles amplitude (within IS limits) for critical vs. warning level.

---

## Top 5 Risks and Mitigations

1. **Skin Impedance Variability** — Electrode-skin contact resistance varies 10:1 between dry/calloused hands and sweaty/hydrated skin. Mitigation: constant-charge-per-pulse architecture (current-source topology with feedback to LT3571); automatic amplitude calibration during a 10-second self-test at glove don; AgCl electrodes reduce DC offset polarization.

2. **IS Certification Timeline and Cost** — Full ATEX Ex ia certification for a novel mixed-signal device (IS, HV boost, RF) can take 18–36 months and $150–400K through a Notified Body (SGS, TÜV SÜD, Baseefa). Mitigation: use pre-certified modules (MGM210L WirelessHART, Ultralife cell) to limit certification scope to the belt-pack PCB and enclosure assembly; pursue IECEx mutual recognition simultaneously to cover EU + global.

3. **ASL Pattern Learning Curve** — Non-deaf operators may not achieve reliable recall without structured training. Mitigation: mandatory 2-hour onboarding simulation (paired laptop trainer app); quarterly refresher drill built into plant PTW (permit-to-work) system; pattern set limited to 6–8 to stay within working-memory limits.

4. **RF Channel Contention / Latency** — WirelessHART mesh can have up to 500 ms latency under high network load. Mitigation: configure alarm subscription as high-priority HART message class; worst-case glove delivery target = 2 seconds from DCS alarm trigger (well within alarm response time requirements per IEC 61511); 868 MHz fallback path has <200 ms latency.

5. **Glove Donning Compliance** — Operators may remove gloves during hot/humid work, negating the alarm channel. Mitigation: belt-pack supervisory task detects open-circuit on glove connector and triggers a belt-pack vibration motor (IS-rated, 3V coin motor inside enclosure) to alert the operator that they are unprotected; supervisor dashboard shows glove-worn telemetry via WirelessHART backhaul.
