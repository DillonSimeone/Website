# cyclecall-peloton — SUMMARY

**Domain:** Pro / club cycling team DHH rider comms.
**Slug:** `cyclecall-peloton`

## The Pitch

Capacitive bar-tape tap pad + top-tube hub + saddle PowerHap puck + bone-conduction collar + DS-car dongle. Bluetooth Mesh 1.1 over LE 1M PHY converts DS voice commands into encoded haptics for DHH (and hearing) riders. Exploits the UCI 1.3.024 gap: voice radios are regulated, tactile is not. Opens elite peloton participation for DHH riders and gives sighted teammates a stealth tactical comm layer.

## Tech Stack (5 bullets)

- Bar pad: AT42QT1070 5-ch cap-touch under hookless bar tape, flex PCB, wired to top-tube hub.
- Top-tube hub: nRF52840 + u-blox GNSS + ANT+ power-meter pickup + 40 G crash IMU.
- Saddle puck: ESP32-C3 + DRV2605L driving TDK PowerHap LRA (silicone-isolated rail clamp).
- Bone-conduction collar: AS3415 / AfterShokz-class transducer + BLE 5.3.
- Team mesh: Bluetooth Mesh 1.1 over LE 1M PHY with ESB fallback; DS-car Android tablet + custom dongle.

## Cost Delta (verify-before-order)

| Item | COGS @1k | MSRP | GM |
|---|---|---|---|
| Rider full kit | $142 | $1,099 | ~87% |
| DHH-only kit | $110 | $899 | ~88% |
| DS dongle | $72 | $549 | ~87% |
| Team package | $1,211 | $9,990 | ~88% |
| Gran-fondo SKU | — | $499 | — |

Comparables: Wahoo Elemnt Roam $400 (no haptic, no team comm); SRAM AXS $2.5–5k (no comm); Garmin Edge — none address DHH or peloton tactical comms.

## Profitability

- 81–88% blended gross margin (athletic-premium channel).
- TAM 5-yr ~$6.86M (UCI teams ~600 + pro riders ~5k + premium gran-fondo ~2M).
- Break-even ~185 team packages — reachable mid-year-2.

## Risks

- UCI rule reclassification of tactile comms (mitigated by federation legal dossier + retreat to gran-fondo, DHH-team, and adaptive-cycling markets).
- Wet-glove / rain false-trigger on bar pad (cap-touch tuning + firmware debounce).
- Counterfeit knockouts from cycling-component cloners (mitigated by mesh-key gating + saddle-rail PowerHap supply lock).

All numbers `verify-before-order` before tape-out.
