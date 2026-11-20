# EchoPalm-CAB — ROI Analysis

> All cost figures are estimates. BOM costs use reference part numbers (see PRODUCTION_BOM.csv). Market size estimates are Fermi approximations. This document is a planning tool, not a financial projection.

---

## Bill of Materials Cost Summary (@1,000 Units)

| Category | Est. Cost per Unit |
|---|---|
| Active ICs (radar, MCU, drivers, transceiver) | $43.80 |
| Passives (resistors, caps, inductors, TVS) | $4.20 |
| Connectors and mechanical | $12.60 |
| Motors (ERM + 4× LRA) | $15.20 |
| PCB (4-layer, ENIG, IPC Class 3) | $4.20 |
| Enclosure (injection-molded, amortized) | $6.50 |
| Misc (thermal pad, standoffs, flash) | $3.00 |
| Programming and basic test | $0.50 |
| **Total BOM (components + PCB + enclosure)** | **~$90** |

Notes:
- AWR1843 at $28 is the largest single-line cost; this drops to ~$20 at 10k volume.
- Enclosure tooling (~$15,000–25,000 one-time) is amortized over 5,000 units at ~$4/unit, included in the $6.50 figure.
- LRA motors ($3.20 × 4 = $12.80) represent the second-largest cost block; alternative is 2× LRA at $6.40 if steering ring uses two motors in tandem instead of four.

---

## PCBA and Assembly

| Line Item | Cost per Unit @1k |
|---|---|
| JLCPCB PCBA (SMT assembly, 1k volume) | $8.50 |
| Through-hole / connector hand-install | $3.00 |
| Motor installation and harness crimp | $4.50 |
| Final assembly (enclosure, standoffs) | $3.50 |
| **Total PCBA + Assembly** | **~$19.50** |

---

## AEC-Q100 and Qualification Testing (Amortized)

AEC-Q100 system-level testing is not a per-unit cost but must be amortized into COGS for automotive-channel sales:

| Test | Estimated Cost |
|---|---|
| HTOL (High-Temp Operating Life, 1000h @125°C) | $12,000 |
| Temperature Cycling (-40 to +85°C, 1000 cycles) | $8,000 |
| MIL-810G Vibration + Shock (Method 514/516) | $18,000 |
| FCC Part 15.253 + CE/ETSI EN 302 858 | $22,000 |
| SAE J1939 CAN conformance | $5,000 |
| **Total qualification (est.)** | **~$65,000** |

Amortized over 1,000 units: **~$65/unit**
Amortized over 5,000 units: **~$13/unit**
Amortized over 10,000 units: **~$6.50/unit**

This is the primary argument for fleet contract pricing over single-unit retail.

---

## Total COGS

| Volume | BOM | Assembly | Qual Amort | Total COGS |
|---|---|---|---|---|
| 1,000 units | $90 | $19.50 | $65 | **~$175** |
| 5,000 units | $82 | $17 | $13 | **~$112** |
| 10,000 units | $74 | $15 | $6.50 | **~$96** |

---

## Retail Price and Justification

**Proposed retail / fleet price: $1,200–$1,800 per unit**

Justification framework:
- Emergency vehicle upfits routinely carry $500–5,000 per accessory item (MDT terminals, camera systems, AVL units, partition panels).
- The device addresses an ADA and workplace safety obligation for agencies employing DHH responders. Procurement framing is "safety and accessibility equipment," which bypasses typical cost-sensitivity thresholds.
- Fleet upfit kit (includes installation harness, seatback ERM bracket, steering-wheel slip-ring harness): add $200–400 to unit price for the kit tier.
- Per-vehicle option for new OEM builds (if an auto OEM integration is achieved): $800–1,000 at OEM price, targeting the Ford/GM/Stellantis emergency vehicle upfit programs.

**Target price: $1,500 per unit (fleet direct), $1,200 (OEM-integrated)**

---

## Gross Margin Estimate

| Scenario | Selling Price | COGS | Gross Margin |
|---|---|---|---|
| 1k units, direct fleet | $1,500 | $175 | **88%** |
| 5k units, fleet / distributor | $1,350 | $112 | **92%** (before distributor cut) |
| Distributor channel (35% margin) | $1,350 | $112 + $472 dist. | **~57% company-level** |
| OEM integrated at 10k | $1,000 | $96 | **90%** (before OEM negotiation discount) |

Note: High gross margin is typical for low-volume safety electronics with significant qualification costs — the margin funds certification maintenance, liability insurance, and ongoing firmware support, not just profit. Comparable safety electronics (e.g., Mobileye 8 Connect at ~$800 wholesale, ~$1,500 installed retail) operate in a similar margin band.

---

## Competitive Landscape and Comparables

**No direct comparable product exists** for a deaf-occupant-to-driver haptic alert system in emergency vehicles. The following are the closest adjacent categories:

| Product | Function | Why Not Comparable |
|---|---|---|
| Mobileye 8 Connect (~$800–1,500 installed) | Forward-collision, lane departure, pedestrian alert for fleet vehicles | Alerts the driver about external hazards; no occupant-to-driver communication function |
| Stertil-Koni vehicle lift safety systems | Lift safety interlock for maintenance vehicles | No relation to in-cab communication |
| Alertmedia / Rave Mobile Safety | Mass notification software for public safety agencies | Software, not hardware; no in-cab haptic |
| Deaf-specific phone alert apps (various) | Mobile app vibration alerts | Requires phone proximity; not automotive-rated; not directed at driver |
| Standard PA intercoms in prisoner transport | Voice intercom rear-to-front | Requires hearing; not usable by DHH occupant |

**Conclusion:** EchoPalm-CAB occupies an uncontested hardware niche. The risk is "no competitor = no validated market," addressed in the Fermi estimate below.

---

## Fermi Market Estimate

> This is a Fermi approximation. All figures should be independently verified before financial planning.

**US Emergency Vehicle Fleet:**
- Ambulances in service (US): ~70,000 (NAEMSP / ACEP estimates, ~50,000 licensed ALS/BLS units + volunteer)
- Police vehicles (US): ~700,000 total; ~50,000 SUVs/vans with rear-seat occupant capability relevant to K-9/SWAT
- Fire apparatus with cab occupancy: ~80,000
- **Addressable US fleet: ~200,000 vehicles with rear occupant position**

**EU Emergency Vehicle Fleet:**
- EU ambulance fleet: ~150,000 (rough aggregate from Eurostat health data)
- Police transport with rear occupant: ~200,000
- **Addressable EU fleet: ~350,000 vehicles**

**Combined addressable fleet: ~550,000 vehicles**

**DHH Responder Penetration:**
- US labor force DHH rate: ~3.6% (NIDCD / Census data)
- Emergency services skew lower due to hearing standards in some roles, but DHH paramedics and civilian officers are employed in meaningful numbers; ADA accommodations require reasonable deployment
- Conservative estimate: 8–12% of vehicles are regularly crewed with at least one DHH-capable occupant position
- **Target vehicle count: 44,000–66,000 US+EU**

**Replacement / Upfit Cycle:**
- Emergency vehicles replace on 7–12 year cycles
- Upfit accessories typically replaced at vehicle replacement or mid-cycle refurb (~5 years)
- Annual addressable units: 44,000 / 7 years ≈ **6,300–9,400 units/year** (conservative, US+EU)

**Revenue Estimate at 5% Market Penetration (Year 3–5):**
- 6,300 × 5% = 315 units/year at $1,500 = $472K/year (niche entry)
- 9,400 × 15% = 1,410 units/year at $1,350 = $1.9M/year (established fleet channel)
- Note: A single large-city EMS or police department fleet contract (e.g., FDNY, LAPD) could be 200–500 units and materially change the trajectory.

---

## Top 3 Business Risks

**1. Auto OEM channel access.**
Emergency vehicle upfits are sold through a complex chain: OEM (Ford, GM, Stellantis) → upfitter (Wheeled Coach, Demers, REV Group) → end agency. Breaking into this chain requires upfitter relationships and, for OEM-integrated options, OEM supplier qualification (PPAP, IATF 16949). Timeline: 18–36 months minimum for OEM path. Mitigation: start with aftermarket fleet upfit kits sold directly to agencies or through safety equipment distributors; use OEM path as a 3-year goal.

**2. Regulatory and type-approval complexity.**
The product combines 77 GHz radar (FCC/CE path), automotive electronics (AEC-Q100 expectation), and medical-adjacent safety claims (used in ambulances). A false-positive that distracts a driver during a crash will draw NHTSA and potentially FDA attention. Mitigation: frame the product as a "vehicle accessory" not a "medical device"; obtain NHTSA FMVSS review opinion early; restrict marketing claims to "driver notification aid" not "emergency alert system."

**3. Liability framing.**
If a DHH responder signals HELP-NOW and the driver does not respond in time (haptic missed, driver fatigued), the agency or manufacturer may face liability for a failed safety system. Mitigation: product must be clearly documented as a supplementary communication aid, not a substitute for established emergency procedures. Require agency sign-off on standard operating procedure integration as a condition of sale. Carry product liability insurance commensurate with automotive safety accessory category (~$2–5M per occurrence, ~$15–30K/year premium at early volumes).
