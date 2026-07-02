# TRACKSIDE-MOTORSPORT — ROI Analysis

> All numbers `verify-before-order`. Motorsport tolerates premium pricing comparable to
> Stilo helmets ($1.5k–4k) and HANS devices ($700+). Cert-driven costs not included.

---

## 1. Bill-of-Materials Cost (Qty 100 systems)

| Subsystem | Qty/system | BOM cost (USD) |
|---|---|---|
| Belt module | 1 | $109.05 |
| Patch array | 8 | $53.60 |
| Harness | bundle | $18.60 |
| Helmet chin pad | 1 | $12.50 |
| Pit-base station (amortized 1 per 8 drivers) | 0.125 | $10.79 |
| Crew wristband | 1 | $15.40 |
| Passives + packaging | — | $7.20 |
| **Total driver kit + 1 crew band** | | **~$227 (excl. pit base)** |
| **Driver kit only (no crew band, no pit base)** | | **~$203** |

CSV total (`PRODUCTION_BOM.csv`) sums to **$309.66** because it includes one full pit-base
station and one crew band per row of the file (single-system worst case). At series-of-100
amortization, pit base is shared across the team, dropping per-driver cost as above.

---

## 2. Assembly & Test

| Step | Cost (USD) | Notes |
|---|---|---|
| PCBA — belt (4-layer, 0402 + QFN) | $14 | JLCPCB EMS qty 100, `verify-before-order` |
| PCBA — patches (flex × 8) | $9 | flex assembly premium |
| PCBA — chinpad + crewband + pitbase | $11 | combined small boards |
| Patch silicone overmolding (×8) | $16 | manual cast, 2-part RTV |
| Harness assembly + Nomex over-sleeve | $22 | hand-built v1; jig-assisted v2 |
| Belt enclosure assembly + RTV pot | $9 | |
| Functional test (auto-cal, RF link, IMU) | $7 | Pi-based bed-of-nails fixture |
| QC + serialization + pack | $6 | |
| **Subtotal assembly/test** | **~$94** | |

**Loaded cost per driver kit + crew band: ~$321** (qty 100, excl. pit base).
**Loaded cost per pit base station: ~$95**.

---

## 3. Pricing & Margin

### 3.1 Driver Kit (belt + 8 patches + harness + chin pad)

| Tier | Price | Notes |
|---|---|---|
| Low end (target) | **$1,200** | margin ≈ 73% gross |
| Mid (recommended launch) | **$1,500** | margin ≈ 79% gross |
| Premium (FIA-listed once cert lands) | **$1,800** | margin ≈ 82% gross |

At a 50–55% gross-margin "industrial" benchmark, fully-loaded cost of $321 implies
a $640–710 price — well below what motorsport accessories command. The premium category
(Stilo ST5 helmet $2.8k, HANS Sport $785, Racelogic data logger $1.2k+) supports $1.2–1.8k.

### 3.2 Pit Crew Wristband (sold per crew member, min 4 per team)

| Tier | Price | Margin |
|---|---|---|
| Single unit | $550 | 56% |
| 4-pack | $1,950 ($487 ea) | 50% |

### 3.3 Pit-Wall Base Station

| Tier | Price | Margin |
|---|---|---|
| Standalone | $1,800 | ~95% (loaded $95) |
| Bundled with 4 crew bands | $3,500 | blended ~52% |

---

## 4. TAM (Total Addressable Market)

### 4.1 Driver-side

| Segment | Population | Notes |
|---|---|---|
| FIA-licensed drivers worldwide | ~75,000 | International A/B/C, regional, karting |
| Club racers (SCCA, NASA, MSA, etc.) | ~250,000 | US + EU + AU/NZ |
| Rallycross & rally | ~30,000 | high-noise environment, strong fit |
| Active karting (CIK + national) | ~120,000 | sub-segment but real adopters |
| **Driver TAM (units)** | **~475,000** | |
| Driver TAM @ $1,500 ASP | **~$712M** | one-time hardware |

DHH-specific addressable subset (driver):
- Estimated 1–3% of motorsport participants identify as DHH or HoH (no published study; verify).
- **DHH-direct TAM:** 4,750–14,250 units → $7–21M one-time.
- BUT: the non-DHH addressable expansion is non-trivial because spatial-haptic flag comms
  also benefits hearing drivers in noise-saturated cockpits (LMP, top fuel, F1000). Treat DHH
  as the wedge, not the ceiling.

### 4.2 Pit-side

| Segment | Population | Notes |
|---|---|---|
| Pit crews (avg 4–6 per active car) | ~600,000 | global, all series |
| Pit-wall base stations (1 per team) | ~120,000 | |
| **Pit-side TAM (units)** | **~720,000** | crew bands + bases |
| Pit-side TAM @ blended $500 ASP | **~$360M** | |

### 4.3 SAM (5-yr realistic)

- Year-1: 8 partner teams, ~40 driver kits, ~120 crew bands, 8 bases → $115k revenue.
- Year-3: regional sanction body endorsement; 1,200 driver kits + 4k crew bands + 300 bases → ~$3.9M revenue.
- Year-5: FIA-listed accessory; 8,000 driver kits + 25k crew bands → ~$22M revenue.

---

## 5. Comparables

| Product | Price | DHH/Haptic? | Overlap |
|---|---|---|---|
| Stilo ST5F helmet | $2,800–4,000 | no | premium proves price tolerance |
| HANS Sport II | $700–950 | no | mandated safety — proves "mandate cycle" market |
| Bell HP77 helmet | $3,500+ | no | top-tier |
| Racelogic VBOX data logger | $1,200–4,000 | no | proves driver-borne electronics adoption |
| Stilo WRC DES helmet (built-in comms) | $4,500 | no | closest analog: integrated electronics |
| Racing Radios driver intercom | $700–1,500 | no | this is what we **complement**, not replace |
| Sparco haptic harness | n/a | none on market | white space |

**Gap:** No FIA-listed haptic comms product exists. No motorsport-rated DHH product exists.

---

## 6. Cost-to-First-Revenue

| Phase | Cost | Duration |
|---|---|---|
| EE + ME prototype build (3 driver kits + 1 base) | $18,000 | 8 wk |
| Bench latency / RF validation | $6,000 | 3 wk |
| Track shakedown (2 club events) | $8,000 | 6 wk |
| Cert prep (FIA 8856 informational submission, lab pre-screen) | $25,000 | 12 wk (`verify`) |
| Pilot batch of 25 driver kits | $9,000 | 6 wk |
| **Total pre-revenue** | **~$66,000** | **~9 months** |

Excludes founder/eng salary, legal, IP, insurance.

---

## 7. Break-Even

- Fully-loaded cost per driver kit: **$321** (qty-100 amortization).
- Recommended ASP: **$1,500**.
- Gross margin per kit: **$1,179**.
- Pre-revenue burn to recoup: **$66,000 / $1,179 ≈ 56 driver kits**.
- At 8 partner teams × 2 drivers × 1 spare-shared, year-1 forecast of ~40 kits gets to ~70% of break-even within 12 months.
- Adding 30 crew bands at blended $420 contribution narrows the gap to **break-even within 14 months** under conservative pricing.

---

## 8. Risk-Adjusted Notes

- **Cert risk (high):** FIA 8856-2018 path is *informational* in this blueprint. Lab-rejection of the assembly inside certified underwear is a material risk. Mitigation: position v1 as "club racing / non-FIA-sanctioned use" product; pursue cert in parallel.
- **RF risk (medium):** sub-GHz licensing varies by country and by series. Some series prohibit driver-borne transmitters during sessions. Mitigation: pit-to-driver receive-only mode for restricted series.
- **Battery risk (medium):** LiFePO4 cell qualification for cockpit thermal envelope (cockpit can hit 60 °C ambient). Mitigation: thermal derating + cell vendor abuse-test data sheet review.
- **Bone-conduction risk (low):** vibration interference in race conditions; can be omitted v1.
- **Premium-price risk (low):** comparables show motorsport tolerates this band; risk is mostly that DHH-specific framing limits perceived market — counter with universal-fit "high-vibration / low-radio-channel" cockpit angle.
