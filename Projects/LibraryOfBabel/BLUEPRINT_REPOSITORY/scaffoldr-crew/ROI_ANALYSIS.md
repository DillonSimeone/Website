# SCAFFOLDR-CREW — ROI Analysis

> All figures are first-pass estimates. A founder should refine with live LCSC/JLCPCB quotes, freight invoices, and channel agreements before committing capital.

---

## 1. BOM Cost at 1,000 Units

| Bucket | $/unit | % of BOM |
|---|---:|---:|
| MCU + RF (ESP32-S3, SX1262, antenna, shielding) | $14.43 | 7.9% |
| Sensors (ToF camera, lens, IMU, mic, BME280) | $59.10 | 32.4% |
| Haptic + bone-conduction (DRV2605L ×2, LRA ×2, BC TX ×2, amps ×2) | $32.79 | 18.0% |
| Power (BQ25895, MAX17048, regulators, 18650 cell + holder) | $19.43 | 10.7% |
| Mechanical (enclosures, mount, cables, pads, packaging) | $25.65 | 14.1% |
| PCB + SMT assembly | $12.70 | 7.0% |
| Passives + connectors + labels + firmware labor | $18.08 | 9.9% |
| **TOTAL BOM @ 1k** | **$182.18** | **100%** |

**Sensitivity at other volumes (estimated):**

| Volume | $/unit | Δ vs 1k |
|---|---:|---:|
| 100 (prototype) | ~$310 | +70% |
| 1,000 (pilot) | $182 | baseline |
| 5,000 | ~$148 | -19% |
| 25,000 | ~$122 | -33% |

Drivers of decline: enclosure tooling amortization, reel-quantity passives, direct factory contracts on transducers, custom panel SMT pricing.

---

## 2. Assembly Cost Detail (JLCPCB Standard + Hand-Finish)

| Step | Cost @ 1k | Notes |
|---|---:|---|
| 4L PCB fab (95×60 + 45×35 daughter, panelized 2-up) | $4.20 | ENIG, controlled-Z |
| SMT top-side (≈ 220 placements) | $5.80 | JLCPCB Standard, parts from JLC library where possible |
| SMT bottom-side (≈ 60 placements, RF + shielding) | $2.70 | Stencil + reflow |
| Hand-finish: SX1262 can, battery holder solder-down, harness terminations | $4.50 | In-house or contract assembly partner |
| Functional test (ICT + RF golden-unit + haptic loopback) | $3.10 | 4-min/unit at $46.50/h labor |
| Final QC + serial provisioning + firmware flash | $1.50 | Listed as FW line in BOM |
| **Total electronics assembly** | **$21.80** | |
| Enclosure assembly + heat-stake + harness routing | $4.20 | Hand assembly |
| Retail pack + label + QSG | $1.40 | Includes pick-pack labor |
| **All-in assembled** | **$27.40** | |

This is rolled into the BOM under SMT, ENC, PACK, FW lines — total $182.18 already includes labor.

---

## 3. Shipping / Duty / Landed Cost

| Item | $/unit |
|---|---:|
| Factory to US bonded warehouse (Shenzhen → LAX, sea LCL 1k units, ~120 kg) | $2.40 |
| US customs broker + clearance | $0.30 |
| Import duty (HTS 8517.62.00 wireless transceiver, currently 0% under MFN) | $0.00 |
| Section 301 tariff exposure (currently ~25% on certain China-origin electronics) | $0–$45.55 |
| Domestic 3PL fulfillment + last-mile (avg) | $4.20 |
| **Landed-cost adder (base, no tariff)** | **$6.90** |
| **Landed-cost adder (with worst-case 25% tariff on BOM)** | **$52.45** |

**Risk-flagged landed cost per unit:**
- Best case: $189.08
- Likely case: $200–$215
- Tariff-exposed worst case: $234.63 — would require either a Mexico/Vietnam CM, or tariff-engineering (final-assembly outside China)

For ROI math below, **use $200/unit landed** as the working assumption.

---

## 4. Suggested Retail & Channel

### 4.1 SKU lineup

| SKU | Description | MSRP | Notes |
|---|---|---:|---|
| SCR-100 | Single helmet node (base) | $499 | ToF, no PV |
| SCR-200 | Single node + solar harvest + OLED brim | $599 | Premium |
| SCR-CREW-5 | 5-pack crew kit + dock charger | $2,199 | -12% vs 5×$499 |
| SCR-OPS-PRO | OAK-D Lite premium SKU (signal-person only) | $899 | Subset units only |

### 4.2 Channel structure

- **Direct-to-contractor** (DTC web + outside sales to ENR top-400 GCs): 60% of volume, full MSRP
- **Safety distributor** (Magid, Grainger, Fastenal): 30% of volume, 35% off MSRP → $324 net
- **Union training programs** (IUOE, Iron Workers Local training centers): 10% of volume, 30% off MSRP → $349 net

Blended ASP on SCR-100: **$420** (0.60 × $499 + 0.30 × $324 + 0.10 × $349 = $419.45)

---

## 5. Gross Margin

| Line | $/unit |
|---|---:|
| Blended ASP (SCR-100, year-1 mix) | $420.00 |
| Landed cost | $200.00 |
| Warranty reserve (3% of ASP) | $12.60 |
| Returns / RMA reserve (2%) | $8.40 |
| Payment processing + factoring (2.5%) | $10.50 |
| **Gross profit / unit** | **$188.50** |
| **Gross margin %** | **44.9%** |

Within the 40–55% target band for first-product hardware startups. Pathway to 55% by year 3:
- Volume BOM down to ~$148 at 5k units → +$34/unit
- ASP up to $449 blended once OSHA cert published → +$29/unit
- Combined → ~52% gross margin

---

## 6. Comparable Products

| Product | Category | MSRP | What it does | Gap |
|---|---|---:|---|---|
| 3M Peltor WS ALERT XPI | Bluetooth + situational-aware earmuff | $399 | Voice radio + ambient mic | Audio-only; useless for DHH |
| Sena Tufftalk Lite | Mesh intercom headset | $269 | 4-person voice mesh, 1.2 km | Voice-only; clamps over ears |
| Sonim XP10 + RPTT | Push-to-talk handset | $799 | LTE/PTT radio | Handheld; voice-only |
| Eartec UltraLITE | Full-duplex wireless crew comm | $640/headset | Crew voice, ~120 m | Voice-only; short range |
| ProGlove MARK Basic | Wearable barcode scanner | $1,200 | Glove-mounted scanner | Different vertical |
| Captioncall / Live Transcribe | Phone-based ASR | free–$varies | Speech → text | Phone in pocket; not jobsite-grade |
| **scaffoldr-crew SCR-100** | **DHH-first crane-signal comms** | **$499** | **Gesture-to-haptic + LoRa mesh** | **N/A — new category** |

**Positioning takeaway:** priced above Sena, below Peltor + Sonim combined. The DHH-accessibility angle plus haptic relay is unmet by any incumbent, so price elasticity is tested against insurance + lawsuit-avoidance value, not against radio comparables.

---

## 7. Addressable Market

### 7.1 US ironworker / signal-person TAM

- Iron Workers International: **~130,000 members** across 130+ locals
- IUOE (operating engineers, includes crane ops): **~400,000 members**, of which ~80,000 are crane/heavy-rig
- OSHA-certified signal persons (mandated by 1926.1428): rough estimate **~200,000 active**
- DHH share of construction workforce: BLS + NIDCD imply ~3–5% have meaningful hearing loss; many self-exclude from signal-person duty because of voice-radio dependence
- US **hardhat replacement market**: ~3.5 M new hardhats sold/year

**Conservative serviceable obtainable market (SOM, 5 years):**

| Segment | Units | Rationale |
|---|---:|---|
| DHH ironworkers / riggers (US) | 4,000 | 3% × 130k members, half are direct prospects |
| Hearing crews on high-noise sites mandating haptic relay (insurance-driven) | 18,000 | 1 in 4 unionized crews adopt by year 5 |
| Crane rental fleets (Maxim, ALL Crane, etc., bundling with cranes) | 6,000 | Top-10 fleets, ~600 cranes ea., one node per signal person |
| International (EU + AU) on the same platform | 12,000 | Year 4–5 |
| **5-yr SOM** | **40,000 units** | |

### 7.2 Global TAM (construction PPE comms)

- Global construction PPE market: ~$11 B / yr
- "Smart PPE / wearable comm" sub-segment: ~$1.4 B / yr, growing 11% CAGR
- Capturable share for a DHH-first niche product: **~0.5% = $7 M/yr** at maturity, $35 M cumulative over 5 yrs

---

## 8. Break-Even Analysis

### 8.1 Fixed costs (year 1)

| Bucket | $ |
|---|---:|
| Engineering payroll (3 FTE × $160k loaded, 12 mo) | $480,000 |
| FCC / IC / IEC 62133 / ANSI Z89.1 cert | $85,000 |
| Injection-mold tooling (crown enclosure) | $42,000 |
| CNC fixturing (camera pod) | $8,000 |
| ML training data licensing + labeling | $35,000 |
| Initial inventory (1k units × $200 landed) | $200,000 |
| Sales + marketing year 1 | $120,000 |
| G&A / legal / insurance | $90,000 |
| **Total year-1 fixed + working capital** | **$1,060,000** |

### 8.2 Break-even units

At $188.50 gross profit / unit:

`$1,060,000 / $188.50 = **5,624 units**`

At year-1 pilot volume of 1,000 units → gross profit $188,500 → loss of ~$871k, financed by seed round.
At year-2 volume of 5,000 units → gross profit $942k → still slightly below break-even.
**Cumulative break-even crossed at unit ~5,624, typically late year 2 / early year 3.**

### 8.3 Year-1 conservative revenue

- 1,000 units × $420 ASP = **$420,000 revenue**
- COGS: $200,000
- Gross profit: $188,500 (after reserves)
- Cash burn vs fixed: -$871,500
- Required seed: $1.2–1.5 M (with 6 mo runway buffer)

---

## 9. Sensitivity Table

Gross margin sensitivity to ASP and landed cost:

| Landed → ASP ↓ | $170 | $200 | $230 | $260 |
|---|---:|---:|---:|---:|
| $499 | 60.7% | 54.7% | 48.7% | 42.7% |
| $449 | 56.3% | 49.6% | 42.9% | 36.2% |
| $420 (blended) | 53.2% | 46.2% | 39.3% | 32.3% |
| $399 | 50.8% | 43.5% | 36.2% | 28.9% |
| $349 | 44.4% | 36.1% | 27.8% | 19.4% |

Greenfield (>50%) requires either (a) tariff-engineered <$170 landed cost, or (b) ASP holding ≥$449 blended via direct-channel mix.

Volume sensitivity to break-even:

| Year-1 units | Gross profit | Loss vs fixed |
|---:|---:|---:|
| 500 | $94k | -$966k |
| 1,000 | $189k | -$872k |
| 2,000 | $377k | -$683k |
| 3,500 | $660k | -$400k |
| 5,624 | $1.06M | $0 (BE) |

### 9.1 Tariff scenario

If a 25% Section 301 tariff applies to the China-origin BOM (~$130 of the $182):
- Tariff cost: ~$32.50/unit
- Landed cost rises to ~$232
- Blended-ASP gross margin compresses from 44.9% → 36.1%
- Mitigation: relocate final assembly to Vietnam or Mexico CM (substantial-transformation rule), or push ASP to $549

---

## 10. Strategic Notes

- **OSHA cert is the moat.** Once SCR-100 is named in an OSHA / ANSI signal-person standard as an acceptable haptic relay, every crew with a DHH member effectively must adopt. Pursue early.
- **Insurance subsidy is a wedge.** Builder's-risk + workers'-comp carriers (Travelers, AIG, Chubb) offer rebates for instrumented PPE; a 5–10% rebate on a $50k/year crew policy fully amortizes a 5-pack kit.
- **Union partnership is the GTM.** A pilot with IUOE Local 14 (NYC) or Iron Workers Local 86 (Seattle) yields the field data, the testimonial, and the political cover for an OSHA petition.
- **DHH-first framing is a real differentiator** under ADA Title I employment-accommodation case law; resellers who pitch the unit as an accessibility solution unlock additional state and federal procurement budgets (Workforce Innovation and Opportunity Act funds).

---

## 11. Open Questions for the Founder

1. China vs Vietnam CM — does the founder have a Vietnam contact or should we plan on China + tariff-engineering?
2. Is the OSHA petition path resourced (legal counsel, ~$60k addl)?
3. Hardhat OEM co-brand (MSA, Honeywell) — license vs partner vs white-label?
4. Training-data licensing — is there a union-school partnership for the ASME B30.5 corpus, or buy from a vendor like Scale AI?
5. Insurance-carrier rebate program — pursue in year 1 or year 2?
