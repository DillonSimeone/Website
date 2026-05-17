# TactileTerrain — MIL-Rated Forearm Haptic Compass

**Elevator pitch:** A flex-PCB forearm band that encodes heading, waypoint distance, and teammate position as differentiated vibration waveforms, giving spec-ops, SAR, and firefighter teams eyes-free, ears-free navigation in zero-visibility environments.

---

## Problem Statement

Three distinct users share one life-threatening problem: navigating in environments where both vision and hearing are compromised or must be suppressed.

**Urban firefighter in a smoke-filled high-rise.** Thermal cameras help, but a firefighter crawling through a corridor at 0/0 visibility — zero light, zero air clarity — cannot spare a hand for a device and cannot hear a radio over SCBA mask noise and structural collapse sounds. Proprioception is the only channel left. Current solutions are audio earpieces (defeated by SCBA masks), head-mounted displays (fogged, heat-damaged within minutes), or printed maps memorized before entry. When the building layout changes mid-incident — collapsed floor, routed evacuation path — the firefighter is improvising blind. Disorientation in this scenario kills: NIOSH firefighter fatality data consistently cites "disorientation" as a leading cause of LODD in structural fires.

**SAR team in a whiteout or cave system.** A mountain rescue team operating in a whiteout blizzard or a cave dive team operating in zero-visibility silt cannot use visual landmarks. GPS works above ground but fails underground or at depth. The team needs to know where the casualty beacon is relative to their body orientation — not a map on a screen, but a directional pull encoded in the skin. Current GPS watches require glove removal and visual attention. Radio communication requires hearing protection removal in some environments. A forearm band that says "target is 30 degrees left, 120 meters, and your team lead is behind you" requires no gloves off, no eyes, no ears.

**Tactical diver or spec-ops assaulter in a denied environment.** A combat diver approaching an objective in zero-vis harbor water cannot use lights, cannot use audio signals, and cannot surface for GPS. A breacher moving through a building under noise discipline needs heading confirmation without breaking radio silence. Current solutions include wrist-mounted dive computers with compass (eyes required) and bone-conduction audio (detectable by adversaries in quiet environments). Haptic encoding eliminates both failure modes.

The core gap is not GPS or IMU technology — those are mature. The gap is the human interface layer: a robust, always-on, silent, eyes-free output modality rated for the actual environmental conditions of these users.

---

## System Block Diagram (ASCII)

```
+------------------SENSOR CLUSTER (Control Pod)------------------+
|                                                                  |
|  [u-blox MAX-F10S GNSS] --> |                                   |
|  [ST LSM6DSV IMU]       --> | Sensor Fusion (AHRS)  --> [ESP32-S3-WROOM-1U] |
|  [Bosch BMM150 Mag]     --> |                                   |
|                                                                  |
+------------------------------------------------------------------+
         |                                    |
         | SPI/I2C                            | UART/SPI
         v                                    v
  [Battery PMIC]                    [Semtech SX1262 LoRa]
  [3.7V Li-ion]                     [Team Mesh In/Out]
         |                                    |
         | 3.3V / VBAT                        | RF
         v                                    v
  +------HAPTIC DRIVER BOARD------+    [Antenna, PCB trace or whip]
  |  [TI DRV2605L #1] -> LRA 1   |
  |  [TI DRV2605L #2] -> LRA 2   |
  |  [TI DRV2605L #3] -> LRA 3   |
  |  [TI DRV2605L #4] -> LRA 4   |
  |  [TI DRV2605L #5] -> LRA 5   |
  |  [TI DRV2605L #6] -> LRA 6   |
  |  [TI DRV2605L #7] -> LRA 7   |
  |  [TI DRV2605L #8] -> LRA 8   |
  +--------------------------------+
         |
         v
  [110mm Flex-PCB Band, 8x LRA around forearm circumference]
  [MOLLE attachment clip, IP67 gasketed pod, strain relief flex tails]
```

---

## Subsystem Breakdown

### Sensor Fusion: GNSS + IMU + Magnetometer (AHRS)

The u-blox MAX-F10S is a dual-band L1/L5 GNSS receiver in a 9.7x10.1mm LCC package. L5 adds multipath rejection critical for urban canyon and near-structure use. Acquisition time is under 2 seconds with AssistNow. In GNSS-denied environments (indoors, underground, underwater), the system falls back to dead-reckoning using the LSM6DSV IMU. The LSM6DSV provides 6-axis IMU with embedded "iNAV" sensor fusion engine and a machine-learning core — this offloads step counting and motion classification from the main CPU, reducing power in pedestrian tracking mode.

The Bosch BMM150 magnetometer completes the 9-DOF sensor suite. Magnetic heading is notoriously unreliable near rebar, steel structures, and ferrous equipment carried by operators. The AHRS algorithm (Madgwick or Mahony filter, or uNavINS for tighter integration) must handle magnetic anomaly detection and fallback to gyro-only heading with drift accumulation warning to the user (faster pulse rate = lower confidence). Calibration is performed at device power-on via a figure-8 wrist rotation sequence, with in-field recalibration triggered by double-tap gesture (detected by LSM6DSV).

Sensor fusion runs at 50 Hz. GNSS update rate is 1 Hz (MAX-F10S limitation at full accuracy). The IMU propagates heading between GNSS fixes. Waypoints are stored in flash and updated over LoRa mesh from team lead or base station.

### Haptic Drive: DRV2605L + LRA Array

Eight TI DRV2605L haptic drivers, one per LRA actuator, communicate over I2C with address-selectable configuration. The DRV2605L provides open-loop LRA drive, resonance tracking, and a waveform library with 123 built-in effects. Each driver connects to a Vybronics VG0832 class 8mm LRA (resonant frequency ~170-200 Hz). LRA was chosen over ERM because LRA has faster rise/fall time (response latency <10ms vs >50ms for ERM), better frequency control for differentiated waveforms, and no imbalanced mass wear over time.

The eight LRAs are positioned at 45-degree increments around the forearm circumference — North, NE, East, SE, South, SW, West, NW relative to body axis. Heading encoding: the single LRA in the direction of the waypoint fires with a "long pulse" pattern. Distance encoding: pulse repetition rate (slow = far, fast = near, continuous = arrived). Teammate/obstacle encoding: a distinct "double-tap" waveform on the relevant angular LRA, differentiated from the waypoint single-pulse. I2C bus runs at 400 kHz; 8 drivers share the bus with jumper-configured addresses (DRV2605L has 2-bit address select, so two I2C buses or a mux — I2C mux TCA9548A handles 8 channels on one bus).

### Compute: ESP32-S3

The ESP32-S3-WROOM-1U module was selected for its combination of 240 MHz Xtensa LX7 dual-core CPU, 8MB PSRAM and 16MB flash in the -1U (U.FL antenna) variant, USB-OTG for field firmware updates, and strong FreeRTOS ecosystem. BLE 5.0 is available for companion app pairing (Android/iOS) for waypoint upload without LoRa infrastructure. Wi-Fi is disabled in firmware to reduce RF emissions and power draw.

Alternatives considered: Nordic nRF5340 (superior BLE, lower power, but no hardware floating-point for AHRS computation without offload), STM32H7 (stronger DSP, but larger form factor and no integrated wireless), Pi RP2350 (too new, limited security boot support). The ESP32-S3 wins on ecosystem maturity, hardware crypto for mesh packet signing, and dual-core for separating sensor fusion from haptic/radio tasks.

### RF Mesh: SX1262 LoRa

The Semtech SX1262 provides LoRa modulation at 125-500 kHz bandwidth, SF7-SF12 spreading factors, and up to +22 dBm output. For a 4-person team in an urban structure, SF9/BW125 gives ~1 km range through walls with acceptable data rate for position packet exchange (100-byte packet, 5-second beacon interval, 8 team members = manageable airtime). Frequency band: 915 MHz (US FCC Part 15 ISM), 868 MHz (EU ETSI), 433 MHz (global fallback). The firmware selects band at compile time or via hardware strap.

Team mesh protocol: each device beacons its GNSS position + heading + status every 5 seconds. Mesh routing uses a simple flooding protocol with 2-hop TTL; for teams under 10 members in a local area, a proper mesh routing protocol (Meshtastic-derived) is not necessary. Packet authentication uses HMAC-SHA256 with a shared team key provisioned at mission brief via BLE + companion app. This prevents spoofing but is not FIPS-140 — for classified environments, an external crypto module can be added on a daughter card.

### Power System

Primary cell: single 18650 Li-ion, 3.7V nominal, 3000-3500 mAh (e.g., Samsung 30Q or Panasonic NCR18650B). The pod accommodates a standard 18650 in a push-release carrier for hot-swap in the field — the operator carries 2-3 spares. A supercapacitor (0.1F, 5.5V) maintains MCU state during the 200ms swap window to prevent restart.

PMIC: Texas Instruments BQ25895 or similar single-cell Li-ion charger with power path management. Charging via USB-C (5V/1.5A), also supports field chargers. Input protection: reverse polarity, 30V transient clamp.

Rail architecture: 3.3V regulated (LDO from VBAT when battery > 3.5V, else boost from 3.0V cutoff), 5V boost for LRA drivers (DRV2605L can run from 3.3V in its specified range but 5V gives better LRA drive force — evaluate at bring-up).

See power budget table below.

### Mechanical: Flex-PCB Band + MOLLE Pod

The forearm band is a 2-layer flex PCB, 110mm length x 35mm width, with 8 LRA footprints at 45-degree spacing around a nominal 135mm forearm circumference. The flex material is Pyralux AP (polyimide), minimum bend radius 3mm, with stiffener pads at LRA locations. The band wraps and secures with a hook-and-loop (Velcro) closure over a neoprene sleeve insert for skin comfort and sweat management.

The control pod is a machined 6061-T6 aluminum enclosure, 60x40x18mm, IP67 gasketed with EPDM O-ring and stainless M2 fasteners with thread-locking compound. The pod mounts to the band via a quick-release slide rail and attaches to a forearm plate carrier or MOLLE sleeve via a standard 1-inch MOLLE-compatible webbing loop. The USB-C port has a Amphenol IP67-rated cap. The 18650 carrier ejects from the pod bottom via a spring-loaded push button protected by a safety catch.

---

## Power Budget

| Subsystem            | Active (mW) | Idle/Sleep (mW) | Notes                            |
|----------------------|-------------|-----------------|----------------------------------|
| ESP32-S3 (active)    | 330         | 10              | Dual core, 240 MHz               |
| MAX-F10S GNSS        | 33          | 0.5             | L1+L5 continuous                 |
| LSM6DSV IMU          | 0.55        | 0.002           | Normal ODR 52 Hz                 |
| BMM150 Magnetometer  | 0.9         | 0.001           | Forced mode, 10 Hz               |
| SX1262 LoRa TX       | 198         | 0.5             | +22 dBm, ~2% duty cycle avg      |
| SX1262 LoRa RX       | 14.2        | —               | Continuous RX mode               |
| 8x DRV2605L (active) | 8x 7 = 56   | 8x 0.05 = 0.4   | Active drive, 1-2 LRAs at a time |
| 8x LRA (typical)     | 8x 100 = 800| 0               | Worst case all firing            |
| LRA typical (1-2)    | 200         | 0               | Normal navigation use            |
| PMIC overhead        | 15          | 5               | Quiescent + regulation losses    |

**Worst-case active (all LRAs firing, GNSS + LoRa TX):** ~880 mW
**Typical ops (1-2 LRAs, GNSS, LoRa 2% TX duty):** ~610 mW
**Deep sleep (GNSS off, radio off, IMU only):** ~15 mW

At 3.7V nominal, 3000 mAh = 11.1 Wh.
- Worst case: 11100 / 880 = ~12.6 hours
- Typical ops: 11100 / 610 = ~18.2 hours
- Mixed (50% typical, 20% worst, 30% sleep): ~24+ hours achievable

**24-hour target is achievable with typical ops profile.** A 3500 mAh cell or modest duty-cycling of GNSS (1 Hz to 0.1 Hz when stationary) extends this comfortably.

---

## Environmental Ratings

- **IP67:** Pod fully immersed 1m/30min. EPDM O-ring on pod lid, Amphenol IP67 USB-C cap, potted cable glands at flex tail exits. For diver variant: upgrade to IP68 (3m/60min) with secondary silicone gasket and pressure-equalization membrane vent.
- **MIL-STD-810 Method 506 (Rain):** 40mm/hr simulated rain, 30 min. IP67 cover is sufficient; flex PCB sealed under overmolded strain relief.
- **MIL-STD-810 Method 510 (Dust):** Fine dust exposure 6 hrs. Pod gasketing prevents ingress; flex PCB under neoprene sleeve.
- **MIL-STD-810 Method 516 (Shock):** 40g, 11ms half-sine, 3 axes. LRA mounts must use flexible adhesive (3M VHB or Loctite 480 flex) to absorb shock; 18650 carrier spring-loaded for retention.
- **MIL-STD-810 Method 514 (Vibration):** Helicopter, vehicle, and functional vibration profiles. Flex PCB inherently dampened; LRA mounting again critical.
- **Operating temperature:** -20°C to +50°C. Li-ion chemistry limits charging below 0°C (charge inhibit in firmware); LRA resonant frequency shifts with temperature (~2 Hz/10°C), compensated by DRV2605L resonance tracking. BMM150 and LSM6DSV both specified to -40°C.

---

## Firmware Architecture

**RTOS:** FreeRTOS on ESP32-S3 (Espressif ESP-IDF v5.x).

**Tasks:**
- `task_sensor_fusion` (Core 0, priority HIGH): reads IMU at 50 Hz, GNSS at 1 Hz, magnetometer at 10 Hz; runs Mahony AHRS; outputs absolute heading + position struct to shared queue. Handles mag anomaly detection (variance spike = fallback to gyro-only).
- `task_haptic_engine` (Core 1, priority HIGH): consumes heading + waypoint struct from queue; computes active LRA index; builds DRV2605L waveform sequence; drives I2C mux + drivers at appropriate pulse rate.
- `task_lora_mesh` (Core 0, priority NORMAL): beacons own position every 5s; receives teammate packets; updates teammate position table; triggers haptic events for teammate proximity.
- `task_ble_manager` (Core 1, priority LOW): handles companion app connection for waypoint upload, config, firmware OTA.
- `task_power_manager` (Core 0, priority LOW): monitors VBAT via ADC; adjusts GNSS duty cycle, LoRa TX power, haptic intensity based on battery state.

**Haptic Waveform Library:** Defined in `haptic_patterns.h` — WAYPOINT_NEAR, WAYPOINT_FAR, WAYPOINT_ARRIVED, TEAMMATE_AHEAD, TEAMMATE_BEHIND, LOW_CONFIDENCE_HEADING (rapid triple-pulse), LOW_BATTERY (slow perimeter sweep). All patterns tested for distinguishability at forearm through gloves.

**Security:** Team key stored in ESP32-S3 eFuse (AES-256 key storage); HMAC-SHA256 on LoRa packets; BLE pairing requires physical button confirmation.

---

## Top 5 Risks + Mitigations

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| 1 | Magnetic interference indoors/near rebar | Heading error > 45 deg, LRA fires wrong actuator | Mahony filter with anomaly detect; fallback to gyro dead-reckoning; display low-confidence waveform; regular recalibration prompt |
| 2 | GNSS denial (urban canyon, indoor, underground) | Waypoint distance stale; position unknown | IMU dead-reckoning with bounded drift error; LoRa mesh can relay teammate GPS if one member has sky view; offline map integration for relative positioning |
| 3 | Skin sensitivity / discomfort over 24h ops | User disables device; pressure injury risk | Neoprene sleeve distributes pressure; max LRA vibration intensity capped; scheduled 5-min pause every 2h (configurable); clinical testing in design validation |
| 4 | MIL-STD certification cost and timeline | Program cost +$300K–$800K; 18-24 month delay | Phase 1: commercial sale to fire departments and SAR teams (no MIL cert required); MIL cert in Phase 2 using revenue; seek SBIR/STTR funding for cert cost |
| 5 | Frequency licensing per country for LoRa | 915 MHz illegal in EU; 868 MHz illegal in US; export compliance (EAR) | Hardware supports 433/868/915 MHz via firmware band select; export classification review (likely EAR99 or AT-controlled); EU version uses 868 MHz SKU with CE marking |
