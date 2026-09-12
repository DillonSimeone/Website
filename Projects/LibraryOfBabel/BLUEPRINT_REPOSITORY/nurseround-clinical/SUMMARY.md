# nurseround-clinical — Summary

**What:** Hospital-bedside DHH-patient call & comms. Sealed silicone-overmolded pillow insert recognizes 30 ASL request signs from a supine patient via two spaced IMUs (head + jaw) and on-device TinyML, replacing the binary nurse-call button with semantic requests. PoE puck renders request on 2.9" e-paper with categorized vibrotactile haptics (P1 critical → P4 ambient), forwards HL7 FHIR observation to EHR, gates ACK back.

**Why now:** Nurse-call buttons are functionally useless for Deaf/HH patients who cannot follow up verbally — unaddressed ADA / Section 504 exposure.

**Diff vs. handshake-kiosk:** clinical bedside (not kiosk); IMU-on-pillow (no depth-cam, no PHI imagery); categorized puck output; explicit 510(k) Class II / MDR IIa path.

**Stack:** Pillow nRF5340 + 2×ICM-42688-P + Qi 5W + LiPo 850mAh + MED-4750 silicone + IPX7. Puck ESP32-S3 + DRV2605L + 2.9" e-paper + W5500 + Si3402-B PoE. TFLite-Micro 78kB INT8, BLE-Mesh 1.1, TLS 1.3 mTLS to EHR. No PHI on device.

**Regulatory:** FDA 510(k) under 21 CFR 880.6310; MDR IIa Rule 11. Mid combined cost $287k; survives $672k catastrophic.

**Unit econ @1k (verify-before-order):** Pillow $53.96 + puck $41.17 (6:1 share). Loaded $148.84/bed. Net $590.75/bed Med-Surg. GM ~75% base, 63–80% realistic, >40% crisis floor.

**Market:** US TAM 2.65M beds. SAM (DHH) 79.5k beds = $46.9M. SOM yr-5 (8%) ~6.36k beds / $3.75M/yr + service.

**Break-even:** ~1,023 beds (~13 accounts). 18–22 mo to first ship.

**Risks:** supine-signing accuracy (→ spaced array + supine corpus); predicate match (→ FDA Q-Sub); hygiene (→ disposable sleeve, autoclave Rev-B roadmap); reg overrun (sensitivity-survivable).

**Status:** All numbers verify-before-order.
