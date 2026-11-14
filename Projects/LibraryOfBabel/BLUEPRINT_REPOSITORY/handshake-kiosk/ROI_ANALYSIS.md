# Handshake Kiosk — ROI Analysis

> **Fermi disclaimer:** All market size estimates, adoption rates, and revenue projections in this document are Fermi estimates — order-of-magnitude approximations from public data. They are not audited financials. Use for directional planning only.

---

## 1. Bill of Materials Cost — @1,000 Unit Volume

| Cost Category                          | Per Unit (USD) |
|----------------------------------------|---------------|
| Electronic components (BOM)            | $620          |
| LCD panel + optics assembly            | $165          |
| Enclosure fabrication (SS + gaskets)   | $155          |
| PCBA assembly (JLCPCB/contract)        | $35           |
| Camera modules (RGB + RealSense)       | $244          |
| Misc hardware (fasteners, glands, etc.)| $80           |
| **Total BOM @ 1k units**               | **~$1,299**   |

Note: RealSense D435i ($179 list) is the single highest-cost electronic line item. If cost-down variant (Coral + MobileNet backbone) is used and a simpler structured-light depth sensor substituted (~$60), BOM drops to ~$1,100.

---

## 2. PCBA + Assembly (Full Build)

| Cost Category                          | Per Unit (USD) |
|----------------------------------------|---------------|
| PCBA (custom power/IO board, JLCPCB)   | $35           |
| Final assembly labor (est. 2.5 hrs @ $22/hr contract manufacturing) | $55 |
| Firmware flash + QC test (est. 45 min) | $18           |
| Packaging (foam + carton)              | $22           |
| **Total assembly cost**                | **~$130**     |

---

## 3. Total COGS

| Category                               | Per Unit (USD) |
|----------------------------------------|---------------|
| BOM                                    | $1,299        |
| Assembly + test                        | $130          |
| Inbound freight + tariffs (est. 8%)    | $114          |
| Warranty reserve (3%, 2-yr warranty)   | $46           |
| **Total COGS**                         | **~$1,589**   |

COGS range: $1,450–$1,750 depending on RealSense pricing, SS fabrication quotes, and exchange rates.

---

## 4. Retail Pricing + Justification

**Proposed retail (direct channel): $4,800 per kiosk**

**Justification against VRI/VRS alternatives:**

Current-market Video Remote Interpreting (VRI) services (Stratus Video, InDemand Interpreting, Language Line Video) charge:
- Per-minute rates: $5–$15/minute for ASL video interpreting (source: publicly available healthcare contracting documents; exact rates vary by contract volume)
- Typical hospital contract: minimum monthly commitment of $500–$2,000 + per-minute overages
- Airport and courthouse deployments: ad-hoc billing at the higher per-minute tier

**Important note:** Sorenson VRS (Video Relay Service) is a consumer-facing FCC-regulated service for deaf-to-hearing telephone calls, funded by the FCC Telecommunications Relay Service (TRS) Fund — it is not a VRI service and is not a direct substitute for in-person triage interpretation. It is not an appropriate cost comparison for this product. The relevant comparables are commercial VRI services (Stratus Video, InDemand, Language Line) used by institutions.

**Break-even calculation (hospital ER example):**
- Assume 1 VRI session per ER shift = 3 sessions/day, avg 8 minutes each = 24 min/day of VRI usage
- At $8/min average blended rate: 24 min × $8 = $192/day in VRI cost
- Annual VRI cost (one active kiosk station): $192 × 365 = ~$70,000/year
- Kiosk retail price: $4,800 (hardware, one-time) + $1,200/year SaaS license (dashboard + model updates)
- Year 1 total cost: ~$6,000 vs $70,000 in VRI fees
- **Payback period: ~32 days of equivalent VRI usage**
- Even at 10% utilization vs full VRI replacement: payback < 1 year

**Enterprise pricing tiers:**
- Single unit MSRP: $4,800
- 5-unit hospital deployment: $4,200/unit + $4,800/year SaaS
- 20+ unit health system: $3,600/unit + enterprise SaaS contract
- Hardware-as-a-Service: $350/month (48-month term, includes HW refresh)

---

## 5. Gross Margin

| Price Point          | COGS   | Gross Margin | Gross Margin % |
|----------------------|--------|--------------|----------------|
| MSRP $4,800          | $1,589 | $3,211       | 66.9%          |
| Enterprise $3,600    | $1,589 | $2,011       | 55.9%          |
| HaaS $350/mo (48mo) = $16,800 lifetime | $1,589 + $2,400 SaaS cost | ~$12,800 | ~76% lifetime |

Target gross margin: 60–70% at direct MSRP. This is consistent with comparable industrial IoT hardware companies (not consumer electronics). The SaaS layer (operator dashboard + model updates) carries ~80% gross margin and improves blended company margin over time.

---

## 6. Fermi Market Estimate

### Total Addressable Market — US Only

**Hospital Emergency Departments:**
- US hospital ERs: ~5,000 facilities with ED (AHA Hospital Statistics, ~2024)
- Large ERs (>50,000 annual visits): ~1,500 facilities — highest priority, most likely to have VRI contracts today
- Kiosks per large ER: 2–4 (triage desk, intake window, waiting room backup) = avg 3
- Small/medium ERs: ~3,500 — typically 1 kiosk per facility
- Total US hospital ED units: (1,500 × 3) + (3,500 × 1) = 4,500 + 3,500 = **~8,000 units**

**Commercial Airports:**
- US commercial service airports with scheduled service: ~500 (FAA data)
- Airports with >1M annual passengers (relevant buyer scale): ~150
- Kiosks per airport: avg 5 gate areas + 1 check-in + 1 information desk = ~7 per airport
- Total airport units at 150 airports: 150 × 7 = **~1,050 units**

**Federal and State Courthouses:**
- Federal courthouses (PACER data): ~500 federal district + magistrate court locations
- State courthouses with intake desks (50 states × avg 30 locations): ~1,500
- Kiosks per courthouse: avg 2 (intake + security screening)
- Total courthouse units: (500 + 1,500) × 2 = **~4,000 units**

**Total US TAM: ~13,000 units**

At MSRP $4,800: hardware TAM = **~$62M**

With SaaS at $1,200/unit/year: annual recurring TAM at full penetration = **~$15.6M ARR**

**5-Year Adoption Estimate (Fermi):**
- Year 1–2: Early adopters, 2 major health systems + 1 airport authority pilot = ~50 units
- Year 3: Reference sales, 5% of hospital TAM = 400 units; 5% airport = 50 units
- Year 4–5: 15% cumulative penetration of hospital TAM = 1,200 units total deployed
- At 15% penetration over 5 years: **~1,500 units deployed**
- Revenue at blended $4,200 ASP: **~$6.3M hardware** + **~$1.8M ARR SaaS by Year 5**

This is a realistic institutional sales cycle estimate — hospital procurement cycles are 12–18 months, airport infrastructure is 18–36 months. Fast growth requires a channel partner (AV integrator network or health system GPO contract).

---

## 7. Direct Comparables

| Comparable Product/Service          | Type          | Cost                        | Notes |
|-------------------------------------|---------------|-----------------------------|-------|
| Stratus Video (InDemand)            | VRI Service   | $5–$15/min, subscription    | No direct kiosk competitor; this is the incumbent being displaced |
| Language Line Video                 | VRI Service   | $5–$12/min, enterprise      | Same as above; no hardware component |
| Sorenson VRS                        | Consumer VRS  | FCC-subsidized, free to deaf user | Different use case (telephone relay); not a direct competitor |
| AMN Healthcare (CyraCom)            | VRI + staffing | $6–$14/min + minimums      | Enterprise healthcare focus; same displacement opportunity |
| **No direct kiosk competitor identified** | Hardware | N/A | No mass-market, zero-touch ASL kiosk product identified at time of analysis; closest are general-purpose ADA information kiosks without ASL ML capabilities |

The absence of a direct hardware competitor is both an opportunity (first-mover) and a risk (no proven market validation for the hardware form factor at this price point).

---

## 8. Top 3 Business / Regulatory Risks

### Risk 1 — Medical Device Regulatory Classification (FDA SaMD)

If Handshake Kiosk is deployed in clinical triage settings and marketed as improving patient safety outcomes, the FDA may classify it as Software as a Medical Device (SaMD) under 21 CFR Part 11 and the FDA's Digital Health Center of Excellence guidance. Class II SaMD clearance (510k) costs $50,000–$500,000 in regulatory consulting + submission fees, with 6–18 month timelines. Mitigation: position v1.0 strictly as a "communication accessibility tool" (ADA compliance), not a clinical decision support system. Engage FDA pre-submission (Q-Sub) to get written classification determination before v1.0 commercial launch. Do not use "triage" language in patient-facing marketing.

### Risk 2 — ASL Classifier Accuracy and Liability

If the kiosk misinterprets a sign (e.g., "allergic" vs "alergy" fingerspelling error, or a regional sign variant misclassified), the result could be a patient receiving the wrong medication or missing a critical intake question. The system is designed to prompt confirmation and provide text output for patient review, but misclassification liability in a healthcare setting is serious. Mitigation: (a) always display the interpreted text on-screen for patient confirmation before committing; (b) include a clear "Did we get that right? Y/N" confirmation step; (c) maintain a staff-escalation button that always routes to a human interpreter; (d) publish accuracy specifications prominently — no marketing claims exceeding tested accuracy rates. Maintain a product liability insurance policy from launch.

### Risk 3 — Cultural and Labor Displacement Concerns

Deploying an ASL-to-speech machine in settings that have historically employed deaf interpreters and deaf community advocates raises legitimate cultural concerns. The Deaf community (capital-D) has a strong identity politics around Deafness not being a "problem to be solved by technology." Marketing that frames the kiosk as "replacing human interpreters" will generate organized resistance. Mitigation: (a) conduct community co-design sessions with Deaf advocacy groups (NAD, HLAA) before launch; (b) position the kiosk as bridging the gap when no interpreter is available, not as a replacement; (c) ensure all promotional materials feature Deaf users as agents, not subjects; (d) donate a percentage of revenue to Deaf interpreter training programs.
