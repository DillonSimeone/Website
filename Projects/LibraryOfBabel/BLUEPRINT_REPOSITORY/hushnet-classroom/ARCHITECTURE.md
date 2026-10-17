# HushNet Classroom

**Elevator pitch:** A privacy-first distributed ceiling-mesh that detects ASL raised-hand handshapes and queues them in turn on the teacher's haptic bracelet — zero raw video ever leaves the ceiling tile.

---

## Problem Statement

Three real users drive this product.

**User 1 — ASL-fluent teacher at a deaf school (e.g., Gallaudet University clinical campus, Indiana School for the Deaf).** She runs a seminar, turns to the whiteboard to diagram a concept in written English, and loses visual contact with twelve students who are simultaneously trying to flag a question in ASL. She can't grow eyes in the back of her head. A student raises a "Q" handshape (the ASL convention for "question"), holds it for several seconds, lowers it in frustration, and the moment is lost. Participation data from DHH classrooms consistently shows that students who can't catch the teacher's attention disengage faster than hearing peers, compounding academic inequity already driven by communication access gaps.

**User 2 — Hearing teacher in a K-12 inclusion classroom with DHH students.** She is ASL-fluent and uses an interpreter, but the interpreter is covering the lecture feed. The DHH student at the back left raises a "P" handshape (point-of-information, a parliamentary hand signal adopted in Deaf school culture). The hearing teacher misses it because she is scanning the hearing students for raised hands at the same time. The DHH student's contribution is skipped. Systematic invisibility of this kind, repeated daily, has documented effects on academic self-efficacy.

**User 3 — University DHH student in a large lecture hall.** The professor cannot consistently scan 200 seats for ASL signals between hearing raised hands. The student needs equitable turn-taking, not just CART captioning of other people's speech. CART and Ava solve the "I can't hear what's being said" problem; HushNet solves the "I can't get a word in" problem — a separate, under-served access barrier.

The root problem is spatial: raised-hand detection is a vision task, classrooms are large, and teachers have one pair of eyes. HushNet moves the detection task into the ceiling and closes the loop through the teacher's wrist rather than their field of view.

---

## System Block Diagram

```
 CLASSROOM CEILING (drop-tile grid)
 +-----------+   +-----------+   +-----------+
 | Tile-A    |   | Tile-B    |   | Tile-C    |
 | ESP32-S3  |   | ESP32-S3  |   | ESP32-S3  |
 | HM01B0    |   | HM01B0    |   | HM01B0    |
 | Ethos-U55 |   | Ethos-U55 |   | Ethos-U55 |
 | 850nm NIR |   | 850nm NIR |   | 850nm NIR |
 | 802.11s   |   | 802.11s   |   | 802.11s   |
 +-----+-----+   +-----+-----+   +-----+-----+
       |               |               |
       +-------+-------+-------+-------+
               | IEEE 802.11s mesh backhaul
               | (classification events only,
               |  no raw video)
               v
      +------------------+
      | Mesh Aggregator  |  (PoE-powered RPi CM4 or
      | (in drop ceiling  |   similar, 1 per classroom)
      |  or J-box)       |
      | - raise-queue    |
      | - time-ordering  |
      | - BLE beacon     |
      | - optional cloud |
      |   syslog         |
      +--------+---------+
               |
         BLE 5.x (or 802.11 2.4GHz)
               |
               v
      +------------------+
      | Teacher Bracelet |
      | ESP32-S3         |
      | DRV2605L + LRA   |
      | SSD1306 OLED     |
      | 400mAh LiPo      |
      +------------------+
```

---

## Subsystem Breakdown

### 1. Ceiling Unit — Camera + NIR Illuminator

**Sensor selection.** The Himax HM01B0 is the preferred primary sensor: 320x320 resolution, 2 mW active power, I2C/SPI interface, QVGA output sufficient for handshape classification at 9-foot ceiling height. The Omnivision OV5640 is the fallback for higher-resolution needs but draws ~200 mW and requires a faster bus, making it harder to power-budget per tile.

**NIR for ambient-light invariance.** Classrooms vary from fluorescent to LED to near-dark. A 4x 850 nm LED illuminator ring (each LED ~200 mW driven at 100 mA duty-cycled) provides consistent frame illumination regardless of ambient. 850 nm is invisible to human observers (no distraction) and passes through standard IR-cut-removed sensor windows. The HM01B0 has no IR cut filter from factory, making it a natural fit.

**FOV calculation at 9-foot ceiling.** At 2.7 m mounting height, a 110-degree diagonal FOV lens covers roughly a 3.6 m x 3.6 m floor footprint. A standard 24"x24" drop-tile grid places tiles every 0.6 m. An 8-tile deployment in a 6m x 6m room provides overlapping coverage with at least 2 tiles covering any seated student. Overlap is intentional: the aggregator de-duplicates raise events by seat zone ID, not by tile.

**Mounting.** The PCB mounts flush to the back of a drop-ceiling tile blank. The lens protrudes 4 mm through a 12 mm laser-cut aperture. NIR LEDs sit in a 50 mm ring around the aperture, diffused by a laser-cut PETG lens ring.

---

### 2. Edge Inference

**Option A — Alif Ensemble E7 (preferred).** The Alif Semiconductor Ensemble E7 integrates a Cortex-M55 with Arm Ethos-U55 NPU (256 MACs), an M4 housekeeping core, and a camera interface in one package. The Ethos-U55 at 256 MACs delivers ~50 TOPS/W at INT8. A MobileNetV2-derived handshape classifier at 96x96 input runs in under 10 ms per frame at 1-5 fps inference rate, leaving abundant headroom. This is the clean architecture: dedicated NPU, no ESP32-S3 compute bottleneck.

**Option B — ESP32-S3 with TFLite-Micro (fallback).** The ESP32-S3's dual 240 MHz Xtensa LX7 cores can run TFLite-Micro with the SIMD DSP extensions. A pruned INT8 MobileNetV1 at 64x64 input runs at roughly 3-8 fps depending on model complexity. Accuracy is adequate for three-class detection (open-palm, Q-shape, P-shape) but power draw is 120-200 mW during inference vs. ~30 mW for the Ethos-U55 approach. For a PoE-powered tile the power difference is manageable; the inference latency is the real concern — missed raises during write-on-board moments require <2 s detection latency.

**Model training note.** The classifier must be trained on a dataset representative of diverse hand sizes, skin tones, and lighting conditions. ASL Citizen (UW, 2023) and the WLASL dataset are starting points. Fine-tuning on in-classroom data (with explicit community consent) is required before deployment — flagged as Risk #1 below.

**Pipeline.** Camera frame → resize to 96x96 → INT8 quantized inference → if confidence > 0.92 threshold → emit raise event {tile_id, handshape_class, timestamp, zone_id} over mesh.

---

### 3. Mesh Radio

**IEEE 802.11s on ESP32-S3 (selected).** The ESP32-S3's 802.11 b/g/n radio supports 802.11s mesh natively via ESP-IDF's ESP-MESH library. Mesh self-heals, requires no AP infrastructure, and supports 6-10 nodes per classroom comfortably. Event payloads are tiny (<100 bytes per raise event), so 802.11s overhead is negligible. The aggregator node acts as the root, bridging to wired Ethernet or BLE toward the bracelet.

**Thread (considered, not selected).** Thread over 802.15.4 has superior latency and power at the cost of requiring a separate Thread radio (e.g., nRF52840 companion). Adds BOM complexity and a second firmware stack. Not justified for this payload size.

**Sub-GHz (considered, not selected).** 915 MHz LoRa or Sub-GHz proprietary (e.g., Si4463) provides excellent penetration but limits bandwidth and requires FCC Part 15 certification for each radio module. Overkill for a within-classroom mesh.

**Chosen configuration.** All ceiling tiles run ESP32-S3 in 802.11s mesh mode. One tile or a dedicated PoE node acts as the mesh root and bridges events to the teacher bracelet via BLE 5.x advertisement packets (one-way event push, <1 kbps).

---

### 4. Teacher Bracelet

The bracelet is a wristband device worn by the teacher. It closes the loop from ceiling detection to teacher awareness without requiring the teacher to look at anything.

**ESP32-S3** handles BLE reception, queue management, and OLED + haptic output. It connects to the classroom aggregator's BLE beacon.

**DRV2605L haptic driver** drives a Linear Resonant Actuator (LRA) for precise, low-distortion tactile pulses. Distinct pulse patterns encode handshape type: single long pulse = open-palm raise, two short = Q-shape (question), three rapid = P-shape (point-of-information). The teacher learns the pattern in under an hour per field test protocol.

**SSD1306-class 128x32 OLED** displays a minimal queue: "3 hands — next: Zone 4 [Q]" — enough to name the zone without requiring the teacher to interpret haptic only.

**Battery.** 400 mAh LiPo, USB-C charging, ~8-hour runtime at typical duty cycle (BLE RX + occasional haptic + OLED on-demand).

**Form factor.** A 50 mm x 30 mm x 12 mm PCB in a silicone over-mold wristband, similar in profile to a Fitbit Alta. Not a smartwatch — purpose-built, no notifications, no distractions.

---

### 5. Aggregator / Installation Server

One PoE-powered node per classroom (can be a dedicated ceiling tile slot or a small enclosure in the J-box).

**Hardware.** Raspberry Pi Compute Module 4 (CM4) on a custom carrier, or equivalent Linux SBC. Runs the raise-queue arbiter, deduplication, and optional cloud syslog (privacy-preserving: events only, no video).

**Queue arbitration.** Each ceiling tile timestamps its raise event at detection (NTP-synchronized across the mesh). The aggregator orders raises by timestamp, breaking ties by zone ID (alphabetical, deterministic). The queue is a FIFO of {zone_id, handshape, timestamp}. When the teacher acknowledges (wristband button press), the front of the queue is dequeued and the next item triggers a haptic pulse.

**OTA.** Firmware updates for all ceiling tiles distributed via the aggregator over 802.11s using ESP-IDF's OTA partition scheme. Update windows are configurable (e.g., only during non-school hours).

**Cloud syslog (optional).** JSON event log (no images, no video) pushed to a school-controlled syslog endpoint for session analytics. FERPA-compliant because no student biometric or raw video data is transmitted — only anonymous zone-level raise events.

---

### 6. Enclosure

**Drop-ceiling tile replacement.** The unit replaces a standard 24"x24" (610 mm x 610 mm) lay-in ceiling tile. PCB mounts to a 16-gauge steel backing plate, which rests on the T-bar grid. The backing plate is the structural element; the aesthetic face is a white ABS panel matching standard tile appearance.

**Fire rating.** The enclosure and all materials in the plenum space must be UL 2043 listed (plenum fire and smoke rated). ABS face panels must be UL 94 V-0 or better. Wire runs in the plenum must use CMP (Communications cable, Plenum) rated cable per NFPA 70 Article 800.

**Impact rating.** The bottom-facing ABS panel is rated IK06 (1 joule impact resistance) — sufficient for a classroom ceiling at 9-foot height.

**Thermal.** The Alif E7 + ESP32-S3 + 4x NIR LEDs dissipate ~2.5 W total per tile. Passive convection via a perforated top panel into the plenum is sufficient; no active cooling required.

---

## Power Budget

| Component | Active Draw | Duty Cycle | Avg Power |
|---|---|---|---|
| HM01B0 camera | 2 mW | 20% (1 fps) | 0.4 mW |
| Alif E7 (inference) | 120 mW | 15% | 18 mW |
| ESP32-S3 (mesh radio) | 200 mW | 30% | 60 mW |
| 4x 850nm NIR LEDs | 800 mW | 10% (burst) | 80 mW |
| PoE circuitry overhead | 200 mW | 100% | 200 mW |
| **Total per tile** | | | **~360 mW** |

**PoE allocation.** IEEE 802.3af Class 1 provides 3.84 W per port, well above the 360 mW average draw. Peak draw (all components active simultaneously) is approximately 1.4 W — still within 802.3af Class 1. A standard 8-port PoE switch at 15.4 W per port provides 123 W total, more than sufficient for 12 ceiling tiles plus the aggregator node.

**Per-classroom PoE budget (12 tiles + 1 aggregator):**
- 12 x 1.4 W peak = 16.8 W peak
- 1 x aggregator (RPi CM4 + carrier) = 5 W
- **Total peak: ~22 W** — fits comfortably on a single 8-port 802.3af switch (61.6 W capacity at Class 1)

---

## Compliance

**UL 2043 (Plenum Fire Rating).** All materials placed in the air-handling plenum space above drop ceilings must be UL 2043 listed or use UL 2043-rated enclosures. The HushNet ceiling unit uses a UL 2043-certified steel enclosure with UL 94 V-0 rated face panels. PoE cabling uses CMP-rated Cat6. This is a hard requirement for school installation and must be verified with AHJ (Authority Having Jurisdiction) before each deployment.

**NFPA 70 (National Electrical Code).** Article 800 covers communications wiring. PoE runs in the plenum require CMP-rated cable. Low-voltage PoE (48 VDC) does not require conduit in most jurisdictions but local AHJ review is required.

**FERPA Privacy Posture.** FERPA restricts collection of student education records. HushNet's privacy-by-construction design — only handshape classification events (no images, no video, no biometrics) leave the ceiling tile — means the system does not collect student PII or biometric data. Anonymous zone-level raise events are comparable to a teacher's manual hand-raise log. Legal review is still recommended before deployment in any school district; this analysis is not legal advice.

**ADA / Section 508.** This product is an assistive technology for DHH inclusion. It does not introduce new barriers and is designed to reduce an existing access barrier. Section 504/508 compliance is a benefit argument, not a constraint.

---

## Firmware

**ESP-IDF** is the base framework for all ESP32-S3 firmware. The ceiling tile firmware consists of:

1. **Camera driver** — I2C init for HM01B0, DMA frame capture at 1-5 fps, grayscale 96x96 crop-and-resize.
2. **TFLite-Micro inference pipeline** — INT8 quantized three-class model, confidence threshold gate (0.92), debounce timer (minimum 2 s between raise events per zone to prevent double-detection).
3. **Mesh radio** — ESP-MESH initialization, node role assignment (root = aggregator tile), event packet serialization (JSON or MessagePack, <100 bytes), best-effort delivery with one retry.
4. **OTA** — ESP-IDF OTA via HTTPS from aggregator, rollback-safe dual-partition scheme.
5. **Time sync** — SNTP client via mesh root to NTP server, used for raise-event timestamps. Critical for queue ordering.

**Aggregator firmware** (Linux/Python on CM4):
- 802.11s bridge interface
- Raise-queue FIFO with timestamp ordering and deduplication (same zone, same handshape, within 3 s = single event)
- BLE advertisement server (ESP32 co-processor or CM4 built-in Bluetooth)
- Optional HTTPS syslog push

**Bracelet firmware** (ESP-IDF):
- BLE scan for aggregator beacon, parse raise-queue events
- Haptic pattern dispatch via DRV2605L I2C (waveform library index selection per handshape class)
- OLED queue display (U8g2 library, SSD1306 driver)
- Acknowledge button ISR: dequeue front item, notify aggregator

---

## Top 5 Risks + Mitigations

**Risk 1 — DHH community privacy acceptance (CRITICAL).** The Deaf community has well-documented and legitimate concerns about surveillance technology in educational spaces. A ceiling-mounted camera system, even with privacy-by-construction design, will face skepticism and potential organized opposition. **Mitigation:** Co-design from day one with Deaf educators and Deaf community advocates (not just audiologists or hearing administrators). Publish the classifier model weights, training data provenance, and firmware source code as open source. Include a physical privacy shutter that can be toggled by the teacher — a visible hardware indicator that the camera is inactive. Submit to independent privacy audit. This is not optional; community rejection kills the product regardless of technical merit.

**Risk 2 — Classifier accuracy across diverse hand sizes and skin tones.** Computer vision models trained on non-diverse datasets systematically underperform for darker skin tones and atypical hand sizes. A false negative (missed raise) for a Black or brown DHH student is a discriminatory outcome. **Mitigation:** Training data must be explicitly diverse. Use ASL Citizen dataset (demographically broader than WLASL). Budget for a paid data-collection study with diverse signers. Track per-demographic false-negative rate as a primary product metric, not an afterthought.

**Risk 3 — Teacher willingness to wear bracelet.** Wearable devices have high abandonment rates if they are uncomfortable, distracting, or socially awkward. **Mitigation:** Run a 90-day wear study with 10 teachers before finalizing form factor. Make wearing optional — the system also has an optional desktop dashboard as a fallback UI. Default to the bracelet because it works with the teacher's back turned, but don't mandate it.

**Risk 4 — Retrofit cost in schools without drop ceilings.** Many older school buildings (pre-1970s) use plaster or gypsum board ceilings with no plenum space. Drop-ceiling retrofit costs $8-15/sq ft, which for a 900 sq ft classroom runs $7,200-13,500 — often exceeding the HushNet kit cost. **Mitigation:** Develop a surface-mount "puck" variant for non-drop-ceiling installation (magnetic or adhesive mount, USB-C power instead of PoE). This is a different enclosure with the same PCB; design the PCB to support both form factors from the start.

**Risk 5 — K-12 procurement cycles.** School districts procure technology on 3-5 year budget cycles. A new category device with no prior comparable in district purchase history requires a new line item and often a pilot program, an RFP process, and board approval. **Mitigation:** Target DHH schools and programs (Gallaudet, state schools for the deaf) first — they have existing AT procurement infrastructure and Deaf leadership who can champion the product. Avoid general-district rollouts until product-market fit is proven. Pursue IDEA (Individuals with Disabilities Education Act) Part B technology funding as the purchase vehicle; it is already allocated annually and AT devices are an eligible expense.

---
