# TECHNICAL SPEC — CyberDeck CV Sign-to-Beat & Motion-to-Synth

**Session:** dhh-curriculum
**Version:** 0.1 (curriculum-pilot)
**Status:** Reference architecture for the K-12 lesson plans. Implementation roadmap, not a fielded design.
**Aligned to:** GestoLumina paper (Hergert et al., NIME '24); CyberDeck application (Simeone, 2026); Sonic Agency paper (Cavdir et al., ASSETS '25); NEA #1949260.

---

## 1. Scope

This document describes the hardware and software architecture of the CyberDeck as used in the Sonic Agency Curriculum. It focuses on two novel modules:

- **Sign-to-Beat** — computer-vision pipeline that detects ASL handshapes and triggers drum/sample events.
- **Motion-to-Synth** — IMU-driven OSC mapping that turns body movement into synthesis parameter changes.

Both modules share a common audio engine, haptic broadcaster, and LED visualizer, all hosted on the same CyberDeck.

A successful implementation must:
- Run entirely **on-device** (no cloud) so it works in field deployments with no internet (per CD p.1).
- Sustain ≤ **10 ms** end-to-end latency for IMU-driven OSC events (Motion-to-Synth) and ≤ **50 ms** for CV-driven events (Sign-to-Beat, including camera + inference).
- Support **up to 4 simultaneous PULSE vests** and **2 LED arrays** per CyberDeck.
- Be **open-source**, replicable from off-the-shelf parts, and forkable by 9-12 grade students (Pillar 4).

---

## 2. Hardware Architecture

### 2.1 CyberDeck core
| Component | Selection | Rationale |
|---|---|---|
| Compute | Intel NUC-class x86 SBC OR Raspberry Pi 5 (8 GB) | x86 supports MediaPipe + JupyterLab smoothly; Pi 5 is the field-deploy fallback. |
| Storage | 512 GB NVMe (or microSD for Pi) | Holds OS, curriculum images, student data partitions. |
| Display | 7" capacitive touchscreen (1024×600) | Front-panel UI for K-2 presets and 9-12 IDE. |
| Camera | USB UVC 1080p with manual focus, fixed lens | For CV pipeline. Must support 30 fps at 720p. |
| Audio | USB Class-Compliant audio interface (Behringer UMC22-class) | Headphone out, mic in, ¼" line in (for marimba etc.). |
| BLE / Wi-Fi | Built-in (RP5) or Intel AX wireless module | BLE 4.2+ required for PULSE/GeLu pairing. |
| GPIO breakout | Adafruit STEMMA/QT hub | For student hardware projects (LP-10, LP-11). |
| Power | Solar + handcrank + 18650 bank + USB-C PD input | "Omnivorous" per CD p.1. |
| Enclosure | Pelican-1450 footprint with 3D-printed bezel | Rugged for school + field deployment. |

### 2.2 PULSE haptic vest
- Adapted from Woojer / EPK reference architectures (NEA p.8, SA §5.1.1).
- 4 independently driven voice-coil actuators (chest L, chest R, shoulder L, shoulder R).
- Per-channel: 20-200 Hz response, optional high-frequency tweeter mode for 200-1000 Hz.
- BLE-Audio receiver (LE Audio LC3 preferred) for sub-30 ms wireless latency.
- Local battery: 3000 mAh, 6-hour active use.

### 2.3 GestoLumina (GeLu) wristware
- Per GL §4 spec table:
  - MCU: LilyGo T-Display-S3 (ESP32-S3, 240 MHz dual-core).
  - IMU: MPU-6050 (3-axis accel + 3-axis gyro).
  - FSR: DF9-16 fingertip sensors.
  - Haptic: 10×3 mm ERM motors driven by L298N H-bridge.
  - LED: Pixelblaze ESP32 + Sensor Extension Board, WS2812B strip.
  - BLE-MIDI to CyberDeck.
  - Round-trip latency: < 2.3 ms (LED/haptic) measured (GL §4.3).

### 2.4 AudioLux LED array
- WS2812B strip (per CymaSpace AudioLux research — NEA p.3).
- Driven by Pixelblaze ESP32; mic input through Sensor Extension Board.
- Configurable bin → palette mapping (the firmware students hack in LP-10).

---

## 3. Sign-to-Beat Module

### 3.1 Data flow
```
                ┌──────────────────────────────────────────────────────┐
   Camera ─►   │ MediaPipe Hands  ─►  Landmark Smoother  ─►  Handshape │
   (USB,  )   │ (21 keypoints,        (1-Euro filter,         Classifier│
   720p30 )   │  GPU/CPU)              cutoff 1 Hz)           (k-NN/MLP)│
                └──────────────┬──────────────────────────────────────┘
                               │ class id + confidence
                               ▼
                ┌──────────────────────────────────────────────────────┐
                │ MIDI/OSC Router (per-class debounce, hold-time gate) │
                └──────────────┬──────────────────────────────────────┘
                               ▼
                ┌──────────────────────────────────────────────────────┐
                │  Audio engine (Pd/SuperCollider)   PULSE broadcaster │
                │  Drum sampler                       AudioLux mirror  │
                └──────────────────────────────────────────────────────┘
```

### 3.2 Detection
- MediaPipe Hands @ 720p, 30 fps.
- 21 hand landmarks × 3 coordinates (x, y, z relative to wrist).
- Per-frame inference latency on x86 CPU: ~10-15 ms; on Pi 5 with XNNPACK: ~25-35 ms.

### 3.3 Smoothing
- One-Euro filter on each landmark vector (cutoff 1 Hz at low motion, increases with derivative). Suppresses jitter without adding noticeable lag for percussive use.

### 3.4 Classification
- Feature vector: normalized landmark coords (translate so wrist = origin; scale so middle-finger-MCP-to-wrist = 1).
- Baseline classifier: k-NN with k=5, cosine distance. (Chosen for simplicity in LP-11.)
- Advanced classifier: 3-layer MLP, 63 → 64 → 32 → C (C = number of classes); softmax output. (LP-11 extension.)
- Default class set (curriculum baseline): **5, S, B, V** (LP-07). LP-11 expands to ≥ 5 classes.
- Export to ONNX for on-device inference via `onnxruntime`.

### 3.5 Event router
- Threshold confidence: 0.7 (configurable per class).
- **Onset debounce:** 80 ms — only one trigger per handshape every 80 ms, prevents stutter.
- **Hold-time gate:** handshape must be held ≥ 60 ms before triggering — eliminates accidental triggers from transient configurations (per SA §5.1.3 — the system must not trigger during normal signing).
- Each class → MIDI note out (channel 10 = drums). Configurable per-student override in `.map` files (LP-07 Session 2).

### 3.6 Sign-aware idle mode
- Critical Pillar-3 invariant: when a student is *signing normally* (not performing), the system must not flood the drum bus.
- Mechanism: a continuous-signing detector watches landmark velocity over a 2-second rolling window. If sustained motion > threshold and 3+ class transitions per second, the router muted automatically with a visible "idle" indicator on the touchscreen.
- This addresses SA §5.1.3's interference concern directly and is the curriculum's signature accessibility innovation.

### 3.7 Latency budget (camera → audio onset)
- Camera capture & USB transit: ~15 ms.
- Landmark inference: ~15 ms (x86) / ~30 ms (Pi 5).
- Smoothing + classifier: ~3 ms.
- Router + sampler: ~5 ms.
- Audio output (PortAudio @ 256 frames @ 48 kHz): ~5 ms.
- **Total target: ≤ 50 ms** on x86, ≤ 70 ms on Pi 5.
- BLE-Audio to vest: an additional 20-30 ms (acceptable since vest is felt, not heard, and Deaf performers report tolerance for slightly higher haptic latency, SA §5.1.1).

---

## 4. Motion-to-Synth Module

### 4.1 Data flow
```
   GeLu IMU ─► BLE-MIDI (14-bit CC) ─► CyberDeck OSC bridge ─►
   ─► Mapping engine (per-student .json) ─► Synth (Pd / SC) ─►
   ─► Audio out + PULSE broadcaster + AudioLux mirror
```

### 4.2 Sensor pipeline
- MPU-6050 sampled at 100 Hz on the GeLu MCU.
- On-board complementary filter fuses accel + gyro into pitch / roll / yaw at 100 Hz.
- Quantized to 14-bit CC values (0-16383) and emitted as BLE-MIDI CC#0 (pitch), CC#1 (roll), CC#2 (yaw).
- Latency MCU → MIDI receiver: ~5 ms.

### 4.3 OSC bridge
- CyberDeck runs a Python (`mido` + `python-osc`) bridge that translates incoming BLE-MIDI CCs to local OSC at `127.0.0.1:9000`.
- Each student has a `mappings/<student-id>.json` that defines:
  - source: `cc.0` / `cc.1` / `cc.2`
  - destination: OSC path (e.g., `/synth/cutoff`, `/synth/q`, `/fx/reverb`)
  - curve: linear / log / exp
  - range: `[min, max]` in OSC units.
- Edited via a touchscreen UI on the CyberDeck (LP-08), or by hand in the `mappings/` directory (LP-10 advanced).

### 4.4 Synth engine
- **Default engine:** Pure Data patch `motion_synth.pd` — saw oscillator → LPF → reverb.
- **Alternative engine:** SuperCollider `motion_synth.scd` for 9-12 students who want to write SynthDefs.
- Both engines accept a fixed OSC contract:
  - `/synth/freq <Hz>`
  - `/synth/cutoff <Hz>`
  - `/synth/q <float>`
  - `/synth/gate <0|1>`
  - `/fx/reverb <0..1>`

### 4.5 Latency budget (motion → audio)
- IMU sample → MIDI: 5 ms
- BLE transit: 7-10 ms
- OSC bridge: < 1 ms
- Synth processing (Pd, 128 frames): ~3 ms
- Audio out: 5 ms
- **Total target: ≤ 25 ms.** Achievable on x86 hardware.

---

## 5. Shared Services

### 5.1 PULSE broadcaster
- Single service `pulse_bcast` reads the mono mix of the audio engine.
- Splits into per-channel sends based on a routing table (set in `pulse_routes.json` and edited via LP-04 UI).
- Encodes per channel as LE-Audio LC3 stream; broadcasts via BLE to vests in audience or on stage.
- Each vest can subscribe to any subset of the 4 channels.

### 5.2 AudioLux mirror
- Reads the same mono mix, runs FFT (1024-point @ 48 kHz, Hann window), sends band magnitudes via UDP to Pixelblaze LED controllers.
- Pixelblaze firmware (the file students modify in LP-10) maps bands → palette + intensity.

### 5.3 Captions sidecar (CD p.1: on-device speech-to-text)
- `whisper.cpp` running on the CyberDeck takes any mic input, emits live captions on the touchscreen.
- Used during artist talks (LP-12), mixed-hearing rehearsals, and as accessibility insurance during teacher instruction.

### 5.4 Student data partition
- All student-generated artifacts (`.score`, `.map`, `.loop`, `.osclog`, datasets, model weights) live under `/students/<student-id>/`.
- The partition is encrypted at rest with a per-student key derived from a printed QR card.
- Nothing leaves the device unless a student explicitly exports it (NEA Data Management Plan, p.18).

---

## 6. Software Stack

| Layer | Technology | Notes |
|---|---|---|
| OS | Debian 12 / Ubuntu 24.04 LTS | Stable LTS for the school year. |
| Audio | JACK2 + ALSA, low-latency kernel | RT priority on the audio thread. |
| DSP runtime | Pure Data 0.54, SuperCollider 3.13 | Pd for K-8 presets, SC for 9-12 extensions. |
| ML | MediaPipe 0.10, scikit-learn 1.5, onnxruntime 1.18 | All on-device. |
| UI | Electron + React (custom touchscreen shell) | Auto-loads grade-band preset. |
| Captions | whisper.cpp (small.en model) | ~150 MB; on-device. |
| Source control | Git + Gitea (self-hosted on CyberDeck) | Students push to local Gitea; teacher mirrors to GitHub for public release. |

---

## 7. Configuration Surfaces (where students touch the system)

| Lesson | Layer modified | File / UI |
|---|---|---|
| LP-04 | PULSE routing | `pulse_routes.json` via touchscreen UI |
| LP-05 | Score sequencer state | `.score` files |
| LP-07 | Sign → drum mapping | `mappings/<student>.map` |
| LP-08 | IMU → OSC mapping | `mappings/<student>.json` |
| LP-09 | Euclidean rhythm state | `.euclid` files |
| LP-10 | Pixelblaze LED firmware | Pixelblaze pattern file (JS-like dialect) |
| LP-11 | Handshape classifier weights | `models/<student>.onnx` |
| LP-12 | Everything above + full repo | Public GitHub repo per student |

A student can graduate from "preset chooser" (K) to "repo maintainer" (12) by climbing this ladder.

---

## 8. Open Issues / Roadmap

- **Real-time on Pi 5.** MediaPipe Hands on the Pi 5 is borderline at 30 fps; we may need TFLite-XNNPACK with a smaller hand model or to drop to 480p.
- **LE-Audio adoption.** Many vests today use Classic Bluetooth A2DP (high latency). The PULSE design assumes LE-Audio LC3 which has < 30 ms wireless latency but limited adapter support in 2026; fall-back is a tethered analog driver (vest cable).
- **Power budget.** Sustained MediaPipe + LE-Audio broadcasts draw ~12-15 W. Solar panel must be ≥ 50 W with a 100 Wh battery to ride out school-day classroom use. Field-deploy (festivals, workshops) needs the handcrank or thermoelectric option.
- **CV bias.** Classifier performance drops on darker skin tones and on hands with prosthetics. LP-11 explicitly assigns students to surface this. Plan for an audit at the end of pilot year, jointly with EWU Music Education and CRIS (per NEA p.21).
- **Cochlear-implant programming.** The NEA application calls out CI filterbank optimization (NEA p.6 + p.19); this falls under the OHSU Reiss-Lab partner's scope, not this technical spec, but the Motion-to-Synth audio output should expose a "CI-friendly" preset whose spectral envelope sits within typical CI map bands.

---

## 9. Reference Implementations (existing code)

- GestoLumina firmware: https://github.com/DillonSimeone/Gestolumina (GL §6).
- AudioLux Pixelblaze patterns: CymaSpace internal repo, to be open-sourced as part of curriculum release (NEA p.3).
- ASL Champ! handshape datasets (NEA ref 27) — partner-licensed; may seed LP-11 baseline classifier.
- CymaSpace haptic vest research (NEA p.3) — non-open; we negotiate a curriculum-license carve-out with Woojer (NEA p.19, partner).

---

## 10. Acceptance Tests (for the curriculum pilot)

A CyberDeck unit is curriculum-ready when:
1. Boots from cold in ≤ 60 s into the preset menu.
2. Pairs a Woojer-class vest in ≤ 10 s.
3. Pairs a GeLu wristware in ≤ 10 s.
4. Sign-to-Beat preset triggers within ≤ 50 ms on the 5 handshape with the bundled k-NN model.
5. Motion-to-Synth preset reacts within ≤ 25 ms of wrist tilt.
6. Survives a 1-meter drop in the closed pelican case.
7. Runs ≥ 6 hours from a fully charged 100 Wh battery in active classroom use.

Each of the 12 lesson plans was authored against this acceptance contract.
