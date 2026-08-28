# HAXEL — Build-Out Brief

**Purpose of this document:** Hand this to a local coding assistant to extend and polish the Haxel project (firmware, simulator, and marketing/docs page) ahead of the Teardown 2026 workshop debut. Written by Dillon (creator), synthesized from a planning conversation with Claude.

---

## 1. What Haxel Is (current state)

Haxel is an open-source ESP32-based haptic firmware — a Hardware Abstraction Layer (HAL) plus declarative pattern engine plus real-time web control portal. Core pitch: "why doesn't WLED exist for haptics?"

Current documented capabilities (per the live project page):
- Unified HAL supporting LRA, ERM, and solenoid actuators from one firmware image (swap codebases → swap driver config)
- Dynamic resonant frequency tracking for LRAs via back-EMF
- Declarative pattern library, Pixelblaze-inspired scriptable expression engine (`wave()`, `triangle()`, `square()`, `noise()`, with injected variables `t`, `freq`, `speed`)
- Audio-reactive pipeline: mic/line-in → 256-point FFT → N configurable frequency bands (default: bass/mid/vocal/high, user-adjustable 1–5) → independent pattern generator per band → max-envelope merge to drive the actuator
- Motor Startup Floor calibration to compensate for static friction (ERM stiction, LRA ring-up)
- Live browser-based simulator/control portal (mobile-captive-portal style UI), serial monitor emulator
- Grounded explicitly in haptic psychophysics (Pacinian corpuscle range, JND, Weber's Law, ~50ms audio-sync latency budget) — this is a differentiator, keep it visible in docs, not just decorative content

Stated differentiation vs. prior art (Neosensory Buzz, Eagleman's vest, Emoti-Chair): open-source + user-scriptable patterns + configurable frequency-band partitioning + near-zero hardware cost (<$8 in components on an ESP32-C3).

Roadmap items already scoped on the page (Section 11):
- Controlled user study with Deaf/HoH participants (N=6-10), likely venue: ASSETS or CHI
- Multi-actuator arrays (spatial haptic mapping across body locations)
- Community pattern-sharing repository
- Adaptive/ML-driven frequency-band partitioning based on incoming audio content

---

## 2. Licensing & Open-Source Strategy (decision made — implement it)

**Decision:** Fully open-source the firmware/HAL/reference implementation. No hedging, no delayed disclosure.

**Rationale (for context, not to relitigate):** Patent enforcement isn't realistic at solo/small-shop scale; a determined reader can reverse-engineer the mechanism from the code regardless of licensing; the actual strategic asset is reputation + being the legible, hireable expert in a very small niche (accessible haptics), which open publication builds far better than secrecy does. Public disclosure through this repo + the ASSETS/SIGACCESS papers also functions as informal defensive publication (prevents anyone else from patenting the mechanism and fencing Dillon out).

**Action items:**
1. Add an explicit `LICENSE` file — MIT or Apache-2.0, not "unlicensed." Attribution-required, permissive. (Apache-2.0 if patent grant/defense language is wanted; MIT if maximum simplicity is preferred.)
2. Ensure the `README.md` puts author identity and links front and center — name, site, workshop, and paper citations near the top, not buried. The whole point of the strategy is making "hire Dillon" the obvious next action for anyone who reads the code.
3. Link NIME/SIGACCESS/ASSETS publications directly from the README, not just the marketing site.
4. Keep this decision layered: firmware/HAL/reference implementation = open. Any future commercial layer (assembled kits, calibrated actuator profiles, hosted pattern-sharing service, consulting/support) can stay separate/closed without contradicting this — don't let "everything is open" scope-creep into giving away a product business if one ever materializes.

---

## 3. Content Gaps to Flesh Out

- **Algorithm sections read as prose lists where a diagram would work harder.** Section 07 (5-step frequency-band partitioning algorithm) and Section 09 (audio→motor latency pipeline stages) are the two highest-priority candidates for a proper signal-flow diagram (FFT → band split → per-band pattern gen → envelope merge → PWM/I2C out).
- **"Future Work" bullets are single-sentence stubs** (multi-actuator arrays, adaptive partitioning, community pattern sharing). Each deserves a paragraph: what's blocking it, what the smallest testable version looks like, timeline if any.
- **No explicit hardware BOM / getting-started page.** If this is meant to lower friction for workshop attendees, a "what you need + where to buy it + flash instructions" page is probably more valuable than more prose about psychophysics.
- **Motor Startup Floor section could use a labeled diagram** (X axis = commanded output 0–100%, Y axis = actual actuator output, showing the dead zone below the floor) — currently pure text description of a fundamentally visual concept.

---

## 4. Visual / Typography Fixes (from full-page screenshot review)

1. **Color-coding is currently decorative, not semantic.** Orange, black, red, and navy cards don't map to a consistent meaning (e.g., navy appears for both "prior art" and "future work," which are unrelated card types). Either:
   - Define an explicit legend — suggested: **black = core technical**, **navy = context/background** (problem statement, prior art), **red = reserved exclusively for the novel-contribution section**, **orange = hero/CTA only** — and apply it strictly, or
   - Flatten to a single card style and drop color-as-category entirely.
2. **Bold is overused as the only emphasis mechanism** (3-4 bolded phrases per paragraph in places), which flattens its usefulness. Reserve bold for true key terms; consider a secondary style (small-caps, accent-colored inline tag, or a pull-quote treatment) for genuinely load-bearing claims.
3. **No diagrams anywhere on a page describing signal-processing pipelines and mechanical resonance behavior** — this is a visual-thinking project described entirely in text. Adding 2-3 real diagrams (FFT pipeline, HAL architecture block diagram, startup-floor curve) would do more for comprehension than further copy editing.
4. **Accessibility/contrast check is overdue, given the subject matter.** Run the actual palette (mustard-on-cream hero, any light-gray-on-black body text) through a WCAG contrast checker before Teardown. For a Deaf/HoH-accessibility-focused project, shipping with unverified visual accessibility undercuts the mission.
5. **Card density is uniform throughout** — every section is the same black-bordered box at the same rhythm. Consider varying block size/weight for the sections that matter most (Section 07, the actual novel contribution) so visual hierarchy matches argumentative hierarchy.

---

## 5. Prioritized To-Do List (suggested order)

1. Add `LICENSE` (Apache-2.0 or MIT) + rewrite `README.md` header to foreground author/links/citations.
2. Build one real diagram for the audio→haptic pipeline (Section 07/09 content) — SVG or simple canvas, matches existing site aesthetic.
3. Contrast-check the existing palette; adjust any failing combinations.
4. Define and apply a consistent color-legend across section cards (or flatten to one style).
5. Write the hardware BOM / getting-started page for workshop attendees.
6. Expand the three "Future Work" stubs into real paragraphs.
7. Add Motor Startup Floor curve diagram.
8. Second-pass edit: reduce bold density, reserve for genuine key terms.

---

## 6. Reference: Current Page Structure (extracted from screenshot)

01 Introduction — What is Haxel (comparison table: legacy vs HAL)
02 The Problem — Why haptic accessibility is hard (frequency mismatch, hardware fragmentation)
03 Architecture — How the HAL works (resonance tracking, waveform synthesis)
04 Audio-Reactive Pipeline — sound to structured touch (FFT → bands)
05 Pattern Studio — scriptable expression engine
06 Prior Art — Neosensory Buzz, Eagleman's Vest, Emoti-Chair
07 Novel Contribution — frequency-band partitioning (5-step algorithm)
08 Psychophysics — mechanoreceptors, JND, Weber's Law, temporal resolution
09 Real-Time Constraints — latency budget (pipeline stages, ~50ms perceptual threshold)
10 Calibration — Motor Startup Floor (ERM stiction, LRA ring-up)
11 Future Work — user study, multi-actuator arrays, community pattern sharing, adaptive partitioning
