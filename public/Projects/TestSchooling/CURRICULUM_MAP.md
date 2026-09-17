# CURRICULUM MAP — K-12 Deaf-Centered STEAM Music

**Working title:** Sonic Agency Curriculum (SAC)
**Platform:** The CyberDeck (omnivorous black box) + PULSE haptic vest + GestoLumina (GeLu) wristware + audio-reactive LED arrays
**Author org:** CymaSpace Universal Music Design Team
**Aligned to:** NEA Research Grant #1949260 (CymaSpace, 2026); Sonic Agency framework (Cavdir et al., 2025).

---

## Guiding Philosophy

The four pedagogical pillars from `RESEARCH_AUDIT.md` §6 — body before notation, see-and-feel before hear, sign-compatible expression, and DHH-as-designer — anchor every band. Across K-12 a student should travel along three parallel arcs:

| Arc | K-2 | 3-5 | 6-8 | 9-12 |
|-----|-----|-----|-----|------|
| **Sensory** | Feel | Feel + see | Feel + see + map | Compose for any sense |
| **Authorship** | Imitate | Modify | Re-map | Fork + publish |
| **Technical** | Touch the hardware | Wire one signal | Program one mapping | Build a sub-module |

The curriculum is **bilingual ASL/English** with graphic notation as primary, staff notation introduced from grade 5 as a secondary literacy.

---

## Band 1 — K-2: FOUNDATION ("Find your pulse")

**Big idea:** Music begins in the body. Sound becomes touch and light before it becomes notation.

**Sensory anchors:** PULSE vest worn ≤15 min per session; CymaSpace audio-reactive LED bars; teacher-held CyberDeck running a fixed `Heartbeat → Vest` patch.

**Conceptual goals**
- Identify the steady pulse of one's own heart and match it to a vibrating pulse on the vest.
- Distinguish *high*, *low*, *loud*, *soft* via color and vibration intensity.
- Mirror a teacher's body rhythm (mimicry as a first competency, per SA §5.3.2, DS).
- Use ASL parameters HEARTBEAT, LOUD, QUIET, FAST, SLOW, COLOR, FEEL.

**STEAM hook (Science):** What is a vibration? Touch a speaker membrane through paper, then through hand.

**Assessment philosophy:** Educator field notes only — no written surveys. (NEA limitation, p.10.)

**Lesson plans in this band:** LP-01 (Heartbeat & Pulse), LP-02 (Sounds & Shapes Graphic Score), LP-03 (Color of the Sound).

---

## Band 2 — 3-5: EXPLORATION ("Map the world")

**Big idea:** Sound has structure. We can decide which body part receives which sound.

**Sensory anchors:** PULSE vest, audio-reactive LED array, CyberDeck running `Stem-to-Channel` patch (each instrument routes to a vest channel that students pick).

**Conceptual goals**
- Identify pitch register, tempo, and timbre by haptic and visual feedback alone.
- Place instruments on the body — left chest for kick, right shoulder for snare — and explain *why* (informed by NH's car-speakers-as-haptic-experience, SA §5.2.2).
- Read and compose a "Sounds and Shapes" graphic score (per SA §5.3.2).
- Use ASL signs PITCH, RHYTHM, BEAT, MEASURE, ECHO, PATTERN, MAP.

**STEAM hook (Math + Technology):** Frequency in Hz; period vs. tempo (BPM); a single FFT bar visualized.

**Authorship goal:** Each student creates one 8-beat graphic score and performs it on shakers/drums while a peer wears the vest.

**Lesson plans in this band:** LP-04 (Stem-to-Body Mapping), LP-05 (Graphic Composition Studio), LP-06 (Visual Vernacular Pulse Piece).

---

## Band 3 — 6-8: EXPRESSION ("Speak through the system")

**Big idea:** Your hands already make music — they make signs. Now they will make sound and signs at the same time.

**Sensory anchors:** PULSE vest (now student-channelized), GeLu wristware (FSR rings + IMU bracelet + LED), CyberDeck running `Sign-to-Beat` and `Motion-to-Synth` modules.

**Conceptual goals**
- Trigger drum samples with ASL handshapes (CV pipeline detects 5, S, B, V handshapes — 4 distinct drum voices).
- Modulate a synth parameter (filter cutoff, pitch) with arm movement via IMU → OSC.
- Compose in **Euclidean rhythm** using a circular display (Toussaint, GL §5); recognize that the symmetrical patterns are the "rhythms a DHH musician can trust."
- Critically interpret Deaf-led music (Deaf Hip Hop, Deaf Rave); contrast with mainstream pop using only the visual + haptic representation.
- Use ASL signs HANDSHAPE, TRIGGER, FILTER, SYNTH, LOOP, MIX, BALANCE, REMIX.

**STEAM hook (Math + Engineering):** FFT bins, MIDI vs. OSC, latency budget. Why is < 10 ms the goal?

**Authorship goal:** Each student produces a 60-second piece using their own ASL→drum mapping. They write a one-page **design rationale** explaining why their mapping is musically and ergonomically sound (does not interfere with signing — SA §5.1.3).

**Lesson plans in this band:** LP-07 (Sign-to-Beat I — Handshape Drumming), LP-08 (Motion-to-Synth — Filter Sweeps with the Body), LP-09 (Euclidean Rhythm Circle).

---

## Band 4 — 9-12: CREATION ("Author the field")

**Big idea:** A Deaf-led genre needs Deaf composers, Deaf engineers, and Deaf publishers. You are all three.

**Sensory anchors:** Full CyberDeck access (admin/SSH), GeLu (with student-modifiable firmware), PULSE vest, AudioLux LED stage system, optional EPK marimba.

**Conceptual goals**
- Modify the FFT-to-LED mapping firmware on the Pixelblaze ESP32 (re-flash with new bin boundaries or palettes; GL §4.2).
- Train a small (e.g., MediaPipe-based) handshape classifier on 5+ ASL handshapes; deploy locally on the CyberDeck; measure precision/recall.
- Compose a Deaf-centered piece scored in graphic + ASL gloss + optional staff notation. Performance must include at least one haptic channel and one CV-driven channel.
- Run an inclusive performance: invite at least one hearing peer to wear the vest, articulate attunement protocols (SA §6.1.2).
- Write a 1,000-word artist statement framing the work within sonic agency theory (LaBelle).

**STEAM hook (full STEAM):**
- *S* — psychoacoustics, FFT, hearing loss audiograms.
- *T* — embedded firmware, BLE-MIDI, computer vision.
- *E* — circuit design, enclosure design, power budgeting (CyberDeck off-grid).
- *A* — composition, graphic notation, performance.
- *M* — Euclidean rhythm geometry, latency math, statistics for hearing-test data.

**Authorship goal:** Year-long capstone — a public CymaSpace Showcase performance + an open-source GitHub repository with code, schematics, score, and ASL-vlog documentation.

**Lesson plans in this band:** LP-10 (Firmware Hack — Re-Map the LEDs), LP-11 (CV Pipeline — Train Your Own Sign Classifier), LP-12 (Capstone Composition & Showcase).

---

## Cross-Band Scaffolding

### Shared ASL gloss spine
Each band re-uses signs from the previous band and adds 5-8 new. By grade 12 a student commands ~50 music-technical signs documented in `LESSON_PLANS/ASL_glossary.md` (see lesson plans for entries).

### Hardware progression
- K-2: pre-built CyberDeck + PULSE vest + LED bar. No student opens the case.
- 3-5: Students patch the vest channels via the CyberDeck UI. No hardware modification.
- 6-8: Students wire a single sensor (FSR or button) into the CyberDeck breakout. Soldering optional, supervised.
- 9-12: Students flash firmware, design enclosures, fork the GitHub repo.

### Mixed-hearing protocol
Whenever hearing students are present, sessions begin with an **attunement exercise** (5 min): hearing students wear the vest blindfolded, identifying instruments only by body channel — recasting the hearing peer as the novice. Drawn from SA §6.1.2 ("attunement exercises to each other's listening modes").

### Family / community extension
Each band ends with a "share night" in which families attend with PULSE vests and the same graphic scores. Per NEA p.26, CymaSpace will host Elementary, Middle, and High School workshops at CRIS and Oregon School of the Deaf.

---

## Alignment to NEA Research Questions

| NEA RQ | Where addressed in the map |
|---|---|
| RQ1 — Tools for multisensory K-12 music | All four bands; CyberDeck + PULSE + GeLu form the tool stack. |
| RQ2 — Student perceptions of haptic prototype | LP-01, LP-04, LP-07 (haptic exposure across bands); pilot survey instruments in `LESSON_PLANS/`. |
| RQ3 — Student attitudes toward prototype | Capstone artist statements (Band 4) + grade-6 design rationale (LP-07). |
| RQ4 — Knowledge & understanding improvement | Pre/post rubrics on rhythm, pitch, timbre vocabulary (see `LESSON_PLANS/Assessment_rubrics.md`). |

---

## Alignment to State/National Standards

The map is designed to map cleanly onto:
- **National Core Arts Standards (NCAS) — Music:** Creating, Performing, Responding, Connecting.
- **Next Generation Science Standards (NGSS):** PS4 (Waves and their applications), HS-ETS (Engineering Design).
- **CSTA K-12 Computer Science Standards:** especially 3A-AP (Algorithms & Programming) and 3A-CS (Computing Systems).
- **Common Core ELA — Speaking & Listening** anchored via ASL discourse expectations.

A formal standards-crosswalk is to be drafted with EWU's Director of Music Education (NEA project partner, p.21) during Phase 1.

---

## Sequence & Pacing (Pilot Year, Aug 2026 – May 2027)

- **Aug-Sep:** Band-specific equipment setup, teacher training (1-day in-service), student baseline assessments.
- **Oct-Dec:** First half of each band's lessons; first share night.
- **Jan-Mar:** Second half of lessons; community workshop at Oregon School of the Deaf.
- **Apr-May:** Capstone (grade 9-12) + post assessments + research reporting back to NEA.

The full pilot covers two sessions per week × 30 min (K-2), 45 min (3-5), 60 min (6-8), or 90 min (9-12).
