# ParaShield Aqua — Architecture

**Elevator pitch:** A 100 m-depth-rated, custom-fit bone-conduction earpiece with temple haptic that delivers vibrotactile Morse-ASL and preset-alert messages to DHH SCUBA divers and hyperbaric rescue teams, where no audio or RF link can reach.

---

## Problem Statement

Underwater communication is an unsolved problem for three distinct user populations who share one constraint: standard acoustic voice comms are either physically inaccessible or physiologically useless to them.

**Deaf recreational diver.** An estimated 1–3 % of certified sport divers have moderate-to-profound hearing loss. Commercially available dive communication devices — wired full-face-mask UW audio (Aquacom STX-101, Ocean Technology Systems DESCO), or acoustic modems (EvoLogics, LinkQuest) — require usable hearing. Hand signals suffice for planned dives but break down in low-visibility water, silt-out, night dives, or when a buddy is out of visual range. A Deaf diver cannot hear a tank-bang, a surface-tender whistle, or a distress signal from a flooded regulator first stage. There is no wearable device that delivers coded tactile messages to a deaf diver's body in a form readable without visual attention.

**Hearing diver under a thick hood.** Neoprene hoods at 7 mm or greater attenuate bone-conducted ambient sound significantly. In cold water (North Sea, Pacific Northwest) or commercial saturation diving, divers wear full-head dry-suit hoods that essentially occlude both air conduction and surface bone-conduction landmarks. A bone-conduction transducer mounted directly against the mastoid region bypasses soft-tissue attenuation and delivers a high-SNR signal even under 7 mm neoprene.

**Commercial pearl and clam diver (high ambient noise).** Surface-supplied commercial divers operating near vessel thrusters, dredges, or in surge zones face ambient noise levels that mask any auditory alert. A surface tender monitoring gas supply or bottom time needs a reliable one-way alert channel to the diver's body that does not depend on the diver watching a wrist console. A vibrotactile pulse — distinct, non-maskable by water noise — delivered through the mastoid region is recognizable even during physical exertion.

For all three populations, Bluetooth and acoustic radio are unusable at operational depths: 2.4 GHz RF penetrates water only millimeters, and acoustic modem bandwidth is too low for real-time fine-grained communication. The only viable physical layer for a wearable with no umbilical is inductive or direct-wire.

---

## System Block Diagram

```
SURFACE TENDER / SURFACE UNIT
┌────────────────────────────────────────────────────────────┐
│  Tablet/phone app  ──NFC──▶  ParaShield Topside NFC tag    │
│  (preset library,           (update message store          │
│   Morse alphabet)            before dive)                  │
│                                                            │
│  Umbilical conductor pair ──────────────────────────────── ▶─┐
│  (20 V, 100 mA max, 2-wire)                                  │
└──────────────────────────────────────────────────────────────┘
                                                               │
                          ┌────────────────────────────────────┘
                          ▼
IN-EAR UNIT (100 m depth rated)
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│  ┌──────────────┐     ┌────────────────────┐     ┌─────────────┐  │
│  │  NXP NTAG    │     │  MCU               │     │  BCT-2      │  │
│  │  I2C Plus    │────▶│  PIC18LF / M0+     │────▶│  Transducer │  │
│  │  NFC tag     │     │  (coordinator)     │     │  (mastoid)  │  │
│  └──────────────┘     │                    │     └─────────────┘  │
│                       │  ┌──────────────┐  │                      │
│  ┌──────────────┐     │  │ Vibrotactile │  │     ┌─────────────┐  │
│  │  60 mAh LiPo │────▶│  │ pattern FSM  │  │────▶│  LRA temple │  │
│  │  + WPT coil  │     │  └──────────────┘  │     │  (Jinlong   │  │
│  └──────────────┘     │                    │     │   FF-M10)   │  │
│        ▲              │  ┌──────────────┐  │     └─────────────┘  │
│        │              │  │ Umbilical Rx │  │                      │
│  ┌─────┴────────┐     │  │ (UART/PWM)  │  │                      │
│  │ WPT Rx       │     │  └──────────────┘  │                      │
│  │ (Qi-like,    │     └────────────────────┘                      │
│  │  silicone    │                                                  │
│  │  gasket)     │                                                  │
│  └──────────────┘                                                  │
│                                                                    │
│  Shell: Formlabs BioMed Amber, parametric fit, oil-fill chamber    │
└────────────────────────────────────────────────────────────────────┘
```

---

## Subsystem Breakdown

### MCU — PIC18LF vs. ARM Cortex-M0+

Two candidates are evaluated at the architecture level:

**Microchip PIC18LF47Q10** operates at 1.8–5.5 V, draws ~35 µA/MHz active and ~50 nA in deep sleep, and comes in a 7 x 7 mm QFN-40. Its hardware I2C, SPI, and one UART are sufficient for the NFC tag bridge, LRA driver, and BCT driver. PIC18 has a well-understood bare-metal toolchain (MPLAB X + XC8), no OS overhead, and a large installed base in medical device firmware. The constraint is 128 KB flash and 8 KB RAM, which is adequate for the 12-preset library + Morse table in PROGMEM.

**Nordic nRF52805 (Cortex-M0+, 64 MHz, 192 KB flash, 24 KB RAM)** is the alternative. It includes a 2.4 GHz radio that is explicitly disabled (no antenna placed, RF pad left open) to eliminate regulatory complexity, reducing it to a pure M0+ compute + I2C/SPI host. It draws ~1 mA active at 16 MHz and ~1.5 µA in System-OFF. Zephyr RTOS 3.x supports it with a device-tree model that simplifies porting; however, Zephyr's minimum footprint (~60 KB) consumes a third of flash before any application code.

**Decision guidance:** For a single-function device with a fixed pattern library, PIC18LF is preferred — smaller silicon, lower sleep current, no RTOS attack surface. M0+ is preferred if future firmware OTA over USB-C umbilical is desired, given superior DFU toolchain support.

### Bone-Conduction Transducer + Driver

The **B&B Acoustic BCT-2** (or equivalent PUI Audio BCT-03 class) is a 16 Ω, ~150 mW continuous bone-conduction transducer in a 20 x 14 x 6 mm form factor. It is mounted directly against the mastoid via a silicone-backed press-fit pocket in the shell. The BCT-2 requires a Class-D amplifier capable of bridged output into 16 Ω.

**TI TPA2005D1** (Class-D, 1.4 W into 8 Ω at 5 V, 1.4 mm² CSP) is the named driver. At 3.3 V / 16 Ω (BCT-2 load), output power is approximately 200 mW, which provides 3–6 dB headroom above the minimum 80 mW needed for effective mastoid stimulation through 5 mm neoprene (per published bone-conduction threshold data from audiological literature). Quiescent current is 3.5 mA with shutdown at 0.06 µA. The TPA2005D1 is available in a 2 x 2 mm chip-scale package and operates to 105 °C, well above any hyperbaric exposure.

PWM patterns generated by the MCU timer are fed directly to the SD/IN pin; no DAC is required. Alert pulses are 50–200 ms bursts with 10–80 ms inter-pulse gaps encoding Morse elements.

### Inductive Charging Through Silicone Gasket

Inductive charging was selected over magnetic-pogo contacts because a zero-break sealed surface eliminates the most common pressure-vessel failure mode: connector O-ring fatigue. The coil pair spans a 3 mm silicone gasket wall.

**Texas Instruments BQ51003** (5 V / 1 A Qi-compatible receiver, 3 x 3 mm SON-8) receives up to 500 mW through the gasket wall. At a 3 mm ferrite-free silicone gap, coupling efficiency drops to ~40–50 %, yielding ~200 mW at the receiver — sufficient to charge a 60 mAh cell in under 30 minutes at surface. A **WR483030-3M3** planar receiver coil (Würth Elektronik, 15 mm OD, 3 mm z-height) fits within the heel of the shell.

The charge controller is the **MCP73831T** (Microchip, 500 mA LiPo charge IC, SOT-23-5) with an RPROG resistor setting the termination current. Thermal cutoff is provided by an **NTC thermistor (Murata NCP15WF104E03RC)** read by the MCU ADC; charging is suspended when die temperature exceeds 45 °C, a condition that can arise in hyperbaric chambers above 30 °C water temperature.

### NFC Pairing

Bluetooth at 2.4 GHz is electrically invisible below 1 m of salt water. All pre-dive configuration and alert-preset upload uses **NXP NTAG I2C Plus (NT3H2111)** — a dual-interface NFC tag that also exposes a 400 kHz I2C bus to the MCU. The user's phone writes a NDEF message containing up to 12 preset slots (4-byte identifiers) and a custom vibrotactile sequence map to the tag's 1 KB EEPROM before the dive. The MCU reads the tag over I2C on power-on and loads the preset table into SRAM.

No active NFC transceiver is placed in the in-ear unit; the NTAG I2C Plus is purely a passive tag powered by the phone's NFC field. This eliminates a 30–80 mA NFC front-end from the power budget.

### Shell Parametrization

The shell is manufactured per-user. The user photographs their ear canal and mastoid region using a guided AR scan flow (iPhone LiDAR or structured-light Android equivalent) producing a 0.3 mm-resolution point cloud. A parametric OpenSCAD model (alternatively Fusion 360 API) accepts landmark inputs — mastoid boss radius, tragus offset, canal depth — and generates a watertight STL with:

- 0.5 mm shell wall minimum (BioMed Amber minimum feature resolution: 0.3 mm)
- Snap-fit BCT-2 pocket with 0.3 mm clearance for silicone pad
- Oil-fill fill-port (1 mm dia., Loctite 565 thread seal) on the posterior face
- Inductive coil recess at the heel
- Temple haptic LRA pocket, press-fit in BioMed Amber pocket

**Formlabs BioMed Amber** resin meets ISO 10993-5 (cytotoxicity), ISO 10993-10 (sensitization), and USP Class VI standards per Formlabs Form 3B+ validation data. It is approved for prolonged skin contact (>24 h), making it appropriate for extended saturation dive exposure. Post-cure: 405 nm / 60 °C / 60 min per Formlabs protocol.

### Pressure Compensation — Oil Fill

At 100 m seawater depth, ambient pressure is approximately 11 bar (160 psi). Without pressure compensation, a sealed air void exerts a net inward force of ~110 N on a 10 cm² cavity, risking shell delamination and solder-joint fatigue. The electronics cavity is flooded with **Dow Corning DC-200 (5 cSt)** polydimethylsiloxane oil — dielectrically inert, biocompatible at the gasket boundary, and pressure-transparent. The BCT-2 transducer operates normally in oil; bone-conduction transducers are acceleration-coupled and do not require air coupling. The PCB is conformally coated with **Dymax 9008** UV-cure conformal coat before flooding.

The fill port is sealed with a Loctite 565 thread-seal compound after vacuum-filling. A **0.5 mm silicone pressure-equalization diaphragm** is molded into the posterior face to absorb oil thermal expansion across the 0–30 °C operating range without building hydrostatic overpressure inside the cavity.

### Battery

**Renata ICP-06230-H** (3.7 V, 60 mAh, 15 x 23 x 6 mm, flex-strip LiPo) is the named cell. It is validated for 300+ charge cycles at 0.5C and operates to −20 °C (though capacity is reduced ~20 % at 0 °C water temperature). The cell is submerged in the DC-200 oil fill alongside the PCB; LiPo chemistry is tolerant of silicone oil immersion at low temperatures.

Charge IC: MCP73831T as noted above. Battery protection (overcurrent, overdischarge) is provided by a **Seiko S-8261** protection IC in a SOT-23-6.

---

## Power Budget

| State | Current | Power (3.7 V) | Note |
|---|---|---|---|
| Active alert (BCT + LRA) | 70 mA | 259 mW | BCT 150 mW + LRA 60 mW + MCU 15 mW + quiescent 4 mW |
| Active BCT only | 50 mA | 185 mW | BCT 150 mW + MCU 15 mW |
| Idle listen (MCU polling NFC via I2C wakeup) | 1.8 mA | 6.7 mW | MCU ~1.5 mA + tag ~0.3 mA |
| Deep sleep (wake-on-umbilical-pulse) | 0.08 mA | 0.3 mW | MCU sleep + NFC tag powered-down |

**8-hour dive budget (60 mAh cell, 3.7 V = 222 mWh):**
- Assume 5 alerts @ 3 s each = 15 s active = 0.7 mWh
- 8 h idle listen = 53.6 mWh
- Total: ~54.3 mWh consumed — well within 222 mWh capacity.
- If surface umbilical power is present (20 V, 100 mA max), the cell is bypassed entirely; the umbilical feeds a buck converter (TPS62840, 3.3 V, 50 mA quiescent at 60 nA) directly.

---

## Environmental Specifications

| Parameter | Specification |
|---|---|
| Depth rating | 100 m seawater (11 bar, tested to 13.2 bar = 20 % safety factor) |
| Water temperature | 0–30 °C operational |
| Salt spray | IEC 60068-2-52, Kb (168 h salt fog) via oil-fill + BioMed Amber shell |
| Pressure-cycle fatigue | 500 cycles 0–11 bar (simulating 500 dives) without solder-joint separation |
| Biocompatibility | ISO 10993-5, ISO 10993-10, USP Class VI (BioMed Amber) |
| Skin contact duration | Extended (>24 h) — BioMed Amber validated for prolonged skin contact |
| Decompression rate | Safe to PADI recreational decompression schedules; no trapped-gas expansion risk due to oil fill |

---

## Firmware

**Bare-metal on PIC18LF** (preferred). Firmware is structured as a foreground/background loop with a 1 ms Tick timer interrupt.

**Vibrotactile pattern FSM:**
- A 26-entry Morse table in PROGMEM maps letters A–Z to dot/dash pulse sequences (dot = 50 ms BCT burst, dash = 150 ms BCT burst, inter-element gap = 50 ms, inter-letter gap = 200 ms).
- 12 preset library stored in NFC EEPROM (uploaded pre-dive): ASCEND, STOP, SHARK, OOA (Out-Of-Air), BUDDY-CHECK, SURFACE, DECO-STOP, LOW-VIS, ABORT, EMERGENCY, OK, WAIT.
- Each preset maps to a 3-byte pattern ID. Patterns are encoded as (BCT duration, LRA on/off, gap) triplet arrays, max 16 triplets per preset.
- Temple LRA fires simultaneously with BCT on alert presets to provide a secondary tactile channel distinguishable by location from the mastoid BCT.

**NFC preset upload:** The NXP NTAG I2C Plus presents as an NDEF record to the phone app. The phone writes a JSON-like NDEF TLV payload (max 888 bytes in 1 KB EEPROM) containing the custom pattern table. On MCU power-on, the I2C bus polls the tag for a "new data" flag bit (set by the phone NFC write); if set, the MCU reads and validates the payload, then clears the flag.

**Low-power wake:** MCU enters PIC18 Sleep (50 nA) between pattern transmissions. A pulse on the umbilical conductor pair (rising edge on INT0 pin) or an NFC field-detect IRQ from the NTAG I2C Plus wakes the MCU within 256 µs. During a dive, the umbilical conductor pair carries a 1 Hz heartbeat pulse from the surface tender; absence of heartbeat for >5 s triggers a BUDDY-CHECK LRA pulse to alert the diver.

---

## Top 5 Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| 1. Shell fit variability without dental impression | High — poor fit reduces BCT coupling force and BCT efficacy | Guided AR scan app with landmark validation; force-fit specification (0.8–1.2 N normal load) verified in design; adjustable silicone retention pad in BCT pocket for ±0.5 mm compliance |
| 2. BCT-2 efficacy under thick neoprene hood | High — neoprene attenuates bone-conduction signal; unknown attenuation through 7 mm hood | Bench test BCT-2 output through 5 mm and 7 mm neoprene strips on cadaveric temporal bone analog; reserve 6 dB driver headroom; fallback: LRA-only alert mode |
| 3. ISO 10993 biocompatibility certification of full assembly | Medium — BioMed Amber is pre-certified but DC-200 oil, Dymax 9008 coat, and silicone gasket each require individual review | Use only pre-validated materials with existing ISO 10993 data sheets; final assembly cytotoxicity extract test (ISO 10993-5) on complete assembled unit |
| 4. Pressure-cycle solder-joint fatigue (500 dives) | Medium — repeated 0–11 bar cycles stress BGA/QFN solder joints even in oil-fill | Specify SAC305 solder paste; conformal coat before oil fill; underfill QFN MCU and BQ51003 with Loctite 3621; accelerated pressure-cycle qualification (500 cycles at 25 °C) |
| 5. Regulatory and operational acceptance by PADI/DAN | Low-Medium — no existing standard for DHH dive communication aids; DAN research division and PADI TecRec may require independent testing | Engage DAN research early; position as a communication-assist device (not life-safety); pilot with DHH Scuba community groups (e.g., Deaf Divers International) for anecdotal validation before CE/FCC submission |
