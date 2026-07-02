# ChillBlast Freezer — ROI Analysis

> Fermi estimates. All part numbers and prices `verify-before-order`. Do not use for investment decisions without independent verification.

---

## 1. COGS Breakdown (per worker kit @ 1k unit volume)

A "kit" = 1 haptic mitt + 1 shoulder puck. Forklift cluster is sold separately (facility-level infrastructure, ~1 per 2 forklifts).

### Haptic Mitt BOM (LSL SKU — primary-cell, preferred)

| Category                                          | Cost (USD) |
|---------------------------------------------------|-----------|
| ESP32-C6-MINI-1 mitt MCU                          | 2.80      |
| DRV2605L haptic driver ×4                         | 7.80      |
| VLV101040A LRA actuator ×4 (-40C cold-rated)      | 7.40      |
| MAX30205 skin-temp sensor ×2                      | 6.80      |
| ATECC608B crypto co-processor                     | 0.95      |
| TPS62933 buck + LDOs + supervisory               | 2.10      |
| LSH14 LiSOCl₂ C-cell (Saft)                      | 7.40      |
| Cell pod sealed bayonet connector                 | 2.20      |
| Flex-rigid PCB (4L ENIG, glove-shaped)            | 18.00     |
| Cordura 1000D + Thinsulate composite (CMT)        | 22.00     |
| Discretes, MLCC X7R, NTC, antenna, misc           | 6.50      |
| **Mitt BOM subtotal**                             | **83.95** |

### Shoulder Puck BOM (LSL SKU)

| Category                                          | Cost (USD) |
|---------------------------------------------------|-----------|
| IWR1443 mmWave radar SoC                          | 32.50     |
| ESP32-S3-WROOM-1U ext-antenna module              | 4.40      |
| EFR32MG24 secondary radio (mesh)                  | 5.20      |
| VL53L8CX ToF sensor                               | 7.10      |
| ITO heated lens window (1.2W)                     | 4.90      |
| TPS62933 + TLV70233 power regulators             | 1.80      |
| 2× Tadiran TL-5104 LiSOCl₂ AA in series          | 8.40      |
| TPU 95A low-temp puck shell (tooled, amortized)   | 8.40      |
| Gore PMF200505 vent + desiccant cartridge         | 1.65      |
| Silicone gasket S0383-70                          | 0.85      |
| PCB (4L ENIG, 60×45 mm)                           | 9.50      |
| Discretes, MLCC, crystal, antenna, misc           | 5.20      |
| **Shoulder puck BOM subtotal**                    | **89.90** |

### Kit-Level Assembly & Test

| Line Item                                       | Cost (USD) |
|-------------------------------------------------|-----------|
| Mitt PCBA (SMT + flex-rigid handling @1k)       | 14.00     |
| Mitt sewn-goods integration + cell-pod seal     | 9.00      |
| Shoulder puck PCBA (SMT @1k)                    | 8.00      |
| Shoulder puck enclosure + radome seal           | 3.50      |
| Functional test + 4-hr cold-soak QC sample      | 6.00      |
| Pairing/enrollment fixture time (8 min)         | 3.30      |
| Packaging + foam insert (return-ready)          | 5.50      |
| Battery shipping surcharge (UN 3091 prep)       | 2.20      |
| **Per-kit assembly subtotal**                   | **51.50** |

### Total COGS Per Worker Kit

| Component               | Cost (USD) |
|-------------------------|-----------|
| Mitt BOM                | 83.95     |
| Shoulder puck BOM       | 89.90     |
| Assembly + test         | 51.50     |
| **Total COGS per kit**  | **225.35**|

LiH SKU (li-ion + heater) adds ~$11 BOM (heater foil + BQ25798 + 18650 cell vs. LSH14/TL-5104), removes battery-shipping surcharge for steady-state, but adds dock-station charger infrastructure (sold separately at $180 retail per 8-bay station).

### Forklift Overhead Cluster COGS

| Category                                         | Cost (USD) |
|--------------------------------------------------|-----------|
| 2× ESP32-S3-WROOM-1U                             | 8.80      |
| KSZ9031RNXIC GbE PHY                             | 4.60      |
| Ag9800MT PoE+ module                             | 12.40     |
| TPS54360 + regulators                            | 4.20      |
| Kapton heater foil 8W                            | 6.40      |
| Aluminum IP66 cold-rated housing                 | 14.00     |
| 4× Lord LM-003 vibration isolators               | 11.20     |
| PCB (4L ENIG, 110×80mm) + assembly               | 21.00     |
| Discretes, RJ45, vent, gasket, antenna           | 8.30      |
| Test + packaging                                 | 4.50      |
| **Forklift cluster COGS**                        | **95.40** |

---

## 2. Retail Price & Justification

| SKU                       | Target retail | Margin (direct) | Margin (distributor 30%) |
|---------------------------|---------------|-----------------|--------------------------|
| ChillBlast Mitt (LSL)     | $850          | 73% (vs. $83.95 + share of assembly = ~$230)¹ | 53% |
| ChillBlast Mitt (LiH)     | $900          | 71%             | 51%                      |
| ChillBlast Shoulder Puck  | $1,550        | 75% (vs. ~$190 fully-loaded) | 56%             |
| ChillBlast Kit (mitt+puck)| $2,200 bundle | 73%             | 53%                      |
| Forklift Cluster          | $480          | 80%             | 60%                      |
| 8-bay charger dock (LiH)  | $180          | 50%             | 30%                      |

¹ Margin math allocates assembly + test pro-rata.

**Comparables:**
- Honeywell IntelliPath worker ergonomic system: ~$2,000 per worker per year (subscription model, body-worn sensors + analytics).
- Zebra TC78 cold-rated handheld: $2,200–$2,800 retail; transactional inventory device, not comms.
- Theatro voice-only worker comms: ~$15/user/month + $500 device — fails the DHH accessibility test entirely.

ChillBlast positions between IntelliPath (ergonomics-only) and Zebra (transactional-only) by occupying the unmet comms + cold-stress monitoring slot. The $2,200 kit price is justified relative to IntelliPath's year-one $2k by adding (a) signing comms, (b) frostbite biometric, (c) no annual subscription required (firmware updates free first 24 months, optional managed service after).

---

## 3. TAM Estimate

| Segment                                            | Workers | Penetration assumption | Units (5yr) |
|----------------------------------------------------|---------|------------------------|-------------|
| US cold-storage / freezer warehouse (USDA/IARW)    | 150,000 | DHH share ~2% + cold-stress-flagged ~8% = 10% addressable | 15,000 kits |
| Global cold-storage (Europe, Japan, AU/NZ, China)  | 1,000,000 | 4% addressable in yr 1-5 | 40,000 kits |
| Adjacent: meat packing, fish processing (US)       | 280,000 | 3% addressable (regulatory) | 8,400 kits |
| Adjacent: pharmaceutical cold-chain handlers (US)  | 35,000  | 12% addressable (GMP) | 4,200 kits |
| **Total 5-yr unit addressable**                    |         |                        | **~67,600 kits** |

Forklift clusters: assume 1 cluster per 2 forklifts in deployed facilities, ~6,000 facilities × 8 forklifts × 0.5 = 24,000 cluster units 5-yr.

Charger docks (LiH SKU only, conservative 30% of kits choose LiH): ~20,000 kits × 1 dock per 8 workers = 2,500 docks.

---

## 4. 5-Year Revenue Model

| Year | Kits shipped | Clusters | Docks | Direct rev (USD) | Distributor mix | Net rev (USD) |
|------|--------------|----------|-------|------------------|-----------------|---------------|
| 1    | 600          | 200      | 80    | 1.49M            | 40% dist        | 1.05M         |
| 2    | 4,500        | 1,600    | 600   | 11.0M            | 50% dist        | 7.4M          |
| 3    | 12,000       | 4,500    | 1,800 | 29.4M            | 55% dist        | 19.0M         |
| 4    | 22,000       | 8,200    | 3,000 | 53.6M            | 60% dist        | 33.4M         |
| 5    | 28,500       | 10,500   | 4,000 | 69.6M            | 60% dist        | 43.3M         |
| **5yr cumulative** | **67,600** | **25,000** | **9,500** | **~165M** | | **~104M**  |

Optional ARR (managed service for fleet operators, $90/kit/year after year 2): year 5 ARR ~$5.7M.

---

## 5. Break-Even Analysis

**One-time engineering & tooling (Fermi):**
- EE + FW + mechanical design: $850k (4 engineers × 10 mo)
- Cold-chamber test rig + 18-month qual program: $220k
- Mitt sewn-goods tooling + sample production: $140k
- Puck enclosure mold (TPU low-temp): $95k
- FCC/IC certification (3 SKUs incl 79 GHz petition): $280k
- UL 61010 listing: $65k
- Working capital + initial inventory: $1.1M
- **Total pre-revenue burn:** **~$2.75M**

**Per-kit contribution margin (blended 50% direct / 50% distributor):**
- Avg sell price: ~$1,540 net of distributor margin
- Avg COGS (incl. cluster + dock attach): ~$280
- Contribution margin: **~$1,260/kit**

**Break-even unit count:** $2.75M / $1,260 ≈ **2,180 kits** — reached in mid-Y2 under the model.

---

## 6. Sensitivity & Top Risks

| Risk                                            | Impact on COGS | Impact on TAM |
|-------------------------------------------------|----------------|---------------|
| 79 GHz FCC posture forces drop-back to 60 GHz IWR6843AOP | +$25 BOM | none |
| Flex-rigid PCB yield issues on glove form factor | +$8–15 BOM   | none          |
| LiSOCl₂ logistics regulation tightens           | +$3 ship      | -5% TAM (EU)  |
| Honeywell or Zebra ships competing product yr 2 | none           | -30% TAM      |
| Cold-storage industry consolidation slows CapEx | none           | -15% TAM      |
| Mitt glove sizing variants (XS-XXL × L/R) explode SKU count | +$6/kit avg | none |

The single largest swing factor is competitive entry — Honeywell has every component competency on shelf and could ship in 12 months if they prioritized. Mitigation is speed to design-in at the 3 largest US cold-chain operators (Lineage, Americold, USCS) before yr-2 close.
