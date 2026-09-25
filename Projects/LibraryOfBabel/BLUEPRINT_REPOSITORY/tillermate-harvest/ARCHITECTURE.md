# TillerMate Harvest — Architecture

**Slug:** `tillermate-harvest`
**Domain:** Agricultural tractor cab + DHH field crew comms
**Status:** Blueprint v0.1 — all part numbers `verify-before-order`

---

## 1. System overview

Three co-engineered nodes plus ranch backhaul:

```
   +-------------------------------+
   |   ROOF MODULE (tractor cab)   |   <-- mmWave + RGB stereo + Edge TPU
   |   IWR6843AOP + 2x OV9281      |
   |   Coral / Hailo-8L            |
   |   SX1262 LoRa + LTE-M optional|
   +---------------+---------------+
                   |
        12 V tractor power (ISO 11783 / CAN)
                   |
   +---------------+---------------+
   |   CAB SEAT PUCK               |   <-- driver UI: haptic + 4-btn
   |   ESP32-S3 + DRV2605L         |
   |   ERM + LRA combo + 1.3" OLED |
   +---------------+---------------+
                   |  BLE 5 LE
                   |
   +---------------+---------------+
   |   WRISTBAND (field worker)    |   <-- DHH wearable
   |   ESP32-C3 + LRA + buzzer     |
   |   SX1262 LoRa node            |
   +-------------------------------+

  Ranch mesh:  LoRa 915 MHz (US) / 868 MHz (EU)
  Backhaul:    Sierra HL7800 LTE-M -> ops dashboard
```

---

## 2. Roof module

### 2.1 Mechanical / env

- Enclosure: cast aluminium, powder-coated, gasketed to **IP6K9K** (high-pressure ag wash-down).
- Operating: **-20 to +60 degC** ambient; sun-load derate to +75 degC internal.
- Vibration: **ISO 5008** (rough/smooth field tracks), 4-corner silicone isolators (Sorbothane 70 duro backup).
- Mount: 2x M8 to roof rib + AMPS pattern; bolt-on RAM-mount adapter for retrofits.
- Lens window: borosilicate + hydrophobic coating; replaceable bug-shield bezel.
- Radome over IWR6843AOP: PC/ASA, 1.6 mm, lossy <1.0 dB at 60 GHz.

### 2.2 Sensors

| Block | Part | Role |
|---|---|---|
| mmWave radar | TI IWR6843AOP `C?????` `verify-before-order` | 60-64 GHz, 3Tx/4Rx, on-package antenna; person detect through dust + light occlusion, 0-80 m. |
| Stereo cam L | OmniVision OV9281 + M12 4 mm lens | 1 MP global-shutter mono, 120 fps; rolling-shutter not OK on a bouncing cab. |
| Stereo cam R | OmniVision OV9281 + M12 4 mm lens | Baseline 180 mm; depth out to ~50 m at 1 px disparity precision. |
| IR illum | 2x 850 nm 3 W LED + driver | Low-light hand-signal capture; eye-safe at >0.3 m. |
| IMU | Bosch BMI270 | Cab pitch/roll compensation for radar bins. |
| GNSS | u-blox NEO-M9N | Per-event geotag; ranch-zone aware alerts. |

### 2.3 Compute

- Primary SoM: **NXP i.MX 8M Plus** carrier (quad A53 + 2.3 TOPS NPU) running Yocto.
- Accelerator (choose at BOM lock): **Google Coral M.2 A+E TPU (4 TOPS INT8)** OR **Hailo-8L M.2 (13 TOPS)**. Hailo-8L preferred for 30 fps stereo + gesture at 50 m; Coral fallback if supply blocks.
- 4 GB LPDDR4, 32 GB eMMC, A/B partitions for OTA.

### 2.4 Vision pipeline

```
OV9281 L/R --> ISP (i.MX) --> rectify --> stereo depth (SGBM HW)
                                              |
                                              v
                              person bbox (YOLOv8n quantized)
                                              |
                                              v
                              pose / hand keypoints (MediaPipe-class, NPU)
                                              |
                                              v
                              gesture classifier (TCN on keypoint stream)
                                              |
                                              v
                                ASL-gloss label + confidence + worker_id
```

Radar fused at bbox stage: radar track gates camera ROIs so we don't burn NPU on empty rows. Dust/glare fallback: radar-only "person at bearing X, distance Y, motion Z" -> cab gets "worker present, gesture unreadable" rather than silent fail.

### 2.5 Gesture vocabulary (v1)

| Gloss | Meaning | Signal source |
|---|---|---|
| STOP | Hard stop | Both arms crossed overhead |
| BACK | Reverse | One arm waving toward self |
| LIFT | Implement up | Palm-up rising |
| LOWER | Implement down | Palm-down falling |
| FOLLOW-ROW | Track me on next row | Pointing + walking |
| WATER-NOW | Start irrigation | Hand-cupped to mouth, then point |
| HELP | Emergency | Both arms waving overhead, sustained |
| ACK | Acknowledged | Thumbs-up |

12 more in v1.1 once field-labelled data exists. All maps are config, not hard-coded — co-design with DHH ag-worker advisory panel.

### 2.6 Power

- Input: tractor **12 V** (also 24 V tolerant via wide-input DC-DC).
- Front-end: TVS + reverse-polarity FET + 30 V load-dump clamp (ISO 7637-2 pulse 5a/5b).
- DC-DC #1: 12 V -> 5 V @ 6 A (TPS54360 class).
- DC-DC #2: 5 V -> 3.3 V / 1.8 V / 1.1 V rails (TPS6521x PMIC).
- Idle: ~3 W. Active inference: ~9 W (Hailo) / 7 W (Coral). Worst-case w/ IR illum: 15 W.

---

## 3. Cab seat puck

### 3.1 Mechanical

- Puck: 90 mm dia x 35 mm, TPU-overmould, sits on seat cushion or magnetic to armrest.
- Buttons: 4 silicone domes around a 1.3" round OLED, each button = pre-coded message class.
- USB-C (PD 9 V trigger) for charge; 1500 mAh LiPo for shift use detached.

### 3.2 Electronics

- MCU: **ESP32-S3-WROOM-1-N16R8** `C2913203` `verify-before-order`.
- Display: 1.3" 240x240 GC9A01 round LCD (sunlight-readable mode).
- Haptics: **TI DRV2605L** driving 1x **ERM coin** (broad thump) + 1x **LRA 10 mm** (sharp tick) in tandem. Pattern library distinguishes alert classes by texture, not just intensity.
- Radios: BLE 5 (ESP32 native) to wristbands via roof relay; UART to roof module.
- Audio: piezo buzzer (optional, for hearing co-drivers).

### 3.3 Driver UX

- Incoming gesture -> 250 ms double-tick + OLED shows ASL-gloss + worker icon + distance.
- Driver presses ACK button -> sends "I see you" back as wristband buzz to that worker.
- Long-press a button = broadcast (e.g. "lunch" to all wristbands in geofence).

---

## 4. Wristband

### 4.1 Mechanical

- 38 x 38 x 11 mm, silicone strap, IP67 (sweat + irrigation splash, not submersion).
- Hi-vis orange shell, ANSI 107 retro reflective trim.

### 4.2 Electronics

- MCU: **ESP32-C3-MINI-1** `C2934569` `verify-before-order`.
- Haptic: **Jinlong G1040003D LRA** + DRV2605L.
- Radio: **Semtech SX1262** LoRa @ 915 / 868 MHz, +22 dBm; 1/2 km LOS budget, mesh-relayed by other wristbands and roof.
- Battery: 350 mAh LiPo, USB-C charge, 3-day target on 1 alert / 5 min duty.
- Indicators: 2x 0805 LED (status), tactile button for ACK + panic-press (3x = HELP).

### 4.3 Alert classes (cab -> wrist)

| Pattern | Meaning |
|---|---|
| 3 short sharp | "Machine moving — clear area" |
| Long-short-long | "Irrigation cycle done" |
| Continuous 2 s | "Operator emergency — come to cab" |
| 4 medium | "Lunch / break called" |
| 2 short | "ACK from driver" |

---

## 5. Ranch network

```
[Wristbands] --LoRa 915MHz mesh--> [Roof module gateway]
                                          |
                              LTE-M (Sierra HL7800-M)
                                          |
                                  Ops dashboard / cloud
                                  (geofence, audit, OTA)
```

- LoRa class A by default; class C on roof module (always-listen) for downlink.
- App-layer ACK + replay protection (16-byte nonce, AES-128-CCM).
- LTE-M optional — ranches with no cell can run LoRa-only and sync via cab Wi-Fi at home shed.

---

## 6. Firmware

### 6.1 Roof module (Linux)

- Yocto kirkstone base, RAUC A/B updates, MQTT to cloud.
- Services: `radar-svc`, `vision-svc`, `fusion-svc`, `lora-svc`, `puck-link-svc`, `ota-svc`, `geofence-svc`.
- Watchdog: hardware (i.MX WDT) + supervisor.
- Logging: 7-day ring buffer on eMMC; opt-in upload of low-confidence clips for model retraining (privacy: face blur on-device before upload).

### 6.2 Puck (ESP-IDF)

- FreeRTOS tasks: `ui_task`, `haptic_task`, `ble_task`, `uart_task`, `power_task`.
- OTA via roof module relay.

### 6.3 Wristband (ESP-IDF)

- Lowest-power LoRa wakeup pattern; deep-sleep between beacons.
- OTA via LoRa fragmented transport (slow but viable for kB-scale patches).

---

## 7. Safety and regulatory

- **NOT a safety-of-life system.** Gesture STOP triggers driver alert; final control authority is the operator. Document clearly in installer manual + on-puck startup screen.
- FCC Part 15 sub C (LoRa), Part 95 not required.
- TI IWR6843AOP pre-certified module path (FCC ID inherited) — verify with TI.
- E-mark / EMC for in-cab use: ECE R10 — pre-compliance lab pass required before OEM channel.
- ROHS, REACH, WEEE.
- Privacy: cameras pointed outward only; on-device face blur for any retained clips; opt-in worker consent flow.

---

## 8. Manufacturing notes

- Roof module: low-volume CM in US/MX (ag tariff exposure); 250-unit pilot, 2k/yr at scale.
- Puck + wristband: standard Shenzhen CM, IPC-A-610 class 2.
- ICT + functional test fixtures for each SKU; HALT chamber sample at every 500 units.

---

## 9. Open questions / risks

- IWR6843AOP supply has been spiky — keep AWR1843 footprint-compatible fallback option in PCB layout.
- Hailo-8L vs Coral final pick depends on price + availability at lock date.
- LoRa duty cycle in EU (1% @ 868) limits broadcast rate — design messages to fit.
- Hand-signal dataset is the moat AND the risk; need >= 50 hrs labelled real-field video before launch.
