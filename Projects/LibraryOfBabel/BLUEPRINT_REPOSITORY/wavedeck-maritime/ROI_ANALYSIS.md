# WAVEDECK-MARITIME — ROI Analysis

All prices/PNs `verify-before-order`. Margin band assumes type-approval cost amortised over first 500 units (PFD) / 100 units (mast).

---

## 1. Per-unit BOM rollup

### 1.1 PFD-clip module

| Group | Cost (USD) |
|---|---|
| Silicon (MCU, GNSS, sensors, haptic, etc.) | 51.05 |
| AIS-SART OEM module (incl. per-unit royalty) | 185.00 |
| Batteries (Li-SOCl2 + Li-MnO2 SART pack) | 60.40 |
| Antennas + RF passives | 17.40 |
| Mechanical (housing, clip, hydrostatic release) | 46.30 |
| PCB (4-layer ENEPIG, salt-fog spec) | 8.40 |
| Misc passives + connectors (est.) | 6.50 |
| Cert amort (AIS-SART + marine) | 155.00 |
| Assembly + test (incl. IPX8 leak) | 42.00 |
| **PFD BOM-loaded** | **≈ 572.05** |

### 1.2 Mast node

| Group | Cost (USD) |
|---|---|
| Jetson Orin Nano SoM | 499.00 |
| Carrier + GMSL2 + GigE | 140.00 |
| RGB sensor + lens | 42.00 |
| FLIR Boson 320 (9 Hz, ITAR-exempt) | 1850.00 |
| LoRa concentrator + NMEA xcvr + PHY | 21.20 |
| Power + surge | 62.40 |
| Housing + Ge window + heater | 264.00 |
| PCB | 38.00 |
| Cert amort | 35.00 |
| Assembly | 80.00 |
| **Mast BOM-loaded** | **≈ 3 031.60** |

### 1.3 Bridge tablet

| Group | Cost (USD) |
|---|---|
| Tablet | 720.00 |
| N2K dongle | 210.00 |
| Software amort | 45.00 |
| **Bridge BOM-loaded** | **≈ 975.00** |

### 1.4 Typical fleet kit (1 vessel, 8 crew)

`8 x PFD + 1 mast + 1 bridge = 8 x 572 + 3 032 + 975 = 8 583 + 3 032 + 975 = 12 590 USD COGS`

---

## 2. Pricing

### 2.1 PFD-clip module

| Lane | Retail (USD) | Margin on $572 |
|---|---|---|
| OEM / fleet (≥ 50 u) | 950 | 40 % |
| Standard (1–49 u) | 1 150 | 50 % |
| Spare / aftermarket | 1 250 | 54 % |

Brief vs. comparables:

- McMurdo Smartfind G8 AIS-SART standalone — ~300 USD (no haptics, no signal CV).
- Ocean Signal rescueME MOB1 — ~250 USD (no haptics, no signal CV).
- ACR ResQLink View PLB — ~400 USD (PLB on 406 MHz, not AIS, no haptics).

Wavedeck PFD is 2.5–4 x the price of a bare MOB beacon **because it bundles**:
1. Type-approved AIS-SART (matches G8 functionally).
2. Hands-free wand/arm signal haptics — *no comparable product*.
3. Buddy-homing haptic on MOB — *no comparable product*.
4. DHH-accessible (the only deck-comms product not built on shouting).

### 2.2 Mast node

| Lane | Retail (USD) | Margin on $3 032 |
|---|---|---|
| OEM / fleet | 4 600 | 34 % (loss-leader for fleet) |
| Standard | 5 400 | 44 % |
| Spare | 5 900 | 49 % |

Mast node margin compresses by design — it is the gateway purchase; PFDs are the recurring (replacement, fleet-growth, lost-overboard) revenue.

### 2.3 Bridge tablet — pass-through

Sold at ≈ 30 % markup ($1 270) or bring-your-own marine tablet (software licence $250/y).

### 2.4 Typical fleet kit retail

`8 x 1 150 + 5 400 + 1 270 = 9 200 + 5 400 + 1 270 = 15 870 USD per vessel`

Blended margin: `(15 870 - 12 590) / 15 870 = 20.7 %` apparent — but the **real margin floor** is at the cert-amort schedule (see §5).

---

## 3. TAM

| Segment | Vessels | Crew (deck-relevant) | Notes |
|---|---|---|---|
| Offshore-support vessels (OSV/PSV) | ~3 000 | ~30 000 | High-spec, capex-tolerant, premium target. |
| Offshore-wind crew transfer (CTV/SOV) | ~600 + 60 SOVs | ~10 000 | Fastest-growing segment; insurer-driven. |
| Commercial fishing global | ~4.6 M | ~38 M | Premium / regulated band ≈ 2 M crew (NA + EU + AU/NZ + JP). |
| Tugs, pilot boats, work boats | ~50 000 | ~150 000 | Mid-tier. |
| Naval / coast guard | n/a | — | Out of scope (separate cert lane). |

**Serviceable obtainable market (Y1–Y3):** offshore wind + NA/EU OSV → ~6 000 vessels x ~10 crew avg = **60 000 PFD units + 6 000 mast/bridge kits**.

---

## 4. Comparables and gaps

| Vendor | Product | Gap we close |
|---|---|---|
| McMurdo (Orolia) | Smartfind G8 AIS-SART | No signal CV. No haptics. No deck-comms. Crew-MOB recovery still relies on shouting + visual scan. |
| Ocean Signal | rescueME MOB1 | Same as above. |
| ACR Electronics | ResQLink, AISLink MOB | Same. |
| FLIR | M-series marine thermal | Mast-mounted thermal exists but is a *display* feed for the wheelhouse, not a CV-classifier feeding crew haptics. |
| Mobilarm (now ACR) | crewWatcher | Phone-app MOB — not type-approved AIS-SART, no signal CV. |

**None of the above address Deaf / Hard-of-Hearing deck crew.** Wavedeck is the only system where a DHH crewmember can hold a working-deck role on a commercial vessel without an assistive interpreter present.

---

## 5. Break-even

### 5.1 NRE / one-time

| Item | Cost (USD) |
|---|---|
| AIS-SART class M type approval (lead class society) | 30 000 – 80 000 |
| EMC + IPX8 + salt-fog cert (TUV / Intertek) | 18 000 |
| FCC / ETSI / IC LoRa cert | 14 000 |
| Industrial design + tooling (PFD housing) | 60 000 |
| Mast node mech tooling | 20 000 |
| Firmware + CV training data (signal set, 14 sigils, 2 k frames) | 110 000 |
| Class-society plan approval (DNV / ABS / Lloyd's lead) | 25 000 |
| **NRE total (mid)** | **~ 320 000** |

### 5.2 Break-even units

Use blended **gross margin = $3 280 per fleet kit** (sec. 2.4).

`Break-even kits = 320 000 / 3 280 ≈ 98 fleet kits` (≈ 100 vessels, ≈ 800 PFD units).

At an OSV-fleet entry-point of 6–24 vessels per buyer, that is **≈ 5–15 fleet customers** to recoup NRE. Comfortable.

### 5.3 Sensitivity

- AIS-SART cert sliding to upper bound ($80 k) → break-even = 113 kits.
- BOM creep on Boson core (+$300) → margin compress 1 pt, BE = 105 kits.
- PFD retail held at OEM lane ($950) on all volume → BE = 145 kits.

---

## 6. Revenue path (3-year)

| Year | Kits | PFDs | Revenue (USD) | Notes |
|---|---|---|---|---|
| Y1 | 40 | 350 | ~620 000 | Pilot fleet + 2 OSV operators; cert in flight. |
| Y2 | 220 | 2 100 | ~3.7 M | Cert complete; offshore-wind ramp. |
| Y3 | 600 | 6 500 | ~11 M | Premium fishing entry; insurer-driven adoption. |

---

## 7. Decision

GO — provided AIS-SART OEM module licensing is locked before PCB tape-out. If type-approval royalty exceeds **$140 / unit** or program cert exceeds **$110 k**, escalate before Y1 spend.
