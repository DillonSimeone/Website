# ChillBlast Freezer — One-Page Summary

## Cryo-Rated Haptic Mitt + Shoulder Puck for Deaf Cold-Storage Workers

---

**The problem:** ~150,000 US cold-storage workers (and ~1M globally) operate at -20 to -30 C under 85-95 dBA ammonia-system noise wearing thick hoods. Voice radios fail; DHH workers are functionally excluded; OSHA's 2024 cold-stress enforcement memos now call for "objective monitoring" of skin temperature that supervisors currently estimate with stopwatches. No purpose-built product addresses comms accessibility and cold-stress monitoring together in this environment.

**The solution:** ChillBlast pairs a cryo-rated insulated mitt (4-channel LRA array on pinky-edge / back-of-hand / cuff, with MAX30205 skin-temp at radial artery and back-of-hand) with a shoulder-clipped mmWave + ToF puck that recognizes a 20-sign warehouse vocabulary (PICK, PLACE, COUNT, ERROR, SUPERVISOR, BREAK, and 14 others) even through bulky cold gloves and frosted face shields. A frostbite-risk mode pulses the cuff LRA when skin temp drops below configurable thresholds and signs a tamper-evident OSHA evidence log entry. Forklift mast-mounted clusters relay ESP-NOW mesh between aisles and uplink to existing warehouse WiFi6 infrastructure.

**Tech stack:** TI IWR1443 79 GHz mmWave + STMicro VL53L8CX 8x8 ToF / ESP32-S3-WROOM-1U inference + ESP-NOW mesh / ESP32-C6 mitt MCU (WiFi6 + 802.15.4 + BLE5.3) / 4x Vybronics VLV101040A cold-rated LRAs / 2x MAX30205 skin-temp / LiSOCl2 primary cells (Saft LSH14 mitt + Tadiran TL-5104 puck) or li-ion + heater foil alt SKU / TPU 95A low-temp shell IP66 / Cordura+Thinsulate composite mitt / forklift cluster on PoE+ with vibration isolators. All part numbers verify-before-order.

**Economics (Fermi — verify):**
- COGS per kit (mitt + shoulder puck) @ 1k: **$225.35**
- Suggested retail: **$2,200 bundle** ($850 mitt + $1,550 puck); $480 forklift cluster
- Gross margin: **~73% direct / ~53% through distributor**
- 5-yr addressable units: ~67,600 kits + 25,000 clusters + 9,500 charger docks
- 5-yr revenue: **~$165M direct / ~$104M net of distributor share**; break-even ~2,180 kits

**Differentiators vs. silent-siren-industrial (the precursor concept):** cold-environment electronics (specifically chosen for -30 C continuous operation — LiSOCl2 chemistry instead of li-ion; TPU 95A low-temp shell instead of polycarbonate; X7R MLCC and -40 C industrial-bin silicon throughout), gloved-hand recognition (not bare-hand ASL), worker-worn shoulder-puck form factor on rail-cart or harness (not ceiling-fixed), frostbite biometric with OSHA evidence chain, and forklift mast cluster (mobile mesh relay, not fixed PoE node).

**Why now:** OSHA's 2024 cold-stress enforcement gives EHS managers a regulatory hook. Lineage and Americold have publicly committed to DEI workforce expansion that requires DHH accessibility kits. mmWave silicon (TI IWR1443 industrial-bin) is in volume production. ESP32-C6 with WiFi6 + 802.15.4 enables seamless integration with existing warehouse BMS networks. No incumbent ships a cold-rated DHH comms product — the category is unoccupied and the regulatory pressure makes the budget conversation easy.
