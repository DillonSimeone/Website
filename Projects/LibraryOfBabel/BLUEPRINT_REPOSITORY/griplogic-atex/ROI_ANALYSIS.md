# GripLogic ATEX — ROI Analysis

> **Fermi estimate notice:** All market-size and revenue figures below are Fermi estimates based on publicly available industry headcount data and analogous product pricing. They are directional, not audited projections. BOM costs are best-guess reference prices; verify with distributor quotes before financial modeling.

---

## BOM Cost Breakdown at 1,000 Units

| Category                          | Cost per Unit (USD) |
|-----------------------------------|---------------------|
| Active ICs (U1–U11)               | $96.90              |
| Passives (C, R, L, D, F)          | $5.20               |
| Connectors & hardware (J, SW)     | $42.65              |
| IS battery cell (BAT1)            | $48.00              |
| Custom PCBs (belt + flex)         | $26.50              |
| Enclosure (GRP ATEX box)          | $32.00              |
| Glove shell (Nomex FR)            | $22.00              |
| Cable loom + cable glands         | $23.90              |
| Misc consumables + conformal coat | $3.95               |
| **BOM Total @ 1k units**          | **$301.10**         |

*Note: IS barrier module (MTL787+) and IS-certified cell (Ultralife UBBL10-I) dominate cost at ~30% combined. At 10k units, volume pricing on these two items alone could reduce BOM by ~$35/unit.*

---

## PCBA and Assembly Costs

| Operation                                  | Cost per Unit (USD) |
|--------------------------------------------|---------------------|
| Belt-pack PCB PCBA (4-layer, ~45 SMT parts) | $28.00             |
| Flex PCB assembly (hand-place + reflow)    | $18.00              |
| Glove cut-and-sew + flex lamination        | $35.00              |
| Final assembly, cable routing, gland seals | $22.00              |
| IS functional test + calibration (10 min)  | $14.00              |
| Conformal coat + cure                      | $6.00               |
| Incoming inspection + IS continuity check  | $8.00               |
| **Assembly Total**                         | **$131.00**         |

---

## ATEX Certification Amortization

Full ATEX Ex ia IIC certification through a Notified Body (e.g., SGS Baseefa, TÜV SÜD) is estimated at $180,000–$380,000 and 18–30 months for a novel IS device. Using midpoint $280,000 amortized over 3,000 units (conservative first 2-year sell-through):

**Cert amortization per unit: $93.33** at 3k units; drops to **$28.00** at 10k units. This is the single largest COGS lever — early volume sales directly compress the effective unit economics.

| COGS Component                    | @ 1k units | @ 3k units | @ 10k units |
|-----------------------------------|-----------|-----------|------------|
| BOM                               | $301      | $285      | $258       |
| Assembly                          | $131      | $128      | $118       |
| Cert amortization                 | —         | $93       | $28        |
| Warranty reserve (5%)             | $22       | $25       | $20        |
| **Total COGS**                    | **$454**  | **$531**  | **$424**   |

*The 1k-unit column excludes cert amortization (pre-cert development units / pilot). The 3k-unit column is the post-cert commercial launch scenario.*

---

## Retail Pricing and Justification

**Target retail price: $2,400 per unit** (glove + belt-pack system, 1-year warranty, onboarding training license).

**Justification rationale:**

1. **ATEX device pricing norms:** IS-certified field instruments (gas detectors, smart transmitters) routinely price at $1,500–$4,500. The GripLogic system is more complex than a single-point gas detector and provides a novel life-safety function. $2,400 sits at the conservative end of the IS instrument market.

2. **FR PPE + electronics precedent:** Honeywell Miller fall-arrest harnesses with integrated sensors price at $800–$1,400. Adding IS electronics and custom certification easily supports a $2,400 price point for a category-defining product.

3. **Cost-per-incident avoided:** A single lost-time injury in a refinery costs $50,000–$500,000 in direct costs (OSHA data, industry estimates). A system that credibly reduces alarm-miss incidents by 1–2 per site per year justifies even higher pricing; $2,400 is priced for rapid adoption, not premium extraction.

4. **Annual service contract:** $240/unit/year (10% of retail) for firmware updates, electrode replacement kit (16 AgCl pads), and recertification support. This builds recurring revenue without requiring hardware replacement.

---

## Gross Margin Analysis

| Scenario          | Retail  | COGS   | Gross Margin | Gross Margin % |
|-------------------|---------|--------|--------------|----------------|
| Launch (3k units) | $2,400  | $531   | $1,869       | 77.9%          |
| Scale (10k units) | $2,200* | $424   | $1,776       | 80.7%          |
| Worst case        | $1,800  | $600   | $1,200       | 66.7%          |

*$2,200 assumes modest price erosion as market matures. Even at worst-case $1,800 retail with $600 COGS, margins remain healthy for a hardware safety product.

---

## Comparable Products

**Direct electrotactile-alarm glove for ATEX: No direct comparable identified.** This is a novel product category as of the analysis date (May 2026).

**Adjacent comparables:**

| Product                          | Category                    | Price      | Notes                                  |
|----------------------------------|-----------------------------|------------|----------------------------------------|
| Neosensory Buzz                  | Vibrotactile wristband      | ~$399      | Consumer, not ATEX, no semantic coding |
| Honeywell BW Clip4 gas detector  | IS wearable gas alarm       | ~$850      | Audible/visual only, no tactile        |
| MSA ALTAIR io360 gas detector    | IS wireless gas monitor     | ~$2,200    | Comparable IS price point, different function |
| Pepperl+Fuchs WirelessHART adapters | IS RF infrastructure    | $600–1,800 | Infrastructure, not wearable           |

*None of the above are direct substitutes. GripLogic occupies a gap between consumer haptics (wrong certifications) and IS field instruments (no tactile output).*

---

## Fermi Market Estimate

**Target segments:** US and EU refineries, chemical plants, LNG terminals, offshore platforms.

**US refineries:** ~135 operating refineries (EIA data), average ~400 process operators per site = ~54,000 US refinery operators. Assume 20% are high-exposure Zone 1 workers requiring personal alarm devices = **~10,800 addressable US refinery operators**.

**US chemical plants:** ~12,000 chemical manufacturing facilities (EPA RMP data), but only ~800 have significant Zone 1 areas. Average 150 Zone 1 operators = **~120,000 US chem-plant Zone 1 operators**.

**EU (Germany, Netherlands, Belgium, France, UK refineries + chem plants):** Roughly 1.5× the US addressable market = **~196,000 EU Zone 1 operators**.

**Offshore (North Sea, Gulf of Mexico):** ~80,000 offshore workers in hazardous zones globally.

**Total addressable market (TAM): ~407,000 units** (operators; replace every 3 years = ~136,000 units/year demand ceiling).

**Serviceable addressable market (SAM):** Assume 15% adoption in first 5 years (driven by regulatory pressure, early adopter safety managers, and insurance incentives) = **~20,000 units over 5 years** = ~4,000 units/year.

**SAM revenue at $2,400 retail:** ~$9.6M/year at scale. Plus service contracts (~$240/unit/year on installed base) add another ~$1.2M/year by year 3. **5-year cumulative revenue estimate: ~$54M.**

*These are Fermi estimates. Actual adoption depends heavily on regulatory mandates, insurance incentive structures, and ATEX certification timeline.*

---

## Top 3 Business Risks

### 1. ATEX Certification Timeline (Highest Impact)

ATEX Ex ia IIC certification for a novel mixed-signal wearable is a 18–30 month process. Any redesign triggered by Notified Body feedback resets portions of the timeline. The company cannot legally sell into Zone 1 in the EU without this certification. Mitigation: pursue IECEx first (single global cert accepted in 50+ countries); use pre-certified modules (WirelessHART, IS battery) to minimize novel certification scope; budget $380k and 30 months worst-case.

### 2. Electrotactile UX and Training Adoption

Electrotactile sensation is unfamiliar to most workers and perceived as uncomfortable at high amplitudes. If operators find the sensation unpleasant or confusing, they will remove the glove. This would be the product's primary failure mode — technically working but behaviorally rejected. Mitigation: conduct 50-person ergonomic study with adjustable amplitude before finalizing production firmware; partner with an occupational therapist and a Deaf safety consultant to validate the ASL pattern mapping; design a mandatory 2-hour simulator-based onboarding that plants can run during regular safety training cycles.

### 3. Displacement Risk from Regulatory Mandate Changes

GripLogic's value proposition is strongest when plants are under regulatory pressure to provide accessible alarms for deaf/HOH workers (ADA, EU Accessibility Directive extensions to industrial safety). If regulators instead mandate simple vibrating wristbands (cheaper, uncertified) as compliant, the premium ATEX glove loses its regulatory pull. Mitigation: engage directly with OSHA Process Safety Management rulemaking and EU ATEX working groups during the certification period to position electrotactile-ASL as the gold standard; develop relationships with hearing-loss advocacy organizations (Hearing Loss Association of America, EFHOH) who have standing in regulatory proceedings.
