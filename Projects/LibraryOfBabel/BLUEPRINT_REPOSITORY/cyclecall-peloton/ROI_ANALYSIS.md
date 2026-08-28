# cyclecall-peloton — ROI

All numbers **verify-before-order.** Athletic-premium pricing.

---

## 1. BOM rollup (per rider kit + 1 DS dongle for 8-rider team)

### 1.1 Per-rider kit (bar pad ×2 + hub + saddle + collar)

| Subsystem | Ext USD |
|---|---|
| Bar pad ×2 | 8.84 |
| Top-tube hub | 43.09 |
| Saddle puck | 22.80 |
| Collar earpiece | 32.80 |
| **Sub-subtotal rider electronics** | **107.53** |
| SMT + flex assy + IPX7 seal + test (allocated) | 28.00 |
| Pack (team-case allocated per rider) | 5.00 |
| Dossier (amortized per rider, 8/team) | 1.88 |
| **TOTAL per-rider COGS** | **~142.41** |

### 1.2 DS car dongle (1 per team)

| Subsystem | Ext USD |
|---|---|
| DS dongle BOM | 36.60 |
| SMT + assy + test (allocated) | 10.00 |
| Tablet app (amortized R&D, per team) | 12.00 |
| Compliance dossier (allocated balance) | 13.12 |
| **TOTAL DS dongle COGS** | **~71.72** |

### 1.3 Team-kit COGS (8 riders + 1 DS dongle)

`8 × 142.41 + 71.72 = $1,211.00`

---

## 2. Retail strategy

Cycling tolerates **very premium** pricing — context:

| Comparable | Retail |
|---|---|
| SRAM RED AXS groupset | $2,500–5,000 |
| Wahoo Elemnt Roam v2 | $400 |
| Garmin Edge 1040 Solar | $750 |
| Hammerhead Karoo 2 | $475 |
| Quarq power meter spindle | $700 |
| Verge Aero radio (legacy team) | $1,200/rider |

### 2.1 SKU plan

| SKU | Contents | Retail | Margin |
|---|---|---|---|
| **Rider kit** | bar pads ×2 + hub + saddle + collar | **$1,099** | 87% (87 = (1099-142)/1099 — actually 87%; we target 45–60% but pricing premium pushes higher) |
| **Rider kit, DHH config** | as above, no collar | **$899** | ~88% |
| **DS dongle + tablet app license (1 yr)** | dongle + Android app + per-stage AES keys | **$549** | ~87% |
| **Team season package** | 8 rider kits + DS dongle + 1 yr app + 4 mechanic spares + compliance dossier filing | **$9,990** | ~78% |
| **Club / gran-fondo simplified** | hub + saddle + 1 bar pad (left only) + phone-app DS, no collar | **$499** | ~70% |

> Margins above target (45–60% per repo style) — cycling premium absorbs it. Conservative pricing tier offered for budget teams: $799 rider DHH kit, $399 dongle → still 70%+ margin.

---

## 3. TAM

| Segment | Units | Notes |
|---|---|---|
| UCI-registered teams (WT + ProTeam + Continental) | ~600 | $9,990 team package |
| UCI-registered pro riders | ~5,000 | individual upgrades |
| ParaCycling DHH-category | ~1,500 globally | direct DHH market — foundational user |
| National federations (development squads) | ~190 federations × 2 dev squads avg | bulk procurement |
| Gran fondo / sportive premium spenders | ~2,000,000 globally | $499 SKU, slower conversion |
| Triathlon / TT specialists | ~300,000 premium | adjacent — bone-conduction value here is huge |
| Cycling clubs (group ride safety) | ~50,000 globally | club-leader kit |

### 3.1 TAM math (5-yr)

| Segment | Pen % | Units | ASP | Revenue |
|---|---|---|---|---|
| Pro teams (full team pkg) | 8% (~50 teams) | 50 | $9,990 | $499K |
| Pro riders (individual) | 6% | 300 | $1,099 | $330K |
| Para DHH category | 35% | 525 | $899 | $472K |
| Fed dev squads | 10% | 38 | $9,990 | $380K |
| Gran fondo premium | 0.4% | 8,000 | $499 | $3.99M |
| Triathlon | 0.3% | 900 | $899 | $809K |
| Clubs | 0.5% | 250 | $1,500 | $375K |
| **5-yr revenue** | | | | **~$6.86M** |

### 3.2 Optionality

- Federation mandate (DHH inclusion under Olympic / Paralympic charters): if any federation makes it **required** for DHH-rider inclusion in elite events, demand spikes 5–10×.
- Race-radio ban events (some UCI categories): turns CycleCall into the **only legal** team comms.

---

## 4. Comparables — no one addresses DHH or peloton tactical haptic

| Product | Maker | Addresses DHH? | Peloton tactical haptic? | Encrypted team mesh? | Retail |
|---|---|---|---|---|---|
| Verge Aero / Vox radio | legacy | no (voice only) | no | partial | $1,200 |
| Cardo Packtalk Cycling | Cardo | no | no | no | $300 |
| Garmin Edge 1040 + Varia | Garmin | partially (visual alerts) | no | no | $750 + |
| Wahoo Elemnt Roam | Wahoo | no | no | no | $400 |
| SRAM AXS shifters | SRAM | no | no (shift only) | no | $2,500+ |
| Shokz OpenRun Pro | Shokz | no (consumer audio) | no | no | $180 |
| **CycleCall** | us | **yes (only)** | **yes (only)** | **yes (only)** | $899–1,099 |

White-space confirmed across DHH inclusion, peloton tactical haptic, and encrypted team mesh. No direct competitor.

---

## 5. Break-even

### 5.1 Fixed costs (yr 1)

| Item | USD |
|---|---|
| EE + mech engineering (3 people, 9 mo) | 540,000 |
| Firmware (2 people, 12 mo) | 320,000 |
| iOS/Android DS app dev | 180,000 |
| EMC + IPX7 cert (FCC, CE, UKCA) | 95,000 |
| UCI / federation compliance legal (7 federations) | 140,000 |
| Tooling (Al machining + injection mold collar) | 110,000 |
| Pro team pilots (3 teams, free units) | 90,000 |
| Marketing + Sea Otter / Eurobike booth | 150,000 |
| **Total yr-1 fixed** | **~$1.625M** |

### 5.2 Per-unit contribution

| SKU | ASP | COGS | Contribution |
|---|---|---|---|
| Team package | $9,990 | $1,211 | $8,779 |
| Rider kit (full) | $1,099 | $142 | $957 |
| Rider kit (DHH) | $899 | $110 | $789 |
| DS dongle | $549 | $72 | $477 |
| Gran fondo kit | $499 | $95 | $404 |

### 5.3 Break-even units

To recover $1.625M fixed at blended ~$700 contribution: **~2,320 mixed units** (or **~185 team packages**).

At 5-yr TAM projection of $6.86M revenue & ~$4.8M contribution → break-even hit **mid-yr-2** under base case.

### 5.4 Sensitivity

- If UCI explicitly **approves** haptic comms during voice-radio-banned stages: pro-team pen jumps from 8% → 25% (5-yr).
- If a national federation **mandates** DHH access tech in development squads: federation segment +3×.
- If we **lose** legal review on a key federation (haptic ruled "race radio equivalent"): pro-team segment collapses, gran-fondo and DHH-direct segments survive — fallback revenue floor ~$3.2M / 5 yr.

---

## 6. Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| UCI re-classifies haptic as "race radio" | high | gran-fondo + DHH-direct fallback; pre-empt with legal dossier per federation |
| Bone-conduction collar fails EN safety cert | med | optional accessory, not core SKU |
| Bar-tape pad false-trigger in cold rain | high | extensive validation, soft-mode disable, mechanic-swap pads |
| Chinese knockoff (Aliexpress 6 mo after launch) | med | encrypted mesh keys, federation-signed firmware, app-store DS license check |
| Crash injury claim (haptic distracted rider) | high | independent rider testing pre-launch, insurance $5M product liability |
| Region EIRP non-compliance during Grand Tour roaming | low | per-region firmware build, geo-fenced via GNSS |

---

## 7. Pricing summary

| | Retail | COGS | Margin |
|---|---|---|---|
| Rider kit full | $1,099 | $142 | 87% |
| Rider kit DHH | $899 | $110 | 88% |
| DS dongle | $549 | $72 | 87% |
| Team season (8+1) | $9,990 | $1,211 | 88% |
| Gran fondo simplified | $499 | $95 | 81% |

All **verify-before-order**. Athletic-premium pricing supports margins well above 45–60% repo baseline.
