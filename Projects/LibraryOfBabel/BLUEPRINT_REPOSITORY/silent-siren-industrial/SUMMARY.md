# Silent Siren Industrial — One-Page Summary

## Ceiling-Mounted ASL Distress Detection for Deaf Factory Workers

---

**The problem:** Roughly 1–2% of US manufacturing workers are profoundly deaf. When they are injured, trapped, or witness an emergency, they have no reliable way to summon help — panic buttons require reaching a fixed location, audible alarms are useless, and visual strobes are routinely missed in high-ambient-light factory environments. Post-2024 OSHA guidance on accessibility of emergency communications is pushing manufacturers to address this gap, but no purpose-built product exists.

**The solution:** Silent Siren is a ceiling-mounted sensor cluster that passively watches a worker's signing from 4–6 m overhead, classifies four high-priority ASL distress signs (HELP, HURT, FIRE, MEDIC) using fused 60 GHz mmWave radar and 8×8 ToF depth data, and instantly relays an alert via 915 MHz LoRa mesh to supervisor wristbands anywhere on the plant floor. The worker wears nothing. The system requires no camera, no glove, and no behavioral change — a deaf worker already signs to communicate. The supervisor receives a haptic + visual alert on a wristband within 2 seconds of sign completion, identifying the worker zone and sign type. One PoE+ Cat6 run to the ceiling installs a complete zone.

**Tech stack:** TI IWR6843AOP mmWave radar + STMicro VL53L7CX 8×8 ToF / NXP i.MX 8M Mini SoM running TFLite INT8 gesture CNN / Semtech SX1262 LoRa mesh (Meshtastic-compatible) / ESP32-S3 wristband with DRV2605L LRA haptic / IK10 NEMA 4X polycarbonate dome, PoE+ powered.

**Economics (Fermi estimates — verify independently):**
- COGS per kit (1 ceiling unit + 2 wristbands) @ 1k volume: **$332.65**
- Suggested retail: **$1,495 per kit**
- Gross margin: **~78% direct / ~68% through distributor**
- Addressable install base: ~3,000 early-adopter US facilities x 6 zones = 18,000 units over 5 years
- Estimated 5-year revenue: **~$18.8M** at distributor sell-in; $2.7M ARR upside from firmware subscription

**Why now:** OSHA's post-2024 emergency-communication accessibility guidance gives EHS managers a regulatory hook to justify budget. No overhead, camera-free, glove-free ASL distress detection product exists — the category is uncrowded. mmWave radar silicon (TI IWR6843AOP) has reached the $35–40 cost point that makes a $1,500 ceiling unit commercially viable. LoRa mesh firmware (Meshtastic) is mature and Apache-licensed, eliminating RF stack development risk. The window to establish a category-defining position is open.
