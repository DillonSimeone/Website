# ROI Analysis — TactileTerrain Forearm Haptic Compass

**Disclaimer:** All financial figures are Fermi estimates based on public pricing data, analogous product research, and market sizing from open sources. They are not audited financials. All part costs from BOM are flagged "verify" and should be requoted before investment decisions.

---

## Cost of Goods Sold (COGS) at 1,000 Units

### BOM Cost Breakdown

| Category | Items | Est. Cost @1k |
|---|---|---|
| Main SoC (ESP32-S3) | U1 | $4.20 |
| GNSS (MAX-F10S) | U2 | $8.50 |
| IMU + Mag + LoRa | U3+U4+U5 | $6.85 |
| 8x Haptic drivers (DRV2605L) | U6-U13 | $6.80 |
| PMIC + LDO + Boost | U14+U16+U17 | $2.24 |
| I2C Mux | U15 | $0.75 |
| 8x LRA actuators | LRA1-8 | $11.20 |
| 18650 cell | BAT1 | $3.50 |
| Passives (caps/res/inductors/diodes) | C/R/L/D | $1.80 |
| Connectors/switches/LEDs | J/SW/LED | $2.25 |
| Custom flex PCB | FLEX1 | $18.00 |
| Control pod rigid PCB | PCB1 | $0.85 |
| CNC machined enclosure | ENC1 | $12.00 |
| Neoprene sleeve + MOLLE | SLEEVE1 | $4.50 |
| Misc hardware | MISC1 | $1.20 |
| **BOM subtotal** | | **$84.64** |
| BOM contingency (+15%) | | $12.70 |
| **Adjusted BOM total** | | **~$97** |

### PCBA + Assembly

| Operation | Est. Cost @1k |
|---|---|
| Rigid PCB SMT assembly (JLCPCB or equivalent) | $12.00 |
| Flex PCB SMT assembly (specialist) | $22.00 |
| LRA hand placement + adhesive bond | $8.00 |
| Final assembly (pod + sleeve + cell + test) | $18.00 |
| Firmware flash + functional test | $6.00 |
| **Assembly subtotal** | **$66.00** |

### Packaging + Logistics + Warranty Reserve

| Item | Est. Cost |
|---|---|
| Retail/shipping packaging | $4.00 |
| Inbound logistics + tariff (@15% BOM) | $14.55 |
| Warranty reserve (3% of retail, see below) | $15.00 |
| **Subtotal** | **$33.55** |

### Total COGS Summary

| | Per Unit |
|---|---|
| Adjusted BOM | $97 |
| PCBA + Assembly | $66 |
| Packaging + logistics + warranty | $34 |
| **Total COGS** | **~$197** |

---

## Retail Price + Justification

**Recommended retail price: $499 (commercial/SAR/fire)**
**DOD/DHS procurement price: $890–$1,200 per unit**

Justification:
- The Garmin tactix 7 series (tactical GPS watch) retails $800–$1,100. It does not provide haptic directional output, has no LoRa mesh, and is not haptic-primary. TactileTerrain provides a meaningfully differentiated interface.
- FLIR/Teledyne wearable sensors and Planck Aero tactical systems sell at $2,000–$10,000+ for full tactical ISR wearable units — these are different categories (imaging, not navigation interface) but establish the DOD appetite for wearable tactical hardware at these price points.
- Plantronics (now Poly) tactical headset systems (INVISIO, Ops-Core SOTR) list at $600–$2,500 per unit for military procurement. They occupy the same "personal sense augmentation in denied environments" space, validating the $500–$1,200 single-unit price tier.
- DOD/DHS procurement pricing typically runs 2–5x commercial due to program overhead, CAGE code margins, qualification testing amortization, and logistics/support contracts. A $499 commercial MSRP can support $890–$1,200 per unit on a GSA schedule or DLA contract.

**No direct comparable product exists** (forearm haptic compass for tactical navigation with LoRa mesh). The PULSE wristband (music-reactive haptic wristband) is frequently cited as "haptic wearable" but is a consumer audio-sync product with no navigation function, no GNSS, and no MIL rating — it is not a comparable.

---

## Gross Margin

| Channel | Price | COGS | GM $ | GM % |
|---|---|---|---|---|
| Commercial (direct/Amazon) | $499 | $197 | $302 | 60.5% |
| DOD/DHS (GSA/DLA contract) | $990 avg | $197 | $793 | 80.1% |
| Blended (60% DOD, 40% commercial) | $746 | $197 | $549 | 73.6% |

Blended gross margin of ~74% supports R&D reinvestment, MIL-STD certification costs (~$400K–$800K over 2 years), and a direct sales team for government channels.

---

## Fermi Market Estimate

All figures are Fermi estimates from public sources (DoD budget documents, USFA statistics, NASAR data). Treat as order-of-magnitude.

### Addressable User Population

**US Military (Special Operations + Tactical Units):**
- SOCOM active duty: ~73,000 personnel (SOCOM FY2025 budget justification, public)
- Army Rangers, Marine Raiders, MARSOC: ~5,000
- Tactical law enforcement (FBI HRT, SWAT at federal level): ~3,000
- Subtotal military/federal tactical: ~81,000 personnel
- Assume 1 device per operator, 5-year replacement cycle = ~16,200 units/year at full saturation

**Search and Rescue (US):**
- NASAR estimates ~30,000 trained SAR personnel in US
- Mountain Rescue Association members + wilderness SAR teams: ~10,000
- Coast Guard SAR teams: ~8,000
- Subtotal SAR: ~48,000 personnel
- Many are volunteers with personal equipment budgets of $200–$600 — commercial price at $499 is accessible

**Structural Firefighters (Top 50 departments by headcount):**
- Top 50 US fire departments collectively employ ~100,000+ career firefighters (NFPA 2023 data)
- Urban fire departments with hazmat/technical rescue units are priority buyers
- Assume top 50 departments, 10% technical rescue/USAR teams = ~10,000 priority users

**Total addressable US market (TAU): ~140,000 users**
**% addressable in years 1–3 (early adopters, SBIR-funded pilots, SAR):** ~3–5%
**Year 1–3 unit volume estimate:** 4,200–7,000 units

### Revenue Projection (Fermi)

| Scenario | Units Y1-3 | Avg Price | Revenue |
|---|---|---|---|
| Conservative | 2,000 | $600 | $1.2M |
| Base case | 5,000 | $750 | $3.75M |
| Optimistic (GSA contract win) | 15,000 | $900 | $13.5M |

A single SOCOM program-of-record award (e.g., 2,000 units for a battalion-level evaluation) at $990/unit = $1.98M — close to a full year of base-case revenue from a single contract action.

---

## Top 3 Business Risks

### 1. Government Procurement Cycles

DOD procurement from concept to fielding contract can take 2–5 years, even for OT (Other Transaction Authority) pathways. SBIR Phase I ($250K) and Phase II ($1.75M) are the fastest on-ramps but still 18–36 months to cash. Fire department procurement is faster (single-year budget cycles) but smaller. **Mitigation:** Lead with commercial and SAR sales to generate revenue and product validation data; use SBIR as parallel path; pursue DHS S&T Directorate and FEMA's NETC (National Emergency Training Center) as pilot customers with faster procurement.

### 2. GSA Schedule Entry and MIL Certification

Getting on GSA Schedule 84 (Law Enforcement/Security) requires CAGE code, DUNS, past performance, and an audited cost structure. First-time applicants typically wait 4–9 months. MIL-STD-810 testing at a certified lab costs $300K–$600K and takes 6–12 months. **Mitigation:** Budget $500K certification reserve in Series A capital raise; pursue commercial sales at commercial grade first; use IP67/IK ratings as interim credibility while MIL cert is in process. Consider partnering with an existing MIL-qualified wearable manufacturer for co-development to share cert costs.

### 3. ITAR/EAR Export Compliance

LoRa mesh with cryptographic authentication and potential military end-use triggers EAR (Export Administration Regulations) review. If classified as an AT (Anti-Terrorism) controlled item under ECCN 5A002 (encryption) or controlled under USML Category XI (military electronics), export licenses will be required for international sales. ITAR classification by DoD would severely restrict commercial international sales. **Mitigation:** Engage export counsel before first sale. Structure firmware so encryption module is a separable component for commercial variants. File for commodity jurisdiction determination (CJ) with State Dept. early. Design EU SKU with open encryption to avoid ECCN 5A002 classification where possible.
