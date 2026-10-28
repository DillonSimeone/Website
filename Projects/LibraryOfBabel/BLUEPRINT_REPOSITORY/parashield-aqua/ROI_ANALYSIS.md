# ParaShield Aqua — ROI Analysis

> All figures are Fermi estimates unless otherwise noted. Part costs are training-data references; verify before financial modeling.

---

## Cost of Goods Sold (COGS)

### BOM Cost at 1,000 Units

| Category | Cost per Unit |
|---|---|
| Electronic components (ICs, passives, coil, LRA) | $17.50 |
| BCT-2 bone-conduction transducer | $8.50 |
| LiPo cell (60 mAh, Renata) | $4.20 |
| PCB (flex-rigid, 2-layer, ENIG, JLCPCB) | $3.20 |
| Custom silicone gasket + diaphragm | $2.80 |
| **Per-user BioMed Amber SLA shell** | **$18.00** |
| Oil fill (DC-200 PDMS) + sealants | $0.50 |
| Conformal coat + underfill | $0.30 |
| Retention pad + labeling | $0.40 |
| Cable/umbilical pigtail (commercial variant add-on) | $0.85 |
| **Total BOM (commercial variant)** | **$56.25** |
| Total BOM (recreational variant, no umbilical) | $55.40 |

Note: The per-user shell cost ($18) does not scale with volume in the conventional sense — each shell requires an individual print job on a Form 3B+ with a per-unit resin cost of approximately $15–22 depending on geometry and support material waste. This is a structural COGS element that does not benefit from economies of scale the way injection-molded parts do.

### PCBA + Assembly

| Step | Cost Estimate |
|---|---|
| SMT PCBA (JLCPCB, 1k qty, flex-rigid) | $8.00 |
| Manual assembly (BCT press-fit, LRA, coil, battery, gasket) | $12.00 |
| Oil fill + vacuum fill + seal | $4.00 |
| Pressure test (13.2 bar, 30 min per unit) | $3.50 |
| Functional test + NFC verification | $2.50 |
| **Total assembly + test** | **$30.00** |

### Total COGS

| Item | Cost |
|---|---|
| BOM (commercial variant) | $56.25 |
| PCBA + assembly + test | $30.00 |
| Packaging + documentation | $4.00 |
| **Total COGS** | **~$90.25** |

---

## Retail Price and Justification

**Proposed retail: $490 USD (recreational) / $580 USD (commercial/umbilical variant)**

### Comparable Devices (for context — not direct competitors)

| Device | Category | Price |
|---|---|---|
| SCUBAPRO Galileo HUD | Dive computer (heads-up display) | ~$600–750 |
| Suunto D9 | Wrist dive computer | ~$800–1,200 |
| Aquacom STX-101 | Full-face-mask UW voice comm | ~$1,200–2,000 |
| OTS Buddy Phone | UW acoustic voice comm | ~$800–1,400 |
| Shokz OpenSwim | Consumer bone-conduction (pool only, no UW comms) | ~$150 |

**Note:** SCUBAPRO Galileo and Suunto D9 are dive computers, not communication devices. They are cited only to establish that divers routinely spend $600–1,200 on single-function accessories. Aquacom and OTS are genuine UW communication devices but require hearing and a full-face mask — they are complementary, not substitutable. There is **no direct comparable** product for vibrotactile DHH underwater communication.

### Margin Analysis

| | Recreational | Commercial |
|---|---|---|
| Retail price | $490 | $580 |
| COGS | $90.25 | $91.10 |
| Gross margin | **$399.75 (81.6 %)** | **$488.90 (84.3 %)** |

Gross margin appears high because the COGS is genuinely low for a medical/dive-grade device at this quantity. The real cost challenge is not COGS but:
1. Per-user customization logistics (scan collection, parametric model generation, print QA) — estimated $40–80 per unit in labor if not automated
2. Regulatory certification (ISO 10993, CE Mark, FCC Part 15 for NFC) — estimated $150–300k one-time, amortized over first ~3,000 units at ~$75/unit
3. Pressure-test infrastructure (~$25k for hyperbaric test chamber)

**Adjusted all-in unit economics at 1k units:**

| Item | Cost |
|---|---|
| COGS | $90 |
| Per-user shell logistics labor | $60 |
| Reg. cert. amortization (3k unit run) | $75 |
| Warranty reserve (5 %) | $25 |
| **Adjusted unit cost** | **~$250** |
| Retail price | $490 |
| **Net margin after adjustments** | **~$240 (49 %)** |

A 49 % net margin pre-SG&A is reasonable for a niche medical/dive hardware device. Post-SG&A (distribution, marketing, customer onboarding for scan flow) will likely compress to 25–35 % operating margin at scale.

---

## Fermi Market Estimate

> These are order-of-magnitude estimates using publicly available diver registration data and hearing loss prevalence. They are explicitly speculative.

### Total Addressable Market

**US certified divers (PADI + NAUI + SSI combined estimate):** ~3.5 million active divers (PADI reports ~1 million new certifications/year globally; US is ~20 % of global total; assume 3.5 M active US divers at any time).

**EU certified divers:** Roughly comparable to US; assume ~4 million across major diving nations (Germany, France, Italy, UK, Spain).

**Commercial/saturation divers (US + EU):** ~50,000 professional divers, of which ~15,000 operate in high-ambient-noise environments relevant to this product.

### Serviceable Addressable Market (SAM)

**Recreational DHH divers:** Hearing loss prevalence in the general adult population is ~15 % (moderate-to-profound: ~3–5 %). Deaf or hard-of-hearing divers who actively dive: conservatively 1 % of active divers = ~35,000 US + ~40,000 EU = ~75,000 globally.

**Hearing divers in hoods / high-noise environments:** Tec divers, cold-water divers, and commercial divers who would benefit from a hood-compatible alert channel. Estimate 5 % of active divers = ~175,000 US + EU recreational + 15,000 commercial.

**Total SAM:** ~265,000 units globally.

### Serviceable Obtainable Market (SOM) — Year 1–3

Capture rate assumptions:
- DHH recreational divers: 5 % penetration in 3 years = ~3,750 units
- Cold-water/tec hearing divers: 1 % penetration = ~1,750 units
- Commercial divers: 3 % penetration = ~450 units
- **3-year SOM: ~6,000 units**

**3-year SOM revenue (@ $490 avg):** ~$2.9 M
**3-year SOM gross profit (@ ~$240 net margin):** ~$1.4 M

### Replacement Cycle

Device lifetime is targeted at 3–5 years (500 pressure cycles = ~3 years for a diver making 3 dives/week). Replacement revenue is recurring and can include a shell-only refresh (~$90 at cost) when device electronics are unchanged.

---

## Top 3 Business Risks

### 1. Small TAM in DHH-Recreational Segment

The primary differentiated market — Deaf recreational divers — is genuinely small. 75,000 global potential users is a micro-niche. If the product cannot expand to the broader "hearing diver in a hood" market (a larger but less acutely underserved group), revenue ceiling is low. Mitigation: market the alert-preset use case (ASCEND, OOA, SHARK) to all cold-water divers regardless of hearing status; position BCT as superior-to-wrist-buzz for tactile salience, not as a hearing-loss accommodation.

### 2. Commercial Diving Regulatory Acceptance

Commercial saturation diving is governed by OSHA 29 CFR 1910.424-1910.430, IMCA D 014 (diving systems), and flag-state regulations. Any electronic device worn by a commercial diver in a saturation system must be approved by the saturation system manufacturer and typically the flag-state authority. This approval pathway is long (12–24 months) and expensive. Mitigation: launch recreational first; pursue commercial certification only after revenue covers the regulatory investment.

### 3. Per-User Shell Logistics at Scale

The custom-per-user shell is the product's key differentiator and its biggest operational challenge. At 6,000 units in 3 years, the scan-to-print workflow must be semi-automated: the phone AR scan generates an STL, a cloud parametric engine validates fit parameters, and an automated print queue dispatches to a network of Form 3B+ printers (in-house or third-party). Failure to automate this pipeline means per-unit labor costs escalate and margin collapses. Mitigation: invest in the scan-to-STL automation pipeline in Year 1 before scaling; alternatively, offer a semi-custom fit in 5 anatomical size classes to reduce per-user print jobs.
