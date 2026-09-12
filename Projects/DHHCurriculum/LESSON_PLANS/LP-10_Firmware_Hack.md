# LP-10 — Firmware Hack: Re-Map the LEDs

**Grade band:** 9-12 (CREATION)
**Duration:** 90 minutes × 3 sessions
**Prerequisites:** All Band 3 lessons; basic familiarity with the Arduino IDE (one-day primer offered before this lesson).

## Big idea
The frequency-to-color mapping you've been using since LP-03 is not a law of nature. It's three lines in a firmware file. Today you change them.

## Learning Objectives
1. Read and modify the Pixelblaze pattern file that drives the AudioLux LED bar from FFT bins.
2. Justify a new mapping in writing, citing at least two perceptual or aesthetic reasons.
3. Re-flash the Pixelblaze ESP32 with the new mapping and demonstrate it live.
4. Sign FIRMWARE, FLASH, COMPILE, FFT, BIN.

## ASL Gloss Vocabulary (new)
FIRMWARE (FIRM + SOFT), FLASH (electric-flash with two hands), COMPILE (gather + transform), FFT (loaned), BIN (container), COMMIT (loaned + finalize), FORK (one becomes two).

## CyberDeck / PULSE Setup
- CyberDeck preset: `912_FirmwareLab.preset`. Boots a desktop with:
  - Arduino IDE configured for ESP32 / Pixelblaze.
  - Git client.
  - Local clone of `https://github.com/DillonSimeone/Gestolumina` (per GL §6 footnote).
  - Live serial monitor.
- Each student gets a Pixelblaze ESP32 + Sensor Extension Board + WS2812B LED strip + Pixelblaze adapter.
- PULSE vest optional; AudioLux LED strip mandatory.

## Lesson Sequence

### Session 1 (90 min) — Read the code
| Time | Activity |
|------|----------|
| 0:00-0:10 | Greeting; tour of the GestoLumina repo; locate the Pixelblaze pattern file. |
| 0:10-0:30 | Walk through the FFT-to-color mapping function line by line; teacher interprets each line. |
| 0:30-0:60 | Pair reading: each pair annotates the file in ASL-vlog form (video annotation saved to repo). |
| 0:60-0:80 | Class discussion: where would *you* change the mapping? Brainstorm. |
| 0:80-0:90 | Each student picks a single change they will make next session. |

### Session 2 (90 min) — Modify and flash
| Time | Activity |
|------|----------|
| 0:00-0:10 | Branch the repo; create a personal feature branch. |
| 0:10-0:50 | Implement the mapping change in code. |
| 0:50-0:75 | Flash to Pixelblaze; test with mic input. |
| 0:75-0:90 | Pair feedback; commit to branch. |

### Session 3 (90 min) — Justify and pull-request
| Time | Activity |
|------|----------|
| 0:00-0:30 | Write a 500-word rationale (in English or ASL-video) explaining the mapping choice with at least two perceptual/aesthetic reasons. Reference research literature where possible. |
| 0:30-0:60 | Open a pull request to the curriculum's mappings repo with the rationale in the PR description. |
| 0:60-0:80 | Peer review circle: students review each other's PRs and sign suggestions. |
| 0:80-0:90 | Merge approved PRs; demo each accepted mapping live. |

## Safety
USB-C cables only; no soldering this lesson (LP-11 introduces soldering). LiPo batteries handled by teacher only.

## Assessment Rubric

| Criterion | 4 | 3 | 2 | 1 |
|---|---|---|---|---|
| **Code comprehension** | Can explain every line; suggests an unrelated improvement. | Explains the relevant function. | Reads the change site only. | Cannot read. |
| **Mapping rationale** | Cites 3+ reasons including at least one from cited literature. | Cites 2 reasons. | Cites 1. | None. |
| **Successful flash** | Flashes on first attempt and demos working mapping. | Flashes within 2 attempts. | Needs help to flash. | Cannot flash. |
| **PR quality** | PR has clean diff, clear description, peer-approved. | PR opened with description. | PR opened, description thin. | No PR. |
| **Peer review** | Reviews 2+ peers' PRs constructively. | Reviews 1. | Comments minimally. | No review. |

**Evidence:** Personal git branch; merged PR (or recorded review); 500-word rationale; demo video.

## Connections
- GL §4.2-4.3 (Pixelblaze + Sensor Extension architecture).
- Pillar 4 — DHH-as-designer fully realized.
- **CSTA 3B-AP-08** (modify code), **3B-AP-15** (open-source contribution norms).
- Industry-readiness: a real PR on a real repo is portfolio-grade evidence for DHH STEM career paths (NEA pp. 14, refs 24, 52).
