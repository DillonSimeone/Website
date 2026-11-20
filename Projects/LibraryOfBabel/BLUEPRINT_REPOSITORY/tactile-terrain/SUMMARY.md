# TactileTerrain — One-Page Summary

## Navigate by Feel. No Eyes. No Ears. No Compromise.

---

## The Problem

Three operator profiles share one critical failure mode: navigating in environments where both vision and hearing are simultaneously denied.

A firefighter crawling through a smoke-filled high-rise at zero visibility cannot spare a hand for a device and cannot hear a radio over SCBA noise. A mountain SAR team in a whiteout blizzard needs to know where the casualty beacon is relative to their body — not a screen, a pull in the skin. A combat diver approaching an objective in zero-vis harbor water cannot use lights, cannot surface for GPS, and cannot emit audio signals detectable by adversaries.

Current solutions — GPS watches, audio earpieces, HMDs — require eyes, ears, or bare hands. None are rated for the actual conditions these operators face. Disorientation in structural fires is a documented leading cause of firefighter line-of-duty death. The interface layer is the gap, not the sensor technology.

---

## The Solution

TactileTerrain is a 110mm flex-PCB forearm band with 8 LRA haptic actuators positioned around the forearm at 45-degree increments. The heading to a waypoint fires the geographically correct actuator. Distance encodes as pulse rate — slow means far, fast means close, continuous means arrived. Teammate position and obstacle proximity fire distinct waveforms the operator learns in 15 minutes of training.

A central control pod (60x40x18mm, machined aluminum, IP67) houses the full sensor suite and radio. The band attaches to forearm plate carriers or MOLLE sleeves and takes standard 18650 cells that hot-swap in under 10 seconds without powering down.

---

## Tech Stack

u-blox MAX-F10S dual-band GNSS + ST LSM6DSV 6-axis IMU + Bosch BMM150 magnetometer fused via Mahony AHRS on an ESP32-S3 SoC, driving 8x TI DRV2605L haptic controllers over I2C, with Semtech SX1262 LoRa for team mesh position sharing; FreeRTOS firmware, BLE companion app for waypoint upload, IP67/MIL-810 rated enclosure.

---

## Economics (Fermi Estimates — See ROI_ANALYSIS.md)

| Metric | Value |
|---|---|
| BOM cost @1k units | ~$97 |
| Total COGS (BOM + assembly + logistics) | ~$197 |
| Commercial retail price | $499 |
| DOD/DHS procurement price (est.) | $890-$1,200 |
| Blended gross margin | ~74% |
| US addressable market (Fermi) | ~140,000 operators |
| Year 1-3 unit target (base case) | ~5,000 units |
| Base-case 3-year revenue | ~$3.75M |

---

## Why Now

Three convergent trends make 2025-2027 the right window:

**1. Sensor miniaturization crossed the threshold.** Dual-band L1/L5 GNSS in a 9.7mm package (MAX-F10S) and IMUs with embedded ML cores (LSM6DSV) only became production-ready in 2022-2024. Building this product two years ago would have required a form factor too large for forearm wear.

**2. LRA actuators reached tactical-grade quality.** The Vybronics VG0832 class of 8mm LRAs offers response latency under 10ms, 100M+ cycle life, and a resonant frequency stable enough for waveform differentiation through thick gloves — necessary conditions for this product that did not exist at acceptable price points until recently.

**3. LoRa mesh is now a mature, fielded technology.** Meshtastic and similar open-source LoRa mesh platforms have proven the hardware and protocol stack in real SAR deployments since 2021, dramatically reducing RF mesh development risk.

**4. The tactical wearable market has budget and demonstrated appetite.** SOCOM FY2025 budget included explicit line items for squad-level sensor integration and human performance augmentation. DHS S&T has funded wearable first-responder navigation in multiple SBIR solicitations. The procurement infrastructure exists and is actively looking for solutions.

TactileTerrain has no direct comparable. The closest adjacent products (Garmin tactix, PULSE wristband, tactical audio headsets) solve adjacent problems in different modalities. The forearm haptic navigation niche is currently empty.
