# MASTER BLUEPRINT INDEX — Run 2

Generated 2026-05-16 by the Hardware Singularity meta-orchestrator. Covers the 10 Run-2 blueprints. Run-1 (10 prior concepts, see `CONCEPTS.md` and the sibling folders) is referenced at the bottom.

> All numbers below are first-pass estimates produced from architecture briefs. Every part number and price is flagged `verify-before-order` in the underlying BOM files — refresh against live LCSC / JLCPCB / distributor quotes before tape-out or fundraising.

---

## 1. Blueprint summaries

### 1.1 scaffoldr-crew — construction high-iron / scaffold crew comms
Hardhat-mount LoRa-mesh node with bone-conduction + downward depth cam recognizing ASME B30.5 / OSHA crane signals; haptic relay to crew earcups. ANSI Z89.1 Type II hardhat clip-on. **Vertical work, not floor.** BOM-at-1k ~$182, break-even ~5,624 units.

### 1.2 groundwave-aviation — airport ramp marshaller vest
Hi-vis ANSI/ISEA 107 Class 3 vest with 4× ICM-42688-P IMU constellation + ESP32-S3 + LoRa SX1262, TinyML classifier for 12 ICAO marshalling signals + 3 custom. Reverse-channel shoulder haptics from tower. **Outbound signal recognition** (wearer signs, vest reads). BOM ~$141.45 / MSRP $349 / 51–60% GM / BE ~3,650.

### 1.3 tillermate-harvest — agricultural tractor + field-crew CV
Roof module (TI IWR6843AOP mmWave + OV9281 stereo + Hailo-8L NPU) reads field-worker hand signals at 50 m through dust; cab seat puck + wristbands for reverse channel; LoRa ranch mesh + LTE-M backhaul. IP6K9K, ISO 5008 vibration. Kit COGS $788 / MSRP $2,625 / 50% GM / BE 2,283 kits.

### 1.4 nurseround-clinical — hospital bedside DHH-patient ASL call
Sealed silicone-overmolded pillow insert with dual ICM-42688-P + nRF5340 + Qi RX; on-device TinyML for 30-sign request vocabulary; PoE puck (ESP32-S3 + e-paper + DRV2605L) routes HL7 FHIR observation to EHR. FDA 510(k) Class II / EU MDR IIa path. $148.84/bed loaded / Net $590.75/bed Med-Surg / 63–80% GM / **BE 1,023 beds (~13 accounts)** / Regulatory $287k mid.

### 1.5 trackside-motorsport — pit-crew & driver fire-rated flagcalls
Belt module (STM32G4 + nRF52840 + SX1262, dual-redundant RF) drives 8-channel LRA patches inside Nomex; helmet chin pad replies; pit-wall RP2040 base. Sub-1 ms transducer latency, ≤5 ms end-to-end. FIA 8856-2018 underwear-layer informational. **$321 COGS / $1,500 MSRP / 79% GM / BE ~56 kits / $66k pre-revenue burn.**

### 1.6 substation-lineman — HV bucket-truck DHH lineman cuff
Forearm cuff over Class-2/3 rubber sleeve: capacitive differential E-field front-end (LMC662 + INA826 + MCP3564R) drives escalating haptics keyed to OSHA 1910.269 / IEEE 516 MAD; Arducam Mega 5MP + MediaPipe-on-ESP32-S3 sends ASL landmarks to ground crew via licensed utility VHF (SA868-V + CMX901). Dielectric witness per ASTM F496. Cuff COGS $295.90 / $2,950 / 51–55% GM / BE ~191 cuffs / NRE ~$400k.

### 1.7 chillblast-freezer — −30 °C cold-storage warehouse mitt + puck
Mitt (ESP32-C6 + 4× DRV2605L + dual MAX30205 frostbite biometric + LiSOCl₂ primary or PowerStream li-ion w/ heater foil) plus shoulder-cart puck (IWR1443 + VL53L8CX ToF + ESP32-S3 + EFR32MG24 mesh) and forklift cluster (PoE+). TPU 95A low-temp shore, IP66, condensation management. Kit COGS $225.35 / $2,200 bundle / 53–73% GM / BE 2,180 kits.

### 1.8 wavedeck-maritime — deck-crew PFD beacon + mast CV node
PFD module (nRF52840 + Si4463 LoRa + u-blox MAX-M10S + BMI270/BMM350/MS5837 + DRV2605 quad LRA + licensed AIS-SART OEM + Hammar hydrostatic release) pairs with mast node (Jetson Orin Nano + IMX715 RGB + FLIR Boson 320 thermal). ITU-R M.1371 class-M / IEC 61097-14/7 / GMDSS interop. Fleet kit COGS $12,600 / $15,900 retail / 44% GM / BE ~98 fleet kits / NRE ~$320k.

### 1.9 mineshaft-deep — underground MSHA-Permissible miner helmet
Helmet (ESP32-S3 + Arducam ToF + dust filter + 457 kHz coil + cap-lamp regulatory backup), belt pack (STM32L4 + 457 kHz TX/RX + LRA quad + 2.4 GHz mesh + NDIR methane head), surface gateway (RP2040 + 457 kHz TX array). Intrinsically Safe Ex ia I Ma (CH₄ ignition 0.28 mJ → designed <0.1 mJ under double fault). MSHA 30 CFR Part 23/27 + IECEx. Loaded COGS $927 / $1,685 list / 45% GM / NRE $625k base / break-even mid-Y4.

### 1.10 cyclecall-peloton — pro/club cycling DHH rider team comm
Capacitive bar-tape tap pad (AT42QT1070) + top-tube hub (nRF52840 + GNSS + ANT+ + crash IMU) + TDK PowerHap saddle puck + AS3415 bone-conduction collar + DS-car Android dongle. Bluetooth Mesh 1.1 over LE 1M, ESB fallback. UCI 1.3.024 tactile-not-voice gap. Rider kit COGS $142 / $1,099 / 81–88% GM / Team package $9,990 / **BE ~185 team packages mid-Y2** / TAM $6.86M.

---

## 2. Master ROI table

> Sorted by capital efficiency (lowest break-even × unit count first).

| # | Slug | COGS/unit | MSRP | Blended GM | Break-even | NRE / Reg | Notes |
|---|------|-----------|------|------------|------------|-----------|-------|
| 5 | trackside-motorsport | $321 | $1,500 | **79 %** | **~56 kits** | $66 k | Highest capital efficiency. |
| 8 | wavedeck-maritime | $12.6 k fleet | $15.9 k fleet | 44–50 % | ~98 fleet kits | $320 k | Big-ticket B2B; type-approval gates. |
| 10 | cyclecall-peloton | $142 rider | $1,099 rider | 81–88 % | ~185 team pkgs | low | Athletic-premium margins. |
| 6 | substation-lineman | $295.90 cuff | $2,950 cuff | 51–55 % | ~191 cuffs | ~$400 k | IOU procurement cycle long. |
| 4 | nurseround-clinical | $148.84 / bed loaded | $590.75 / bed net | 63–80 % | ~1,023 beds | $287 k mid | Largest TAM (2.65 M beds). |
| 7 | chillblast-freezer | $225.35 kit | $2,200 bundle | 53–73 % | ~2,180 kits | mod | Workforce + safety dual value. |
| 3 | tillermate-harvest | $788 / kit | $2,625 | 50 % | ~2,283 kits | mod | Dealer channel friction. |
| 2 | groundwave-aviation | $141.45 | $349 | 51–60 % | ~3,650 | mod | FCC Part 15 / 90 simple. |
| 1 | scaffoldr-crew | $182.18 | (BE 5,624) | mid | ~5,624 | mod | Highest unit BE; OSHA path long. |
| 9 | mineshaft-deep | $927 / miner | $1,685 | 45 % | mid-Y4 base | $625 k base | Heaviest IS / MSHA cert load. |

---

## 3. Profitability winner & next steps

**Winner: `trackside-motorsport`.** Best combination of:

- Lowest break-even (~56 kits / ~$66 k pre-revenue burn).
- Premium margin envelope (79 %, defensible at 65 % even with discounting).
- Strong willingness-to-pay benchmark (Stilo helmet $1.5–4 k, FIA HANS $700+, no comparable DHH product on market).
- Short certification list: FCC Part 15 + FIA 8856 underwear-layer informational; no medical-device, no MSHA, no AIS type-approval.
- Founder-adjacent buyer (club racers, regional FIA series) — fast feedback loops, no IOU/hospital procurement cycle.

### Recommended next steps (90-day plan)

1. **Week 1–2 — Lock the BOM.** Pull live LCSC / JLCPCB quotes on all 46 line items; eliminate `C?????` placeholders. Confirm STM32G4 + nRF52840 stock against the dual-redundant RF design. Target landed cost ≤ $310.
2. **Week 2–4 — Belt-module Rev-A PCB.** Two-board sandwich (RF + power on one, MCU + I²C mux on the other). Submit to JLCPCB SMT with X7R caps and conformal coating.
3. **Week 3–6 — Patch-array prototype.** Source TDK PowerHap or AAC 1040W LRAs; embed in silicone substrate over Nomex carrier. Bench-measure transducer latency end-to-end; budget ≤ 1 ms.
4. **Week 4–8 — Track-day pilot.** SCCA / NASA-regional partner; 2 cars + 4 crew. Capture flag-call latency under live RF (paddock 2.4 GHz dense + GSM). Run a DHH-driver pairing with a national federation deaf-motorsport advocate (Daniel Mancina-tier outreach).
5. **Week 6–10 — FIA / SCCA dossier draft.** GCR 9.16 fire-rating math, FCC Part 15.247 test plan, FIA 8856-2018 layering compatibility note. *Not* a homologation push yet — a "no objection to use" letter is enough for Rev-A.
6. **Week 8–12 — Pre-seed raise.** $750 k–$1.2 M target; lead with the BE-56 number and the FIA gap. Use the trackside-motorsport `ROI_ANALYSIS.md` sensitivity table verbatim.

### Honorable mentions (parallel-track candidates)

- **cyclecall-peloton** — second-best capital efficiency at 185 team packages and 88 % GM. UCI rule-watch is the only structural risk. Stand it up as a sister-brand under the same firmware platform; share BT-Mesh stack with trackside.
- **nurseround-clinical** — largest dollar-TAM ($1.5 B+ at net $590 / bed × 2.65 M beds). Heavy 510(k) drag means it is a slower, capital-heavier path — but it is the right *second* product once trackside is generating revenue and the firmware platform has shipped. Begin FDA Q-Sub conversations in parallel from month 6.

### Cross-cutting reuse

The 10 Run-2 blueprints share enough silicon to justify a common **firmware platform** (`output/firmware-multitarget/` already hosts ESP32-S3 / nRF52840 reference firmwares for haptic, LoRa, IMU, FastLED — extend it). Specifically:

- 6 of 10 use ESP32-S3 or ESP32-C6 — share BLE-Mesh + DRV2605L drivers.
- 4 of 10 use nRF52840 / nRF5340 — share Bluetooth-Mesh-1.1 provisioning.
- 5 of 10 use DRV2605L LRA driver — share waveform library (extend `hapticblaze`).
- 4 of 10 use SX1262 LoRa — share PHY layer + AES-128 frame.

A unified HAL (drafted in `output/hapticblaze/HAL_SPEC.md`) cuts each subsequent project's firmware cost by 40–60 %.

---

## 4. Run-1 reference

Run 1 (2026-05-16, earlier) produced 10 prior blueprints. Listed for cross-reference and deduplication audit only — not re-summarised here:

`echopalm-cab`, `fieldmend-medic`, `griplogic-atex`, `handshake-kiosk`, `hushnet-classroom`, `parashield-aqua`, `silent-siren-industrial`, `subsonic-signer`, `tactile-terrain`, `vibeweld-helmet`. See `CONCEPTS.md` and per-folder deliverables under `BLUEPRINT_REPOSITORY/`.

Run 2 expressly avoided overlap with Run 1 — see `CONCEPTS_RUN2.md` for the deduplication audit.

---

## 5. Open questions for the founder

1. **Founder cycle vs. operator cycle.** Trackside-motorsport is the right *first* product — but is the cap-table strategy a single-product play or a platform-firmware play? The HAL reuse argues for platform.
2. **DHH-first or capability-first marketing?** Each blueprint can be sold "the only way DHH workers can do this job" or "the safer/faster way *everyone* can do this job." The latter is a bigger market; the former is grant-eligible (ADA, RSA, state vocational-rehab). Pick early.
3. **Manufacturing geography.** Several blueprints (mineshaft-deep, substation-lineman, wavedeck-maritime) carry US procurement preferences (Build America / Buy America, IECEx-EU). Trackside and cyclecall do not. China-CM is cheaper but slower for the regulated SKUs.
4. **Pricing power vs. inclusion mission.** 79–88 % GM is justifiable on capability grounds but uncomfortable for a DHH-inclusion narrative. Decide before the first press cycle.

All part numbers, pricing, regulatory references, and break-even math in this index and the underlying blueprints are **first-pass estimates** to be re-verified before commitment.
