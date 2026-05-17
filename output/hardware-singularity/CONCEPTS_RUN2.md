# Hardware Singularity — Run 2 Concept Roster

Generated 2026-05-16. Scope: 10 NEW concepts at the intersection of haptics × sign-language CV × ruggedized computing, deduplicated against Run 1 and the broader research library.

## Deduplication audit

Scanned before spawning:
- `public/Projects/` — AgentArsenal, arcGun, ChooseYourOwnAdventure, CottageGrove912Group, CustomGameEngine, GameOfLife
- `public/ESP32Codes/` — DataGlove sender/receiver, DeafClock, ESP32-CAM streaming, CymaSpace FFT, FastLED blending, MPU6050, CYD, CarrieBrainBadge, bluetooth-mic, doorbell-leader/follower, espnow, haptic-control-inmp441, haptic-follower-drv2605l
- `output/hapticblaze/` — open Pixelblaze-style audio-reactive haptic firmware
- `output/dhh-curriculum/` — DHH STEM curriculum
- `output/firmware-multitarget/` — 20+ ESP32 reference firmwares
- `output/pixelblaze-lite/`, `output/babel-visualizer/`
- `output/hardware-singularity/BLUEPRINT_REPOSITORY/` (Run 1, listed in `CONCEPTS.md`)

**Vectors explicitly avoided** (already in Run 1): factory mmWave overhead, ATEX petrochem glove, public ASL kiosk, emergency-vehicle cab, SAR forearm compass, SCUBA bone-conduction, underwater diver-to-tender, combat medic trace-pad, classroom IR ceiling, welding helmet HUD.

## Run 2 roster

| # | Slug | Domain | Key differentiator vs. library + Run 1 |
|---|------|--------|----------------------------------------|
| 1 | scaffoldr-crew | Construction high-iron / scaffold | LoRa-mesh hardhat with bone-conduction + crane-signal CV (vertical work, not flat factory) |
| 2 | groundwave-aviation | Airport ramp / apron ground crew | Hi-vis vest IMU array reads marshaller signals, jet-noise-immune (no ASL recognition, marshalling) |
| 3 | tillermate-harvest | Agricultural tractor cab + field crew | Dust-immune mmWave ASL recognition from cab toward field workers (rural, GPS-rover backbone) |
| 4 | nurseround-clinical | Hospital bedside DHH patient | Pillow IMU detects in-bed ASL request, autoclavable, MDR Class IIa (clinical, not public-kiosk) |
| 5 | trackside-motorsport | Pit-crew + driver fire-rated comms | Sub-1ms haptic flagcalls inside Nomex suit, helmet HUD (motorsport, not emergency-vehicle) |
| 6 | substation-lineman | Electric utility HV bucket truck | Lightning-impulse rated tactile + bucket-to-ground ASL (HV, not ATEX chemical) |
| 7 | chillblast-freezer | Cold-storage −30 °C warehouse | Cold-rated LRA glove + overhead mmWave (cold env, not generic factory) |
| 8 | wavedeck-maritime | Offshore platform / deck crew | Mast-mounted flag-signal CV + fall-overboard directional haptic homing (surface, not subsea) |
| 9 | mineshaft-deep | Underground hard-rock mining | Through-rock VLF haptic + dust-immune ToF, MSHA-rated (sub-surface, not water/space) |
| 10 | cyclecall-peloton | Pro cycling team DHH rider comm | Aero bar tap-pad + saddle haptic, team mesh, crash-G-rated (sport, athletic, not industrial) |

## Methodology

Same as Run 1: one builder agent per concept produces ARCHITECTURE.md, PRODUCTION_BOM.csv, ROI_ANALYSIS.md, SUMMARY.md. Builders are instructed to mark LCSC/JLCPCB part numbers and pricing as "verify-before-order" since live stock/price cannot be checked from this session.
