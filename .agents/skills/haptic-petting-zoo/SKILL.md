---
name: haptic-petting-zoo
description: >-
  Operational workflows, press release publishing, Exhibit B financial ledger management,
  and hardware prototyping runbooks for The Haptic Petting Zoo touring exhibition ($96,000 OCF grant).
---

# Haptic Petting Zoo Engineering & Touring Runbook

## Core Architectural Pillars

### 1. Financial Governance & Ledger Operations (`public/Projects/HapticPettingZoo/ledger/`)
* **Legal Grant Cap**: Direct Project Costs are strictly capped at **$91,200.00** under Exhibit B with PDX Hackerspace (Control+H). The 5% fiscal sponsorship fee ($4,800.00) is retained upfront by Sponsor.
* **Disbursement Schedule**:
  * Milestone 1: **$20,000.00 (Received Sept 2026)** — Working capital in hand.
  * Milestone 2: **$20,000.00 (Target Jan 2027)** — Completion of prototyping phase (Dec 12 CymaSpace reveal).
  * Milestone 3: **$20,000.00 (Target Apr 2027)** — Fabrication midpoint & OCF interview.
  * Milestone 4: **$15,000.00 (Target Jun 2027)** — Final assembly & calibration.
  * Milestone 5: **$12,000.00 (Target Aug 2027)** — Public exhibition debut.
  * Milestone 6: **$4,200.00 (Target Oct 2027)** — Phase 1 fabrication accounting.
* **Lead Artist Fee ($35,000.00 Cap)**:
  * Track effort hours inside `ledger-data.json` under `activities_log` to maintain an internal burn rate.
  * **Rule**: Never expose public hourly rates (e.g., "$X/hour"). In user-facing reports and HTML UI, display milestone completion percentage and milestone earned value.
* **Tax Pacing Strategy**: Grantee is a Sole Proprietor on cash-basis accounting. Milestone 2 is held until January 2027 so that 2026 gross receipts ($20,000.00) are balanced against 2026 equipment deductions (11/11 bulk buy, cases, tooling) to minimize self-employment tax.
* **Data Machine Integrity**: Any spending or hours changes must update `public/Projects/HapticPettingZoo/ledger/ledger-data.json` first, ensuring complete parity with `ledger.html`.

---

### 2. Press & Dispatch Operations (`index.html`)
* **Style**: Broadside vintage newsprint inspired by *The Portland Tactile Dispatch* (news-gazette styling).
* **AdBlock Guardrail**: **NEVER use `ad` in IDs or class names** (e.g., do not use `woodcut-ad` or `ad-inner`; use `woodcut-colophon`, `colophon-inner`, or `badge`).
* **Verified Links**: Always hyperlink official partners:
  * Oregon Community Foundation: `https://oregoncf.org/`
  * Control+H (PDX Hackerspace): `https://pdxhackerspace.org/index.html`
  * CymaSpace: `https://www.cymaspace.org/`
  * HAXEL Web IDE: `https://dillonsimeone.com/Projects/Haxel/index.html`
  * Teardown 2026 Talk: `https://youtu.be/QELd3fTHwCc`
* **Isolated Ledger**: Do **NOT** place public navigation links to `ledger/ledger.html` on the public Dispatch newspaper. The ledger is an internal transparency tool accessible by direct URL.

---

### 3. Hardware Prototyping & Sensor Architecture
* **Hybrid MCU Fleet**:
  * **Station Controllers**: ESP32-S3 (Dual-core LX7, USB OTG/CDC for HAXEL web serial, dual-core FFT audio DSP, camera interface).
  * **STEM Mini-Zoo Kits & Node Breakouts**: Bulk ESP32-C3 SuperMini (RISC-V, ultra-compact, low-cost).
* **Spatial Tracking & Lighting Immunity**:
  * **Lid Vision**: ESP32-S3-CAM mounted in the Pelican case lid aimed downward at the tactile petting zoo arena.
  * **3 Proximity Zones per Critter**: Approach -> Hover -> Contact.
  * **Failover Backup**: VL53L1X Time-of-Flight (ToF) sensors or capacitive touch embedded in animal bodies to guarantee instant zero-latency triggering regardless of ambient venue lighting.
* **Actuator Modulation**:
  * 5V ERM coin vibration motors (1027/1030) modulated via AO3400A low-side N-MOSFET PWM.
  * Tactile bass exciters (4Ω 25W) for deep bone-conduction acoustic surfaces.
  * Push-pull solenoids for sharp percussive mechanical recoil.
  * Thermoelectric Peltier modules (TEC1-12706) for hot/cold thermal feedback.
* **Touring Packaging**:
  * Ruggedized waterproof transit cases (Pelican Air / Apache equivalents) with modular internal decks.

---

### 4. Cross-Grant Synergies
* **World Deaf Timberfest (WDT) 2027**: Hands-on tactile STEM workshop for 100 Deaf kids ($1,000 secured + $1,000 pending). Powered by 120x ESP32-C3 SuperMini kits with 300x coin motors.
* **NEA Arts Education Grant**: $100k requested + $120k match with Columbia Regional Inclusive Services. OCF hardware R&D qualifies as matching funds.
* **Corvallis Kaleidoscope / PRAx / Graand Kinetic Challenge**: "Torque, Resonance & Light" kinetic gear train + tactile frequency station + festival-wide AV accessibility audit.
