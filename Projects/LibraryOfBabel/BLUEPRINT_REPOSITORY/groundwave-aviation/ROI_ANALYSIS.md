# GroundWave Aviation — ROI Analysis

> All prices are **first-pass estimates** to be refined against live
> LCSC / JLCPCB / contract-manufacturer quotes and a real RF-cert spend.
> Treat every number as **verify-before-order**.

---

## 1. Cost stack @ 1k units

| Layer                              | $/unit     |
|------------------------------------|-----------:|
| BOM (silicon, passives, PCBs, FFC) | $74.49     |
| Mechanical (pods, hub mold, vest)  | $39.60     |
| PCBA assembly (JLC SMT)            | $6.50      |
| Final integration + QA labor       | $9.00      |
| Test + RF cal + burn-in            | $2.40      |
| Inbound logistics / duty           | $1.80      |
| Packaging                          | $2.80      |
| **Landed COGS / unit**             | **$136.59**|

Cross-check vs CSV TOTAL line ($141.45): the $4.86 spread accounts for
~3.5% rounding plus the polyfuse / passive kit reallocation. Use **$140**
as the planning COGS pending live quotes.

### Amortized one-time costs (NRE)
| Item                                          | Cost     | Amortize over | $/unit @ 1k |
|-----------------------------------------------|----------|---------------|-------------|
| Hub injection-mold tooling                    | $14,000  | 5,000 units   | $2.80       |
| IMU pod injection-mold tooling                | $6,500   | 5,000 units   | $1.30       |
| FCC / ISED radio cert (Part 15.247)           | $18,000  | 5,000 units   | $3.60       |
| CE-RED cert                                   | $14,000  | 5,000 units   | $2.80       |
| UN 38.3 pack re-test                          | $4,500   | 5,000 units   | $0.90       |
| Functional test jig + RF chamber fixture      | $9,000   | 5,000 units   | $1.80       |
| TCN dataset capture (18 subjects × 50 hr)     | $42,000  | 5,000 units   | $8.40       |
| **NRE per unit @ first 5k**                   |          |               | **$21.60**  |

**Fully-loaded COGS @ first 5k = $140 + $21.60 ≈ $161.60**
**Fully-loaded COGS @ steady-state (post-amortization) ≈ $140**

---

## 2. Pricing & margin

| SKU              | MSRP    | Channel / direct | COGS    | GM%    |
|------------------|---------|------------------|---------|--------|
| Vest only        | $349    | direct (pilot)   | $140    | 60%    |
| Vest + EFB lic.  | $399    | direct           | $140 + $8 SaaS COGS | 63% |
| Fleet (10+)      | $299    | airline direct   | $140    | 53%    |
| Distributor      | $245    | safety distrib.  | $140    | 43%    |

**Blended target: 52–56% GM** across mix; sits in the program 40–55% target
window when weighted toward distributor channel.

### Why $349 is defensible
- Sonim XP10 rugged radio: $899 with no captioning, no DHH support
- 3M Peltor WS Alert XPI muff: $649, voice + BT only
- Bose A30 aviation headset: $1,295 (pilot-side, not ramp)
- Class 3 hi-vis vest with built-in lighting (Nightbeam etc): $80–$150
  baseline — we charge a $200 premium for the comms layer

A $349 sticker is on the low side of "professional ramp PPE" and well below
the radio it partially displaces.

---

## 3. SaaS attach

Optional `GroundWave Console` subscription for fleet admins:
- $9/seat/month: device fleet management, classifier updates, incident replay
- $29/seat/month: + EFB plugin license, audit log retention 7 yr (FAA-friendly)
- Margin: ~88% (standard SaaS); ~$8 COGS/seat-month covers cloud + support

At 30% attach on a 1,000-unit fleet → 300 seats × $29 × 12 = **$104k ARR** on
top of $349k hardware. SaaS layer is the long-tail equity driver.

---

## 4. TAM / SAM / SOM

| Tier  | Bucket                                              | Units  |
|-------|-----------------------------------------------------|-------:|
| TAM   | Global ramp / apron agents                          | 600,000|
| TAM   | + Marshallers + wing-walkers + GSE operators        | +220,000|
| SAM   | US + EU + CA (regulatory tractable v1)              | 240,000|
| SAM   | DHH-friendly carrier ops (target buyer)             | 12,000 |
| SOM 3y| Aspirational fleet penetration                      | 8,000  |
| SOM 1y| Pilot + 2 regional carriers                         | 600    |

US ramp agents: BLS SOC 53-6021 "aircraft service attendants" ≈ 120k.
Global multiplier ~5× via IATA AHM membership ≈ 600k.

**Critical accessibility wedge**: there is currently **no commercial product
that supports DHH ramp workers**. The category is empty. We're not splitting
a pie, we're baking the first one. The regulatory tailwind is the FAA
Reauthorization Act 2024 §744 (DHH accessibility study) and ADA Title I
enforcement actions against ramp-employer disqualification rules.

---

## 5. Break-even

Fixed first-year costs (engineering, certifications, dataset):

| Bucket                              | Year-1 cost |
|-------------------------------------|------------:|
| Engineering payroll (3 FTE × 1 yr)  | $510,000    |
| Industrial design + tooling NRE     | $42,000     |
| Certifications (FCC / CE / UN 38.3) | $36,500     |
| Dataset capture (paid subjects)     | $42,000     |
| Pilot deployment / support travel   | $25,000     |
| Insurance (product liab, $5M)       | $18,000     |
| **Year-1 fixed**                    | **$673,500**|

At blended GM of $185/unit ($349 MSRP − $164 fully-loaded COGS at first 5k):

`Break-even units = $673,500 / $185 ≈ 3,641 units`

Plus SaaS ARR layer pulls break-even forward by ~6 months.

---

## 6. Comparables — what's on the market today

| Product              | Audience         | DHH support? | Price   | Notes                                          |
|----------------------|------------------|--------------|--------:|------------------------------------------------|
| Sonim XP10           | First-responder  | No           | $899    | LMR radio, not gestural                        |
| 3M Peltor WS Alert XPI| Industrial ramp | No           | $649    | Voice + BT muff                                |
| Bose A30             | Pilot            | No           | $1,295  | Cabin headset, not ramp                        |
| Honeywell HMS-30     | Ground crew      | No           | $480    | Voice radio + hearing pro                      |
| David Clark H10-13.4 | Pilot/marshal    | No           | $385    | Passive headset                                |
| Sena Tufftalk Lite   | Industrial       | No           | $250    | BT intercom only                               |
| **GroundWave**       | **DHH + hearing**| **Yes**      | **$349**| **Gestural OUT + haptic IN; only DHH product** |

There is no direct competitor on the DHH axis. Adjacent products either gate
on voice radio (which excludes DHH workers entirely by ops policy) or they
are tablet-based ASL kiosks (wrong form factor for an active ramp). Our moat
is the dataset and the wearer-outbound classifier — both compound over time.

---

## 7. Sensitivity

Sensitivity of GM% to BOM-cost slip and MSRP, at qty 1k, including NRE
amortization:

|              | MSRP $299 | MSRP $349 | MSRP $399 | MSRP $449 |
|--------------|----------:|----------:|----------:|----------:|
| COGS $140    | 53%       | 60%       | 65%       | 69%       |
| COGS $160    | 46%       | 54%       | 60%       | 64%       |
| COGS $180    | 40%       | 48%       | 55%       | 60%       |
| COGS $200    | 33%       | 43%       | 50%       | 55%       |

**Bands of acceptability**:
- Above 55% GM = green; pursue
- 40–55% GM = on-target; ship
- Below 40% GM = re-engineer (cut to 2 IMUs, drop nRF52833, single-mold housing)

Most likely realized landing: **MSRP $349, COGS $155–$170, GM 51–55%**.

---

## 8. Channel & GTM

1. **Pilot (Months 0–9)**: one US regional carrier (e.g. SkyWest, Republic),
   one mainline (Alaska, JetBlue), 40-vest fleet each, free deployment, paid
   support. Goal: ops-manual approval and FAA AC 120-57B mapping doc.
2. **Pilot 2 (Months 9–15)**: cargo (FedEx, UPS Worldport ramp) — cargo ramps
   are *louder* and the gesture vocabulary is identical. Easier ops-policy
   path than passenger carriers.
3. **Direct sales (Year 1.5+)**: 100-500 vest fleet deployments at $299/unit
   + GroundWave Console attached at $29/seat/mo.
4. **Distribution (Year 2+)**: Grainger, Conney Safety, Magid — Class 3 vests
   are already in their SKU lineup; we slot above their "lighted vest" tier.
5. **International (Year 2.5+)**: Lufthansa Technik partnership, IATA SMSGAA
   working-group endorsement, then EASA Part 145 marshaller adoption.

---

## 9. Why this beats the alternative for the same buyer

A carrier with even one DHH ramp agent must currently either (a) reassign the
agent away from active marshalling (loss of $40-60k/yr of qualified labor and
ADA exposure) or (b) buy a $40k captioning-tablet rig per gate that doesn't
solve outbound channel. A $349 vest that closes both channels and is washable
PPE is, frankly, an obvious purchase the moment the FAA approves the
ops-manual amendment.

---

## 10. Bottom line

| Metric                 | Value           |
|------------------------|-----------------|
| Landed COGS @ 1k       | ~$140           |
| Fully-loaded COGS @ 5k | ~$162           |
| MSRP (direct)          | $349            |
| Steady-state GM        | 55–60%          |
| Break-even             | ~3,650 units    |
| Y3 SOM target          | 8,000 units     |
| Y3 hardware revenue    | ~$2.4M          |
| Y3 SaaS ARR            | ~$700k          |
| Category competitors   | **Zero on DHH** |
