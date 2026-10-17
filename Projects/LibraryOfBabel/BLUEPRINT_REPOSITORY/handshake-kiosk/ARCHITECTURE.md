# Handshake Kiosk — Architecture Blueprint

**Elevator pitch:** An IP65 stainless-steel triage kiosk that translates American Sign Language into synthesized speech and on-screen text in real time, replacing costly 24/7 video-relay interpreter subscriptions at hospital ERs, airport gates, and courthouse intake counters.

---

## Problem Statement

Three people walk into institutions at the worst possible times without a human interpreter in sight.

**The deaf ER patient at 3 am.** A 47-year-old deaf woman arrives at a community hospital ER with chest pain. The hospital's Video Remote Interpreting (VRI) contract covers day-shift hours; the night-shift charge nurse scrambles to load a tablet app, fumbles with the login, and spends eleven minutes on hold with the interpreter service while the patient grows increasingly anxious and unable to communicate her symptom history. When an interpreter finally connects, the tablet sits at the wrong angle, the connection drops twice, and critical triage questions — medication allergies, onset time, pain scale — are answered late. Studies show that language-access failures in the ER correlate with longer length of stay, higher rates of adverse events, and measurably lower patient satisfaction for deaf and hard-of-hearing patients.

**The airport gate-agent standoff.** A deaf traveler at a mid-size regional airport approaches the gate desk to clarify a seat assignment. The gate agent has no ASL training, no tablet VRI contract, and no pen and paper within reach. The boarding queue is twenty deep. Both parties gesticulate, misunderstand, and the traveler boards the wrong cabin class. The interaction cost: two minutes of dead time per non-English or non-hearing interaction, multiplied across thousands of daily gate transactions at 500+ US commercial airports.

**The courthouse pro-se filer.** A hard-of-hearing defendant representing himself in a misdemeanor arraignment cannot follow the clerk's rapid intake instructions. The courthouse interpreter is present only on Tuesday mornings. The defendant misses a deadline to request a continuance. This is a Constitutional access-to-justice failure, not an inconvenience.

Current solutions all require a human middleman on standby — either a contracted VRI service ($5–$15 per minute, subscription minimums in the thousands per month), a staff interpreter (salary + benefits, available only during business hours), or a general-purpose tablet loaded with a proprietary app that the deaf user must operate without training. No zero-touch, always-on, infrastructure-embedded solution exists in this form factor at this price point.

The Handshake Kiosk is bolted to the wall, always on, requires zero app installation, works with bare or gloved hands (glove mode degrades gracefully), and is maintained remotely. It is a piece of infrastructure, not a service subscription.

---

## System Block Diagram (ASCII)

```
┌─────────────────────────────────────────────────────────────────────┐
│                       HANDSHAKE KIOSK                               │
│                                                                     │
│  ┌──────────────┐   USB3   ┌─────────────────────────────────────┐  │
│  │ RGB Camera   ├──────────►                                     │  │
│  │ (1080p/60fps)│          │   NVIDIA Jetson Orin Nano 8GB       │  │
│  └──────────────┘          │                                     │  │
│                            │  ┌──────────────────────────────┐   │  │
│  ┌──────────────┐   USB3   │  │  Vision Pipeline             │   │  │
│  │ RealSense    ├──────────►  │  MediaPipe Hands → ROI crop  │   │  │
│  │ D435i Depth  │          │  │  MobileViT-S ASL Classifier  │   │  │
│  └──────────────┘          │  │  Fingerspelling fallback     │   │  │
│                            │  └──────────┬───────────────────┘   │  │
│  ┌──────────────┐   I2C    │             │ text output            │  │
│  │ Touch Panel  ├──────────►  ┌──────────▼───────────────────┐   │  │
│  │ (opt input)  │          │  │  TTS Engine (coqui / Polly)  │   │  │
│  └──────────────┘          │  └──────────┬───────────────────┘   │  │
│                            │             │                        │  │
│  ┌──────────────┐  HDMI/   │  ┌──────────▼───────────────────┐   │  │
│  │ 13" Sunlight ◄──────────┤  │  Display Controller          │   │  │
│  │ LCD 1000 nit │  DSI     │  │  (text overlay + UI)         │   │  │
│  └──────────────┘          │  └──────────────────────────────┘   │  │
│                            │                                     │  │
│  ┌──────────────┐  I2S/    │  ┌──────────────────────────────┐   │  │
│  │ Directional  ◄──────────┤  │  Audio Out (ALSA/PulseAudio) │   │  │
│  │ Speaker array│  USB DAC │  └──────────────────────────────┘   │  │
│  └──────────────┘          │                                     │  │
│                            │  ┌──────────────────────────────┐   │  │
│  ┌──────────────┐  GbE /   │  │  Operator Dashboard Agent    │   │  │
│  │ Network I/F  ◄──────────┤  │  (MQTT/WebSocket uplink)     │   │  │
│  │ (ETH + LTE)  │  USB3    │  └──────────────────────────────┘   │  │
│  └──────────────┘          └─────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  316 Stainless Steel Enclosure, IP65, Anti-microbial coating │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘

                          │ MQTT/HTTPS/WebSocket
                          ▼
              ┌───────────────────────┐
              │  Operator Dashboard   │
              │  (web app, cloud or   │
              │   on-prem server)     │
              └───────────────────────┘
```

---

## Subsystem Breakdown

### Vision — RGB + Depth Camera Pair

The RGB channel is an industrial-grade 1080p/60 fps USB3 camera (Leopard Imaging LI-USB30-IMX415 or equivalent Sony IMX415 sensor). A wide dynamic range sensor is non-negotiable: ER hallways mix fluorescent overhead light with direct patient-facing glare; airport gates have floor-to-ceiling window backlighting at dawn. The chosen sensor provides 120 dB HDR in still mode and adequate performance in 60 fps rolling mode.

The Intel RealSense D435i provides a depth stream (848×480 at 30 fps, ~3 % depth error at 1 m) via a second USB3 port. Depth serves three purposes: (1) automatic hand-ROI segmentation — the pipeline discards background clutter by masking pixels beyond 1.2 m; (2) 3D gesture normalization — scaling is corrected for hand distance, preventing sign size ambiguity; (3) liveness detection for privacy — the system activates only when a real hand is within 0.3–1.0 m, preventing inadvertent recording of bystanders.

Both cameras mount behind a flat AR-coated borosilicate window flush with the enclosure front face. The window doubles as vandal resistance (6 mm tempered) and maintains the IP65 seal.

MediaPipe Hands (21-keypoint skeleton, 30+ fps on Jetson GPU) extracts normalized hand landmarks from the RGB frame. Depth is fused per-frame to add z-coordinates, making the classifier orientation-agnostic in the sagittal plane. The combined 63-float landmark vector (21 × xyz) feeds the MobileViT-S classifier.

### Compute — Jetson Orin Nano 8GB vs Coral M.2

The primary compute module is the **NVIDIA Jetson Orin Nano 8GB (NVIDIA P3767-0005)**. At 10 W TDP it delivers 40 TOPS INT8 on the integrated DLA + GPU cluster. The MobileViT-S ASL classifier runs at ~25 ms/inference on INT8-quantized TensorRT, comfortably inside the 33 ms budget for 30 fps classification. MediaPipe Hands runs concurrently on the CPU cores (6× Arm Cortex-A78AE). Total measured thermal envelope: ~12 W under sustained dual-camera + inference load, handled by a passive copper heat spreader bonded to the enclosure rear panel (no moving parts, no fan noise in clinical environments).

The **Coral M.2 Accelerator (Google G313-00009-01)** is evaluated as a cost-down variant. A single Edge TPU delivers 4 TOPS at <2 W. Paired with a host SBC (e.g., Raspberry Pi CM4 or i.MX 8M Plus carrier), the full compute stack fits under 8 W. The trade-off: MobileViT-S at INT8 is 22 MB — marginally over a single Edge TPU's on-chip SRAM (8 MB parameter cache). In practice this causes ~2× latency increase from DRAM paging. The Coral variant is viable only if the ASL model is distilled to ≤8 MB (MobileNet-V3-Small backbone). ASL accuracy degrades ~4–6 % on the compressed model. Recommended only for pilot deployments with relaxed accuracy requirements or tight hardware budgets below $400 BOM.

Jetson Orin Nano is the production recommendation.

### Display — Sunlight-Readable LCD

Panel: **Innolux M133NWF4-R3** (or AUO G133HAN01.0), 13.3" FHD (1920×1080), 1000 cd/m² brightness, IPS, operating temperature –20 °C to +70 °C. 1000 nit is the minimum threshold for outdoor-readable-equivalent in direct sunlight; ER and airport environments occasionally see 80,000+ lux from windows. The panel is driven at 700–1000 nit depending on an ambient light sensor (ALS) reading to extend backlight LED lifetime.

A 6 mm AR-coated tempered glass overlay is bonded with optical adhesive (OCA) to eliminate air-gap reflections. The cover glass carries a NFRC-rated anti-glare coating (haze ≤ 3 %). Touch input is optional (projected capacitive) — the primary interaction is camera-based, but a touch fallback exists for typed input by hearing users.

### Audio — Directional Speaker

A **Focusound FS-16A parametric speaker array** (or equivalent Holosonics Audio Spotlight-equivalent) emits a 60° horizontal × 30° vertical beam. This is critical in open environments (airport gate hall, courthouse lobby) to avoid broadcasting sensitive medical or legal content to bystanders. Nominal SPL at 0.5 m: 78 dB. Driver: USB Class-compliant DAC (PCM2704 or equivalent) feeding a Class-D amplifier (TPA3110 or equivalent) at 10 W peak.

The audio path carries coqui-TTS synthesized speech (offline, GPU-assisted VITS model at ~40 ms latency) or fallbacks to Amazon Polly (cloud, requires internet uplink). A privacy mute button on the enclosure face disables the speaker; text-only mode is always available.

### Networking — Ethernet Primary, LTE Fallback

Primary: **IEEE 802.3ab Gigabit Ethernet** via the Jetson Orin Nano's onboard GbE port, terminated at the rear cable entry (RJ-45 with IP67 cable gland). Institutional networks with a VLAN-isolated IoT port are the target. TLS 1.3 is enforced for all dashboard telemetry.

Fallback: **Sierra Wireless EM9191 M.2 LTE Cat-20 module** (or Quectel RM502Q) in the Jetson carrier's M.2 E-key slot, SIM in a locked external nano-SIM tray. Used for: (a) cloud TTS when offline ASL model is insufficient, (b) operator dashboard heartbeat during Ethernet failure, (c) OTA firmware updates. LTE data budget: ~50 MB/day nominal.

Wi-Fi 6 (802.11ax) is available via the same M.2 slot as an alternative to cellular — institution-dependent.

### Enclosure — 316 SS, IP65, Anti-microbial

Enclosure material: **Grade 316 stainless steel, 2 mm sheet**, TIG-welded, electropolished finish. 316 (18 Cr / 10 Ni / 2 Mo) is specified over 304 for chloride resistance — hospital-grade disinfectants (quaternary ammonium, bleach solutions, isopropyl alcohol 70 %) are used on a schedule and 316 resists pitting corrosion from chloride contact. All external hardware (M6 captive screws, hinges) is A4-grade stainless.

IP65 seal: perimeter EPDM gasket, 3 mm cross-section, compressed to 40 % crush. Cable entries via stainless IP68-rated cable glands (Roxtec or equivalent). The cover glass-to-bezel interface is sealed with a silicone bead.

Anti-microbial treatment: **Microban antimicrobial additive** applied to the vinyl graphic wrap (front face only) and a proprietary silver-ion coating on the stainless steel surface (not FDA medical device treatment — cosmetic grade). Touch surfaces include a UV-C LED strip (265 nm, 100 mW) inside the enclosure that sanitizes the glass face during idle periods (>5 min no interaction), per a timed relay.

ADA reach range compliance: all interactive elements (camera capture zone, speaker, touch panel if present) within 15–48 inches from finished floor. Wall-mount bracket adjustable ±3 inches.

---

## Power Budget

| Subsystem                        | Typical (mW) | Worst Case (mW) |
|----------------------------------|-------------|-----------------|
| Jetson Orin Nano 8GB (10W TDP)   | 6,500       | 10,000          |
| RGB Camera (IMX415)              | 350         | 500             |
| RealSense D435i                  | 1,200       | 2,500           |
| 13" LCD (1000 nit full)          | 4,500       | 6,000           |
| LCD at 50% brightness            | 2,200       | —               |
| Directional Speaker (idle)       | 100         | 10,000 (peak)   |
| LTE Module (idle/tx)             | 200         | 3,500           |
| UV-C LED strip (sanitize cycle)  | 100         | 100             |
| Ancillary (fans=0, relays, etc.) | 200         | 400             |
| **TOTAL — Typical**              | **~13,150** | —               |
| **TOTAL — Worst Case**           | —           | **~33,000**     |

Input: 24 VDC @ 3 A nominal (72 W supply), 24 VDC @ 2 A worst-case peak handled by 80 W PSU with PFC. AC input: 100–240 VAC 50/60 Hz via hospital-grade IEC C14 inlet.

---

## Environmental Ratings

| Parameter                          | Rating / Spec                                    |
|------------------------------------|--------------------------------------------------|
| Ingress protection                 | IP65 (IEC 60529)                                 |
| Operating temperature              | –10 °C to +50 °C                                 |
| Storage temperature                | –40 °C to +70 °C                                 |
| Relative humidity                  | 5–95 % non-condensing                            |
| Vibration (transport)              | IEC 60068-2-6, 5–500 Hz, 2 g                     |
| Disinfectant compatibility         | Bleach (0.5%), IPA 70%, quaternary ammonium, H2O2 wipes — 316 SS + electropolish |
| Cover glass impact resistance      | 6 mm tempered, EN 12600 Class 1B1                |
| ADA height (interactive zone)      | 15"–48" from FFL, ANSI A117.1                    |
| FCC/CE emissions                   | FCC Part 15B (unintentional radiator), CE Mark target |

---

## Firmware / Software Architecture

**OS:** Ubuntu 22.04 LTS (Jetson-optimized BSP, JetPack 6.x). Yocto is evaluated but rejected for v1.0 — the Jetson JetPack BSP is Ubuntu-derived and community documentation is richer for rapid prototyping. Yocto migration is planned for production hardening (reduced attack surface, read-only rootfs via OverlayFS).

**Boot security:** UEFI Secure Boot with OEM key, signed kernel + initrd. Rootfs on 64 GB eMMC (read-only in production, writable overlay for logs/config). OTA updates via Mender.io client, A/B partition scheme.

**Vision pipeline (C++/Python hybrid):**
1. GStreamer pipeline ingests RGB (V4L2) and depth (librealsense SDK) streams.
2. MediaPipe Hands C++ API runs on CPU, outputs 21-keypoint landmarks at 30 fps.
3. Depth fusion module (custom C++, librealsense pointcloud API) adds z-coordinates.
4. MobileViT-S TensorRT INT8 engine runs inference on Jetson GPU (CUDA 12.x). Model trained on WLASL-200 + custom fingerspelling dataset (~150k samples). Confidence threshold: 0.75 — below threshold, system prompts for clarification or switches to fingerspelling letter-by-letter mode.
5. Language model post-processor (sentencepiece tokenizer + 4-gram language model) smooths classifier output into grammatically plausible phrases.

**TTS:** coqui-TTS VITS model (offline, ~40 ms latency, runs on Jetson CPU). Amazon Polly (cloud) is invoked as fallback when confidence in the sign reading is low and a clearer phrasing is needed. Polly adds ~200 ms RTT. All audio is logged only as transcribed text (no audio recording), with a 30-second rolling buffer that is discarded unless a staff-review flag is set.

**Operator Dashboard:** Lightweight MQTT broker (Mosquitto) on the kiosk publishes session-start/end events, confidence scores, error states, and sanitization cycle logs. A Node.js web dashboard (self-hosted or cloud) aggregates a fleet of kiosks. WebSocket push for real-time alert (kiosk offline, repeated low-confidence events suggesting model degradation). Dashboard does NOT receive video or audio data by default — HIPAA/GDPR compliance by design.

**Privacy / Security:** Camera activates only when occupancy sensor (PIR + depth threshold) detects a user. No facial recognition. No persistent image storage. TLS 1.3 for all network traffic. Operator accounts use TOTP MFA. Annual penetration test required by contract for healthcare deployments.

---

## Top 5 Risks + Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|------------|--------|------------|
| 1 | **ASL classifier accuracy on regional dialects / Black ASL** | High | High | WLASL-200 training set has documented bias toward standard ASL. Mitigation: augment dataset with Black ASL corpus (Bridges ASL dataset); implement active-learning pipeline where operator-flagged errors feed back to retraining queue; publish accuracy metrics by dialect in datasheet. Never claim >85% accuracy in marketing. |
| 2 | **Cover glass glare in direct sunlight / backlit environments** | Medium | Medium | AR coating (reflectance <0.5%) + optical bonding eliminates air-gap reflection. Circular polarizer option for airports. ALS-controlled backlight ensures 1000 nit in high-ambient conditions. |
| 3 | **Vandal resistance / enclosure tampering** | Medium | Medium | 316 SS 2mm sheet resists casual vandalism. Captive Torx T20 security screws, no exposed USB ports on front face. Internal tamper-evident microswitch logs to operator dashboard. Anchor via M12 through-bolts to structural wall. |
| 4 | **GDPR / HIPAA compliance — inadvertent biometric data capture** | High | High | No facial recognition, no persistent image storage, no audio recording. Camera activates only on occupancy trigger. All telemetry is aggregated/anonymized. Legal review required before EU deployment (GDPR biometric data rules, Article 9). US healthcare deployments require BAA with cloud TTS vendors (AWS Polly). |
| 5 | **FDA medical device classification (Software as a Medical Device — SaMD)** | Medium | High | The kiosk assists communication but does not diagnose or treat. Likely falls under FDA Software as a Medical Device guidance as a Class I or exempt device if marketed for communication assistance, not clinical decision support. Legal counsel must confirm classification before any claims about triage support. Position product as "communication aid" not "medical device" in v1.0 marketing. |
