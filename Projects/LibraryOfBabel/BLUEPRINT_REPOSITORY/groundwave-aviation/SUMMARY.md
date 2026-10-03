# GroundWave Aviation — Summary

## Pitch
ANSI/ISEA 107 Class 3 hi-vis safety vest with a 4-node 9-axis IMU constellation
(wrists, elbows, chest) that recognizes the wearer's own ICAO Annex 2 / FAA
AC 120-57B marshalling signals and broadcasts them as structured events over
LoRa 915 MHz to flight-deck EFB tablets and crew-chief wrist tablets. Inbound
text alerts arrive as patterned haptic on shoulder and lumbar LRAs. Built so
that DHH ramp agents — currently disqualified from active marshalling by
voice-radio ops rules — have a complete, peer-equal comms channel in the
120-140 dB ramp environment where voice radios fail anyway.

## Tech stack
- **MCU**: ESP32-S3-WROOM-1-N16R8 (dual LX7, 16 MB flash, 8 MB PSRAM, ESP-DL vector ML)
- **IMUs**: 4x ICM-42688-P (wrists/elbows) + 1x BMI270 (chest) + 2x MMC5983MA mag (wrists)
- **Classifier**: int8 TCN, 60-frame window @ 100 Hz, 12 ICAO signals + 3 custom, ~45 ms inference
- **RF outbound**: SX1262 LoRa 915 MHz, +22 dBm, AES-128-CTR + HMAC-SHA256-trunc64
- **RF fallback**: nRF52833 BLE 5.4 GATT advertiser, 30 m gate-area coverage
- **Haptic inbound**: 4x DRV2605L drivers -> 4x LRAs (shoulders + lumbar)
- **Power**: 1S 5000 mAh Li-poly, BQ25798 USB-PD, 14 h continuous run
- **Mechanical**: stock Class 3 FR vest + sewn ripstop liner, snap-on IMU pods, IP66 chest hub
- **Certs**: FCC Part 15.247, ISED RSS-247, CE-RED, UN 38.3, ANSI/ISEA 107; no DO-160 (not installed equipment)

## Cost delta
| Item                            | $/unit |
|---------------------------------|-------:|
| BOM @ 1k                        | $141   |
| Mechanical + assembly + QA      | inc.   |
| **Landed COGS (steady-state)**  | **$140**|
| NRE amortized over first 5k     | +$22   |
| **Fully-loaded COGS @ first 5k**| **$162**|
| **MSRP (direct fleet)**         | **$349**|

vs comparables: Sonim XP10 $899, Peltor WS Alert XPI $649, Bose A30 $1,295.
None of those serve DHH ramp workers; the category is currently empty.

## Profitability
- **Gross margin steady-state**: 55-60% at $349 MSRP / $140 COGS
- **GM @ first 5k (with NRE)**: 51-53%
- **Blended GM (mix of direct + distributor)**: 52-56%
- **Break-even**: ~3,650 units against ~$674k Y1 fixed
- **TAM**: 600k global ramp agents; **SAM**: 240k US/EU/CA; **Y3 SOM**: 8,000 units
- **SaaS attach**: GroundWave Console $9-$29/seat/month, ~88% margin, ~$700k ARR at Y3 fleet size
- **Unique moat**: only product on the market that closes the DHH marshalling
  comms gap; classifier dataset (50 h captured, augmented to 200 h) compounds.

**Verify-before-order**: all part numbers, prices, and certification cost
estimates are first-pass and should be refined against live LCSC / JLCPCB
quotes plus a real RF-cert lab statement of work before any spend.
