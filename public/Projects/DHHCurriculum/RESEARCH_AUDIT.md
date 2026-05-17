# RESEARCH AUDIT — Sonic Agency, GestoLumina, CyberDeck, NEA

**Session:** dhh-curriculum
**Date compiled:** 2026-05-16
**Audience:** Curriculum designers, CymaSpace UMD team, NEA reviewers, K-12 DHH educators.

This audit synthesizes the four required source documents into a working evidence base for a Deaf-centered STEAM music curriculum hosted on the CyberDeck platform. Findings are organized by theme, with direct citations to source files. All page numbers refer to the extracted text files under `output/dhh-curriculum/_extracted/`.

---

## 1. Sources

| ID | Document | Type | Pages |
|----|----------|------|-------|
| SA | Cavdir, Simeone, de Bastion, Trail, Hergert (2025). "Sonic Agency: A Group Autoethnography…" ASSETS '25. | Peer-reviewed paper | 15 |
| NEA | CymaSpace NEA Research Grants application #1949260 (2025). | Grant proposal | 31 |
| GL | Hergert, Simeone, Cavdir, MacConnell, Trail, de Bastion (2024). "GestoLumina: Gesture interpreted Light, Sound and Haptics." NIME '24. | Peer-reviewed paper | 4 |
| CD | CyberDeck Residency application correspondence (Simeone & collaborators, 2026). | Application + email thread | 2 + 1 |

---

## 2. Central Construct — "Sonic Agency"

Brandon LaBelle's definition, as cited in SA and GL, frames sonic agency as the social production of sound and the right to "shape attention" with or without producing audible output (SA p.10; GL p.2). The Universal Music Design (UMD) team operationalizes this in three Deaf-led practices:

1. **DHH as music technology developers** — bespoke, contactless interfaces that do not interfere with signing (SA §5.2.1; GL §3).
2. **Hacking and re-purposing as resilience** — converting headphone mixers into haptic spatializers (SA §5.2.2).
3. **Performance as visibility** — "the right to be heard, even without making a sound" (DS, SA p.10).

**Curriculum implication.** Every unit must give students authorship, not just consumption. Lesson design must let learners *make* and *modify* the technology that mediates their experience, not merely receive an "accessible" output.

---

## 3. Key Empirical Findings to Address

### 3.1 Proprioception, balance, and the body
- DHH children do not develop equilibrium/proprioception via early music training the way hearing children do (NEA p.6 ¶3; GL §3, citing Wink 2018; Erkiliç 2011).
- One co-author cannot ride a bicycle as a likely consequence (GL §3).
- **Strategy:** "Return to the body" — Hergert and de Bastion compose rhythms patterned on heartbeats ("ba-bum, pause, ba-bum") so timing is felt before it is heard (SA §5.3.2). Curriculum must front-load **somatic, body-anchored rhythm** in K-5.

### 3.2 Multisensory substitution & augmentation
- Three integrated modalities consistently work for DHH musicians: **haptic displays, audio-reactive light/visuals, and gestural interfaces** (SA §4; NEA p.7).
- Vibrotactile vests (Woojer) plus FFT-driven LED arrays (CymaSpace audio-reactive mask, AudioLux) let Deaf performers "read" pitch region and amplitude across each other's faces and bodies (SA §5.1.1–§5.1.2; NEA p.3).
- Vibrotactile feedback can deliver frequencies **inaudible through traditional speakers**, expanding the perceptible spectrum (SA §5.1.1, quoting ST and NH).
- DS quote (SA p.7): "*Separating the sounds to left and right made a big difference with those haptics! Like they've just gotten a glimpse of an entirely new dimension that they can start exploring now!*"

### 3.3 Frequency-to-color and frequency-to-vibration mappings
- GestoLumina (GeLu) performs real-time FFT on a MEMS mic (SPW2430) and drives WS2812B LEDs through a Pixelblaze ESP32, with <2.3 ms round-trip latency (GL §4.3).
- Each frequency band gets a palette + intensity. Louder bands light more LEDs (SA §5.1.2, DS quote).
- **Curriculum implication.** The CyberDeck's "Motion-to-Synth" and "Sign-to-Beat" modules can re-use the same FFT/LED pipeline; students should be able to inspect and re-map the assignments (e.g., swap palettes, change Hz boundaries) as a STEAM/physics exercise.

### 3.4 Gestural / ASL-compatible expression
- Theremin is *physically stifling* because it forces arms-up posture incompatible with signing or pacing (SA §5.1.3, DS quote).
- GeLu is designed so it "does not interfere with signing or typing" (SA §5.1.3).
- Iijima et al. and ASL Champ! confirm DHH performers prefer interfaces that map gesture grammar already in their daily use (SA §2.2; NEA refs 27, 36).
- **Curriculum implication.** All gestural assignments must be testable with the student still able to sign at the same time. "Sign-to-Beat" — using CV to detect ASL handshapes and trigger drum samples — is a direct outgrowth of this requirement.

### 3.5 Graphic scores & non-Western notation
- DHH students engage more deeply with non-staff notation: "*I felt more engaged following a graphic 'Sounds and Shapes' score, represented with dots, lines, cells, and rows*" (DS, SA §5.3.2).
- Curriculum should treat graphic notation as a **first-class** literacy, not a remedial alternative. Standard staff notation can be introduced later, anchored to the graphic vocabulary students already trust.

### 3.6 Euclidean / "innate" rhythms
- GL §5 cites Toussaint's *Geometry of Musical Rhythm* — humans worldwide adopt a small family of symmetrical rhythmic geometries. These are a "rhythm a DHH musician can trust" because the symmetry is visible when mapped to a circular display (GL §5).
- **Curriculum implication.** Middle-school rhythm units should teach polyrhythm through Euclidean circles before bar-line notation.

### 3.7 Misalignment of expectations in mixed-hearing settings
- During the December 2024 tour, performances "felt less like a mixed-ability collaboration and more like a hearing music ensemble with a few Deaf performers tacked on" (NH and DS, SA §5.3.1).
- **Strategy:** Prioritize Deaf-composed music. Curriculum repertoire (especially in grades 6-12) should default to Deaf composers (NH, MB) and Deaf-led genres (Deaf Rave, Deaf Hip Hop — Best 2018; Jones 2016).

### 3.8 Under-representation of DHH designers
- SA §1 and NEA p.6 both name this as the central methodological gap. The curriculum must therefore not just *include* DHH learners but actively *train them as designers* — soldering, programming, composing — by grade 12.

---

## 4. Grant Goals (NEA #1949260) — Curriculum Must Demonstrably Address

From NEA pp. 6-9, the funded research questions are:

> (1) What educational tools can be developed to increase multi-sensory music education in K-12 settings?
> (2) What are DHH student perceptions of their multisensory musical experiences of a haptic curricular prototype?
> (3) What are DHH students' attitudes towards the use of the haptic curricular prototype?
> (4) Does a multi-sensory haptic curriculum improve music knowledge and understanding for K-12 DHH students?

**Timeline constraints (NEA pp. 25):** Phase 1 Jan-Jun 2026 = lab perception studies + curriculum design. Phase 2 Jul-Dec 2026 = pilot in partner schools (CRIS, Oregon School of the Deaf, Creston Public School).
**Sample:** Up to 50 students, ASL-fluent, English literate, ≥13 yo for direct survey; younger students via educator-mediated assessment.
**Partner technology:** GeLu (gestural haptic/LED), AudioLux (LED FFT), Woojer haptic vest, EPK marimba, OPEnS Lab custom multi-modal solutions.
**Assessment philosophy:** Qualitative triangulation — surveys + field notes + interview transcripts; emergent coding; pre/post for knowledge, participation metrics for engagement, portfolio for creativity.

---

## 5. The CyberDeck Platform — Hardware Vision

From CD (Simeone application + email thread 2026-05):

- **"Omnivorous black box"** — pelican-case-form portable computer, NUC-class compute, runs off solar / thermoelectric / handcrank / scavenged DC.
- **Local FFT-to-haptic** pipeline (no cloud, no wall outlet).
- **On-device speech-to-text** accurate enough to function in noisy classrooms.
- **Motion-to-synth** via IMU; **Sign-to-Beat** via CV — both explicitly named as trivial-to-add layers on top of the core deck (CD email 2026-05-13).
- **Reproducible:** No proprietary parts; printable shell; under-$100 power board with companion zine for non-technical builders (CD p.1).

**Curriculum implication.** The CyberDeck is the perfect K-12 hub because it is **field-deployable** (Deaf schools often lack treated rooms / dedicated music rooms — SA §5.1.1, NH quote), **inspectable** (students can open it, swap a sensor, reflash firmware), and **affordable** at the parts-bin level (GeLu BOM totals < $145 — GL Table 1). Where a commercial DAW black-boxes everything, the CyberDeck is pedagogically transparent.

---

## 6. Synthesis — Pedagogical Pillars

Four pillars drop out of the audit. They will structure the K-12 scope and sequence in `CURRICULUM_MAP.md`.

1. **Body before notation.** Heartbeat rhythms, mirrored movement, haptic vests, and graphic scores precede any traditional notation. (SA §5.3.2; NEA p.6; GL §3.)
2. **See and feel what you cannot hear.** FFT-to-light and FFT-to-vibration are taught as first-class literacies. Students learn *both* to use them and to re-map them. (SA §5.1.1–§5.1.2; GL §4.)
3. **Sign-compatible expression.** Every gestural assignment must leave the hands free to sign. ASL grammar (handshape, location, movement, palm orientation, non-manual markers) becomes a music-controller grammar. (SA §5.1.3; GL §6.)
4. **DHH-as-designer.** Students do not just *use* the tools; by grade 8 they re-map them, by grade 12 they fork and re-release them. (SA §5.2.1; NEA p.8; CD p.1.)

These pillars also serve the four NEA research questions directly: pillar 2 produces the "haptic curricular prototype" the grant promises; pillars 1, 3, and 4 generate the artifacts and observations the qualitative triangulation will analyze.

---

## 7. Risks & Known Limitations from the Source Literature

- **Sample bias.** ASL + English fluency requirement may exclude DHH students who operate primarily within Deaf culture (NEA p.10). Mitigate with educator-mediated assessment for K-5 and visual-vernacular-only assessment alternatives.
- **Cognitive overload.** Studio sessions running late at night caused data-collection fluctuation (SA §3.3). Lesson plans must pace haptic stimulus deliberately; recommend ≤25 min of continuous vest-on time at K-5.
- **Hardware fragility.** Early-stage prototypes (GeLu rings) were excluded from public tour performance (SA §4.3). Curriculum classroom kits must be more rugged than research prototypes — the CyberDeck pelican-case form addresses this.
- **Co-performer alignment.** Mixed-hearing classroom dynamics replicate the same misalignment risks the SA team observed on tour (§5.3.1). Hearing peers should be onboarded with attunement exercises before joint sessions.

---

## 8. What the Audit Does Not Resolve (Open Questions for Pilot)

- Optimal vest-on duration by grade band.
- Whether frequency-to-color palette choices should be student-customizable from K, or introduced as a design assignment in grade 6.
- Whether to teach Euclidean rhythm before, alongside, or after Western 4/4 — the Toussaint argument suggests before, but co-performance with hearing peers may require both.
- IRB-approved methods for collecting affective response data from pre-literate K-2 learners.

These are the variables the Phase-1 lab studies (NEA pp. 6-8) are designed to settle.
