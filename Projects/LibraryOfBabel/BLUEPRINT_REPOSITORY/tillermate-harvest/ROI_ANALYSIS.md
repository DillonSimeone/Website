# TillerMate Harvest — ROI Analysis

All figures `verify-before-order`. Currency USD.

---

## 1. System composition

A "TillerMate kit" = **1 roof module + 1 cab puck + 5 wristbands** (median row-crop crew size).

| Node | BOM (parts only) | Notes |
|---|---|---|
| Roof module | $448.07 | Hailo-8L SKU; Coral SKU ~$394 |
| Cab puck | $25.57 | |
| Wristband | $20.32 | per unit; kit ships 5 |
| **Kit BOM** | **$575.24** | 448.07 + 25.57 + (5 x 20.32) |

---

## 2. Loaded landed cost per kit

| Cost line | Roof | Puck | Wrist (x5) | Kit total |
|---|---|---|---|---|
| Parts | 448.07 | 25.57 | 101.60 | 575.24 |
| PCBA + test (15% of parts) | 67.21 | 3.84 | 15.24 | 86.29 |
| Enclosure / final assy | 22.00 | 4.50 | 7.50 | 34.00 |
| Cable + harness + kitting | 8.00 | 1.00 | 2.50 | 11.50 |
| Freight + duty (avg 7%) | 31.37 | 1.79 | 7.11 | 40.27 |
| Warranty reserve (4%) | 17.92 | 1.02 | 4.06 | 23.00 |
| Yield + scrap (3%) | 13.44 | 0.77 | 3.05 | 17.26 |
| **Landed COGS / kit** | | | | **787.56** |

Add SaaS-amortized cloud/OTA: $4/kit/mo capitalized 36 mo = ~$144 lifetime, not in hardware COGS but tracked separately.

---

## 3. Pricing — B2B ag-equipment dealer channel

Dealer channel for ag: dealer keeps **35-45% margin** off MSRP. We target **40% dealer discount**.

| Tier | Logic | Price |
|---|---|---|
| Landed COGS | from sec. 2 | $787.56 |
| Target factory margin | 50% on COGS | gross margin $787.56 -> $1,575 |
| Dealer net (we ship at) | $1,575 | |
| Dealer MSRP (40% off MSRP = $1,575) | $1,575 / 0.60 | **$2,625 MSRP** |

**Margin check:** factory margin = (1575 - 787.56) / 1575 = **50.0%** — within 40-55% band.

Companion SaaS (ops dashboard, audit logs, OTA): $39/cab/mo, $7/wristband/mo. Per kit ARR = $39 + 5x$7 = $74/mo = **$888/yr**. SaaS gross margin ~80%.

Lifetime value (5 yr) = $2,625 hw + $888 x 5 = **$7,065/kit gross**.

---

## 4. TAM / SAM / SOM

### TAM
- US farms: ~2.0 M (USDA NASS).
- Global farms: ~570 M (FAO), but ~84% are <2 ha smallholders — not addressable.
- **TAM (global commercial row-crop + specialty w/ hired labor): ~6.5 M operations.**

### SAM — narrow to ops that actually buy precision-ag hardware
- US row-crop + specialty ops w/ >= 1 FTE hired labor and >= 500 acres OR >= $250k receipts: **~120,000 US ops** (USDA ARMS ballpark).
- EU equivalent (CAP-registered, >= 50 ha row crop): **~95,000 ops**.
- AU + NZ + Canada commercial row-crop: **~45,000 ops**.
- **SAM: ~260,000 ops** worldwide.

### SOM — DHH-inclusive workforce-shortage segment
Ag labor pool in US has higher proportional incidence of noise-induced hearing loss than general population (NIOSH: ~50% of older farmers have measurable NIHL). Plus DHH workers actively excluded from many ag jobs today due to comms gaps.

- 5-yr realistic SOM: **5% of US SAM + 2% of intl SAM** = 6,000 + 2,800 = **~8,800 kits**.
- @ $2,625 MSRP -> $23.1 M hardware revenue, plus 5-yr SaaS ramp ~$15-25 M ARR by yr 5.

---

## 5. Comparables (none address DHH workforce)

| Product | What it does | What it misses |
|---|---|---|
| John Deere Operations Center | Telematics, machine data, in-cab guidance display | No worker-facing comms; no DHH features; visual-audio only |
| Trimble Ag Software + GFX displays | Guidance, prescriptions, fleet | Same; driver-only UI |
| Topcon XD / X35 | Display + guidance | Driver-only |
| Climate FieldView | Agronomy data | No comms hardware |
| Tend.ag / Burro robotics | Autonomous follow-bots for crews | Robot, not comms; ignores DHH ops |
| Two-way radios (Motorola CP200d et al.) | Voice radio | Hostile to DHH; voice-only |
| Bluetooth in-cab headsets | Voice | Same |

**Gap we own:** machine-vision-mediated visual-gesture <-> haptic comms between cab driver and field crew, designed-with-DHH-workers. Zero direct competitors at blueprint date.

---

## 6. Break-even

Fixed costs to MVP launch:

| Bucket | $ |
|---|---|
| Engineering (HW + FW + CV, 4 FTE x 14 mo) | 980,000 |
| Tooling (cast Al, TPU mould, wrist mould) | 165,000 |
| Cert (FCC, ECE R10 pre-comp, ag EMC) | 95,000 |
| Field data collection + labelling (50 hr video, 6 farms) | 140,000 |
| Pilot inventory (250 kits) | 197,000 |
| Dealer channel onboarding + marketing | 220,000 |
| **Total launch capex+opex** | **1,797,000** |

Contribution margin per kit at MSRP $2,625 sold dealer-net at $1,575:
- Factory revenue: $1,575
- Variable COGS: $787.56
- **Contribution: $787.44 / kit**

**Break-even units (hardware-only):** 1,797,000 / 787.44 = **2,283 kits**.

At SOM 8,800 kits over 5 yr, break-even hits **~yr 2.5** on hardware alone. SaaS attach pulls it forward to **~yr 2** if 60% attach @ yr-1 average.

---

## 7. Sensitivities

| Lever | Effect |
|---|---|
| Hailo-8L -> Coral fallback | -$54 BOM = +$108 MSRP headroom or hold MSRP and gain 3.4 pts margin |
| LoRa-only SKU (no LTE-M) | -$42 BOM; -$15 SaaS ARPU; sell to off-grid ranches |
| Larger crew kits (10x wrist) | +$203 BOM, +$508 MSRP; better attach where crews are 8-15 |
| Bundle through dealer service plan | Adds 5-8 pts effective margin via service-revenue share |

---

## 8. Honest risks to ROI

- **Dataset cold-start:** gesture model needs >= 50 hr labelled real-field video before perf is dealer-demo-ready. Pre-launch field partnership cost is real.
- **Dealer channel inertia:** Deere/CNH dealers are slow to add non-OEM hardware. May need 2 OEM-blessed reference accounts to crack the channel.
- **Seasonal sell-through:** ag sales spike Q4/Q1; cash-flow plan must absorb 6-mo lulls.
- **Worker consent + privacy:** outward cameras are politically easier than inward, but ranch-side DPIA needed in EU.
- **Liability framing:** must be marketed as awareness-aid not safety-critical; insurance rider likely required.
