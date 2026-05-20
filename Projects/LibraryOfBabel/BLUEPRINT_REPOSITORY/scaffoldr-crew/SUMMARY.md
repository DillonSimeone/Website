# SCAFFOLDR-CREW — One-Pager

**Helmet-mounted DHH crane-signal comms node for high-iron crews.**

## The Pitch

A clip-on hardhat module that watches the signal person with a downward depth camera, classifies ASME B30.5 / OSHA standardized crane and rigging hand signals on-device, and relays each call as a distinct haptic-plus-bone-conduction pattern to every helmet within ~2 km via LoRa mesh. It replaces voice radio in wind, distance, and PPE conditions where speech is unreliable, and gives Deaf and Hard-of-Hearing ironworkers full participation in signal-person duties for the first time. ANSI Z89.1 Type II compatible, ~295 g added mass, 12 h shift runtime.

## Tech Stack

- **MCU:** ESP32-S3-WROOM-1-N16R8 (dual LX7 @ 240 MHz, 8 MB PSRAM, on-die BLE 5.0 + Wi-Fi 4, native camera ingress, ESP-DL INT8 inference)
- **Vision:** Arducam B0410 ToF (base) / OAK-D Lite Myriad-X NPU (premium); MobileNetV3-Small INT8, 22-class signal vocab + reject, 113 ms end-to-end
- **Comms:** Semtech SX1262 LoRa 868/915 MHz, +22 dBm, AES-CCM-secured Meshtastic-derived mesh, ~303 ms perceived signaler-to-crew latency
- **Haptic / audio:** Stereo TI DRV2605L -> Vybronics LRAs + Sanwa BTV-2008 bone-conduction transducers, PAM8302A amps, 28-pattern waveform library
- **Power / mech:** 18650 3500 mAh + BQ25895 + MAX17048, optional 250 mW flex-PV crown harvest, ABS+PC IP65 crown pod + 6061 CNC camera pod, GoPro 3-prong + VHB mount

## Cost Delta

| Line | $ / unit |
|---|---:|
| BOM @ 1k (assembled, ex-factory) | $182 |
| Landed cost (sea LCL + 3PL, no tariff) | $200 |
| Blended ASP (60% DTC, 30% distributor, 10% union) | $420 |
| MSRP (SCR-100 base) | $499 |
| MSRP (SCR-200 premium w/ solar + OLED) | $599 |
| 3M Peltor WS ALERT (voice-only competitor) | $399 |
| Sena Tufftalk Lite (voice-only competitor) | $269 |
| Sonim XP10 + RPTT (handheld competitor) | $799 |

## Profitability

- **Gross margin (year 1, blended ASP):** **44.9%** — within 40-55% hardware startup target band; path to **52%** by year 3 via 5k-unit BOM ($148) + ASP lift post-OSHA cert.
- **Break-even:** **5,624 units cumulative** against $1.06 M year-1 fixed + working capital (engineering, cert, tooling, inventory, S&M).
- **Year-1 conservative revenue:** **$420,000** on 1,000 pilot units (1 union local + 2 GC pilots).
- **5-yr SOM:** ~40,000 units between DHH ironworkers, insurance-driven hearing-crew adoption, crane rental fleets, and EU/AU expansion -> ~$16 M cumulative revenue at maintained margin.
- **Moat:** OSHA-cert pathway + DHH-accessibility framing (ADA Title I) + union-school training data corpus. Insurance-carrier rebate (5-10% on builder's risk) drives pull-through once one carrier signs on.

*All figures are verify-before-order estimates; live LCSC/JLCPCB quotes and channel terms will refine.*
