# nurseround-clinical — ROI Analysis

All part costs, retail price points, and regulatory line items: **verify-before-order**.

---

## 1. BOM-at-1k (per bedside kit = 1 pillow + 1 puck shared across ~6 beds)

Pulled from `PRODUCTION_BOM.csv`. Sum verified against line extensions.

| Sub-assembly | $/unit @ 1k |
|---|---|
| Pillow module (sealed) | **$53.96** |
| Nurse-station puck (PoE) | **$41.17** |
| **Pair (1 pillow + 1 puck)** | **$95.13** |
| **6 pillows : 1 puck (ward kit)** | **$364.93** |

> Pucks amortize across ~6 beds in a typical ward. Pricing below uses **per-bed** allocation: `pillow + puck/6 = $53.96 + $6.86 = $60.82`.

---

## 2. Regulatory Amortization

| Line item | Low | Mid | High |
|---|---|---|---|
| FDA 510(k) prep + consulting | $35k | $70k | $110k |
| Predicate gap testing | $8k | $15k | $25k |
| IEC 60601-1 / -1-2 EMC testbeds | $18k | $30k | $45k |
| IEC 62304 SW lifecycle audit | $6k | $12k | $20k |
| ISO 10993 biocompat (skin >24h) | $10k | $18k | $28k |
| Clinical evaluation (2-site pilot) | $25k | $50k | $90k |
| ISO 13485 QMS stand-up | $15k | $30k | $55k |
| EU MDR CE-mark + Notified Body | $30k | $55k | $90k |
| FDA user fee + filings | $5k | $7k | $9k |
| **Total (US + EU)** | **$152k** | **$287k** | **$472k** |

**US-only path**: $122k / $217k / $382k.

### Amortization schedules

| Scheme | Allocation | $/unit (mid US-only) | $/unit (mid US+EU) |
|---|---|---|---|
| Across first 5,000 units | 5k denom | **$43.40** | **$57.40** |
| Across first 15,000 units | 15k denom | **$14.47** | **$19.13** |
| Across first 50,000 units | 50k denom | **$4.34** | **$5.74** |

We use **first-5k US-only @ $43.40/unit** as the conservative base case.

---

## 3. Loaded Cost per Bed

| Component | $/bed |
|---|---|
| Hardware (per-bed allocation) | $60.82 |
| Regulatory amortization (5k US base) | $43.40 |
| Disposable sleeves (8 admissions/yr × $0.85, 3-yr life amortized as capex) | $6.80 |
| Provisioning + install services (1 hr nurse-IT @ blended $90) | $15.00 |
| EHR/HL7 integration license (per-bed annualized, 3-yr) | $12.00 |
| QMS overhead, post-market surveillance, MDR vigilance reporting | $9.00 |
| Warranty reserve (3 % of HW) | $1.82 |
| **Total loaded cost / bed** | **$148.84** |

---

## 4. Retail / Capex Positioning

Nurse-call augmentation hardware is typically **capex-priced $400–$800 per bed** (Rauland Responder bedside stations land in this band; verify-before-order). DHH-specific augmentation justifies the upper end because:

- Replaces an item (button) the patient functionally **cannot use**.
- Reduces ADA/Section 504 exposure for the hospital.
- Reduces nurse-time per request (no bedside walk to interrogate).

| SKU | List $/bed | Discount typical | Net $/bed |
|---|---|---|---|
| ER / Med-Surg bedside | $695 | 15 % IDN | **$590.75** |
| ICU / step-down | $895 | 12 % IDN | **$787.60** |
| LTAC / SNF retrofit | $545 | 20 % | **$436.00** |
| Service contract (yr 2+, 18 %) | $125/bed/yr | — | recurring |

---

## 5. Margins

Base case = Med-Surg @ net $590.75, loaded cost $148.84.

| Metric | Value |
|---|---|
| Gross profit / bed | **$441.91** |
| Gross margin | **74.8 %** |

That looks rich vs. our 40–55 % target — it reflects untaxed first-5k regulatory. If we recompute with worst-case mid US+EU regulatory:

| Scenario | Reg $/unit | Loaded $/bed | GP / bed | GM |
|---|---|---|---|---|
| Best (US-only, 15k denom) | $14.47 | $119.91 | $470.84 | **79.7 %** |
| Base (US-only, 5k denom) | $43.40 | $148.84 | $441.91 | **74.8 %** |
| Conservative (US+EU, 5k denom) | $57.40 | $162.84 | $427.91 | **72.4 %** |
| Stress (US+EU, 5k, retail haircut to $440) | $57.40 | $162.84 | $277.16 | **63.0 %** |
| Crisis (high reg $472k / 3k units, retail $440) | $157.33 | $262.77 | $177.23 | **40.3 %** |

Even at the **crisis floor** we hold the 40 % bottom of the band, so the regulatory bet is survivable. Realistic operating margin band: **63 – 80 %**.

---

## 6. Break-even

Fixed (mid US+EU): **$287k regulatory + ~$120k NRE tooling/silicone molds + ~$45k SW v1 = $452k**.

Contribution margin / bed (base case): **$441.91**.

Break-even = $452k / $441.91 = **~1,023 beds**.

At 6 beds/puck and an average pilot account of ~80 inpatient beds, **~13 hospital accounts** clears break-even.

---

## 7. TAM / SAM / SOM

| Segment | US beds | Notes |
|---|---|---|
| Community / acute-care hospital inpatient | ~920,000 | AHA latest, verify-before-order |
| Skilled nursing & long-term care | ~1,700,000 | CMS, verify-before-order |
| Long-term acute-care (LTAC) | ~33,000 | small but high-acuity |
| **Total US bed-base** | **~2.65M** | TAM |

DHH-adjusted serviceable share: estimated **3–5 %** of inpatient bed-nights involve a DHH or hard-of-hearing patient who would meaningfully benefit (CDC ~15 % adults report hearing difficulty; clinically-relevant subset narrower).

| Tier | Beds | $/bed | Revenue |
|---|---|---|---|
| TAM hardware | 2.65M | $590 | **$1.56 B** |
| SAM (3 % DHH-flagged inpatient + ADA-mandate ER/L&D rooms) | 79,500 | $590 | **$46.9 M** |
| SOM yr-3 (1.5 % of SAM) | 1,190 | $590 | **$702k/yr** + service |
| SOM yr-5 (8 % of SAM) | 6,360 | $590 | **$3.75 M/yr** + service |

Recurring service (yr 2+) at $125/bed adds ~21 % to top line by year 4.

---

## 8. Sensitivity — Regulatory Cost

| Reg scenario | $ total | $/unit @ 5k | GM @ net $590.75 |
|---|---|---|---|
| Optimistic (US-only, low) | $122k | $24.40 | 79.5 % |
| Mid US-only | $217k | $43.40 | 74.8 % |
| Mid US+EU | $287k | $57.40 | 72.4 % |
| High US+EU | $472k | $94.40 | 66.1 % |
| Catastrophic (extra cycle, +$200k) | $672k | $134.40 | 59.3 % |

GM stays inside 40–55 % floor even at catastrophic. The ROI is **resilient to regulatory cost overruns**, which is the dominant uncertainty in Class IIa devices.

---

## 9. Cash & Timeline

- Months 0–6: design freeze, IEC 62304 doc-set, ISO 13485 stand-up — **~$180k**.
- Months 6–10: bench EMC + biocompat — **~$60k**.
- Months 10–14: 510(k) prep & submission — **~$50k**.
- Months 14–20: clinical pilot, FDA response, clearance — **~$70k**.
- First commercial ship: month 18–22.
- Break-even unit shipped: month 30–36 depending on sales velocity.

---

## 10. Bottom Line

- Per-bed loaded cost: **$148.84** (base).
- Per-bed net revenue: **$590.75** (Med-Surg).
- Gross margin: **~75 %** base, **63–80 %** realistic band, **>40 %** even under crisis.
- Break-even: **~1,000 beds** (~13 accounts).
- US SOM yr-5: ~6,360 beds → ~$3.75 M/yr HW + service tail.
- Dominant risk: regulatory cost overrun — sensitivity shows it does not break the model.
