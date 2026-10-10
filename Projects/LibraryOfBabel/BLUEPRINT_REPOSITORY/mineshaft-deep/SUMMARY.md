# mineshaft-deep — Summary

**Domain:** Underground hard-rock / coal mining DHH miner comms
**Form:** MSHA-permissible cap-lamp-replacement helmet module + IS belt pack + surface gateway
**All part numbers and prices: verify-before-order.**

## What it is

Helmet module that drops into the standard cap-lamp bracket and adds:

1. **Downward dust-immune ToF camera** (940 nm, IR-bandpass) that recognizes a 25-sign mining hand-signal vocabulary (Modified Bishop + industry standard) from nearby miners. Depth sensing punches through coal dust where RGB fails.
2. **457 kHz through-rock VLF receive** — one-way haptic relay from surface ops or refuge chamber for emergency patterns (evacuate / shelter / stand-down / muster / radio-check). Penetrates ~500 m of rock.
3. **Belt-pack tag** with chest haptic quad, 2.4 GHz mesh between miners line-of-sight (~30 m), redundant CH4 sensing, and the 457 kHz TX loop.
4. **Cap-lamp** retained (4500 lm Cree XHP70, regulatory ride-along — MSHA still requires a permissible cap-lamp).

## Why it's different from the rest of the Singularity repo

| | griplogic-atex (ATEX Zone 1) | **mineshaft-deep** |
|---|---|---|
| Cert | ATEX II 2G | **IECEx Ex ia I Ma + MSHA permissible** (highest mining IS) |
| RF | 2.4 GHz | **457 kHz through-rock + 2.4 GHz LoS** |
| Form | Glove | **Helmet cap-lamp replacement** |
| Vocab | Industrial gestures | **Mining-specific (Bishop + MSHA)** |
| Emergency | None | **Surface->miner haptic broadcast** |

## Numbers

- **BOM (qty 1k):** ~$770/miner direct, ~$927 loaded; surface gateway ~$1,050.
- **Cert NRE:** $500-765k (use $625k base) over ~18 months. MSHA dominates.
- **List price:** $1,685/miner, $1,750/gateway, $180/miner/yr support.
- **Margin:** 45% gross; first-2,500-unit net ~$87 (NRE recovery), then ~$337 net (20%).
- **Break-even:** ~mid-Y4 base case (2 mine wins/yr, ~400/800/1200 unit ramp).
- **TAM:** ~1M miners in safety-capex operations; SOM 8k-25k over 5 yr.

## Comparables

| Vendor | System | $/miner | $/surface | DHH? |
|---|---|---|---|---|
| Strata Worldwide | CommTrac | $1.0-3.0k | $50-250k | No |
| Becker Mining | SmartCom | $1.5-4.0k | $100k+ | No |
| MST | ImPact | $1.2-2.8k | $80k+ | No |
| **mineshaft-deep** | — | **$1.685k** | **$1.75k** | **Yes — sole provider** |

## Top risks

1. MSHA approval timeline (12-24 months post-submission).
2. IS-cert LiFePO4 cell supply (2-3 qualified vendors globally).
3. Re-cert required for any silicon/firmware change -> no field OTA.
4. Mine-fatality liability — carry $5M product-liability insurance from day 0.
5. Mesh radio hard-killed in firedamp; emergency relies entirely on 457 kHz.

## Why this is a strong v1 for the regulated-mining vertical

Cap-lamp form-factor is the only place on a miner's body that already has a cert pathway (every miner wears a permissible lamp). DHH framing is the wedge into mine safety departments; through-rock haptic emergency relay is the revenue — sellable to every miner, not just DHH. Once a mine specs you in, 5-7 year replacement cycle.

End SUMMARY.md
