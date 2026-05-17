# VibeWeld Helmet — Architecture Blueprint

**Elevator pitch:** A welding helmet that tracks a supervisor's ASL gestures through a dedicated depth-camera window and delivers coded haptic pulses to a neckband — keeping deaf welders and noise-isolated hearing welders in continuous command contact without interrupting the arc.

---

## Problem Statement

A deaf welder in a structural-steel fabrication shop is operationally isolated the moment the auto-darkening visor (ADV) snaps to shade 12. Visual signals from the floor are blocked by the lens. Vibration signals from the floor are masked by grinder noise and the arc itself. For most of recorded occupational history, that welder has had no communication channel during active arc time. Emergency stop signals — a supervisor rushing across the shop floor waving arms — arrive too late or not at all. Non-emergency coordination (move the gun left, gas bottle is low, take a break) simply does not happen in real time.

The problem is not limited to Deaf/Hard-of-Hearing (DHH) workers. A hearing welder inside a shipyard confined compartment, inside a heavy structural hood, cannot hear verbal commands at all during arc strike. Shop ambient noise commonly exceeds 100 dBA. Push-to-talk radios require a free hand and a clear visor. Bone-conduction headsets are blocked by the helmet shell and are not spatter-rated. The hearing welder is in the same communications vacuum as the deaf welder; the only difference is that the hearing welder's isolation is situational rather than permanent.

Both users share a single failure mode: the visor darkens, the world disappears, and the only information channel remaining is what is already inside the helmet. This product occupies that channel. A supervisor in line-of-sight of the welder can issue commands by signing into the depth-camera field of view; those commands are decoded to a 16-item vocabulary and transmitted to a neckband haptic array as distinct pulse patterns within approximately 300 ms of gesture completion. No radio channel audible to anyone. No free hand required. No interruption of the arc.

Secondary benefit: the depth-camera continues to log spatial data during arc, providing a supervisory record of welder head-position and bead-track distance that can feed weld-quality documentation systems.

---

## System Block Diagram (ASCII)

```
  SUPERVISOR (line-of-sight, 0.5 – 4 m)
        |
        | ASL gesture, visible through arc UV/IR
        v
  [Intel RealSense D405]  -- polysulfone optical window (separate from ADV)
        |  USB 3.0 (internal flex ribbon)
        v
  [Compute Pod — Kneron KL720]
        |  SPI/I2C   |  BLE 5.2 / IEEE 802.15.4
        v             v
  [Status LED bar    [nRF52840 radio bridge]
   inside hood]           |  2.4 GHz short-range RF
                          v
                   [Neckband — ESP32-S3]
                          |  I2C
                          v
                   [DRV2605L haptic driver x4]
                          |
                   [LRA array x4, neck-conformal]

  ADV cartridge ---- passthrough adapter (mechanical only, no signal tap)
  Li-ion pack (pod) → USB-C PD 12 V rail → KL720 + D405 + radio bridge
  Thermal cutoff PCB between Li-ion and main rail
```

---

## Subsystem Breakdown

### 1. Depth Camera — Intel RealSense D405

The D405 is selected over the D435i and D455 for one reason: minimum range. The D405 operative range begins at 70 mm and targets 0.1 – 0.5 m with sub-1 mm precision; the D435i minimum depth is 300 mm. A supervisor 0.5 – 4 m away gesturing with hands at chest height maps well to D405 optics. The 90° × 65° FOV captures a full-arm signing envelope without requiring the welder to pan.

Placement is a dedicated optical window on the upper-left face of the helmet shell, machined in polysulfone, not occupying the ADV cartridge bay. This is non-negotiable: the ADV window is optically matched to the cartridge and is warranty-sensitive; tapping it for a camera mount would void 3M Speedglas compliance and place secondary optics in the arc-splash strike zone. The D405 window sits above and left of center, angled 10° downward, keeping the camera FOV on the supervisor standing in front of the welder.

Optical isolation from arc UV/IR: a Schott OG550 longpass filter (cutoff 550 nm) is laminated to the inner face of the polysulfone window. This blocks the primary arc UV emission below 400 nm and limits the IR flux that can saturate the D405 IR projector. The D405 uses 850 nm structured light; the OG550 passes 850 nm with ~92% transmission, so depth performance is preserved. A second hard-coat AR layer on the outer polysulfone face reduces spatter adhesion.

Window replacement is designed as a field-replaceable cartridge retained by two M2.5 captive screws; expected replacement interval 200 operating hours or on visible pitting.

### 2. Compute Pod — Kneron KL720

Three candidates were evaluated:

- **NVIDIA Jetson Orin Nano** (15 W TDP, 40 TOPS AI): thermally unsuitable. A polysulfone pod above an active arc helmet shell sees ambient temperatures of 50–70°C. The Orin Nano requires active cooling and a heat path that cannot be provided in a sealed IP6X pod of < 300 cm³. Disqualified on thermal grounds.
- **NXP i.MX 8M Plus** (4 W TDP, 2.3 TOPS NPU): viable thermal profile but NPU throughput is marginal for real-time hand-skeleton inference at 30 fps. Acceptable fallback if KL720 supply chain becomes constrained.
- **Kneron KL720** (2 W typical, 1.0 TOPS NPU at INT8): selected. The KL720 runs a MediaPipe Hands-equivalent graph at 30 fps on 640×480 depth+RGB in approximately 1.8 W sustained. In a sealed polysulfone pod with 20 cm² external surface area exposed to convective airflow over the helmet crown, steady-state pod temperature is estimated at +35°C above ambient (see power budget), keeping junction temperature below 85°C even in summer shipyard conditions. The KL720 exports to ONNX; the hand-skeleton + ASL classifier model is ~3.2 MB quantized INT8.

The compute pod runs Yocto Linux (kirkstone) with a custom BSP layer for the KL720 NPU driver. A watchdog timer resets the inference pipeline if frame latency exceeds 200 ms. OTA updates are delivered over BLE using the MCUboot dual-bank scheme.

### 3. HUD Overlay

A full transparent OLED panel inside the hood was evaluated and rejected. Arc-rated transparent OLEDs at the required 80 × 30 mm display size do not exist at production-feasible cost (< $15/unit at 1k), and placement in the welder's direct line-of-sight creates focus-plane conflicts with the weld pool 200 mm away.

Selected: a 3-character 7-segment LED bar (red, 30 cd brightness) mounted at the top inside edge of the hood shell, above the welder's direct line of sight. During arc-dark, the LED bar is the only visible element. It displays abbreviated message codes (STP, CLG, RLT, etc.) simultaneously with the haptic pulse, providing a redundant visual channel for welders who retain partial vision or remove the helmet immediately post-arc to confirm the command received. Power draw is negligible (< 80 mW).

### 4. Neckband — ESP32-S3 + DRV2605L + LRA Array

The neckband is a separate wearable worn under the welding bib. It connects to the compute pod via IEEE 802.15.4 (Zigbee PHY, custom minimal stack) at 2.4 GHz. BLE was considered for the pod-to-neckband link but 2.4 GHz BLE has documented reliability issues near arc plasma EMI; 802.15.4 DSSS spreading provides better link margin in that environment.

Hardware: ESP32-S3 (SoC, handles 802.15.4 via software radio with the integrated 2.4 GHz transceiver and a secondary nRF52840 radio bridge on the pod side for the PHY). Four DRV2605L haptic drivers each address one LRA (linear resonant actuator) at cervical positions C3, C5, C7, and T1 level — distributed across the neck for directional disambiguation. Pulse codes are 2-bit position × 3-bit pattern = 8 combinations, mapping to the 16-message vocabulary with a single repeat-press protocol for the upper 8.

The neckband PCB is encased in a TPU overmold rated to IP67. The LRA actuators and their silicone mounting pads are the primary hygiene concern; the neckband is designed for daily washing and the LRA mounts are replaceable without tools (friction-fit into TPU pockets). Neckband battery: 200 mAh LiPo, USB-C charging, 8-hour shift life.

Antenna routing: the neckband antenna is a meandered PCB trace positioned at the posterior neck, away from the welding bib front where spatter and conductive debris accumulate. The pod antenna is a U.FL-connected ceramic chip antenna on the bottom face of the pod, pointing away from the helmet shell metal frame.

### 5. Helmet Shell Modifications

Base shell is sourced as an aftermarket 3M Speedglas 9100-class compatible blank (not OEM 3M shell — retaining OEM shell would require 3M approval for modification). The blank is injection-molded polysulfone (PSU, Udel P-1700) rather than the OEM polycarbonate. Rationale: PSU has a UL 94 V-0 flammability rating vs. V-2 for standard PC; its continuous-use temperature of 160°C vs. PC's 115°C provides margin during spatter events. PSU is compatible with ANSI Z87.1 optical and impact requirements when the visor aperture geometry is preserved.

The pod above the cartridge is a separate PSU enclosure bonded with Loctite EA 9394 structural adhesive and backed by two M4 through-bolts into the helmet crown. The pod adds approximately 180 g, bringing total helmet weight to ~700 g — within the range of premium auto-darkening helmets.

ANSI Z87.1 impact certification requires the modified shell assembly to pass the high-mass and high-velocity projectile tests as a unit; the pod position above center-of-mass slightly increases rotational inertia. The design must be third-party certified as a modified assembly.

---

## Power Budget

| Subsystem             | Typical (mW) | Peak (mW) |
|-----------------------|-------------|-----------|
| Intel RealSense D405  | 1500        | 2200      |
| Kneron KL720 (NPU)    | 1800        | 2400      |
| nRF52840 radio bridge | 80          | 150       |
| LED bar (HUD)         | 60          | 80        |
| Misc. LDOs, I2C       | 40          | 60        |
| **Pod total**         | **3480**    | **4890**  |
| Neckband (ESP32-S3)   | 120         | 200       |
| Neckband DRV2605L x4  | 300         | 800       |
| Neckband LRA x4       | 600         | 1200      |
| **Neckband total**    | **1020**    | **2200**  |

Pod Li-ion: 3.7 V × 3000 mAh = 11.1 Wh. At 3.5 W typical: **~3.2 hours arc-on time**. With 50% duty cycle (arc on half the shift): ~6.4 hours. A 6000 mAh dual-cell pack in the pod delivers a full 8-hour shift at 50% duty. Thermal: 3.5 W dissipated in a ~280 cm³ sealed PSU pod, assuming 20 cm² convective surface at 0.3 W/(m²·K) natural convection coefficient → ΔT ≈ +58°C above ambient. At 25°C ambient, pod internal temperature ≈ 83°C — within PSU continuous rating (160°C) and KL720 junction spec (125°C) but marginal. One graphite heat-spreader sheet bonded to the pod interior ceiling is specified to reduce ΔT to approximately +42°C.

---

## Compliance

| Standard          | Applicability                                                  |
|-------------------|----------------------------------------------------------------|
| ANSI Z87.1-2020   | Eye and face protection; optical lens + modified shell must pass as assembly |
| ANSI Z49.1-2012   | Safety in welding, cutting, and allied processes; helmet shade selection |
| EN 175:1997       | EU personal eye protection for welding; CE marking path        |
| EN 379:2003+A1    | Auto-darkening filter performance (ADV cartridge passthrough, not modified) |
| IEC 62133-2       | Li-ion battery cell safety                                     |
| IP6X (IEC 60529)  | Dust ingress for compute pod (sealed PSU enclosure)            |
| IP67              | Neckband (daily-wash rated)                                    |
| FCC Part 15 / IC RSS-247 | 2.4 GHz RF emissions (nRF52840 + ESP32-S3)            |
| ATEX Zone 1 (optional) | Refinery/petrochemical welding; requires certified enclosure and intrinsically safe power — add-on SKU |

---

## Firmware Architecture

**Compute pod (Yocto Linux, KL720 BSP):**
- `weld-cam-daemon`: V4L2 capture from D405 at 30 fps 640×480 depth+RGB, feeds KL720 NPU inference pipeline via `/dev/kneron_npu`
- `asl-classifier`: Post-processes 21-keypoint hand skeleton into gesture windows; sliding 1.5 s window, Viterbi smoothed, outputs message ID 0–15
- `haptic-broker`: Receives message ID, encodes pulse pattern, transmits over 802.15.4 via nRF52840 UART bridge
- `hud-controller`: Drives LED bar via I2C GPIO expander, mirrors message code to 3-character display
- `ota-agent`: MCUboot-compatible A/B partition OTA over BLE GATT; authenticates updates with Ed25519 signature

**Neckband (FreeRTOS, ESP32-S3):**
- `radio-rx`: 802.15.4 receive task, 2 ms poll interval
- `haptic-sequencer`: DRV2605L waveform sequencer, executes 4-channel pulse pattern from lookup table
- `power-mgr`: Deep-sleep when no message for 30 s; wakes on 802.15.4 beacon

---

## Top 5 Risks and Mitigations

1. **UV/IR degradation of D405 optical window:** Arc UV and radiated IR flux will yellow polysulfone and degrade OG550 coating over 100–500 hours. Mitigation: field-replaceable window cartridge, 200-hour replacement interval in user manual, anti-reflective hard coat on outer face, and spatter shield (sacrificial polycarbonate film, replaced weekly).

2. **Weld spatter blocking optical window:** Fine spatter from GMAW/FCAW will accumulate on the window outer face, reducing depth-camera contrast. Mitigation: sacrificial outer film (same material as common welding lens covers), dispenser roll mount on helmet brow, 30-second swap. Window recess geometry (3 mm setback from flush) limits oblique spatter adhesion.

3. **False positives from welder's own hand movement during re-strike pump:** The welder's gloved hand passes through camera FOV when repositioning the gun. Mitigation: confidence threshold tuning (minimum 18 of 21 keypoints visible, bilateral hand skeleton required — supervisor signs with both hands for vocabulary commands), and an inhibit window of 2 s after ADV darkening event (detected via LDR tap on ADV cartridge).

4. **Neckband hygiene and replacement under weld-shop sweat load:** Welders sweat heavily; LRA mounts will accumulate contamination. Mitigation: TPU overmold IP67, friction-fit LRA pockets for toolless swap, neckband band itself is washable fabric with a replaceable inner liner (spare liners sold as consumable). Silicone pads are autoclaved-compatible.

5. **3M Speedglas ADV warranty voiding:** The design specifically avoids any modification to the ADV cartridge. However, selling a helmet with a modified shell using Speedglas-compatible geometry may create trademark issues. Mitigation: aftermarket shell (not branded as Speedglas), clear user documentation that the ADV cartridge is sourced and installed separately by the user (drop-in compatible with 3M Speedglas 9100 ADV cartridges), and legal review for any implied association with 3M branding.
