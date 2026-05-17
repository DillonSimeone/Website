# substation-lineman — SUMMARY

**Domain:** HV electric utility — bucket-truck linemen with hearing loss.
**Slug:** `substation-lineman`

## What

Forearm tactile cuff worn **over** the Class-2/3 rubber sleeve. Two channels for a Deaf / hard-of-hearing lineman in the bucket:

1. **HV proximity alarm.** On-cuff capacitive differential E-field sensor (LMC662 / INA826 / MCP3564R 24-bit ADC) reads 60 Hz field. Six LRA haptics drive escalating patterns mapped to OSHA 1910.269 / IEEE 516 MAD tables.
2. **Two-way ASL bucket ↔ ground.** Arducam Mega 5MP looks down at signing hands; ESP32-S3 extracts MediaPipe landmarks; **licensed utility-VHF burst** (SA868-V + CMX901 PA, 500 mW) sends landmark stream to ground-crew rugged Android tablet + USB-C VHF dongle.

## Why

Decades of substation noise push DHH linemen out. Cuff brings them back without breaching primary PPE — no exposed conductors, internal Faraday cage, parylene-C + silicone over-mold, dielectric witness tested per ASTM F496 (20 kV/1 min AC withstand + 75 kV 1.2/50 us lightning impulse).

## Differentiators vs. repo

- HV electric domain (not chemical-ATEX `griplogic-atex`).
- **Forearm cuff** over Class-2 sleeve, not a glove or helmet.
- E-field **input** drives haptic output (not just glove-output devices).
- Bucket-to-ground ASL (not factory floor / handshake / signing).
- Explicit OSHA 1910.269 + IEEE 516 + ASTM F18 framing.

## Numbers (verify-before-order)

| | Value |
|---|---|
| Cuff landed COGS @ 1k | **$295.90** |
| Full kit landed COGS (2 cuff + tablet + dongle) | **$1,108** |
| Cuff retail | **$2,950** |
| Full kit retail | **$6,800** |
| NRE (mid) | **~$400k** (incl. $25–80k F18 lab) |
| Loaded margin | **51–55 %** |
| Break-even units | **~191 cuffs** |
| TAM (US linemen) | ~125k; global ~1.5M |
| SOM yr 1 pilot | 400 cuffs / 1 IOU + 1 IBEW center |

## Comparables gap

Salisbury / Honeywell — no DHH, no built-in E-field alert. Greenlee FieldSense — standalone hot-stick, no comms. Sensear headset — voice only, fails DHH. **No equivalent product** combining wearable + E-field + ASL.

## Top risks

1. ASTM F18 dielectric lab queue (4–6 mo).
2. IOU procurement cycle (9–14 mo) → enter via IBEW training centers.
3. Lithium-aloft IOU policies → LiFePO4 SKU.
4. Glove OEM channel block → license / partner posture, not compete.

## Status

Blueprint only. Not a substitute for primary PPE. All part numbers, prices, regulatory references **verify-before-order** before tape-out or quoting.
