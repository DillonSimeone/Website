# EchoPalm-CAB — Architecture

**Elevator pitch:** Headliner-mounted radar gesture module that lets a deaf emergency-vehicle occupant silently alert the driver with a single ASL wakeword sign, firing seatback and steering-wheel haptics without touching any control.

---

## Problem Statement

Emergency vehicles create an acoustic environment that is already engineered to suppress awareness: sirens run at 110–120 dB, radio traffic is continuous, and the driver's visual attention is legally and operationally locked forward. For hearing occupants in the cab, verbal callouts survive this environment because the driver can hear them through bone conduction, radio earpiece, or direct proximity. For Deaf and Hard-of-Hearing (DHH) occupants, every one of those channels is unavailable.

Three specific user archetypes drive this design:

**Deaf back-of-cab paramedic supervisor.** A field supervisor rides rear-facing in an advanced life support ambulance, monitoring a patient while a junior medic and driver operate up front. During a lights-and-siren run, the supervisor may need to signal an emergency status change — patient is coding, route must change, scene hazard ahead — but cannot shout over siren noise and cannot safely release both hands from patient contact to type on a tablet.

**Deaf-officer K-9 handler riding rear with a restrained dog.** A K-9 handler occupies the second row of a police SUV with a caged German Shepherd. The dog may signal a threat posture or the handler may observe a tactical development through the rear glass that the driver cannot see. Voice is masked by siren; tapping the cage or bulkhead produces noise the driver ignores; the handler's hands may be on the dog's harness.

**Deaf SWAT entry-team member.** A tactical operator rides the third row of a SWAT carrier en route to a dynamic entry. Comms are on a tactical radio channel that does not include the driver. The operator may need to escalate or abort before arrival. Standard tap-codes on the vehicle body are not universally trained and may be misread.

In all three cases, the driver's forward focus is non-negotiable and cannot be interrupted by visual or auditory means without safety risk. A semantically specific, low-false-positive haptic alert — delivered through the seatback they are already in contact with — creates an eyes-free, hands-free interrupt channel that works regardless of cabin noise.

EchoPalm-CAB solves exactly this. It does not attempt full ASL translation. It recognizes a small, trained vocabulary of two to three high-priority signs (HELP-NOW cross-and-tap, STOP-VEHICLE, and PATIENT-CRITICAL) and converts each to a distinct haptic pattern on the driver's seatback ERM and steering-wheel ring.

---

## System Block Diagram (ASCII)

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │                     HEADLINER MODULE (overhead)                     │
 │                                                                     │
 │  ┌──────────────┐    SPI/UART    ┌──────────────────────────────┐   │
 │  │  TI AWR1843  │───────────────▶│       ESP32-S3 (main)        │   │
 │  │  76GHz FMCW  │                │  • PointCloud pre-filter     │   │
 │  │  radar       │                │  • HMM/CRNN gesture engine   │   │
 │  │  4TX / 3RX   │                │  • FreeRTOS task scheduler   │   │
 │  └──────────────┘                │  • OTA update manager        │   │
 │                                  └──────┬──────────────┬────────┘   │
 │  ┌──────────────┐                       │              │            │
 │  │  ICM-42688-P │  I2C (IMU data)       │              │            │
 │  │  6-axis IMU  │───────────────────────┘              │            │
 │  └──────────────┘                                      │            │
 └────────────────────────────────────────────────────────┼────────────┘
                                                          │
                          ┌───────────────────────────────┴──────────────────┐
                          │                  Output Stage                    │
                          │                                                  │
                    ┌─────┴──────┐                   ┌──────────────────┐    │
                    │ TJA1051T   │                   │  DRV2605L (x2)   │    │
                    │ CAN transc.│                   │  haptic drivers  │    │
                    └─────┬──────┘                   └────┬────────┬────┘    │
                          │                               │        │         │
                    SAE J1939                      ┌──────┘        └──────┐  │
                    vehicle bus                    │                      │  │
                    (event log,               ┌────┴────┐           ┌────┴───┴──┐
                    diagnostics)              │ Seatback│           │ Steering  │
                                              │  ERM    │           │ Wheel     │
                                              │ Vybronics│          │ LRA Ring  │
                                              │ C10-100 │           │ Precision  │
                                              └─────────┘           │ Micro-drives│
                                                                     └────────────┘
```

---

## Subsystem Breakdown

### 1. Radar: TI AWR1843

The TI AWR1843 is a single-chip 76–81 GHz FMCW radar with 4 transmit and 3 receive antennas, on-chip ARM R4F and C674x DSP, and a dedicated hardware accelerator for range-Doppler FFT. It ships in an AEC-Q100-qualified automotive-grade package (-40 to +105°C junction).

The alternative considered was the TI IWR6843. The IWR series is ISOC (short-range industrial/consumer) grade, not automotive-qualified, and the IWR6843 lacks AEC-Q100 documentation. For a product requiring AEC-Q100 sign-off, the AWR1843 is the correct choice despite its higher unit cost (~$28 vs. ~$12 at 1k). The AWR1843's on-chip DSP can run the initial PointCloud extraction and noise floor compensation, offloading the ESP32-S3. FMCW at 77 GHz resolves hand position to approximately 4–8 cm in range and 1–2 degrees in azimuth — sufficient for coarse gesture skeleton at the distances in a cab (0.5–2.5 m from headliner to rear passenger).

Mounting: centered overhead, angled 15° rearward to cover the rear passenger zone without illuminating the driver zone unnecessarily.

Regulatory note: 76–81 GHz automotive radar is permitted under FCC Part 15.253 and EU ETSI EN 302 858. No license required in the US or EU for vehicular short-range radar at compliant power levels.

### 2. Compute: ESP32-S3

The ESP32-S3 (Xtensa LX7 dual-core, 240 MHz, with vector extensions and 512 KB SRAM, 8 MB PSRAM via QSPI) is chosen for its combination of inference performance, cost (~$3 at 1k), and integrated 2.4 GHz Wi-Fi for OTA. The vector extensions support quantized int8 CRNN inference at practical throughput for a 5-feature PointCloud stream at 10 Hz output rate.

The alternative considered was an NXP i.MX RT1060 or RT1170. The i.MX RT series offers AEC-Q100 qualification and better deterministic latency, but costs 4–6x more and requires external Wi-Fi for OTA. The ESP32-S3 is not AEC-Q100 qualified in its standard commercial variant. Mitigation: extended-temperature industrial variant (–40 to +85°C) is available; AEC-Q100 test data can be gathered at module level during certification. For initial production, the risk is accepted and flagged explicitly in the compliance section.

Gesture inference runs a lightweight CRNN (convolutional recurrent neural net, ~180 KB int8 TFLite model) over a 30-frame sliding window of radar micro-Doppler and skeleton point features. HMM post-processing reduces false positives by requiring the sequence completion state to be held for 200 ms before firing.

### 3. CAN / SAE J1939

The TJA1051T (NXP) is an AEC-Q100-qualified CAN FD transceiver supporting up to 5 Mbit/s data phase, 3.3 V or 5 V compatible, -40 to +150°C. It connects the ESP32-S3's TWAI (CAN) peripheral to the vehicle J1939 backbone via a standard DB9 or Deutsch DT connector.

On detect, the module transmits a vendor-defined PGN (Parameter Group Number) in the J1939 proprietary A range (PGN 0xFF00 + device-specific offset). The message carries: event type (gesture ID), confidence score, timestamp, and module health. This allows fleet management software and CAD (computer-aided dispatch) systems to log deaf-alert events without requiring active J1939 integration for basic haptic function — haptic drive is direct and independent of bus acknowledgment.

Baud rate: 250 kbit/s (J1939 standard for heavy vehicles) or 500 kbit/s (common police/fire upfit).

### 4. Haptic Drivers

Two TI DRV2605L I2C haptic driver ICs are used: one for the seatback ERM and one for the steering-wheel LRA ring. The DRV2605L includes an 8-bit effect library (123 waveform effects), auto-resonance detection for LRA, and a diagnostics register accessible over I2C.

Seatback ERM: Vybronics C10-100 (10 mm diameter, 1.0 g centrifugal, 2.0 V rated, 85 mA stall). Drives at 3.3 V through DRV2605L analog output. Mounted in a machined pocket in the seatback foam surround with a rubber isolator gasket to prevent acoustic buzz-through to the frame. Three distinct patterns are defined: single 200 ms pulse (HELP-NOW), double 100 ms pulse with 150 ms gap (STOP-VEHICLE), and triple rapid 80 ms pulse (PATIENT-CRITICAL).

Steering-wheel LRA ring: Precision Microdrives 308-100 LRA (10 mm, 1 G resonance at 175 Hz), mounted in four quadrants of a slip-ring harness inside the steering column shroud. LRA provides a cleaner, more localized vibration than ERM and is easier to distinguish from road vibration. Auto-resonance tracking in DRV2605L keeps the ring on resonance regardless of temperature drift.

### 5. Enclosure

The enclosure is a low-profile ABS+GF injection-molded shell designed to replace or overlay a standard headliner panel section. Dimensions: approximately 180 mm × 120 mm × 22 mm. Snap-fit or adhesive mounting with two M4 capture bolts into headliner backing foam. The radar aperture area is polycarbonate (76 GHz transparent); the remainder is opaque ABS.

Vibration isolation: the PCB is mounted on four M2 silicone standoffs (Shore 40A) to decouple the electronics from chassis vibration. This is critical because the AWR1843 performs micro-Doppler analysis — chassis vibration at 5–50 Hz from road surface and siren compressor must be notch-filtered in the IMU-assisted calibration loop. The ICM-42688-P IMU provides chassis vibration telemetry at 8 kHz, and the firmware subtracts the chassis vibration model from the radar PointCloud before gesture inference.

MIL-810G Method 514.8 (vibration) and Method 516.8 (shock) are the target test profiles. Vehicle profile (Category 20) and functional shock (40 G, 11 ms half-sine) are the primary test cases.

### 6. Power

The module accepts 12 V or 24 V vehicle supply (automotive fleet uses both). Input TVS (SMAJ28A for 12 V bus, SMAJ58A for 24 V) clamps load-dump transients per ISO 7637-2. A TI LMR36015 synchronous buck converter steps to 5 V at 1.5 A. Linear LDOs (TLV75801 x2) then derive 3.3 V for logic and 1.8 V for AWR1843 analog rails. EMI filtering: common-mode choke (TDK ACM2012) + 100 nF/10 µF ceramic decoupling at each IC.

---

## Power Budget

| State | AWR1843 | ESP32-S3 | Haptics | CAN | Total |
|---|---|---|---|---|---|
| Idle (radar off, MCU light sleep) | 5 mW | 25 mW | 0 mW | 5 mW | **35 mW** |
| Standby (radar running, no gesture) | 850 mW | 120 mW | 0 mW | 10 mW | **980 mW** |
| Gesture detect + haptic fire | 850 mW | 220 mW | 320 mW (2×160 mW) | 15 mW | **1405 mW** |
| Worst case (24 V rail, 85°C) | 900 mW | 240 mW | 350 mW | 15 mW | **~1500 mW** |

At 12 V nominal, worst-case current draw is approximately 125 mA. Within standard automotive accessory fuse ratings (5–10 A). Idle mode activatable when vehicle is parked (CAN bus sleep signal).

---

## Compliance Targets

| Standard | Applicability | Notes |
|---|---|---|
| AEC-Q100 Grade 1 | AWR1843, TJA1051T (qualified); ESP32-S3, DRV2605L (not qualified — mitigated at module level) | System-level thermal cycling and HTOL required for non-AEC parts |
| MIL-STD-810G Method 514.8 | Vibration (vehicle profile, Category 20) | 10–500 Hz sweep + random vibration |
| MIL-STD-810G Method 516.8 | Functional shock, 40 G / 11 ms half-sine | 3 axes, 3 shocks each |
| FCC Part 15.253 | 76–77 GHz vehicular radar | Max 50 mW EIRP, no license |
| ETSI EN 302 858 | EU equivalent for 76–81 GHz automotive radar | CE marking path |
| SAE J1939 | Vehicle data bus | Proprietary PGN, no J1939 certification required |
| ISO 7637-2 | Automotive electrical transient immunity | TVS + choke on power rail |

---

## Firmware Architecture

**RTOS:** FreeRTOS on ESP32-S3, four tasks: (1) Radar_Pipeline, (2) Gesture_Inference, (3) Haptic_Control, (4) CAN_Reporter.

**Radar PointCloud pipeline:** AWR1843 on-chip DSP outputs UART/SPI TLV frames at 10 Hz. Radar_Pipeline task parses TLV, applies range gate (0.4–2.8 m), azimuth gate (±45°), and IMU-assisted vibration notch. Output: 3D point cloud + per-point Doppler velocity, 10 frames/second.

**Gesture inference:** 30-frame sliding window fed to int8 CRNN (TFLite Micro, ~180 KB model, ~12 ms inference on LX7 with vector ext.). Output: gesture class + confidence. HMM layer requires 200 ms hold at confidence > 0.82 before emit. Three gesture classes trained: HELP-NOW, STOP-VEHICLE, PATIENT-CRITICAL plus NULL class.

**OTA:** ESP32-S3 Wi-Fi connects to fleet management AP when vehicle is in bay. HTTPS OTA with SHA-256 firmware signature verification. Rollback on boot failure (A/B partition scheme).

**Training data:** Collected in simulated cab environment (3 vehicle types), 12 DHH subjects, 5 hearing subjects, 500 samples per gesture per subject. Augmented with simulated vibration noise.

---

## Top 5 Risks and Mitigations

**1. False positive during patient transport.**
Risk: involuntary hand motion by patient or medic triggers HELP-NOW alert, distracting driver unnecessarily.
Mitigation: Range gate and azimuth gate limit radar field to rear passenger zone only (not stretcher zone). HMM confidence threshold set conservatively. False-positive rate target: <1 per 8 hours of operation in bench testing. Alert pattern uses escalating confirmation: first detection triggers amber LED on headliner (visual confirm to user that gesture was seen) — second detection within 5 seconds fires haptic.

**2. EMI from siren amplifier and LED lightbar.**
Risk: High-frequency switching noise from siren and lightbar PWM controllers couples into power rail or CAN bus, causing false CAN frames or radar interference.
Mitigation: Isolated DC-DC topology (LMR36015 with spread-spectrum), TVS on 12/24 V input, common-mode chokes on CAN lines, shielded cable harness. Ground the enclosure shield to chassis via dedicated ground bolt, not shared with signal ground.

**3. Radar regulatory variance by jurisdiction.**
Risk: 76–81 GHz band usage restrictions differ outside US/EU. Some countries require type approval for vehicular radar.
Mitigation: Initial product targets US (FCC Part 15.253) and EU (ETSI EN 302 858) only. Non-US/EU markets flagged as requiring local type approval. AWR1843 already FCC/CE certified at chip level; system-level approval required.

**4. Vehicle electrical noise causing spurious haptic events.**
Risk: Alternator whine, relay switching, or ABS pump transients couple into DRV2605L I2C lines and trigger unintended haptic pulses.
Mitigation: DRV2605L I2C pull-ups to 3.3 V local, not shared with long harness runs. Haptic motor enable pin is GPIO-controlled by ESP32-S3 and is only asserted after confirmed gesture — DRV2605L is in standby otherwise.

**5. Certification timeline risk.**
Risk: MIL-810G environmental testing plus FCC Part 15 testing adds 4–6 months to launch timeline and $80–150K in test fees.
Mitigation: Design to test from day 1: use AWR1843 evaluation module form factor for early firmware development, then swap to custom PCB. Pre-compliance EMC scan in-house before submitting to accredited lab. Schedule MIL-810G vibration test at same time as FCC to parallelize.
