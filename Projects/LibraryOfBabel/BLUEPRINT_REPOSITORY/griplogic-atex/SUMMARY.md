# GripLogic ATEX — One-Page Summary

## Headline

The first ATEX-certified electrotactile work glove that translates plant DCS alarms into ASL handshape patterns on the fingertips — giving Zone 1 petrochemical operators a semantic, eyes-free, hearing-independent alarm channel.

---

## Problem

Front-line refinery and chemical-plant operators work in Zone 1 explosive atmospheres wearing hearing protection and FR PPE that blocks every existing alarm channel. Audible horns are inaudible through full-face respirators. Visual strobes are obstructed by equipment and fog. Radio voice demands divided attention. Deaf and hard-of-hearing workers are structurally excluded from the primary alarm channel — a life-safety gap and an ADA/EU equality compliance exposure that no current product addresses for Zone 1.

---

## Solution

GripLogic is an output-only wearable system: a WirelessHART-connected belt-pack (ATEX Ex ia IIC T4) receives alarm state from the plant DCS over the existing WirelessHART mesh and drives a 4x4 electrotactile electrode array on the glove palm via a Kapton flex PCB. Each alarm class (FIRE, EVAC, MEDIC, GAS, SPILL, GENERAL) is encoded as the corresponding ASL handshape — the fingertip electrode activation sequence literally traces the sign-language morphology across the operator's palm. After 2–3 hours of spaced-repetition training, operators recognize alarm classes subconsciously, the same way a trained typist reads keys by feel. No audio. No display. No operator input. No ignition risk.

---

## Tech Stack

STM32L432 MCU + Silicon Labs MGM210L WirelessHART module + LT3571 IS-current-limited HV boost + dual MAX14661 16-channel electrode mux + Kapton flex PCB with AgCl electrodes + FR Nomex glove shell + Ultralife IS-certified Li-Ion cell, all housed in GRP ATEX IP67 enclosure.

---

## Economics (Fermi estimates — see ROI_ANALYSIS.md)

| Metric                          | Value                  |
|---------------------------------|------------------------|
| BOM cost @ 1k units             | ~$301 per unit         |
| Total COGS @ 3k units (post-cert)| ~$531 per unit        |
| Retail price (target)           | $2,400 per unit        |
| Gross margin (launch scenario)  | ~78%                   |
| TAM (Zone 1 operators, US+EU)   | ~407,000 operators     |
| SAM (15% adoption, 5 years)     | ~20,000 units          |
| 5-year revenue estimate (SAM)   | ~$54M                  |
| Annual service contract         | $240/unit/year         |
| ATEX cert investment            | ~$280k over 24 months  |

---

## Why Now

Three converging forces make 2025–2027 the entry window:

1. **Regulatory pressure:** OSHA is updating PSM (Process Safety Management) rules; EU ATEX Directive enforcement on accessible alarm systems is tightening. Plants need a compliant solution before the next inspection cycle.

2. **Infrastructure already deployed:** Over 60% of US and EU refineries now have WirelessHART mesh infrastructure installed for field instrument monitoring. GripLogic rides that network at zero incremental RF infrastructure cost to the plant — dramatically lowering the sales conversation barrier.

3. **No incumbent:** There is no ATEX-certified electrotactile alarm glove on the market. The window to establish category ownership, build the clinical/ergonomic evidence base, and lock in the first 10 reference-site deployments is open now and will close once a large PPE manufacturer (Honeywell, MSA, 3M) notices the regulatory tailwind and enters.

---

*All part numbers are training-data references — verify before procurement. All financial figures are Fermi estimates — verify before investment decisions. ATEX certification is a regulatory requirement; engage a Notified Body early.*
