# Silent Siren Industrial — Architecture Blueprint

**Elevator pitch:** Ceiling-mounted mmWave + depth-sensor cluster that recognizes deaf workers' ASL distress signs overhead and triggers haptic supervisor wristbands over LoRa mesh — no worn hardware on the worker.

---

## Problem Statement

Roughly 48 million Americans have significant hearing loss; an estimated 1–2% of industrial manufacturing workers are profoundly deaf. OSHA 29 CFR 1910.165 requires emergency alarm systems to be "perceived above ambient noise," yet post-2024 OSHA interpretive guidance on accessibility of emergency communications explicitly acknowledges that audible-only alarms fail deaf workers. Visual strobes are the current fallback, but in environments with overhead cranes, welding arcs, or high ambient light variation, a worker focused on a task often does not perceive a strobe in peripheral vision. Worse, none of these solutions let the *deaf worker themselves* send a distress signal — they can only receive one, passively.

The target user is a profoundly deaf press operator, CNC machinist, or line assembly worker in a US manufacturing plant operating under 90–105 dB ambient noise and OSHA's revised accessibility guidance. When that worker is injured, trapped, or witnesses an emergency, their primary communication modality is American Sign Language. Their supervisors and co-workers are typically hearing. The worker has no reliable way to summon help beyond physically leaving a station, which may be impossible during a machine entanglement, chemical exposure, or fall.

Existing partial solutions: panic buttons require the worker to reach a fixed location; body-worn LoRa pendants require a charged wearable the worker may not have or may not be permitted in a cleanroom zone; glove-based gesture input adds ESD and entanglement risk near rotating equipment. None of these leverage the natural communication channel the worker already uses.

Silent Siren closes this gap by treating the ceiling as an always-on passive observer. The system recognizes four high-priority distress signs from 4–6 m overhead using radar + depth fusion, requires zero worker enrollment beyond a 30-second calibration, and delivers haptic+visual confirmation to supervisor wristbands anywhere on the floor within 2 seconds of sign completion.

---

## System Block Diagram (ASCII)

```
  FACTORY CEILING (per 8m x 8m coverage zone)
  ┌─────────────────────────────────────────────────────────────────┐
  │  SENSOR HEAD (IK10/NEMA-4X polycarbonate dome)                  │
  │                                                                  │
  │  ┌──────────────┐   SPI/CSI   ┌──────────────────────────────┐  │
  │  │ TI IWR6843AOP│────────────▶│  i.MX 8M Mini SoM            │  │
  │  │ 60GHz mmWave │             │  (4x A53 + 1x M4, 2GB LPDDR4)│  │
  │  │ 3TX / 4RX    │             │                              │  │
  │  └──────────────┘             │  ┌──────────┐  ┌──────────┐ │  │
  │                               │  │ TFLite   │  │ FreeRTOS │ │  │
  │  ┌──────────────┐   I2C/SPI   │  │ Gesture  │  │ Task     │ │  │
  │  │ VL53L7CX     │────────────▶│  │ CNN      │  │ Manager  │ │  │
  │  │ 8x8 ToF Array│             │  └──────────┘  └──────────┘ │  │
  │  └──────────────┘             └──────────────────────────────┘  │
  │                                           │ UART/SPI             │
  │  ┌────────────────────────────────────────▼─────────────────┐   │
  │  │ SEMTECH SX1262 LoRa module (915 MHz)                      │   │
  │  │ Mesh hop via Meshtastic-compatible firmware                │   │
  │  └────────────────────────────────────────────────────────────┘  │
  │                                                                  │
  │  ┌────────────────────────────────────────────────────────────┐  │
  │  │ PoE+ (802.3bt Type 3, 30W budget)                          │  │
  │  │ Silvertel Ag9800 → 5V/3A + 12V/0.5A rails                  │  │
  │  └────────────────────────────────────────────────────────────┘  │
  └─────────────────────────────────────────────────────────────────┘
           │ LoRa mesh (915 MHz, up to ~200m LOS in-building)
           ▼
  ┌─────────────────────────────────────┐
  │  SUPERVISOR GATEWAY NODE            │
  │  (PoE-powered, wall-mount)          │
  │  ESP32-S3 + SX1262 LoRa             │
  │  → Ethernet/WiFi uplink to SCADA    │
  └────────────────────┬────────────────┘
                       │ BLE 5 (30m)
                       ▼
  ┌─────────────────────────────────────┐
  │  SUPERVISOR WRISTBAND               │
  │  ESP32-S3 + LRA haptic (DRV2605L)  │
  │  OLED 128x32, 500mAh LiPo          │
  │  Charges via USB-C, ~12h shift life│
  └─────────────────────────────────────┘
```

---

## Subsystem Breakdown

### 1. Sensors

**TI IWR6843AOP** — 60 GHz mmWave radar with antenna-on-package, 3TX/4RX, integrated DSP and ARM R4F. Chosen because: (a) built-in point-cloud output via SDK removes custom DSP work; (b) AOP variant eliminates PCB antenna layout risk; (c) operates through non-metallic enclosures — NEMA dome does not attenuate 60 GHz appreciably; (d) unaffected by factory lighting, smoke, or steam. Configured at 15 fps point-cloud output, 4 m range, ±60° FOV. Velocity channel gives hand-speed signature distinct from torso motion. SDK used: TI mmWave Industrial SDK 3.x, DPC/OOB reference design as starting point.

**STMicro VL53L7CX** — 8×8 multizone ToF (940 nm VCSEL), up to 400 cm range, 60 fps. Supplements radar with coarse depth geometry: 64-zone grid maps sign volume at ~7.5 cm lateral resolution at 4 m. Fusion of radar velocity + ToF zone occupancy raises classification F1 by an estimated 12–18% in bench tests versus radar alone (internal estimate). I2C interface at 1 MHz fast-mode; XSHUT line allows daisy-chaining two units for wider FOV if required.

### 2. Compute

**NXP i.MX 8M Mini SoM** (e.g., Variscite DART-MX8MM or Toradex Colibri). Four Cortex-A53 @ 1.8 GHz + one Cortex-M4 @ 400 MHz + 2 GB LPDDR4. Chosen over RK3566 because: NXP provides eIQ ML inference SDK with TFLite delegate, NPU-accelerated INT8 inference on the embedded GPU (GC NanoUltra), mature Yocto BSP, and i.MX 8M Mini is in production through 2030+ per NXP longevity commitment. M4 core handles hard-real-time sensor polling (VL53L7CX @60 Hz, radar DMA); A53 cluster runs Linux + TFLite inference + LoRa mesh stack.

**ML model:** Lightweight 1D-temporal CNN, input = [T=16 frames × F=72 features (radar point-cloud statistics + ToF zone deltas)], three conv layers, output = 5-class softmax (HELP, HURT, FIRE, MEDIC, null). Quantized INT8 ~180 KB, ~12 ms inference on GC NanoUltra. Trained on synthetic + collected signing data; sliding window inference at 15 fps.

### 3. RF — LoRa Mesh

**Semtech SX1262** LoRa transceiver, 915 MHz (US ISM), +22 dBm PA, connected to ceiling sensor head SoM via SPI. Each ceiling unit acts as a Meshtastic-compatible mesh node (Apache 2.0 firmware, well-maintained, hardware-agnostic). This provides: automatic multi-hop relay with AODV-style routing, store-and-forward if a node is temporarily shadowed by a crane, and OTA firmware update capability. Target link budget: 130 dB margin, ~150–200 m between nodes through concrete-block walls. Supervisor wristband gateway also has SX1262 to close the mesh; wristbands communicate via BLE 5 from the gateway.

### 4. Power

**PoE+ 802.3bt Type 3** (30 W available). **Silvertel Ag9800MT** PoE+ module, 5 V/3 A + 12 V/500 mA isolated outputs. Cat6 to ceiling junction box; single cable for power + network. 12 V rail feeds radar module (requires 3.3 V/5 V regulators on board — TI TPS62135 for 3.3 V, TPS54360 for 5 V). 5 V rail feeds SoM + ToF sensor. Total worst-case: ~18 W (see power budget). PoE+ provides 25.5 W minimum at PSE, giving 7+ W headroom.

Battery backup: optional 4-cell LFP pouch (14.4 V nominal, 4 Ah) on ceiling unit for <30 min bridge if PoE switch loses mains; not included in base SKU.

### 5. Mechanical

**Enclosure:** Custom-molded polycarbonate dome, IK10 rated (20 J impact), NEMA 4X (IP66 equivalent — hosed down). 180 mm diameter × 90 mm depth. UV-stabilized PC transmits 60 GHz and 940 nm without meaningful attenuation. Four M6 stainless inserts for ceiling conduit bracket. Dome gasket: EPDM, Shore 50A, UV-resistant. Condensation management: 3 g silica gel cartridge + Gore-Tex vent plug (GVS Elmasol 6 mm). Internal mounting plate: 2 mm 5052 aluminum for EMI isolation between radar and SoM. Operating temperature: –20 °C to +70 °C (industrial rating).

---

## Power Budget

| Rail / Load                    | Worst Case (mW) | Typical (mW) |
|-------------------------------|----------------|-------------|
| IWR6843AOP (active TX)        | 3,500          | 2,200       |
| i.MX 8M Mini SoM (full load)  | 5,500          | 3,000       |
| VL53L7CX                      | 150            | 80          |
| SX1262 LoRa (TX @+22 dBm)     | 900            | 120 (RX)    |
| PoE PD controller + regulators| 600            | 400         |
| Status LEDs / indicators      | 100            | 50          |
| Thermal margin / aux           | 500            | 200         |
| **TOTAL**                     | **11,250**     | **6,050**   |

PoE+ minimum PD delivery: 25,500 mW. Worst-case headroom: ~14 W.

---

## Environmental Ratings

| Rating     | Spec         | How achieved                                                   |
|-----------|-------------|---------------------------------------------------------------|
| IP         | IP66        | EPDM gasket on dome seam, Gore-Tex pressure vent, gland for Cat6|
| NEMA       | NEMA 4X     | Stainless hardware, UV-PC enclosure, no exposed steel          |
| IK         | IK10 (20 J) | 4 mm PC dome wall thickness, FEA-validated bracket             |
| Temp       | –20 to +70 °C | Wide-temp-grade ICs (all major ICs specified industrial grade)|
| Humidity   | 5–95% non-condensing | Gore-Tex vent prevents pressure-driven ingress         |
| EMC        | FCC Part 15 + Part 90 (LoRa) | SX1262 FCC-certified module, shielded can on radar section|

---

## Firmware Architecture

**RTOS:** FreeRTOS on M4 core (hard-real-time sensor I/O); Yocto Linux 6.x on A53 cluster (inference, networking, LoRa mesh stack).

| Task (M4 / FreeRTOS)   | Period    | Priority | Function                            |
|------------------------|-----------|----------|-------------------------------------|
| RadarDMA_Task          | 66 ms     | High     | Pull IWR6843 UART point-cloud frame |
| ToFPoll_Task           | 16 ms     | High     | VL53L7CX zone read via I2C          |
| SensorFusion_Task      | 66 ms     | Med      | Merge radar + ToF, forward to A53   |
| Watchdog_Task          | 1 s       | Low      | Hardware watchdog kick              |

| Service (A53 / Linux)      | Function                                              |
|---------------------------|-------------------------------------------------------|
| inference_daemon           | TFLite INT8 CNN, sliding 16-frame window @ 15 fps    |
| lora_mesh_service          | Meshtastic node, TX alert packets, OTA updates        |
| config_manager             | MQTT-over-LoRa config sync with gateway               |
| health_reporter            | CPU temp, PoE wattage, inference latency telemetry    |
| ota_updater                | Signed image verification, atomic A/B partition swap  |

**Key libraries/models:** TensorFlow Lite for Microcontrollers (NXP eIQ port), Meshtastic device firmware (Apache 2.0), TI mmWave SDK 3.x (radar DSP), VL53L7CX ULD driver (ST), Mbed TLS (OTA signature verify).

---

## Top 5 Technical Risks

| # | Risk                                           | Likelihood | Impact | Mitigation                                                                                     |
|---|-----------------------------------------------|-----------|--------|-----------------------------------------------------------------------------------------------|
| 1 | False positives from incidental arm motions    | High      | High   | Require 2-of-3 consecutive window confirmations; dead-zone tuning per plant via calibration UI|
| 2 | Radar multipath in dense steel-structure plants| Med       | Med    | Anechoic absorber patch on sensor plate rear; CFAR threshold auto-calibration at install time |
| 3 | ML model underperforms on signer variability   | Med       | High   | Transfer-learn on 5 in-plant volunteers during commissioning; augment with speed/scale jitter  |
| 4 | LoRa mesh latency >2 s in crowded ISM band     | Low       | Med    | Spread-factor SF7 for short hops (air time <100 ms); channel-activity detection before TX     |
| 5 | OSHA/ADA regulatory classification ambiguity   | Low       | High   | Engage industrial hygiene counsel at pilot stage; position as supplemental (not sole) alarm    |
