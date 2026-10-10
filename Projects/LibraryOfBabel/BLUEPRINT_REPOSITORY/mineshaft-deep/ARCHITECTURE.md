# mineshaft-deep — Architecture

> **Domain:** Underground hard-rock / coal DHH miner comms
> **Form:** Cap-lamp-replacement helmet module + belt-pack + surface gateway
> **Cert path:** MSHA 30 CFR Part 23 (methane-air) + Part 27 (permissible electric equipment), IECEx Ex ia I Ma / Group I Category M1 (intrinsically safe, energized in firedamp). ATEX Group I M1 equivalent.
> **All part numbers / prices: `verify-before-order`.**

---

## 0. Why this exists

Underground coal & hard-rock mines kill the assumptions every other Singularity SKU relies on:

| Assumption (rest of repo) | Underground reality |
|---|---|
| GPS available | Zero. Hundreds of meters of rock. |
| 2.4 GHz reaches >50 m | Tunnel mode-conversion + roof bolts + dust. <30 m reliable. |
| Voice / TTS OK in emergencies | Self-rescuer mask in mouth. Cannot speak. |
| Spark = annoyance | Spark = funeral. CH4 LEL ≥ 5%. |
| ATEX Zone 1 (griplogic) | Insufficient. Group I M1 (mining, energized in firedamp) required. |

DHH miners exist (NIOSH 2019: ~25% of US coal miners have measurable NIHL by retirement; congenitally Deaf miners work surface prep and increasingly underground in SA / AU). They currently rely on tap-on-shoulder and cap-lamp Morse — both fail in dust and behind pillars.

---

## 1. System topology

```
                     SURFACE
   ┌──────────────────────────────────────────────┐
   │  Surface Gateway (dispatch room)             │
   │  ┌─────────┐   ┌────────────────┐            │
   │  │ RP2040  │──▶│ 457 kHz Class-D│──▶ TX coil │
   │  │ + Eth   │   │ PA, 50 W ERP    │   array   │
   │  │ + 4G LTE│   └────────────────┘   (3 loops │
   │  └─────────┘                          ortho) │
   └─────────────────┬────────────────────────────┘
                     │ through-rock VLF (457 kHz)
                     │ ~ 500 m vertical reach
                     ▼
   ╔═════════════════════════════════════════════════╗
   ║  UNDERGROUND — single miner kit                 ║
   ║                                                 ║
   ║   HELMET MODULE (cap-lamp replacement)          ║
   ║   ┌───────────────────────────────────────┐     ║
   ║   │ ESP32-S3 (IS-derated, see §5)         │     ║
   ║   │ Arducam ToF (downward, 1 m FOV)       │     ║
   ║   │ IR/UV-reject filter (dust-immune)     │     ║
   ║   │ DRV2605L → 2× LRA (temple R/L)        │     ║
   ║   │ 457 kHz RX ferrite-rod coil           │     ║
   ║   │ Cap-lamp LED 4500 lm (MSHA approved)  │     ║
   ║   │ CH4 catalytic sensor (regulatory ride-│     ║
   ║   │   along, NDIR alt verify-before-order)│     ║
   ║   └──────────────┬────────────────────────┘     ║
   ║          IS-rated tether (4-wire, fused)        ║
   ║   ┌──────────────▼────────────────────────┐     ║
   ║   │ BELT PACK                             │     ║
   ║   │ STM32L4 (lower power than S3)         │     ║
   ║   │ 457 kHz TX/RX (relay, peer-to-peer)   │     ║
   ║   │ 4× chest LRA quad-array               │     ║
   ║   │ nRF24L01+ 2.4 GHz mesh (LoS miners)   │     ║
   ║   │ LiFePO4 4.4 Ah (IS-cell, see §5)      │     ║
   ║   │ Methane catalytic head (redundant)    │     ║
   ║   └───────────────────────────────────────┘     ║
   ╚═════════════════════════════════════════════════╝
```

---

## 2. Helmet module

### 2.1 Mechanical

- **Form factor:** Drop-in replacement for Koehler Wheat 4000 / Northern Light Genesis cap-lamp. M22 thread on hard-hat bracket.
- **Shell:** Glass-filled PA66, antistatic carbon-loaded (surface resistivity 10^4–10^9 Ω, per IEC 60079-0 Group I). No painted plastic >100 cm² (electrostatic constraint).
- **Ingress:** IP67 minimum; dunkable for wash-down at lamp-room.
- **Mass:** ≤ 220 g (cap-lamp battery decoupled to belt — same as legacy).

### 2.2 Optics (the differentiator)

Downward ToF, not RGB. Reasons:

1. **Coal/silica dust attenuates visible** by 30–60 dB/m at full face cut. ToF at 940 nm punches through better than RGB and gives depth — which the gesture classifier actually wants.
2. **Cap-lamp glare** of the wearer's *own* 4500 lm LED blinds an RGB sensor pointed where the lamp shines. Narrow 940 nm bandpass filter (10 nm FWHM) rejects it.
3. **No "is it a face or a wall"** ambiguity — depth map gives instant figure-ground.

| Block | Part (verify-before-order) | LCSC | Note |
|---|---|---|---|
| ToF imager | Arducam ToF cam (VL53L8CX 8×8 zone) or OPT8241 | `C?????` | 8×8 too coarse for 25-sign vocab; consider Melexis MLX75027 320×240. |
| Bandpass filter | 940 ± 10 nm interference filter | `C?????` | Optical-grade glass, glued in shell. |
| Lens | 90° HFoV M12, AR-coated | `C?????` | Downward at ~30° forward tilt. |

### 2.3 Compute

- **MCU:** ESP32-S3-WROOM-1U-N16R8 (16 MB flash, 8 MB PSRAM) — `C?????` verify-before-order
- **IS derating:** Vcc clamped 3.0 V (not 3.3) via LDO with current-limit fuse, see §5. Wi-Fi/BLE radios **disabled** in firedamp zones (firmware-gated by methane sensor reading, redundant hardware kill).
- **Gesture model:** 25-class CNN on 8×8×30-frame depth tensor. Trained on Modified Bishop signal set + industry signs (stop / fire / gas / hoist / lower / man-down / OK / left / right / 12-direction / numerals).
  - Quantized int8 ~280 kB. Inference ~12 ms on S3 @ 240 MHz.

### 2.4 Haptics

- 2× LRA (linear resonant actuator) in temple pads, DRV2605L driver, ERM fallback.
- Patterns are **directional** (L vs R buzz tells the miner who waved at them and from which side).

### 2.5 Cap-lamp LED (regulatory ride-along)

MSHA 30 CFR Part 19/20 still requires a permissible cap-lamp. We keep one — 4500 lm Cree XLamp XHP70 family, regulated 1.0 A, IS current-limited. The module *replaces* the lamp; the lamp doesn't replace itself. Switch via captouch through-shell.

### 2.6 457 kHz receive

- Ferrite-rod antenna (10 mm × 80 mm, Mn-Zn, µi ≈ 5000), tuned LC tank.
- LNA → mixer → narrowband 100 Hz BW envelope detector.
- 457 kHz is the international avalanche-beacon band; in mine context, repurposed for one-way through-rock emergency push from surface (or refuge chamber) to all miners. **Receive-only on helmet** — TX is in belt pack so the helmet shell never carries the high-current loop.
- Modulation: 5 Hz on/off keying for haptic patterns: evacuate / shelter-in-place / stand-down / muster / radio-check. 5 codewords, ≥1 s Hamming distance, gloves-safe.

---

## 3. Belt pack

### 3.1 Mechanical

- 120 × 80 × 35 mm aluminum-housed (anodized, antistatic strap-eyelet). Mine-belt clip.
- IP67. Survives drop onto rock from 1.8 m (helmet-height fall).
- Tether to helmet: 4-conductor armored cable, screw-lock M8 connector, IS fused at both ends.

### 3.2 Electronics

| Block | Part | LCSC | Note |
|---|---|---|---|
| MCU | STM32L4R5ZIT6 | `C?????` | Lower idle current than S3; runs RTOS. |
| 457 kHz TX | Class-E PA, 1–5 W ERP into loop antenna | (custom) | IS limited — see §5. |
| Loop antenna | 30 cm dia, 8-turn 0.5 mm² Litz, weatherized | (custom) | Tucks behind self-rescuer. |
| 457 kHz RX | Same front-end as helmet | — | Belt-pack acts as relay if helmet RX shadowed. |
| 2.4 GHz mesh | nRF52840 module (Zigbee/Thread, custom mesh) | `C?????` | 30 m LoS miner-to-miner. |
| Haptic | 4× LRA in chest strap, DRV2605L × 2 | `C?????` | Directional + emergency pulse-train. |
| CH4 sensor | NDIR methane head (Dynament MSH-DP-HC) | `C?????` | Redundant to helmet sensor; vote-of-two. |
| Battery | LiFePO4 4.4 Ah, IS-cell certified | `C?????` | Group I M1 cell, see §5. |
| Charger | TI BQ25890 IS-modified | `C?????` | Lamp-room dock only. |

### 3.3 Mesh protocol

- 2.4 GHz nRF52, Thread-derived, 250 kbit/s.
- Sole job: forward gesture-recognition events to nearest miners (so a sign 5 m away triggers the recipient's chest haptic even if their helmet camera didn't see it).
- Crew-of-8 mesh tested in tunnel: 80–95% delivery within 30 m, falls off cliff past 50 m.
- **Not** an emergency channel. Emergency = 457 kHz from surface.

---

## 4. Surface gateway

| Block | Part | LCSC | Note |
|---|---|---|---|
| MCU | RP2040 dual-core | `C?????` | Plenty for 5-codeword TX scheduler. |
| 457 kHz PA | Class-D, 50 W ERP, 3-axis orthogonal loop antenna farm | (custom) | Located at portal or shaft collar. Penetrates ~500 m good rock, less in wet/conductive shale. |
| Network | Ethernet + Quectel EC25 4G LTE | `C?????` | Dispatch console. |
| Power | 24 V site rail, isolated | — | Surface = not IS-rated. |
| UI | 10" touchscreen dispatch console | — | Panic-button operator interface. |

**Operator flow:** Dispatcher hits "EVACUATE LEVEL 3" → gateway TX broadcasts evacuate codeword every 2 s for 90 s → every miner's belt pack receives + chest haptic pulses + helmet temple haptic confirms.

Through-rock latency: ~200 ms one-way. Acknowledged via miner tag at portal exit (not over RF).

---

## 5. Intrinsic safety analysis (the expensive part)

Cert target: **IECEx Ex ia I Ma** + MSHA permissible. Ex ia = "no ignition under two independent faults." Group I = mining (methane-air, 8.6% LEL). Ma = highest mining category, energized in firedamp.

### 5.1 Energy budget

Ignition energy of CH4-air at stoichiometric ≈ **0.28 mJ**. We design to <0.1 mJ stored anywhere accessible under double fault.

| Rail | V | I limit | Stored E (cap network) | Margin to 0.1 mJ |
|---|---|---|---|---|
| Helmet 3.0 V logic | 3.0 V | 100 mA (fused, dual-redundant) | <50 µJ | 2× |
| Helmet LED 1.0 A | 3.6 V | 1.05 A (1.10 A fast-blow ×2 series) | <80 µJ | 1.25× — tight |
| Belt 3.3 V logic | 3.3 V | 200 mA | <60 µJ | 1.6× |
| 457 kHz TX rail | 12 V | 500 mA (2 W into loop) | <90 µJ | 1.1× — TIGHTEST, may need to drop to 1 W ERP |
| LiFePO4 cell | 3.2 V | factory-IS-cert cell only | sealed | n/a |

**Surface temperature constraint:** ≤ 150 °C any accessible part (T3 group, Group I requires lower than T4 surface SKUs). Practically means generous heatsink on the LED driver and no exposed power resistors.

### 5.2 Component selection rules

- No electrolytics on accessible rails (replaced with ceramic + tantalum-IS-cert).
- No through-hole leads exposed (conformal coat all PCBs to IEC 60079-11 §6.3.13).
- Every signal entering/leaving the enclosure: TVS clamp + series fuse + zener barrier (galvanic isolation where feasible).
- Battery: IS-certified LiFePO4 only (not generic 18650). Verify-before-order; budget $80–120/cell vs $4 generic.

### 5.3 Certification path & cost

| Stage | $ | Months |
|---|---|---|
| Pre-compliance bench (NTS, Element, MET) | 25–40k | 3 |
| Design iteration | (internal) | 4 |
| IECEx Ex ia I Ma full test | 60–120k | 6 |
| MSHA 30 CFR Part 23/27 permissible | 80–200k | 9 (parallel) |
| Mine-site field trial (required for MSHA) | 30–80k | 4 |
| **Total cert** | **195–440k** | **~18 mo** |

This dominates BOM. See `ROI_ANALYSIS.md`.

---

## 6. Firmware

### 6.1 Helmet (ESP32-S3, ESP-IDF + FreeRTOS)

```c
// Pseudocode — gesture pipeline
void tof_task(void *_) {
  static int8_t window[30][8][8];
  uint8_t head = 0;
  while (1) {
    tof_read(&window[head]);          // 12 ms blocking
    head = (head + 1) % 30;
    if (head == 0) {
      uint8_t pred; float conf;
      cnn_infer(window, &pred, &conf); // ~12 ms
      if (conf > CONF_THRESHOLD &&
          pred < N_SIGNS &&
          !ch4_inhibit())             // gas-zone gate
      {
        haptic_pattern(SIGN_TO_PATTERN[pred]);
        mesh_broadcast(pred, conf);
      }
    }
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

// 457 kHz emergency RX — interrupt-driven, never gated
void IRAM_ATTR vlf_demod_isr(void) {
  uint8_t codeword = envelope_decode();
  if (hamming_valid(codeword)) {
    emergency_haptic(codeword);  // L+R temple, 100% duty for 3s
    belt_relay(codeword);        // belt re-broadcasts to mesh
  }
}
```

### 6.2 Belt pack (STM32L4, Zephyr RTOS)

- Three RTOS threads: VLF (highest prio), mesh, telemetry.
- Watchdog: 1 s, hardware-reset on fault.
- Methane vote-of-two: helmet sensor + belt sensor disagree → conservative max + alarm.

### 6.3 Surface gateway (RP2040, C)

- Bare-metal, no OS. Two cores: core0 = TX scheduler, core1 = Ethernet/4G stack.
- TX duty cycle limited to comply with ITU R-A (license note: many jurisdictions require a mine-specific authorization for 457 kHz transmit at >100 mW).

### 6.4 OTA

- **Helmet/belt: no OTA** (regulatory — any field code change voids permissible cert).
- Updates at lamp-room dock via signed image, wired only, re-cert check on every release.

---

## 7. Failure modes & lockouts

| Fault | Response |
|---|---|
| CH4 > 1% LEL | Wi-Fi/BLE/2.4 GHz radios hard-killed (FET + GPIO), miner alerted by triple-pulse temple haptic, lamp goes amber. |
| CH4 > 2% LEL | All non-essential rails off. 457 kHz RX + cap-lamp + haptic only. Belt pack chest pulse "evacuate" pattern. |
| Battery cell voltage out-of-spec | IS fuse trips, device dead but safe. |
| Helmet-belt tether disconnect | Both ends fail safe (IS fuses pop). Belt continues 457 kHz RX + chest haptic. Helmet keeps cap-lamp on emergency cell (10 min reserve). |
| Surface gateway loss | Belt packs continue peer-to-peer 457 kHz beacon every 30 s ("I am alive at level X"). No evacuate possible without surface — accepted limit. |

---

## 8. Vocabulary — 25 signs

Source: Modified Bishop (1992) + MSHA-published mining signals + Australian DMP standard. Specifics in `firmware/gesture_set.h`. Examples:

```
00 STOP            (flat palm, raised)
01 GO / PROCEED    (forward sweep)
02 RAISE / HOIST   (thumb up, repeated)
03 LOWER           (thumb down)
04 SLOW            (palm wave)
05 EMERGENCY       (cross arms over head)
06 GAS             (hand to throat)
07 FIRE            (open-close fist, upward)
08 MAN DOWN        (two-hand point-to-ground)
09 OK / ACK        (thumb-forefinger circle)
10 LEFT / RIGHT    (point)
11 NUMBERS 1–9     (finger count)
... [25 total]
```

Bishop-aware: ~70% overlap with hearing-mine signals, additions are DHH-derived (numeric ack, "repeat", "I-don't-understand").

---

## 9. Open risks

1. **457 kHz through wet shale** — attenuation can hit 40 dB/100 m. Some mines may need repeater nodes at intermediate levels (productize later).
2. **ToF in heavy-cut dust** — bench-tested to ~6 g/m³, real face cut hits 20+ g/m³. Mitigation: longer integration time, frame averaging; may drop classifier to 15 Hz.
3. **MSHA approval timeline** — historically 12–24 months after submission. Cash-flow risk.
4. **IS-cert LiFePO4 supply** — only 2–3 qualified vendors globally. Single-source risk.
5. **Mesh radio in firedamp** — currently planned to hard-disable. Industry trend (Strata) is moving to certified-IS 2.4 GHz; may revisit at v2.

---

End ARCHITECTURE.md
