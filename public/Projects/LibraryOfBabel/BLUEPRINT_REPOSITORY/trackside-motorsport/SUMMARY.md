# TRACKSIDE-MOTORSPORT — One-Pager

**Slug:** `trackside-motorsport`
**Domain:** Pit-crew + driver fire-rated haptic flag/signal comms
**Status:** Prototype-stage blueprint. All part numbers & prices **verify-before-order**.

---

## What

Inside-Nomex thin haptic patch array (8 LRA channels: chest, forearms, thighs, sternum, lumbar) wired to a belt-mounted, fire-rated electronics module that talks to pit wall over **dual-redundant RF** — licensed 868/915 MHz (primary, paddock-robust) + 2.4 GHz ESB (low-latency redundant).

Race director / spotter flag calls (yellow, blue, debris, pit-now, red, position warn) become **spatially-encoded haptics** with sub-1 ms transducer rise. Driver replies via 4-button helmet chin pad. Pit crew variant: wristband for DHH-inclusive pit-stop choreography.

## Why

Verbal helmet comms gates DHH participation in club, regional, and Formula Regional racing. Current "solution" = exclude. There is **no FIA-listed haptic comms product** and **no motorsport-rated DHH product** on market.

## Key Differentiators vs. Repo

| | This concept | Repo neighbors |
|---|---|---|
| Domain | Motorsport-specific | Generic emergency / industrial |
| Form factor | Nomex-internal soft-flex patches | Gloves / helmets / wearables |
| Semantics | Flag-call spatial encoding | ASL recognition / generic alert |
| Cert path | FIA 8856-2018 informational + GCR 9.16 | n/a |

## Numbers

| | |
|---|---|
| BOM (driver kit, qty 100) | ~\$203 |
| Loaded cost (incl. assy/test) | ~\$321 |
| Recommended ASP | **\$1,500** |
| Gross margin | ~79% |
| Pit-crew band ASP | \$487–550 |
| Pit-base station ASP | \$1,800 |
| Driver TAM (units) | ~475k |
| Driver TAM (dollars) | ~\$712M |
| Pre-revenue burn | ~\$66k / 9 mo |
| Break-even units | ~56 driver kits |

## Stack

- **Belt:** STM32G4 + nRF52840 + SX1262, LiFePO4 1500 mAh, aluminum enclosure
- **Haptics:** 4x DRV2605L + I2C mux + analog SPDT -> 8 LRAs (Vybronics 8 mm class)
- **Patch:** silicone substrate + polyimide flex PCB + Nomex over-sleeve harness
- **Chin pad:** 4 buttons + bone-conduction, JST-GH coiled lead
- **Pit base:** RP2040 + 5" IPS + dual-radio + USB-C to race director laptop
- **Protocol:** 16-byte AES-CCM frames, dual-path with 8 ms stagger, ACK target 50 ms

## Latency

- Target <= 5 ms end-to-end; achieved on 2.4 GHz path (~3.5 ms); sub-GHz path ~6 ms (paddock-robust trade-off). Transducer rise sub-1 ms via closed-loop resonant drive.

## Major Risks (verify)

1. **Cert:** FIA 8856-2018 path is informational; assembly must be re-tested by accredited lab before track use. v1 positioned as club / non-sanctioned.
2. **RF licensing:** sub-GHz allocation and series-specific transmitter rules vary; receive-only fallback supported.
3. **Battery thermal:** LiFePO4 cockpit-envelope qualification required.

## Out of Scope (v1)

CAN/ECU bridge, voice replacement, marshal variant, driver-to-driver comms (FIA forbids in-session).

---

**Pitch line:** *Flag-call haptics that fit under the Nomex, work in the loud, and let DHH drivers race.*
