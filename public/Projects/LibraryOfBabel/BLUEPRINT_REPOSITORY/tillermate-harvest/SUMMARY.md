# TillerMate Harvest — Summary

**Slug:** `tillermate-harvest`
**Domain:** Agricultural tractor cab + DHH field crew communication
**Status:** Blueprint v0.1 — all part numbers + prices `verify-before-order`

---

## What it is
A roof-mounted mmWave + RGB-stereo perception module that reads agricultural hand signals from field workers up to **50 m** away in dust, low light, and crop occlusion. Driver gets ASL-gloss alerts on a cab-seat **haptic puck**; driver replies via puck buttons to **wristbands** worn by DHH field hands. Ranch-scale **LoRa mesh + optional LTE-M** backhaul.

## Why it wins
- Only product on the market combining **DHH workforce inclusion** with **labor-shortage tooling** ag already pays for.
- Outdoor / long-range — not industrial-floor or kiosk.
- Co-designed haptic vocabulary, not retro-fitted voice-radio.

## Stack (one-line)
TI IWR6843AOP + 2x OV9281 + Hailo-8L (or Coral) on i.MX 8M Plus -> ESP32-S3 puck w/ DRV2605L + ERM+LRA -> ESP32-C3 wristbands -> SX1262 ranch mesh -> Sierra HL7800 LTE-M.

## Numbers (kit = 1 roof + 1 puck + 5 wrists)
| | $ |
|---|---|
| BOM | 575 |
| Landed COGS | 788 |
| Dealer net | 1,575 |
| MSRP | **2,625** |
| Factory margin | **50%** |
| SaaS ARPU / kit / yr | 888 |
| 5-yr LTV / kit | 7,065 |
| Break-even | **~2,283 kits / ~yr 2** |

## Market
- SAM: ~260k commercial row-crop ops (US+EU+AU/NZ/CA w/ hired labor).
- SOM (5 yr): ~8,800 kits.
- Direct competitors for DHH-inclusive cab<->crew comms: **none**.

## Risks
Gesture dataset cold-start; ag dealer channel inertia; seasonal cash flow; must be marketed as **awareness-aid, not safety-of-life**.

## Files
- `ARCHITECTURE.md` — full system, sensors, firmware, env spec
- `PRODUCTION_BOM.csv` — multi-section BOM, 45 lines, TOTAL row
- `ROI_ANALYSIS.md` — COGS, pricing, TAM/SAM/SOM, comparables, break-even
- `SUMMARY.md` — this file
