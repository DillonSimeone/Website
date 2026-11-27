# substation-lineman — ROI ANALYSIS

> All numbers **verify-before-order**. ASTM F18 / Kinectrics / Doble lab quotes vary widely; treat the cert allocation as an envelope, not a quote.

---

## 1. Bill of materials roll-up

| Bucket                          | Cost (USD) | Notes                          |
|---------------------------------|-----------:|--------------------------------|
| Cuff electronics + RF           | 113.45     | per PRODUCTION_BOM.csv         |
| Cuff mechanical (shell/mesh/PCB/strap/Nomex) | 51.40 | silicone over-mold + Faraday   |
| Battery + dock + charge IC      | 16.65      | UL1642 pouch, magnetic dock    |
| Ground dongle (whole)           | 36.40      | SA868-V + STM32 + whip + LiPo  |
| Per-unit assembly labor         | 38.00      | 0.75 h burdened                |
| Per-unit calibration            | 22.00      | training-yard E-field ladder   |
| Per-unit witness test amort.    | 18.00      | dielectric retest allocation   |
| **Cuff + dongle landed BOM**    | **295.90** | excl. ground tablet HW         |
| Ground tablet (rugged Android)  | 480.00     | Samsung XCover Pro class       |
| **Kit landed cost (1 cuff + 1 tablet + 1 dongle)** | **775.90** | verify-before-order |

Volume curve (cuff-only landed, excl. tablet):

| Annual qty | Cuff landed (USD) |
|-----------:|------------------:|
| 250        | 320               |
| 1,000      | 285               |
| 5,000      | 240               |
| 20,000     | 205               |

---

## 2. NRE / certification budget

| Line                                                  | Low (USD) | High (USD) | Notes                                |
|-------------------------------------------------------|----------:|-----------:|--------------------------------------|
| Industrial + mechanical design (cuff shell + strap)   | 25,000    | 55,000     | 3 SKUs for sleeve OD variants        |
| Electrical design (4-layer PCB, RF compliance)        | 35,000    | 70,000     | incl. SAW/π filter sim               |
| Firmware (FreeRTOS, landmark, alarm, radio)           | 60,000    | 120,000    | incl. ground tablet Android app      |
| ASTM F496 / F18 dielectric witness lab (Kinectrics/Doble) | 25,000 | 80,000     | AC withstand + impulse + salt fog    |
| FCC Part 90 type acceptance (sub-assembly use)        | 8,000     | 22,000     | utility licensee covers operational license |
| UL 1642 / IEC 62133 battery cert                      | 6,000     | 14,000     | per pouch SKU                        |
| IBEW DHH apprentice trial (closed yard)               | 18,000    | 40,000     | host utility partnership             |
| Tooling (silicone over-mold, magnetic dock)           | 22,000    | 60,000     |                                      |
| Per-unit cal jig at training yard                     | 12,000    | 28,000     | 4 kV / 13.8 kV / 25 kV reference     |
| Insurance + product liability (year 1)                | 15,000    | 45,000     | non-trivial for HV-adjacent PPE      |
| **NRE total**                                         | **226,000** | **534,000** | verify-before-order              |

Plan against **~ $400k** mid-case.

---

## 3. Pricing & margin

Anchors:

- Salisbury Class-2 glove kit: $200–400.
- Salisbury full live-line kit (gloves, sleeves, blanket, bag): $1.5k–3k.
- Greenlee FieldSense voltage detector (hot-stick): $400.
- HD Electric LineRanger: $1.2k.
- Honeywell Salisbury arc-flash kit (CAT 4): $3–5k.

Utility safety spend is **non-discretionary** at the foreman/safety-director level — once an item is in the IBEW local's safety standard, replacement is line-item budgeted.

Pricing:

| SKU                       | Target retail | Cogs   | Gross margin |
|---------------------------|--------------:|-------:|-------------:|
| Cuff only (single)        | $2,950        | 295.90 | **90 %** raw, **53 %** loaded* |
| Ground tablet + dongle    | $1,150        | 516.40 | **55 %** loaded* |
| Full kit (2 cuff + 1 tablet) | $6,800     | 1,108.20 | **84 %** raw / **51 %** loaded* |

*loaded = COGS + amortized NRE over 3 yrs / forecast units + service + insurance + channel margin. Target 40–55 % loaded margin.

Service / SaaS attach:

- Annual recert + dielectric witness retest per cuff: **$120/yr** (lab fee + handling).
- Ground tablet OTA + ASL render updates: **$180/yr** per crew.
- Both bundled as "Lineman Safety Subscription" $35/mo per cuff.

---

## 4. TAM / SAM / SOM

**TAM (units, primary worker population):**

| Segment                                  | Population | Notes                                |
|------------------------------------------|-----------:|--------------------------------------|
| US journeyman linemen (IBEW + non-union) | ~ 125,000  | BLS 49-9051, verify-before-order     |
| US apprentices                           | ~ 25,000   |                                      |
| US distribution sub field engineers      | ~ 35,000   | DSO + munis                          |
| EU/UK DSO field engineers                | ~ 280,000  | DSOs + TSOs                          |
| Global (incl. India/China/LATAM)         | ~ 1,500,000 | rough; many not addressable yr 1     |

**Hearing-impacted subset (cumulative occupational noise + ototoxin exposure):**
NIOSH literature suggests **18–28 %** of long-tenured (15+ yr) linemen show measurable high-frequency hearing loss. Not all are DHH-identifying; the addressable "needs tactile alert + visual comms" subset is **larger** than the "ASL-fluent" subset because the cuff helps *anyone* who can't reliably hear the ground crew over a substation.

**SAM (year 3, North America):**

- ~ 40,000 linemen at IOUs with active hearing-conservation programs.
- ~ 8,000 of them will be issued a cuff if any one IBEW local or any one IOU safety dept adopts the standard.
- Mid case: **6,000 cuffs + 1,500 ground kits** in NA by year 3.

**SOM (year 1, design-partner):**

- 2 IOUs + 1 IBEW training center.
- **400 cuffs + 100 ground kits** = pilot revenue $1.4M.

---

## 5. Comparables & gap

| Product                       | Voltage detect | DHH/ASL comms | Wearable | Price          |
|-------------------------------|:--------------:|:-------------:|:--------:|----------------|
| Salisbury Class-2 glove kit   | —              | —             | yes      | $200–400       |
| Salisbury full live-line kit  | —              | —             | yes      | $1.5–3k        |
| Greenlee FieldSense           | yes (hot-stick) | —            | no       | $400           |
| HD Electric LineRanger        | yes (hot-stick) | —            | no       | $1.2k          |
| Honeywell arc-flash kit       | —              | —             | yes      | $3–5k          |
| **substation-lineman cuff**   | **yes (cuff)** | **yes**       | **yes**  | **$2.5–4k**    |

The combination — wearable + cuff-resident E-field alarm + bucket-to-ground ASL — has no listed equivalent. Closest adjacent is a Bluetooth headset (e.g., Sensear SM1P) which fails the DHH use case entirely.

---

## 6. Unit economics (mid case)

```
Retail (cuff)         $ 2,950
- Channel margin 15 % $   443    (utility distributor / ESCO)
- Sales tax handled by buyer
= Net to maker        $ 2,507
- COGS (1k volume)    $   285
- Per-unit warranty   $    35
- Per-unit insurance  $    45
- Cust support        $    25
- Calibration support $    15
= Contribution        $ 2,102 /cuff
```

**Loaded margin: 71 %** at 1k volume, before NRE amort.

**Break-even (mid NRE $400k):**
$400,000 / $2,102 contrib ≈ **191 cuffs.**

Pilot of 400 cuffs at one IOU clears NRE in year 1.

---

## 7. Risk-adjusted view

| Risk                                       | Impact         | Mitigation                            |
|--------------------------------------------|----------------|---------------------------------------|
| ASTM F18 lab schedule slips 6 mo           | revenue push   | book lab slot at PCB layout           |
| IOU procurement cycle = 9–14 mo            | cash burn      | start with IBEW training centers (faster) |
| Product liability quote balloons           | margin hit     | structure as PPE-adjacent, not PPE     |
| Lithium aloft policy at certain IOUs       | SKU split      | LiFePO4 alt SKU (lower energy, ok)    |
| Glove OEM (Salisbury) views as competitive | channel block  | position as complement; OEM licensing route |
| ASL render quality on cheap tablet         | UX failure     | spec'd Snapdragon 6 Gen 1 floor       |
| FCC Part 90 sub-assembly recert            | timing         | utility licensee absorbs operational license |

---

## 8. 3-year revenue model (mid case)

| Year | Cuffs | Kits | Subscription ARR | Hardware rev | Service rev | Total |
|-----:|------:|-----:|-----------------:|-------------:|------------:|------:|
| 1    | 400   | 100  | $80k             | $1.36M       | $80k        | $1.44M |
| 2    | 1,800 | 450  | $360k cumul.     | $6.1M        | $360k       | $6.46M |
| 3    | 6,000 | 1,500 | $1.1M cumul.    | $20.4M       | $1.1M       | $21.5M |

Gross margin year 3 ~ 58 % blended; opex (eng + sales + ops) ~ $4.5M → operating income ~ $8M.

---

## 9. Exit / strategic value

- Acquisition targets in this space (Salisbury / Honeywell, Greenlee / Emerson, MSA Safety, 3M EHS). DHH-inclusion + wearable E-field detector is a clean strategic add for any of them; comparable PPE-electronics acquisitions trade 3–5× ARR.
- IP: combination of (a) Class-2-compatible forearm cuff form factor, (b) on-cuff differential E-field sensing with guard-driven plate, (c) VHF-burst landmark ASL — file all three before pilot.
