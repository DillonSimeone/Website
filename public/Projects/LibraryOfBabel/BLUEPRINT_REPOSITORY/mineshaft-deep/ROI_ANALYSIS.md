# mineshaft-deep — ROI Analysis

> All part costs and prices: **verify-before-order**.
> Regulatory cost dominates this SKU. Read §3 before §1.

---

## 1. BOM roll-up (per-unit, qty 1k)

| Subsystem | Line items | Direct material | Notes |
|---|---|---|---|
| Helmet module | 18 | **$248** | Dominated by ToF imager, optical filter, MSHA-class LED, IS-cert pellistor |
| Belt pack | 15 | **$468** | Dominated by NDIR methane head ($210), IS-cert LFP cell ($95), Litz loop ($22) |
| Common (label/test/pot) | 3 | **$37** | Per-unit serialization + mandatory hipot test labor |
| **Per-miner subtotal (helmet + belt + common)** | — | **$753** | |
| Surface gateway (amortized 1 per 50 miners) | 9 | $856 / 50 = **$17** | TX coil array dominates |
| **Total direct material / miner** | — | **$770** | qty 1k pricing |

At qty 10k pricing assume ~18% reduction → **~$630/miner direct**.

---

## 2. Loaded cost / miner kit (qty 1k)

| Line | $ |
|---|---|
| Direct material | 770 |
| PCBA + mechanical assembly (8% of mat) | 62 |
| Per-unit IS test + cert paperwork | 28 |
| QA + functional test | 18 |
| Packaging + lamp-room dock allocation | 14 |
| Warranty reserve (4%, harsh environment) | 35 |
| **Cost of goods, ex-factory** | **$927** |

Surface gateway loaded: ~$1,050 ex-factory (qty 50/yr).

---

## 3. Certification & non-recurring engineering (NRE)

This is the dragon. Underground mining electronics is one of the most expensive cert regimes on earth — comparable only to medical Class III and aerospace DO-178B/C.

| Item | Low $ | High $ |
|---|---|---|
| Pre-compliance bench testing (NTS / Element / MET) | 25,000 | 40,000 |
| IECEx Ex ia I Ma cert (test house + dossier) | 60,000 | 120,000 |
| MSHA 30 CFR Part 23/27 permissible cert | 80,000 | 200,000 |
| Mine-site field trial (required for MSHA approval) | 30,000 | 80,000 |
| Internal regulatory engineering (~1.5 FTE × 18 mo loaded) | 270,000 | 270,000 |
| Tooling — antistatic shell injection mold | 35,000 | 55,000 |
| **Total NRE before first sale** | **~500k** | **~765k** |

For modeling: use **$625k NRE**. Amortize over first 2,500 miner kits → **$250/kit** of regulatory amortization. (After 2,500 units, NRE retires.)

Re-cert is required for any silicon or firmware change. Plan ~$40k/year sustaining regulatory engineering.

---

## 4. Pricing

Comparable retail (verify-before-order):

| Competitor | System | Per-miner price | Surface | Notes |
|---|---|---|---|---|
| Strata Worldwide | CommTrac | $1,000–3,000 | $50k–250k | Tracking + leaky-feeder voice |
| Becker Mining | SmartCom | $1,500–4,000 | $100k+ | Through-rock + LF |
| MineSite Technologies (MST) | ImPact / AwareNow | $1,200–2,800 | $80k+ | Wi-Fi-mesh + tag |
| **None of the above** | DHH coverage | **$0** | — | Wide-open differentiator |

Our positioning: **mid-pack on price, sole player on DHH + cap-lamp form-factor integration**.

### Pricing decision

| SKU | Direct cost | Target margin | List price | Notes |
|---|---|---|---|---|
| Helmet + belt + common (per miner) | $927 | 45% (regulated industry tolerates premium) | **$1,685** | Below Strata low end, well below Becker |
| Surface gateway | $1,050 | 40% | **$1,750** | Single per-mine purchase, often via systems integrator (margin shared) |
| Lamp-room dock (charger + provisioning) | $480 (not BOMed in §1) | 35% | $740 | Ancillary |
| Annual support + re-cert hand-off | — | — | $180/miner/yr | Sustaining engineering pass-through |

Mine-scale list (typical 200-miner operation): 200 × $1,685 + 4 × $1,750 + 4 × $740 + 200 × $180 = **$382k upfront + $36k/yr**. Strata equivalent for same headcount $400–700k upfront. We are competitive on price *and* the only solution covering DHH.

---

## 5. Unit margin

| | Per miner | Per surface gateway |
|---|---|---|
| List | $1,685 | $1,750 |
| Less: Distributor / SI margin (25%) | -$421 | -$438 |
| Less: NRE amortization (first 2,500 units) | -$250 | -$0 (gateway NRE included) |
| Less: COGS | -$927 | -$1,050 |
| **Net to mfgr (first 2,500 miner units)** | **$87** | **$262** |
| Net after NRE retires | $337 (20% net) | $262 |

Note: Channel through mine-safety distributors / integrators is unavoidable — they own the relationships. Direct sale possible to top-3 mining majors (BHP, Rio Tinto, Anglo American).

---

## 6. Market sizing (TAM / SAM / SOM)

| Layer | Workers | Notes |
|---|---|---|
| Global underground miners | ~6.0M | China, India dominate count, low capex per miner |
| **Operations with safety capex** (TAM) | **~1.0M** | China large-mine, AU, US, CA, CL, ZA, RU, PL, DE legacy, deep mines globally |
| Operations w/ active tracking modernization (SAM) | ~250k | Strata/Becker addressable base |
| 5-yr realistic share (SOM) | 8k–25k miners | 3–10% of SAM with DHH differentiator + competitive pricing |

DHH-specific addressable: NIOSH puts measurable noise-induced hearing loss in coal miners at ~25% by retirement; congenital Deaf miners < 0.5% but a real population in some jurisdictions. Even ignoring DHH, the through-rock haptic emergency relay is sellable to *all* miners in firedamp environments, so the SKU is not DHH-only — it's DHH-led, mainstream-eligible.

---

## 7. Break-even

Assume:

- ASP-net-of-channel: $1,264/miner kit
- COGS: $927
- Gross profit/unit: $337
- NRE: $625k
- Sustaining regulatory: $40k/yr
- Sales + marketing (industry trade + 2 mine-safety sales reps): $480k/yr

Break-even units (NRE recovery only): 625,000 / 337 ≈ **1,860 miner kits**.
Break-even cash flow incl. opex: ~3,600 kits in year 1–2, OR ~1,500 kits/yr at steady state once NRE retired.

| Scenario | Units yr1 | Units yr2 | Units yr3 | Cum net |
|---|---|---|---|---|
| Slow (1 mine win/yr, 250 miners) | 250 | 500 | 750 | –$340k by EOY3 |
| Base (2 mines/yr, 200/each then 400) | 400 | 800 | 1200 | –$50k by EOY3, +$300k by EOY4 |
| Fast (Strata licenses tech) | 1500 | 3500 | 5000 | +$1.4M by EOY3 |

Most likely: **break-even mid-Y4**. Mining safety has long sales cycles (12–24 months) but extremely sticky once specified (replacement cycle 5–7 years, mandated by safety department).

---

## 8. Risks to ROI

1. **MSHA timeline slip** — each 6-month slip pushes break-even 4–6 months. Mitigation: pursue IECEx (rest-of-world) and MSHA in parallel; IECEx mines (AU, ZA, CL) can buy before MSHA closes.
2. **IS-LFP cell single-source** — if vendor exits, full re-cert. Mitigation: dual-source qualified at launch (+$40k NRE).
3. **Mine-fatality event involving our device** — existential. Carry $5M product-liability insurance from yr0 (~$45k/yr).
4. **Strata or Becker bolts on DHH** — they have channel + cert, we have product. Defense: 18-month head start + patentable haptic-codeword scheme (low confidence patent, but slows competitor).
5. **Per-mine bespoke deployment cost** — each mine wants RF survey + repeater placement. Build a "deployment-services" SKU at $25k/mine, separately profitable, also moats out competitors.

---

## 9. Verdict

- High-fixed-cost, high-ASP, sticky-revenue SKU.
- Cert spend ($500–765k) is the gate. Once paid, defensible 5–7 years per win.
- DHH framing is the wedge into safety departments; the real revenue is through-rock haptic emergency relay sold to all miners.
- Break-even ~Y4 base case. NPV positive if 3+ mines/yr after Y2.
- **Go/no-go decision** is really a "do we want to be in MSHA-regulated electronics" decision, not a product decision. If yes, this SKU is a strong v1 because the form factor (cap-lamp replacement) and the DHH angle are both genuinely novel.

End ROI_ANALYSIS.md
