# FieldMend Medic — ROI Analysis

> **Fermi estimate notice:** All market size figures, unit economics at scale, and adoption rate projections are Fermi estimates. They are directionally useful but not validated by market research. Treat as order-of-magnitude guidance only.

---

## Unit Economics at 1,000-Unit Production Run

### BOM Cost Breakdown @1k Units

| Category | Line-item examples | Subtotal (USD) |
|---|---|---|
| Active ICs (PSoC 6, SX1262, DRV2605L ×4, TPS63051, LDO) | ~$6.20 + $3.80 + $3.80 + $0.78 + $0.12 | ~$14.70 |
| Display module (e-paper GDEY0213B74) | $8.50 | $8.50 |
| Sensor film (custom ITO-on-PET) | $4.50 | $4.50 |
| LRAs ×4 (Z10SC3B) | 4 × $1.40 | $5.60 |
| Passives, connectors, antenna, crystal | ~35 line items | ~$7.20 |
| PCB (4-layer ENIG @1k) | $3.20 | $3.20 |
| Enclosure (PA66-GF30 shell, gasket, window) | $6.50 + $0.35 + $0.40 | $7.25 |
| Strap + hardware + screws | $1.80 + $0.32 | $2.12 |
| Packaging | $0.60 | $0.60 |
| **BOM subtotal** | | **~$53.67** |

Note: Battery (CR123A) treated as a consumable and sold separately or included as a one-time bundle. If included, add ~$1.50 to BOM.

### PCBA and Assembly Cost

| Step | Est. cost @1k units |
|---|---|
| SMT placement + reflow (two-sided, ~40 components) | $8.00 |
| Manual assembly (sensor film lamination, LRA bonding, FPC routing) | $6.00 |
| Enclosure assembly + gasket + screw torque | $4.00 |
| Firmware flash + functional test (CapSense calibration, haptic, LoRa link) | $5.00 |
| **Assembly subtotal** | **~$23.00** |

### Total COGS

| Item | USD |
|---|---|
| BOM | $53.67 |
| PCBA + assembly | $23.00 |
| Quality / yield loss (est. 4%) | $3.10 |
| Inbound logistics | $1.50 |
| **Total COGS** | **~$81.27** |

---

## Retail Pricing and Margin

### Price Justification

TCCC kit reference pricing for context:
- Combat Application Tourniquet (CAT): $30–$35
- Israeli Bandage (emergency pressure dressing): $8–$15
- NPA (nasopharyngeal airway) kit: $15–$25
- JUNCTIONAL tourniquets (CRoC, SAM-JT): $130–$200
- Advanced monitoring (LifeSignals LX1.8 biosensor patch, FDA cleared): ~$80–$120 per patch disposable
- PHANTOM Combat Medical limb salvage training system: ~$400–$600 (training, not comms)

FieldMend Medic is a durable (reusable, battery-swappable) communication aid, not a consumable. The appropriate analog is a durable diagnostic or communication device in a military medical context. Comparable durable devices (pulse oximeters, capnometers) in mil-spec grade run $150–$800.

**Proposed retail price: $349 (direct-to-military/SAR channel), $289 (commercial EMS/hospital channel)**

| Channel | Price | Gross Margin |
|---|---|---|
| Military/government direct (FMS, GSA schedule) | $349 | ($349 - $81) / $349 = **76.8%** |
| Commercial EMS / SAR distributor (30% channel margin) | $289 list, $202 wholesale | ($202 - $81) / $202 = **59.9%** |
| Hospital/ER institutional (GPO contract, 40% discount off list) | $209 net | ($209 - $81) / $209 = **61.2%** |

These margins look strong but must absorb: R&D amortization, regulatory (FDA 510(k) or De Novo if marketed as medical device), warranty/repair, software maintenance, and SG&A. Adjusted contribution margin after these is likely 35–50% in steady state — still healthy for a low-volume mil-med device.

---

## Real Comparables

| Product | Company | Function | Why Different |
|---|---|---|---|
| T6Care (Tacticare) | Tacticare | Physiological monitoring patch | Monitors medic's vitals; no patient communication function |
| Combat Medical PHANTOM | Combat Medical | Hemorrhage control training system | Physical training device; no communications |
| LifeSignals LX1.8 Biosensor | LifeSignals | Wireless biosensor for hospital triage | Closest in comms concept (LoRa/BT triage relay); monitors vitals only; no input from patient |
| SpeakSee | SpeakSee B.V. | Real-time ASL → text for DHH | Requires glove worn by DHH user; no mil-hardening; not medic-worn |
| **FieldMend Medic** | — | Patient input via medic's forearm pad | No direct comparable as of May 2026 |

**No direct comparable product exists** for a medic-worn capacitive input pad allowing hands-compromised patient communication. The product occupies a gap between communication aids (require patient device) and triage monitoring (one-way sensor).

---

## Fermi Market Estimate

> All figures are Fermi estimates. No validated TAM study exists for this niche.

### Addressable Population Segments

**US Military 68W Combat Medics**
- Active duty Army: ~11,000 68W billets
- Reserve/National Guard: ~7,000 additional
- USSOCOM special operations medics (18D, SARC, PJ): ~2,500
- Per-medic kit budget: $500–$2,000/year durable items
- Estimated procurement if adopted at platoon level: 5,000–8,000 units initial buy
- USSOCOM rapid acquisition pathway (SOFWERX): realistic 200–500 unit pilot within 24 months of prototype

**Allied Military Medics**
- Israeli Defense Forces combat medics: ~3,000 active
- UK SF and field medics: ~1,500 relevant billets
- NATO allied forces (Germany, France, Australia, Canada): ~15,000 combined field medics
- Adoption lag: 3–5 years post-US adoption
- Reachable units in 5-year window: 2,000–5,000

**Wilderness SAR / EMS**
- US SAR teams: ~3,500 organized teams, ~65,000 volunteers
- Wilderness EMT / WEMS programs: ~12,000 certified practitioners in US
- Relevant purchase rate (specialty item, not standard kit): 2–5% = 1,500–3,500 units
- Average purchase channel: direct-to-team or via REI/specialty EMS distributors at $289

**Hospital ER / Triage Nurses**
- US Level I/II trauma centers: ~600
- Triage nurses per center: 8–20
- Relevant purchase if stocked as unit-level device (not individual): 2–4 units per center = 1,200–2,400 units
- Larger patient communication market (AAC devices): $200M+ annually, but FieldMend is not AAC; it's triage-specific

### Revenue Scenarios (5-Year Fermi)

| Scenario | Units Sold | Avg Price | Revenue |
|---|---|---|---|
| Conservative (SOFWERX pilot + SAR niche only) | 1,500 | $320 | $480K |
| Base (US mil pilot + SAR + select hospital) | 6,000 | $310 | $1.86M |
| Optimistic (partial NATO adoption + SAR + ER) | 18,000 | $300 | $5.4M |

This is a niche market. It is not a consumer product. Revenue ceiling at realistic adoption rates is in the low millions over five years without a large-scale military program of record. The strategic value is in the capability differentiation and potential integration into future TCCC digital triage systems.

---

## Top 3 Business Risks

### 1. TCCC Adoption Gatekeeping by US Army Institute of Surgical Research (USAISR)

**Risk:** TCCC protocols are governed by the Committee on Tactical Combat Casualty Care (CoTCCC), administratively supported by USAISR. New devices in the triage workflow require endorsement before military procurement officers will fund them. The endorsement cycle can take 3–5 years for devices without an existing category. FieldMend Medic has no existing TCCC category.

**Mitigation:** Pursue SOFWERX Other Transaction Authority (OTA) pathway for rapid prototype contract (< 18 months). Market first to civilian SAR and ER to generate outcome data. Position LoRa output as optional supplement to existing MEDEVAC 9-line reporting — not a replacement for any current TCCC step. Seek endorsement from Special Operations Medical Association (SOMA) as a bridging step.

### 2. Fingerspelling Literacy Among Non-DHH Casualties

**Risk:** ASL fingerspelling is not universally known. A hearing soldier, hiker, or patient who has never learned fingerspelling cannot use the system as designed. Even among DHH individuals, fingerspelling proficiency varies. Under stress, pain, or hypoxia, even fluent fingerspellers make errors. The system's core assumption (that casualties know how to fingerspell) may hold for < 30% of the addressable user base without training.

**Mitigation:** Include a printed trace-card on the enclosure back with a simplified 9-item number-trace protocol (body region codes 1–9, pain scale 1–10) that requires no ASL knowledge. Train medics to guide casualty finger through number traces for non-fingerspelling casualties. This degrades gracefully to a Y/N binary triage mode with no fingerspelling required.

### 3. Classifier Accuracy Under Operational Stress

**Risk:** The stroke ML model is trained on controlled fingerspelling datasets. Operational conditions — gloved casualty fingers, shaking, pain-limited movement, partial stroke completion — may drive accuracy below useful thresholds. If the confirmed message is wrong and the medic acts on it, patient safety is at risk. Regulatory classification as a medical device (FDA) may be triggered if marketed as clinical decision support.

**Mitigation:** Classifier displays per-letter confidence on e-paper alongside the message. Medic always confirms critical clinical data verbally or by other means; the device is positioned as a communication aid, not a diagnostic. Training data augmentation must include gloved, tremor-affected, and partial-trace samples. If FDA De Novo clearance is required, estimate 18–24 month timeline and $500K–$1.5M regulatory spend — incorporate into capital planning.
