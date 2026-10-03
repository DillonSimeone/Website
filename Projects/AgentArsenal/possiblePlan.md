Agent Arsenal — Hackathon Orchestrator Prompts
Claude Code Deep-Build Hackathon
Dillon Simeone | May 2026

USAGE: Paste each ORCHESTRATOR PROMPT into a separate Claude Code session.
Launch all sessions. Walk away. Review outputs.
Each agent writes to its own output directory. Nothing conflicts.
Stagger launches by ~2 minutes to avoid concurrency spikes.

Projects:
[A] PULSE Swarm (free divergence, 5 variants)
[B] HapticBlaze
[C] DHH Curriculum Generator
[D] Zero-to-PCB Firmware Multi-Target
[E] Sonic Agency Red-Team
============================================================
============================================================
[A1] PULSE ORCHESTRATOR — FREE VARIANT 1
============================================================
Session name: pulse-v1
Output dir:   ./output/pulse-v1/
You are an autonomous embedded systems architect. Your job is to design a complete,
production-ready variant of the PULSE haptic broadcast system.
CONTEXT:
PULSE is a distributed haptic feedback system for Deaf and Hard-of-Hearing users.
It uses ESP32-C3 leader nodes broadcasting over ESP-NOW to follower units housed
in saucer-form-factor enclosures. The system is deployed at festivals and music
education settings. The current architecture uses:

ESP32-C3 leaders with captive portal calibration
ESP-NOW broadcast protocol
DRV8833 H-bridge motor driver for haptic actuators (currently L298N mini in active use)
Button-triggered MAC bonding with NVS whitelist for multi-leader deployments
Dayton Audio TT25-8 puck transducers
Wireless charging for watertight sealing
Sled-and-shell modular enclosures

YOUR MISSION:
Design and document a complete PULSE system variant. You have total creative freedom.
Diverge from the reference architecture wherever you see technical advantage.
Consider: power delivery, range, latency, BOM cost, form factor, firmware architecture,
UX for non-technical festival deployers.
DELIVERABLES — write all files to ./output/pulse-v1/:

ARCHITECTURE.md — full system design with rationale for every decision
FIRMWARE_SPEC.md — pseudocode + register-level notes for leader and follower firmware
BOM.csv — full bill of materials with LCSC/JLCPCB part numbers where possible
DEPLOYMENT_GUIDE.md — step-by-step for a non-engineer deploying 20 units at a festival
DIFF_FROM_REFERENCE.md — what you changed from the reference arch and why

CONSTRAINTS:

Must remain wireless
Must support minimum 20 simultaneous follower units
Must be deployable by a single person
Follower units must survive outdoor festival environments

Begin immediately. Do not ask clarifying questions. Make decisions and document them.
Write all deliverables before terminating.
============================================================
[A2] PULSE ORCHESTRATOR — FREE VARIANT 2
============================================================
Session name: pulse-v2
Output dir:   ./output/pulse-v2/
You are an autonomous embedded systems architect. Your job is to design a complete,
production-ready variant of the PULSE haptic broadcast system.
CONTEXT:
[Same context as A1 — copy the CONTEXT block above]
YOUR MISSION:
Design a PULSE variant optimized for K-12 classroom deployment rather than festival.
Think: school budgets, durability for children, teacher-friendly setup, curriculum integration.
Diverge freely from the festival-focused reference architecture.
DELIVERABLES — write all files to ./output/pulse-v2/:

ARCHITECTURE.md
FIRMWARE_SPEC.md
BOM.csv — with emphasis on cost reduction for school district bulk purchase
TEACHER_GUIDE.md — how a non-technical music teacher sets up and runs a lesson
DIFF_FROM_REFERENCE.md

CONSTRAINTS:

Unit cost target: under $15/follower at quantity 30
Must require zero soldering by teacher
Must survive being handled by 10-year-olds daily

Begin immediately. Do not ask clarifying questions. Make decisions and document them.
============================================================
[A3] PULSE ORCHESTRATOR — FREE VARIANT 3
============================================================
Session name: pulse-v3
Output dir:   ./output/pulse-v3/
You are an autonomous embedded systems architect. Your job is to design a complete,
production-ready variant of the PULSE haptic broadcast system.
CONTEXT:
[Same context as A1]
YOUR MISSION:
Design a PULSE variant that pushes latency to the absolute minimum. Target sub-5ms
leader-to-follower haptic onset. Rethink the protocol stack if necessary.
This is the "no compromises on feel" variant.
DELIVERABLES — write all files to ./output/pulse-v3/:

ARCHITECTURE.md — include latency budget breakdown per system layer
FIRMWARE_SPEC.md — interrupt-driven, DMA where applicable
LATENCY_ANALYSIS.md — theoretical minimum, measured estimate, failure modes
BOM.csv
DIFF_FROM_REFERENCE.md

Begin immediately. Do not ask clarifying questions.
============================================================
[A4] PULSE ORCHESTRATOR — FREE VARIANT 4
============================================================
Session name: pulse-v4
Output dir:   ./output/pulse-v4/
You are an autonomous embedded systems architect.
CONTEXT:
[Same context as A1]
YOUR MISSION:
Design a PULSE variant that eliminates the ESP32-C3 from follower units entirely,
replacing with the cheapest viable alternative (CH32V003, ATtiny, discrete logic,
or whatever you determine is best). The leader can stay ESP32-C3. Justify every
component choice with datasheet-level reasoning.
DELIVERABLES — write all files to ./output/pulse-v4/:

ARCHITECTURE.md
MCU_SELECTION_REPORT.md — full comparison table of candidates considered
FIRMWARE_SPEC.md — for both leader and new follower MCU
BOM.csv — show cost delta vs reference ESP32-C3 follower
DIFF_FROM_REFERENCE.md

Begin immediately. Do not ask clarifying questions.
============================================================
[A5] PULSE ORCHESTRATOR — FREE VARIANT 5
============================================================
Session name: pulse-v5
Output dir:   ./output/pulse-v5/
You are an autonomous embedded systems architect.
CONTEXT:
[Same context as A1]
YOUR MISSION:
Design a PULSE variant targeting Crowd Supply launch. This means: manufacturable
at JLCPCB turnkey, FCC/CE certification path considered, packaging designed for
shipping to backers, and a retail price point that makes sense. Think like a
one-person hardware startup.
DELIVERABLES — write all files to ./output/pulse-v5/:

ARCHITECTURE.md — with manufacturability as a first-class constraint
BOM.csv — LCSC part numbers, JLCPCB assembly compatibility flags
CERTIFICATION_NOTES.md — what testing/certification is required, estimated cost
RETAIL_PRICING_MODEL.md — COGS, margin, Crowd Supply fee, suggested retail
PACKAGING_SPEC.md — dimensions, materials, what goes in the box
DIFF_FROM_REFERENCE.md

Begin immediately. Do not ask clarifying questions.
============================================================
[B] HAPTICBLAZE ORCHESTRATOR
============================================================
Session name: hapticblaze
Output dir:   ./output/hapticblaze/

THIS IS A PRODUCT CONCEPT. Treat it as such.
Like WLED but for haptics. Like Pixelblaze but for motors.
You are an autonomous firmware architect and product designer. You are building
HapticBlaze: an open-source, ESP32-based haptic pattern engine with a web-based
captive portal UI, a massive pattern library, and hardware abstraction for any
motor driver or haptic actuator.
CONCEPT:
WLED revolutionized LED control by abstracting hardware and providing a rich
pattern library with live web UI. Pixelblaze did the same with a JavaScript
pattern scripting engine. HapticBlaze does this for haptic actuators:

Any motor driver plugs in (user selects driver type in portal)
Any actuator type (ERM, LRA, linear resonant, puck transducer, solenoid)
Massive built-in pattern library (modes, envelopes, rhythms, reactions)
Live captive portal to configure pins, select device, audition patterns
Sound-reactive mode (analog or I2S audio input → haptic output)
API for external control (same philosophy as WLED's JSON API)

HARDWARE CONTEXT:
Primary test hardware: ESP32 (any variant) + L298N mini (currently in active use,
low voltage drop preferred). Also target: DRV8833, DRV2605L, raw MOSFET PWM.
DELIVERABLES — write all files to ./output/hapticblaze/:

PRODUCT_SPEC.md — full feature list, target users, positioning vs WLED/Pixelblaze
ARCHITECTURE.md — firmware layers: HAL → pattern engine → web server → API
HAL_SPEC.md — hardware abstraction layer for all four drivers:

L298N mini (IN1/IN2/ENA PWM, note low Vdrop advantage)
DRV8833 (dual H-bridge, sleep pin, current limiting)
DRV2605L (I2C, built-in waveform library, LRA/ERM modes)
Raw MOSFET PWM (single pin, N-channel, flyback diode notes)
For each: pin config schema, initialization sequence, PWM parameter range,
known gotchas.


PATTERN_LIBRARY.md — design and document minimum 40 named haptic patterns across:

Pulse types (heartbeat, double-tap, ramp-up, ramp-down, buzz, thud)
Rhythmic patterns (waltz, 4/4, polyrhythm, swing)
Reactive envelopes (attack-decay-sustain-release variants)
Music-mapped patterns (bass hit, snare, hi-hat, chord swell)
Alert/notification patterns (attention, warning, success, error)
Ambient/texture patterns (breath, tremor, ocean, static)
For each pattern: name, description, waveform parameters (frequency Hz,
amplitude 0-255, envelope shape, duration ms), intended use case.


PORTAL_UI_SPEC.md — complete UI specification for the captive portal:

Device setup wizard (driver select → pin assign → actuator type → test)
Pattern browser with live audition button
Sound-reactive config (input source, frequency band mapping, sensitivity)
API key and network config


API_SPEC.md — JSON API (WLED-compatible where possible):

GET /api/state
POST /api/state (set pattern, intensity, speed)
GET /api/patterns
WebSocket for real-time control


ROADMAP.md — v0.1 (MVP for hackathon demo) vs v1.0 (Crowd Supply launch)
firmware/ — write actual ESP32 Arduino/ESP-IDF skeleton code:

main.cpp (setup, loop, task structure)
hal/l298n.h + hal/l298n.cpp
hal/drv8833.h + hal/drv8833.cpp
hal/drv2605l.h + hal/drv2605l.cpp
hal/mosfet_pwm.h + hal/mosfet_pwm.cpp
patterns/pattern_engine.h + pattern_engine.cpp
patterns/library.cpp (first 10 patterns implemented)
web/portal.h (AsyncWebServer routes)



Begin immediately. This is a product, not a prototype. Write production-quality
specs and real compilable skeleton code. Do not ask clarifying questions.
============================================================
[C] DHH CURRICULUM GENERATOR ORCHESTRATOR
============================================================
Session name: dhh-curriculum
Output dir:   ./output/dhh-curriculum/

Feed this agent your NEA application PDF before launching.
Command: "Here is my NEA grant application. [attach PDF]. Now execute your prompt."
You are an autonomous curriculum designer and accessibility researcher. You are
building a Deaf-centered STEAM music curriculum for K-12 students, with emphasis
on DHH (Deaf and Hard-of-Hearing) learners.
RESEARCH CONTEXT (from NEA grant application provided):

Research Question: How does a Deaf-centered STEAM music curriculum improve
engagement, learning outcomes, and creative expression for K-12 students,
particularly those who are DHH?
Core concept: Sonic Agency — the expansion of avenues through which all
individuals can engage with music beyond auditory perception
Technology: haptic vibration (PULSE system) + audio-reactive lighting (GestoLumina)
that translates audio frequencies into color
Key finding: DHH children can struggle with balance/proprioception activities
that hearing children develop through early music training
Key finding: DHH music students succeed when given opportunity; the research
field under-represents DHH designers as active participants
Population: DHH students, Cochlear Implant/Hearing Aid users, hearing students
Setting: K-12 school music classrooms
Partner: CymaSpace Universal Music Design (UMD) project

TECHNOLOGY AVAILABLE TO STUDENTS:

PULSE haptic saucer units (distributed vibrotactile feedback, wireless)
GestoLumina gesture bracelets (motion → light/sound)
Audio-reactive LED lighting
Standard classroom instruments

DELIVERABLES — write all files to ./output/dhh-curriculum/:

CURRICULUM_OVERVIEW.md — scope and sequence for K-12:

K-2: Foundation (rhythm through vibration, body percussion, balance)
3-5: Exploration (frequency as color, instrument families, composition)
6-8: Expression (ensemble work, haptic choreography, self-expression)
9-12: Creation (original composition, technology integration, performance)


LESSON_PLANS/ — write 12 complete lesson plans (3 per grade band):
Each lesson plan must include:

Grade band, duration, learning objectives
Materials (including which PULSE/GestoLumina components)
Vocabulary (with ASL gloss notes where relevant)
Step-by-step procedure
DHH accommodation notes
CI/HA user considerations
Assessment rubric
Extension activities
Alignment to NCCAS music standards


ASSESSMENT_FRAMEWORK.md — how to measure:

Engagement (DHH vs hearing baseline comparison)
Learning outcomes (rhythm accuracy, compositional complexity)
Creative expression (qualitative rubric design)
Equity metrics (participation parity between DHH and hearing students)


TECHNOLOGY_INTEGRATION_GUIDE.md — for music teachers:

How to set up PULSE units for a classroom lesson
How to use GestoLumina bracelets with students
Troubleshooting common issues
How to run a lesson with mixed DHH/hearing class


RESEARCH_INSTRUMENTS.md — data collection tools:

Pre/post student survey (engagement, confidence, enjoyment)
Teacher observation checklist
Parent/guardian feedback form
All instruments in both English and with visual/ASL-accessible formats noted


LITERATURE_REVIEW_GAPS.md — based on the grant context, identify:

What is known about DHH music education outcomes
Where the research gaps are
How this curriculum addresses them
20+ citations (real, verifiable sources — use your training knowledge)


GRANT_SUPPLEMENT.md — additional content that could strengthen the NEA
application: additional research motivations, broader impact statements,
evaluation methodology suggestions

Begin immediately. Write complete, publication-quality documents.
Do not use placeholder text. Do not ask clarifying questions.
============================================================
[D] ZERO-TO-PCB FIRMWARE MULTI-TARGET ORCHESTRATOR
============================================================
Session name: firmware-multitarget
Output dir:   ./output/firmware-multitarget/

Reference project: MPU6050toLEDPixels
https://github.com/DillonSimeone/Website/tree/main/public/ESP32Codes/PlatformIO/08_Hardware_Specific/MPU6050toLEDPixels
Clone or copy that project into your working directory before launching.
Feed agent the source files.
You are an autonomous embedded systems engineer. Your job is to port an existing
ESP32 firmware project to every viable lower-cost MCU alternative, producing
production-quality firmware, BOM, and one-click upload tooling for each.
REFERENCE PROJECT: MPU6050toLEDPixels
This project reads an MPU6050 IMU (I2C, addr 0x68) and drives WS2812B LED pixels
based on motion/orientation data. Currently targets ESP32 (which is overkill for
this task). Read all source files provided.
YOUR MISSION:

Analyze the reference firmware: identify all peripheral requirements (I2C, GPIO,
PWM/timing for WS2812B protocol, RAM/flash footprint, clock speed needs)
Generate a candidate MCU list — every realistic alternative to ESP32 for this task
For each viable candidate, produce a complete port

CANDIDATE MCUs TO EVALUATE (at minimum):

CH32V003 (RISC-V, 2KB RAM, 16KB flash, ~$0.10)
CH32V203 (RISC-V, more capable, ~$0.30)
STM32G031 (ARM Cortex-M0+, good I2C, ~$0.50)
ATtiny85 (AVR, 512B RAM — evaluate if viable at all)
ATtiny1614 (AVR0, 2KB RAM, much better than 85)
RP2040 (overkill but cheap, PIO for WS2812B is perfect)
ATTINY3226 or similar modern AVR
Any other candidate you identify as superior

DELIVERABLES — write all files to ./output/firmware-multitarget/:

ANALYSIS.md — peripheral requirements extracted from reference firmware:

I2C timing requirements for MPU6050
WS2812B bit-bang or peripheral timing (800kHz, 0/1 pulse widths)
RAM usage estimate
Flash usage estimate
Any WiFi/BT usage? (probably not — note if absent)


MCU_COMPARISON.md — full comparison table:
| MCU | Cost@100 | Flash | RAM | I2C | HW timer for WS2812B | Toolchain | Verdict |
For each: viable YES/NO with one-line reason
For EACH viable MCU — create a subdirectory ./output/firmware-multitarget/{mcu_name}/:
a. firmware/ — complete ported source code:

main.c or main.cpp
mpu6050.h + mpu6050.c (I2C driver, register-level, no libraries)
ws2812b.h + ws2812b.c (bit-bang or peripheral implementation)
platformio.ini or CMakeLists.txt as appropriate
b. BOM.csv — MCU + MPU6050 + LED strip + passives + connectors, with:
LCSC part numbers
Unit cost at qty 1, qty 10, qty 100
Total BOM cost per tier
c. upload.sh (Linux/Mac) + upload.bat (Windows) — one-click flash scripts:
Auto-detects connected programmer/port
Builds firmware
Flashes
Opens serial monitor
d. README.md — what changed from the ESP32 version, any limitations


RECOMMENDATION.md — your top pick with full justification:

Best for prototyping (easiest toolchain)
Best for cost (production BOM)
Best for performance (headroom for future features)
Best overall



Begin immediately. Write real, compilable firmware — not pseudocode.
Do not ask clarifying questions. Make decisions and document them.
============================================================
[E] SONIC AGENCY RED-TEAM ORCHESTRATOR
============================================================
Session name: red-team-a11y
Output dir:   ./output/red-team-a11y/

Target: https://dillonsimeone.com
Also target the PULSE project page on that site.
You are an autonomous accessibility engineer running a red-team audit.
You simulate disabled users attempting to navigate a website and produce
both a detailed failure report and a complete set of patches.
TARGET: dillonsimeone.com — a portfolio site for a Deaf embedded systems engineer.
The site uses Vite, Handlebars templating, vanilla JS, and is bundled to a single
index.html. It includes: portfolio cards, a modal gallery system, a shop section,
and a PULSE project page.
AGENT ARCHITECTURE — run these as sequential phases:
PHASE 1 — Agent A (Screen Reader Simulation):

Fetch the live site HTML
Parse the DOM structure
Simulate NVDA/JAWS navigation order (tab index, landmark regions, aria-labels,
heading hierarchy, alt text on images, link text quality)
Document every barrier encountered as a structured finding

PHASE 2 — Agent B (Keyboard Navigation Simulation):

From the same HTML, simulate keyboard-only navigation
Identify: focus traps (especially in modal gallery), missing skip links,
non-interactive elements that need tabindex, focus order issues,
elements only reachable by mouse
Document every barrier as a structured finding

PHASE 3 — Agent C (Visual/Cognitive Audit):

Check color contrast ratios (WCAG AA: 4.5:1 text, 3:1 large text/UI)
Check font sizes (minimum 16px body)
Check motion (any auto-playing animations without prefers-reduced-motion?)
Check reading level of text content
Document findings

PHASE 4 — Agent D (The Patcher):

Read all findings from Phases 1-3
For each finding, write a concrete CSS/HTML/JS patch
Patches must be minimal and surgical — do not rewrite the site
Format each patch as a git diff or clearly labeled code block

DELIVERABLES — write all files to ./output/red-team-a11y/:

AUDIT_REPORT.md — executive summary + all findings from all three agents:

Severity: Critical / High / Medium / Low
WCAG criterion violated
DOM location (CSS selector or description)
User impact description
Total finding count by severity


PATCHES.md — all patches from Agent D:

One section per finding
Before/after code
Verification step (how to confirm the fix worked)


WCAG_SCORECARD.md — estimated compliance level before and after patches:

WCAG 2.1 Level A: X/Y criteria met
WCAG 2.1 Level AA: X/Y criteria met
Estimated score improvement from applying all patches


PORTFOLIO_TALKING_POINTS.md — how to present this audit in a grant application
or conference paper context as evidence of DHH-centered design practice

Begin immediately. Fetch the live site first. Do not ask clarifying questions.
Make findings specific and actionable.
============================================================
LAUNCH ORDER (stagger by ~2 minutes each)
============================================================

T+0:00  pulse-v1        (longest, most open-ended)
T+2:00  hapticblaze     (most code output, needs runway)
T+4:00  dhh-curriculum  (attach NEA PDF first)
T+6:00  firmware-multi  (attach MPU6050 source files first)
T+8:00  red-team-a11y   (fetches live site, fastest to start)
T+10:00 pulse-v2
T+12:00 pulse-v3
T+14:00 pulse-v4
T+16:00 pulse-v5

Total: 9 orchestrators, potentially 50-90 subagent spawns
Review outputs: start 3-4 hours after last launch
Pick winners, discard losers, demo the best 2-3

============================================