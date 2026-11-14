# EchoPalm-CAB — One-Page Summary

## Headline

Silent ASL gesture-to-haptic alert for deaf emergency-vehicle occupants — automotive-rated, radar-driven, no screen required.

---

## Problem

Deaf and Hard-of-Hearing paramedics, K-9 officers, and SWAT operators riding in emergency vehicles cannot alert their driver during a lights-and-siren run. Voice is masked by 110 dB sirens. Visual signals are blocked by partitions and forward attention requirements. Tapping the bulkhead is ambiguous. The result: a deaf rear-seat occupant has zero reliable interrupt channel to the driver during the highest-risk moments of emergency response.

---

## Solution

EchoPalm-CAB is a headliner-mounted module that uses a TI AWR1843 77 GHz FMCW automotive radar to watch the rear-passenger zone for two to three trained ASL wakeword gestures (HELP-NOW, STOP-VEHICLE, PATIENT-CRITICAL). When a gesture is recognized with sufficient confidence, it fires two haptic actuators simultaneously: an ERM in the driver's seatback (unmissable through the seat, even at highway speed) and an LRA ring on the steering wheel. Each gesture maps to a distinct vibration pattern the driver learns in a 15-minute onboarding session. No app, no screen, no voice required.

The system is intentionally narrow in vocabulary — three gestures, not full ASL — because robustness under cab vibration and low false-positive rate matter more than expressiveness in a 90-second emergency run.

---

## Tech Stack

TI AWR1843 76GHz automotive radar (AEC-Q100) + ICM-42688-P IMU + ESP32-S3 (FreeRTOS, int8 CRNN gesture inference, TFLite Micro) + TJA1051T CAN FD transceiver (SAE J1939) + dual DRV2605L haptic drivers + seatback ERM + steering-wheel LRA ring; MIL-810G shock/vibe rated enclosure; 12/24 V vehicle power with ISO 7637-2 transient protection; OTA via Wi-Fi when in fleet bay.

---

## Economics (Fermi Estimates — Planning Use Only)

| Line | Figure |
|---|---|
| BOM + Assembly COGS @1k units | ~$175/unit |
| COGS @5k units (qual amortized) | ~$112/unit |
| Target retail / fleet price | $1,500/unit |
| Gross margin @1k | ~88% |
| Gross margin @5k (direct fleet) | ~92% gross; ~57% after distributor |
| Total qualification budget (est.) | ~$65,000 one-time |

No direct comparable product exists. Adjacent safety electronics (Mobileye 8 Connect, ~$800-1,500 installed) address driver-facing alerts, not occupant-to-driver communication. EchoPalm-CAB is uncontested in its specific niche.

---

## Market (Fermi)

~550,000 addressable US+EU emergency vehicles with a rear-occupant position. Conservative DHH crew penetration of 8-12% yields ~44,000-66,000 target vehicles. At a 7-year replacement cycle and 5-15% market penetration in years 3-5, the annual unit opportunity is 315-1,400 units/year, generating $0.5M-$1.9M ARR at fleet pricing. A single large-city fleet contract (FDNY, LAPD scale) represents 200-500 units and could anchor the business.

---

## Why Now

Three converging factors: (1) ADA enforcement pressure on public safety agencies to accommodate DHH first responders is increasing, creating procurement urgency; (2) 77 GHz automotive radar SoCs (AWR1843) are now cost-accessible and AEC-Q100 qualified, making automotive-grade gesture sensing viable below $30/unit; (3) embedded ML inference on ESP32-class hardware (TFLite Micro, int8 CRNN) enables a $3 MCU to run gesture recognition that required a $50 processor three years ago. The convergence of regulatory pressure, affordable automotive-grade radar, and edge inference makes 2025-2026 the right entry window before a larger automotive or safety electronics company addresses the gap.

---

> All financial figures are Fermi estimates for planning purposes. Part numbers are training-data references — verify before procurement. See PRODUCTION_BOM.csv and ROI_ANALYSIS.md for full detail.
