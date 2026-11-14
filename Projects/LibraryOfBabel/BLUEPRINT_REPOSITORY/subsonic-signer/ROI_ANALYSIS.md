# ROI Analysis — Subsonic Signer

> **Methodology note:** All market-size figures are Fermi estimates based on publicly available industry data (ADCI membership counts, USCG statistics, IMCA contractor databases, IBISWorld commercial diving reports). Cost figures are derived from BOM line-item estimates flagged as "best-guess (verify)" in PRODUCTION_BOM.csv. This is not a financial projection; it is a structured feasibility estimate.

---

## Cost of Goods Sold (COGS) at 1,000 Units

### BOM Cost Rollup

| Category | Item(s) | Est. Cost @ 1k |
|---|---|---|
| Core silicon (SoC, TPU, sensors) | RV1126 + Coral M.2 + 2× IMX415 | $87.49 |
| Power management ICs | BQ77915, TPS65988, TPS54360, TPS54202, TPS7A8001 | $9.72 |
| Memory | W25Q128, 32GB eMMC, 4GB LPDDR4 | $16.75 |
| PHY + housekeeping MCU | DP83822, STM32G031 | $2.83 |
| Passives (C, R, L, D) | MLCC, electrolytics, inductors, diodes | $3.50 |
| Connectors | SubConn wet-mate ×2, M.2, MagJack | $307.65 |
| Battery cells (6× VTC6) | Sony US18650VTC6 | $27.00 |
| Mechanical housing | 6061-T6 machined + hardcoat | $185.00 |
| Optical ports (×2 sapphire) | 25 mm AR-coated sapphire windows | $76.00 |
| Seals + anodes | O-rings, zinc anode, vent plugs | $10.30 |
| Thermal + hardware | Cu pads, M3 316SS fasteners | $6.96 |
| Tether tail (5 m) | STP PU-jacketed cable | $22.00 |
| Bare PCB | 4-layer 100×60 mm ENIG | $8.50 |
| Miscellaneous | Gore-Tex vents, LED | $5.72 |
| **BOM Subtotal** | | **~$769** |

**Notes:**
- The SubConn wet-mate bulkhead connectors ($305 combined) are the single largest cost driver. At 5k unit volume, alternative wet-mate sources (Cobalt, Seacon) can reduce this to ~$180 combined.
- Coral M.2 module is sourced at list price; no volume-discount pricing is publicly available at time of writing; budget $25 firm.
- Housing machining at 1k units is estimated; aluminum at this complexity typically runs $150–220 per piece at CNC job shops in the US; $185 is the midpoint.

### PCBA and Assembly

| Operation | Est. Cost per Unit |
|---|---|
| SMT placement + reflow (main PCB) | $12.00 |
| Through-hole / hand-solder (connectors, BMS wiring) | $8.00 |
| ICT / functional test (camera bring-up, inference smoke test) | $15.00 |
| Housing assembly + O-ring installation | $18.00 |
| Pressure test (10 bar hydrostatic soak, 30 min) | $9.00 |
| Final QC + packaging | $6.00 |
| **Assembly Subtotal** | **$68.00** |

### Total COGS

| Line | Value |
|---|---|
| BOM (materials) | $769 |
| PCBA + assembly | $68 |
| Inbound freight + duty (~5%) | $38 |
| **Total COGS** | **~$875** |

---

## Retail Price and Gross Margin

### Pricing Rationale

The commercial diving services market is accustomed to premium per-unit tool costs. Benchmark references:

- **Outland Technology UWC-Series (UWC-1200):** Underwater color zoom cameras, ~$3,500–$6,000. These are video cameras only; no CV, no signal classification, no haptic integration.
- **SubC Imaging Rayfin:** Modular underwater camera system used in ROV/AUV integration, ~$8,000–$18,000 depending on configuration. Again, a streaming video device, not a semantic sensor.
- **Imenco BUC-series:** Subsea broadcast-grade video, $4,000–$12,000.
- **No direct comparable exists** for a pressure-rated, on-device hand-signal classifier with haptic relay. Subsonic Signer occupies a product category that does not yet exist; pricing must be established, not matched.

For commercial saturation diving supervisors: a dive bell bounce costs $40,000–$120,000 in operational time and DSV day rate. A single missed abort signal that causes a decompression injury or fatality triggers liability exposure orders of magnitude larger. A supervisor's auxiliary monitoring tool priced at $8,000–$15,000 is within one operational incident's avoided cost.

**Recommended retail (direct, year 1):** **$12,500 per unit** (includes 5 m tether tail, one spare O-ring kit, one spare sapphire port, activation of cloud-model-update subscription for 1 year).

**Volume / enterprise pricing:** $9,500 per unit at 5+ units (dive contractor fleet purchase).

| Metric | Value |
|---|---|
| Retail price | $12,500 |
| COGS | $875 |
| Gross profit | $11,625 |
| **Gross margin** | **~93%** |

**Important caveat:** The 93% gross margin is materials + assembly only. It does not include NRE (estimated $400k–$800k for hardware development, software, pressure certification testing, regulatory engagement), sales and marketing (direct-to-dive-supervisor requires trade show presence at ADCI, Diving Contractor International, Offshore Technology Conference), customer support, or cloud infrastructure for model updates. Fully-loaded contribution margin after these costs at 200 units/year sold is likely 20–40% in year 2–3.

---

## Fermi Market Estimate

### US Commercial Dive Contractors (Primary Beachhead)

- ADCI (Association of Diving Contractors International) lists approximately **180 member companies** in North America.
- Assume 40% operate saturation or surface-supplied commercial diving (the high-value segment): ~72 companies.
- Average fleet: 2–4 dive supervisors per active company: ~200–280 supervisors.
- Penetration at 10% in year 3: **20–28 units sold to US commercial contractors.**

### USCG and US Military Dive Units

- USCG maintains ~12 active dive teams nationally.
- USN Supervisor of Salvage and Diving (SUPSALV) oversees ~30 active dive detachments.
- Total addressable government units: ~42. At $12,500: $525k TAM segment.
- Government procurement cycles are 2–4 years; realistic first contract: 2–6 units.

### Global Oil-and-Gas Saturation Dive Supervisors

- IMCA (International Marine Contractors Association) estimates ~3,500 certified saturation divers globally; supervisor-to-diver ratio roughly 1:3.
- Estimated ~1,150 saturation dive supervisors globally (North Sea, Gulf, Asia-Pacific, Brazil).
- At 5% capture in 5 years: ~57 units.
- Average 3 units per vessel/DSV: total ~190 units across the global fleet.

### SAR and Rescue Diving (Secondary Market)

- USCG rescue dive capability: small market, budget-constrained.
- Civilian SAR organizations (NASAR-affiliated, ~800 teams): most are volunteer, cannot afford $12,500 per unit. Not a near-term revenue source.

### Market Size Summary (Fermi)

| Segment | Est. Reachable Units (5-year) | Revenue @ $12,500 |
|---|---|---|
| US commercial contractors | 25 | $312,500 |
| USCG / USN | 8 | $100,000 |
| Global O&G saturation | 190 | $2,375,000 |
| Global commercial (non-US) | 50 | $625,000 |
| **Total 5-year Fermi** | **~273 units** | **~$3.4M** |

**TAM assessment:** The serviceable addressable market is small in absolute terms (~$3–5M over 5 years at initial pricing). This is a niche professional tool, not a consumer device. Revenue must be supplemented by: (a) model-update subscription ($500/unit/year = $136k ARR at 273 units), (b) integration services for surface tender haptic vest pairing, (c) potential licensing to large DSV operators who want private-label versions.

---

## Top 3 Risks

### 1. Small Absolute TAM

The global saturation dive supervisor population is roughly 1,000–1,500 people. Even at 20% capture, this is 200–300 units over 5 years. At $12,500 retail, peak annual revenue is under $1M without expansion into adjacent markets (recreational technical diving instruction, military combat diving). Adjacent markets require either lower price points (recreational divers will not pay $12,500) or separate product variants. The business is only viable if the core commercial-dive version funds continued CV model development that can be productized in a lower-cost SKU.

### 2. Training Data Scarcity for Underwater CV

No public labeled dataset exists for RSTC/CMAS hand signals in underwater conditions. Models trained on surface-captured ASL datasets (WLASL, MS-ASL) will fail to generalize to: turbid water backscatter, monochromatic blue-green lighting at depth, gloved hands, drysuit-constrained arm range-of-motion, and wetsuit color-contrast loss. Acquiring labeled underwater training data requires hiring commercial dive instructors as data subjects, deploying in controlled pool environments, and manually labeling thousands of short video clips. Estimated cost: $60,000–$120,000 for an initial dataset of sufficient quality. This is an NRE cost that has no hardware analog and is often underestimated.

### 3. Commercial Dive Certification and Regulatory Burden

USCG 46 CFR Subchapter V requires equipment used in commercial diving operations to meet specific standards; UK HSE Diving at Work Regulations 1997 and the associated ACOP impose similar requirements on North Sea operators. A novel electronic device attached to a lift line or dive cage is not covered by existing product categories. Achieving acceptance from major dive contractors (Oceaneering, Modus, Subsea 7) will require: independent hydrostatic pressure testing documentation, ATEX/IECEx assessment if deployed near gas-saturated environments, and likely engagement with DNV GL or Bureau Veritas for a Type Approval letter. This process takes 18–30 months and costs $80,000–$200,000. Skipping it means the product can only be sold to operators willing to accept it as an "experimental auxiliary device," limiting the addressable market to smaller, more risk-tolerant operators.
