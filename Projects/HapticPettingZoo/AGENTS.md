# The Haptic Petting Zoo: Agent Operations Guide

## 0. Strict Scoping & Boundary Rules
* **Confine Reads & Edits**: Restrict all operations to `public/Projects/HapticPettingZoo/` and its immediate subdirectories.
* **Master Skill Reference**: Consult `.agents/skills/haptic-petting-zoo/SKILL.md` for full financial schedules, tax rules, and hardware engineering specifications.
* **No Speculative Exploration**: Do NOT crawl unrelated website folders unless specifically instructed.

---

## 1. Directory Structure & File Map
* `index.html`: *The Portland Tactile Dispatch* public-facing 5-tab broadsheet portal.
* `style.css`: Broadsheet typography, frequency visualizer canvas, halftone styling, and responsive layout.
* `script.js`: History API navigation, audio-haptic frequency synthesizer, and Control+H signup form.
* `images/`: Self-contained project images (`hapticZoo.webp`, `workshopKIT.jpg`, `18-signals-to-haptics-fft.png`).
* `ledger/`:
  * `ledger.html`: Standalone financial & hours transparency dashboard.
  * `ledger-data.json`: Authoritative machine-readable project state (Exhibit B lines, milestones, activities log, 11/11 bulk BOM).
  * `ledger.css` & `ledger.js`: Rendering logic and KPI calculations.
* `acceptanceLetter/`: Official OCF grant award documentation ($96,000).
* `NEA/`: Federal NEA Arts Education proposal materials and matching cost-share records.

---

## 2. Subagent Roles & Responsibilities

When spawning subagents for this project, use the following roles:

### `zoo-press` (News Releases & Communications Specialist)
* Drafts new broadsheet dispatch editions in `index.html`.
* Writes press releases, venue host booking packages, and festival outreach proposals (e.g., Corvallis Kaleidoscope / PRAx).
* Ensures all media includes accessible transcripts, ASL context, and verified links.
* **Invariant**: Never introduce classes or IDs containing `ad` (prevents adblock false positives).

### `zoo-planning` (Financial & Grant Administrator)
* Updates `ledger/ledger-data.json` with new expenditures, purchase receipts, or logged hours.
* Ensures strict compliance with Exhibit B direct costs cap ($91,200.00).
* Maintains cash-basis sole proprietorship tax pacing (balancing 2026 deductions against Milestone 1 receipts).
* Formats Lead Artist effort using value-based milestone progress (never expose public $/hr rates).

### `zoo-prototype` (Hardware & Interactive Systems Engineer)
* Develops ESP32-S3 lid camera spatial tracking code and VL53L1X ToF failover logic.
* Designs and tests 5V coin vibration motor MOSFET PWM circuits for animal critter nodes.
* Manages 11/11 bulk procurement BOMs and component verification.
* Prepares the Dec 12, 2026 CymaSpace prototype reveal.

---

## 3. Human-in-the-Loop Verification
* Always provide numbered test steps with exact local URLs (`http://localhost:5173/Projects/HapticPettingZoo/...`) for Dillon to test in the browser.
* Do not spawn browser subagents for visual layout testing.
