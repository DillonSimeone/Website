# LP-08 — Motion-to-Synth: Filter Sweeps with the Body

**Grade band:** 6-8 (EXPRESSION)
**Duration:** 60 minutes
**Prerequisites:** LP-04, LP-07.

## Big idea
Your wrist tilt is now a knob. Your arm raised high makes the synth bright; lowered, it makes it dark. Movement becomes sound.

This lesson uses the IMU pipeline from GestoLumina (GL §4.1). The MPU-6050 accelerometer values become OSC messages that drive a software synth running on the CyberDeck.

## Learning Objectives
1. Wear the GeLu bracelet correctly and verify IMU data on the CyberDeck screen.
2. Map at least 2 IMU axes to 2 synth parameters (e.g., wrist tilt → filter cutoff; forearm rotation → resonance).
3. Perform a 30-second "filter ballad" demonstrating expressive control.
4. Sign IMU, AXIS, FILTER, CUTOFF, RESONANCE.

## ASL Gloss Vocabulary (new)
IMU (loaned: finger-spell + ACCELERATE-SENSE), AXIS (lined-up movement), FILTER (palm sieving), CUTOFF (chop motion), RESONANCE (vibrating both hands), OSC (loaned).

## CyberDeck / PULSE Setup
- Preset: `68_MotionSynth.preset`.
- GeLu bracelet on dominant wrist (per GL §4); BLE-MIDI to CyberDeck (paired in advance by teacher).
- CyberDeck runs a Pure Data (Pd) patch (or SuperCollider — see TECHNICAL_SPEC §4): a saw-wave oscillator → low-pass filter → reverb → master out.
- Default mapping:
  - IMU pitch axis (–90° to +90°) → filter cutoff (50 Hz to 8 kHz, log-scaled).
  - IMU roll axis (–90° to +90°) → filter resonance (Q from 0.5 to 10).
- AudioLux LED bar mirrors the synth output FFT.
- PULSE vest receives the low-frequency content as continuous tactile.

## Lesson Sequence
| Time | Activity |
|------|----------|
| 0:00-0:08 | Greeting; review LP-07 latency note; teacher demos a 15-second filter ballad. |
| 0:08-0:18 | Each student fits the GeLu bracelet; verifies IMU readings on screen. |
| 0:18-0:35 | Free exploration: students discover the mapping by movement. Pair feedback: one performs, one wears vest, both observe LED. |
| 0:35-0:50 | Composition: each student writes a 30-second piece with a clear shape (rise, plateau, fall — visible on LED). |
| 0:50-0:60 | Performances + reflection. Sign WHO-MADE-RISE / WHO-MADE-FALL. |

## Differentiation
- **6th grade:** Single axis only (pitch → cutoff); fixed resonance.
- **8th grade:** Add a third mapping (Y-axis displacement → reverb send) and require a contrasting B-section.
- **Mobility-restricted students:** Use a head-mounted IMU instead of wrist; same mapping conventions.
- **Hearing peers:** Must compose using vest + LED preview only.

## Assessment Rubric

| Criterion | 4 | 3 | 2 | 1 |
|---|---|---|---|---|
| **IMU setup independence** | Pairs bracelet without help. | Pairs with one hint. | Pairs with multiple hints. | Cannot pair. |
| **Expressive shape** | Piece has clear rise, plateau, fall, recognizable from LED+vest alone. | Two of three shape elements. | One. | Flat / random. |
| **Axis ↔ parameter understanding** | Explains both mappings precisely. | Explains 1. | Vague. | None. |
| **ASL vocab use** | All 6 new signs. | 4-5. | 2-3. | 0-1. |

**Evidence:** 30-second performance video; OSC log file from CyberDeck (`.osclog`); reflection sheet.

## Connections
- GL §4.1 (IMU + BLE-MIDI).
- SA §5.1.3 (gestural interfaces that align with kinesthetic communication).
- **NGSS MS-PS4-1** (mathematical representations to describe wave properties); **CSTA 3A-CS-01** (computing systems and physical components).
- Pillar 4: students *modify* mappings; precursor to LP-10's firmware hack.
