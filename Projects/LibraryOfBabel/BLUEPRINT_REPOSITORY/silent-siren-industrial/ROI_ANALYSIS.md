# Silent Siren Industrial — ROI Analysis

> All figures are Fermi estimates unless sourced. Every assumption is stated. Do not use for investment decisions without independent verification.

---

## 1. COGS Breakdown (ceiling sensor unit + 2 wristbands, @1k unit volume)

### Ceiling Sensor Unit BOM

| Category                             | Cost (USD) |
|--------------------------------------|-----------|
| IWR6843AOP radar SoC                 | 38.50     |
| i.MX 8M Mini SoM (Variscite)         | 85.00     |
| VL53L7CX ToF sensor                  | 6.20      |
| SX1262 LoRa module                   | 4.80      |
| Ag9800MT PoE+ module                 | 12.40     |
| Power regulators (TPS62135 x2, TPS54360) | 4.05   |
| Ethernet PHY, RTC, flash, ESD, discretes | 8.50  |
| Connectors, test points, crystals    | 4.50      |
| Sensor head PCB (4L, 130×100mm)      | 14.00     |
| Polycarbonate IK10 dome enclosure    | 18.00     |
| Misc hardware (gasket, vent, bracket)| 6.00      |
| **Ceiling unit BOM subtotal**        | **201.95**|

### Wristband Unit BOM (×2 included per ceiling unit)

| Category                                 | Cost (USD) each |
|------------------------------------------|----------------|
| ESP32-S3-MINI SoC                        | 3.20           |
| DRV2605L haptic driver                   | 1.95           |
| SSD1306 OLED                             | 1.40           |
| BQ24075 charger + BQ27427 fuel gauge     | 2.75           |
| LiPo 500mAh cell                         | 2.80           |
| USB-C connector, ESD, LDOs, discretes    | 2.50           |
| Wristband PCB (flex-rigid)               | 11.00          |
| TPU strap + clasp                        | 3.50           |
| **Wristband BOM subtotal (each)**        | **29.10**      |
| **Two wristbands**                       | **58.20**      |

### Combined BOM + PCBA + Assembly

| Line Item                                     | Cost (USD) |
|-----------------------------------------------|-----------|
| Ceiling unit BOM                              | 201.95    |
| Two wristband BOM                             | 58.20     |
| PCBA (SMT placement, reflow, inspection) — ceiling PCB @1k | 22.00 |
| PCBA — two wristband PCBs @1k               | 16.00     |
| Final assembly + enclosure integration        | 18.00     |
| Functional test + calibration labor (8 min)   | 12.00     |
| Packaging + foam insert                       | 4.50      |
| **Total COGS per kit**                        | **332.65**|

Rounding assumption: component prices from BOM are @1k unit volume. PCBA cost assumes JLCPCB or equivalent EMS in Shenzhen. Assembly labor at $25/hr effective rate.

---

## 2. Retail Price & Justification

**Suggested retail (direct/distributor): $1,495 per kit** (one ceiling unit + two wristbands).

**Justification:**
- Industrial IoT safety hardware typically carries 3–5× COGS at channel. At 3× COGS: ~$998. At 4.5×: ~$1,497. $1,495 is in the 4–5× range, consistent with niche industrial safety devices where reliability, regulatory compliance, and liability protection justify premium.
- Comparable vertical: Vocera B3000n wireless nurse-call badge retails ~$600/device on nursing floors; factory safety wearables (e.g., Guardhat) are $500–$800/unit. Silent Siren is a ceiling unit + two wristbands for a full zone, not a single wearable.
- No direct comparable exists: overhead ASL distress detection is a novel category. Closest adjacent: Hikvision DeepinView people-counting cameras (~$800–$1,200) and Milestone industrial analytics platforms (license fees $200+/camera/year). Neither provides distress-sign classification or haptic relay.
- $1,495 gives room for a 30% distributor margin ($448) and a 20% rep commission ($100) without eroding target gross margin.

**Gross Margin:**

| Metric                     | Value     |
|---------------------------|-----------|
| Retail price               | $1,495    |
| COGS                       | $332.65   |
| Gross profit               | $1,162.35 |
| **Gross margin %**         | **77.7%** |

At distributor sell-in of $1,046 (30% channel discount off retail): gross margin = 68.2%. Both are healthy for an embedded IoT safety product.

---

## 3. Fermi Market Estimate

**Assumptions (all explicit):**

| Assumption                                   | Value / Source |
|----------------------------------------------|---------------|
| US manufacturing facilities (20+ employees)  | ~250,000 (Census Bureau NAICS data, 2022) |
| Facilities with ≥1 deaf/hard-of-hearing worker| ~15% = 37,500 (NIDCD prevalence extrapolation) |
| Facilities that would pay for a solution in 5 years | ~8% of eligible = ~3,000 (conservative early-adopter assumption) |
| Average plant size (coverage zones per plant) | 6 ceiling units per plant average |
| Units sold over 5 years                      | 3,000 × 6 = 18,000 units |
| Revenue @$1,046 sell-in (distributor)        | 18,000 × $1,046 = ~$18.8M |
| Annual revenue (steady state, year 3+)       | ~$4–5M |

This is a niche market, not a mass-market product. The value proposition is regulatory compliance, liability reduction, and worker safety — not volume. At $4M ARR with 68% gross margin, this is a viable specialty product for a small embedded-hardware company or a bolt-on SKU for an existing industrial IoT platform vendor.

**Annual recurring revenue opportunity (maintenance/firmware):** $150/unit/year subscription for cloud analytics dashboard and OTA updates — on 18,000 units = $2.7M ARR at full penetration, fully incremental.

---

## 4. Top 3 Commercial Risks

**Risk 1: Slow enterprise sales cycle.**
Industrial safety capital purchases involve facilities managers, EHS directors, procurement, and legal. Typical cycle is 9–18 months from pilot to PO. Mitigation: offer a 90-day pilot program at $0 (hardware on loan) to compress cycle; target OSHA compliance officers who have budget pressure under post-2024 guidance.

**Risk 2: Regulatory classification triggers safety-critical certification.**
If OSHA or a state labor board classifies Silent Siren as a primary emergency alarm system, it may require UL 2572 (mass notification) or UL 864 (fire alarm) listing — adding $200k+ and 12–18 months to certification. Mitigation: position explicitly as a supplemental worker-communication tool, not a fire or evacuation alarm, and document this in marketing materials from day one.

**Risk 3: ML model liability exposure.**
A missed distress sign (false negative) during a real emergency could expose the manufacturer to product liability claims. Mitigation: explicit disclaimers, mandatory on-site calibration with signed acceptance, product liability insurance, and contractual cap on damages. Consider requiring annual recertification.
