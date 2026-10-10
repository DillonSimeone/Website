# WAVEDECK-MARITIME — Summary

**Domain:** Offshore platform / commercial vessel deck-crew comms + fall-overboard.
**Slug:** `wavedeck-maritime`. **Status:** pre-type-approval reference. All PNs `verify-before-order`.

## Pitch

A waterproof PFD-clip module pairs with a mast-mounted long-range RGB + thermal CV node. The node reads the bridge officer's lighted-wand and standard one-arm deck signals (heave, slack, hold, come-to-me) and re-encodes them as directional haptics on the crew member's lifejacket. The same module is a man-overboard beacon: on submersion it releases a type-approved AIS-SART class-M float, broadcasts on 161.975 / 162.025 MHz + DSC ch.70, and the surviving crew's PFDs switch into a haptic "swim to him" homing pattern via PFD compass + radio TDoA.

Replaces shout-and-hand-signal coordination on supply boats, fishing vessels, and offshore-wind crew-transfer vessels — and is the only deck-comms product that lets a Deaf or Hard-of-Hearing crewmember hold a working-deck role.

## Differentiators vs. repo siblings

- Surface-vessel deck (not subsea — distinct from `parashield-aqua` / `subsonic-signer`).
- Mast-mounted long-range thermal CV (not glove/wrist sensor).
- MOB recovery **and** officer-signal recognition combined.
- Documented AIS-SART class-M + GMDSS path (rare in this repo).

## Stack at a glance

- **PFD:** nRF52840 + Si4463 LoRa + u-blox MAX-M10S GNSS + BMI270 + BMM350 + MS5837-30BA + DRV2605 quad LRA + licensed AIS-SART OEM module (Em-Trak / Weatherdock / ACR OEM) + Hammar-style hydrostatic release. ENEPIG salt-fog PCB. IPX8 / 5 m clip body, SART float independently rated.
- **Mast node:** Jetson Orin Nano 8 GB + Sony IMX715 4K RGB + FLIR Boson 320 (9 Hz, ITAR-exempt) thermal + LoRa concentrator + isolated 24 V vessel power + heated germanium window + NMEA 2000 bridge.
- **Bridge tablet:** marine Android, N2K hand-off to vessel ECDIS for MOB.

## Economics (per-unit, verify-before-order)

| | BOM-loaded | Std retail | Margin |
|---|---|---|---|
| PFD module | ~ $572 | $1 150 | 50 % |
| Mast node | ~ $3 032 | $5 400 | 44 % |
| Bridge tablet | ~ $975 | $1 270 | 23 % (pass-through) |
| **Fleet kit (8 crew)** | **~ $12 590** | **$15 870** | ~ 21 % blended |

NRE ~ $320 k (AIS-SART class-M cert $30–80 k dominant). Break-even ~ 98 fleet kits / 800 PFDs.

## Comparables

McMurdo Smartfind G8 SART ($300), Ocean Signal rescueME MOB1 ($250), ACR ResQLink ($400). None do haptic signalling, none do CV signal recognition, none address DHH crew.

## TAM (serviceable, Y1–Y3)

Offshore wind CTV/SOV + NA/EU offshore-support vessels ~ 6 000 vessels, 60 000 PFDs.

## Files

- `ARCHITECTURE.md` — full block diagram, RF cert path, firmware, failure modes.
- `PRODUCTION_BOM.csv` — 45 line items.
- `ROI_ANALYSIS.md` — BOM rollup, pricing, TAM, comparables, break-even.

## Go / no-go

GO if AIS-SART OEM royalty < $140/unit and class-M type-approval program < $110 k. Escalate otherwise.
