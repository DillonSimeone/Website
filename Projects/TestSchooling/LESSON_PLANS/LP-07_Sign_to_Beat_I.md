# LP-07 — Sign-to-Beat I: Handshape Drumming

**Grade band:** 6-8 (EXPRESSION)
**Duration:** 60 minutes × 2 sessions
**Prerequisites:** Band 2 (LP-04 — LP-06).

## Big idea
Your hands already sign. Now they will drum, without ever letting go of the language. This is the first lesson in the Sign-to-Beat module — the central novel curriculum contribution.

## Learning Objectives
1. Demonstrate four canonical ASL handshapes (5, S, B, V) and explain when each appears in everyday ASL.
2. Use the CyberDeck's CV pipeline to map each handshape to a different drum voice.
3. Perform a 16-beat groove using only handshapes — without disrupting one's ability to sign.
4. Critique the design of the mapping; propose at least one alternative.

## ASL Gloss Vocabulary (new)
HANDSHAPE, TRIGGER, MAP-AGAIN (remap), DRUM-KIT, GROOVE, LATENCY (loaned, then sign DELAY-FEEL).
*Carried:* STEM, CHANNEL, MIX, PATTERN, RHYTHM.

## CyberDeck / PULSE Setup
- Preset: `68_SignToBeat.preset`.
- CyberDeck enables CV pipeline (MediaPipe Hands) on its onboard camera (or a USB camera mounted on a music stand).
- Default mapping:
  - **5-handshape** (open palm, fingers spread) → kick drum
  - **S-handshape** (closed fist) → snare
  - **B-handshape** (flat hand, fingers together) → hi-hat closed
  - **V-handshape** (index + middle extended) → hi-hat open
- 4-zone PULSE vest mirrors the kit (kick → chest, snare → right shoulder, etc.).
- A 16-step grid on the CyberDeck screen records the performer's pattern so it can be replayed.

## Lesson Sequence

### Session 1 (60 min) — Calibrate + Drum
| Time | Activity |
|------|----------|
| 0:00-0:08 | Greeting; review the four handshapes; teacher signs a short story using all four in everyday meaning. |
| 0:08-0:18 | CyberDeck calibration: each student stands in front of the camera; the system shows live skeleton overlay; teacher demonstrates how to make the system happy (good lighting, hand fully visible). |
| 0:18-0:32 | Free play: students improvise handshape sequences. Pair-up — one drums, one wears the vest. |
| 0:32-0:50 | Loop building: each student records a 16-step pattern by performing handshapes to a 4-second loop window. |
| 0:50-0:60 | Sharing: 4 patterns played back; class signs WHICH-IS-LOUDEST, WHICH-IS-MOST-COMPLEX. |

### Session 2 (60 min) — Design Critique
| Time | Activity |
|------|----------|
| 0:00-0:10 | Recap; replay last session's loops. |
| 0:10-0:30 | **Sign-while-drumming test:** student is given a 1-minute speech topic in ASL while *also* drumming a steady 4-beat pattern. Does the mapping interfere with signing? Class notes interference moments. |
| 0:30-0:50 | Design critique: each student proposes one *re-mapping* (e.g., "I want my open-5 to be hi-hat, not kick, because I sign 5-PALM a lot in normal speech and I don't want to trigger kicks while talking"). Save proposed remappings as `.map` files. |
| 0:50-0:60 | Reflection write-up (one page, see assessment). |

## Differentiation
- **6th grade:** Reduce to 2 handshapes (5 and S), 2 drum voices.
- **8th grade:** Add a 5th handshape ("Y") mapped to a cymbal, allow students to compose in 32 steps.
- **Hearing peers:** Must also pass the "sign-while-drumming test" using basic ASL (taught in same session).

## Latency note
Per GL §4.3 the GeLu round-trip latency is < 2.3 ms. With MediaPipe Hands the CV pipeline adds ~25-40 ms (camera + inference). Students should be told their drumming will feel responsive but not zero-latency, and they should record patterns at moderate tempo (≤ 100 BPM) for this lesson.

## Assessment Rubric

| Criterion | 4 — Exceeding | 3 — Meeting | 2 — Approaching | 1 — Emerging |
|---|---|---|---|---|
| **Handshape recognition accuracy** | System recognizes student's shapes > 90% of attempts. | 70-90%. | 50-70%. | < 50%. |
| **Groove performance** | Performs 16-step loop with ≤ 2 errors. | 3-5 errors. | 6-10 errors. | > 10 errors. |
| **Sign-while-drum interference** | Articulates 3+ specific interferences observed. | Articulates 1-2. | Vague observations. | No critique. |
| **Re-mapping proposal** | Proposes remapping + rationale grounded in ASL frequency-of-use. | Proposes remapping with rationale. | Proposes remapping. | None. |
| **ASL vocab use** | All 6 new signs in context. | 4-5. | 2-3. | 0-1. |

**Evidence:** Recorded `.loop` file; `.map` proposal; one-page reflection (in ASL via video, or in written English at student's choice — per NEA inclusivity principles).

## Connections
- Direct embodiment of SA §5.1.3 (gestural interaction; do-not-disrupt-signing constraint).
- Mirrors GL §4.1 (BLE-MIDI, IMU-based gesture sensing) — same data pipeline.
- Pillar 3 (sign-compatible expression).
- **NCAS Music — Performing 6-8** + **CSTA 3A-AP-13** (use procedures to manage data).
