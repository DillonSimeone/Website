# WAVEDECK-MARITIME — Architecture

**Domain:** Offshore platform / commercial vessel deck-crew comms + fall-overboard.
**Status:** Pre-type-approval reference design. All PNs `verify-before-order`.

---

## 1. System overview

Three coupled subsystems on a mixed RF + LoRa + AIS topology:

```
+----------------------+        +-------------------------+        +------------------+
|  PFD-CLIP MODULE     |<-LoRa->|  MAST NODE (CV BRAIN)   |<-Eth-->|  BRIDGE TABLET   |
|  (1 per crew, 4-12)  |        |  (1 per vessel)         |        |  (officer UI)    |
|  IPX8 / 5 m / submer.|        |  RGB + thermal + Jetson |        |  Android marine  |
|  AIS-SART float det. |        |  24 V vessel bus        |        |  N2K bridge      |
+----------------------+        +-------------------------+        +------------------+
        |                                  |
        | (on submersion)                  |
        v                                  v
   AIS class-M                         NMEA 2000 / 0183
   GMDSS DSC ch.70                     to vessel ECDIS
```

- PFD module rides on the crew member's lifejacket D-ring. Always-on LoRa link receives recognised bridge wand/arm signals from the mast node, decodes to four-quadrant LRA haptics.
- On submersion (water-conductivity bridge + IMU free-fall + depth >40 cm for 3 s) the AIS-SART floats free of the PFD via a hydrostatic release (Hammar H20-style), surfaces, and begins ITU-R M.1371 class-M burst transmission on 161.975 / 162.025 MHz **and** DSC distress alert on ch.70.
- All other crew PFDs receive an "MOB" broadcast with bearing/range and switch their LRA haptics into a homing pattern (vibration intensity proportional to inverse range; quadrant cycling indicates bearing).

---

## 2. PFD-clip module

### 2.1 Block diagram

```
[Antenna LoRa 868/915]---[u.FL]---[Si4463 sub-GHz]---+
[Antenna AIS 162 MHz ]---[u.FL]---[AIS Tx module]---+--[nRF52840 MCU]--+
[Antenna GNSS L1/L5  ]---[u.FL]---[MAX-M10S      ]---+                  |
                                                                        |
       +----------------------------------------------------------------+
       |
       +--[BMI270 IMU]--[BMM350 mag]--[MS5837-30BA depth]
       +--[Quad LRA driver DRV2605 x2]--[LRA x4: N/E/S/W on chest panel]
       +--[Li-SOCl2 primary 3.6 V 19 Ah + LTC4150 coulomb]
       +--[Hammar H20 hydrostatic release + reed switch confirm]
       +--[Piezo buzzer 95 dB + 5 mm RGB SOS LED]
       +--[USB-C waterproof (Amphenol DX07) under cap, service only]
```

### 2.2 MCU + radio split

| Function | Part | Notes |
|---|---|---|
| Application MCU | Nordic **nRF52840** | BLE 5 (service/pairing), 1 MB flash, FPU. |
| Sub-GHz signalling | SiLabs **Si4463** | LoRa-compatible FSK, 868/915 MHz ISM, +20 dBm. |
| AIS-SART RF | **Em-Trak / Weatherdock licensed AIS-SART module** | Type-approved class-M; standalone — *do not* implement raw AIS in firmware, you will not get certified. |
| GNSS | u-blox **MAX-M10S** | L1, low power 25 mA tracking, hot-fix < 1 s. |

> AIS submodule isolation: separate Li-MnO2 primary, separate hydrostatic release, separate ENEPIG sub-PCB inside IPX8 inner can. PFD module can be replaced for service without disturbing the SART beacon's type-approval seal.

### 2.3 Sensors

- BMI270 6-axis IMU — gait / submersion-impact detection.
- BMM350 magnetometer — bearing for homing haptics.
- MS5837-30BA depth/pressure — submersion confirm + drift depth.
- Conductivity bridge (two ENEPIG pads, 100 kΩ pull-up, ADC) — saltwater contact in <500 ms.

### 2.4 Haptics

Four LRAs (10 mm coin, 200 Hz) at N/E/S/W around chest panel, driven through 2x DRV2605L (I2C-addressed). Patterns:

- **Heave** (bridge "raise"): two pulses, top-quadrant.
- **Slack** (bridge "lower"): two pulses, bottom-quadrant.
- **Hold / stop**: continuous 1 s buzz, all four.
- **Come to me**: rotating quadrant chase, CW.
- **MOB homing**: quadrant matching bearing-to-victim, intensity = f(1/range), 0.5 Hz.

### 2.5 Mechanical / IP

- Housing: glass-filled PA12, ultrasonic-welded, ENEPIG-plated coplanar GND ring against case.
- Rating: **IPX8 to 5 m / 60 min** (clip body); AIS float separately rated IPX8/10 m.
- Salt-fog: 96 h per ASTM B117 on populated PCB coupons.
- Mass target: ≤ 180 g (must not affect SOLAS PFD buoyancy class).

### 2.6 Battery / life

- Crew-comms duty: 19 Ah Li-SOCl2 primary (Tadiran TL-5930-ish) → ≥ 6 months on 2 % LoRa duty + idle haptics.
- AIS-SART float: separate Li-MnO2, type-approval-rated 96 h beacon @ -20 °C minimum (regulatory floor).

---

## 3. Mast node (CV brain)

### 3.1 Block diagram

```
24 V vessel bus
   |
   +--[Iso-DC/DC 24V->19V Recom RP30-Z]--[Jetson Orin Nano 8 GB]
   |                                       |
   |                                       +--[IMX715 RGB 4K @ 30 fps, M12 f/1.4]
   |                                       +--[FLIR Boson 320 thermal 9 mm 24°]
   |                                       +--[USB3 / GMSL2 carrier]
   |                                       +--[1000BASE-T1 to bridge]
   |                                       +--[Si4463 LoRa concentrator (SX1302 alt.)]
   |
   +--[Iso-DC/DC 24V->5V]--[Stainless heater 8 W, anti-icing window]
   +--[NMEA 2000 isolated XCVR (TI ISO1042)]
   +--[Surge: Bourns CDSOT23-SM712 on LoRa, GDT on 24V]
```

### 3.2 Mounting

- Mast at 6–12 m AGL (above wheelhouse top), pointing aft over working deck.
- Heated, hydrophobic-coated germanium window for thermal; AR-coated glass for RGB.
- IP67 housing, marine-grade 316L stainless brackets, sacrificial Zn anode bonded to vessel GND.

### 3.3 CV pipeline

```
RGB 4K@30 ---+
              +-->[YOLOv8-pose, custom 2k-frame dataset]--+
Thermal@60 --+      "officer with wand"                   |
                                                          v
                                                  [Signal classifier
                                                   (transformer, 14 classes:
                                                    heave/slack/hold/...)]
                                                          |
                                                          v
                                          [Confidence gate >= 0.85, 3-frame stable]
                                                          |
                                                          v
                                              LoRa broadcast to PFDs
                                              + NMEA 2000 to bridge ECDIS
```

- Thermal lane runs always: detects crew presence on deck for "safe to swing load" interlock.
- RGB lane runs when officer in frame; powers down at night unless deck floods on.
- Edge inference target: < 120 ms officer-motion-to-LoRa-burst.

### 3.4 Latency budget

| Stage | Budget (ms) |
|---|---|
| Capture + ISP | 20 |
| Pose + classify | 60 |
| Gate / debounce | 30 |
| LoRa Tx airtime SF7 BW250 | 35 |
| PFD Rx + haptic onset | 30 |
| **End-to-end** | **≈ 175** |

---

## 4. Bridge tablet

- Off-the-shelf marine Android tablet (e.g. Garmin GPSMAP-class or rugged consumer in IP67 cradle).
- Apps: (a) crew roster + PFD pairing, (b) live deck view with overlaid signal interpretation, (c) MOB alarm panel with N2K hand-off to ECDIS, (d) firmware-update gateway.
- N2K bridge: PGN 127489 / 129038 (AIS class B position) repeated for MOB to ECDIS.

---

## 5. RF + regulatory path

| Band | Use | Cert path |
|---|---|---|
| 868 / 915 MHz ISM | LoRa crew↔mast | ETSI EN 300 220 / FCC Part 15.247 |
| 162 MHz marine VHF | AIS-SART class M | **ITU-R M.1371-5 + IEC 61097-14**; vessel type approval. Use a pre-certified AIS-SART OEM module — *do not* design own RF. |
| 156.525 MHz ch.70 | DSC distress alert | IEC 61097-7 (DSC controller cert). Often bundled in SART OEM module. |
| 1.575 GHz | GNSS Rx only | n/a |
| 2.4 GHz BLE | Service pairing only | FCC/ETSI standard. **Disabled at sea** per company policy. |

- AIS-SART = "class M" survival craft beacon. Activation must be automatic (submersion) **and** manual. Test mode must be physically distinct.
- Per IMO MSC.246(83), beacon must transmit position bursts every minute for ≥ 96 h at -20 °C.
- **Do not** ship a non-type-approved AIS transmitter — it is illegal in every flag state and will jam coastal SAR.

GMDSS interop:

- AIS-SART burst is the primary alert; class-M is recognised by Sea Areas A1–A4.
- DSC distress alert on ch.70 hits coast stations + nearby vessels.
- No Inmarsat-C path on this device; the vessel's existing GMDSS station handles long-range distress relay.

---

## 6. Firmware

### 6.1 PFD module

```
Application (Zephyr RTOS, nRF52840)
   |
   +-- State machine: DOCKED -> ARMED_DECK -> MOB_SELF -> MOB_HOMING
   +-- LoRa Rx task (Si4463 SPI, FreeRTOS-thread)
   +-- Sensor fusion task (BMI270 + BMM350 + MS5837, 100 Hz)
   +-- Submersion detector:
   |     conductivity_high AND depth > 0.4 m AND duration > 3 s
   |       -> trigger SART_RELEASE GPIO + state = MOB_SELF
   +-- Haptic player (DRV2605 effect library + custom)
   +-- BLE service (pairing only, sealed in factory after roster pair)
   +-- OTA via BLE through bridge tablet only, signed
```

### 6.2 Mast node

```
Linux for Tegra + JetPack
  |
  +-- gst pipeline: nvarguscamerasrc (IMX715) + v4l2 (Boson) -> appsink
  +-- inference svc: TensorRT engines (pose + classifier)
  +-- signalbus: ZMQ pub of {sigil, confidence, ts}
  +-- lora-tx svc: Si4463 SPI driver, 25 ms inter-frame
  +-- n2k-svc: NMEA 2000 fast-packet writer
  +-- watchdog: hw watchdog 5 s + thermal-throttle on Jetson
  +-- secure boot, signed model artefacts, A/B rootfs
```

### 6.3 Bridge tablet

- React Native / Android, signed APK.
- Pairs over BLE in port; at sea, talks LoRa via mast node.
- ECDIS hand-off via vessel's existing N2K bus.

---

## 7. Failure modes

| Failure | Detection | Mitigation |
|---|---|---|
| Mast node down | PFD LoRa Rx timeout 30 s | PFD haptics revert to BLE-direct crew-to-crew "buddy" mode; bridge alarm. |
| PFD battery dead | LTC4150 + Tx-fail counter | Yellow LED + bridge roster flag. AIS-SART has independent battery — still works. |
| False MOB trigger | Conductivity + depth + IMU all required | 3-of-3 vote + 3 s persistence; physical cancel button under cap (24 h reset). |
| Type-approval lapse | Periodic test mode logs to bridge | Annual SART self-test required by SOLAS chap. IV. |
| RF blackout (jamming, mast loss) | LoRa CRC fail rate | AIS-SART path is independent of LoRa entirely — primary GMDSS alert still goes out. |

---

## 8. Build BOM crosswalk

See `PRODUCTION_BOM.csv`. All LCSC `C?????` placeholders are `verify-before-order`; the AIS-SART OEM module is *not* commodity — source from a type-approved supplier (Em-Trak, Weatherdock, ACR/McMurdo OEM channel) and budget per-unit licensing.

---

## 9. Open items (verify-before-order)

- Confirm AIS-SART OEM module supplier + per-unit type-approval royalty (US$ 60–120 typical, plus one-time program cert US$ 30–80 k).
- Confirm hydrostatic release vendor (Hammar H20 vs. equivalent) — affects mechanical envelope.
- Confirm thermal core export classification (FLIR Boson 320 9 Hz is ITAR-exempt, 60 Hz often is not).
- Confirm Jetson Orin Nano availability + lifecycle (NVIDIA roadmap states 2030+ but lock supply).
- Confirm class-society type approval scope: DNV, ABS, Lloyd's, BV — pick one as lead.
