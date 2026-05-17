# Hardware Singularity — Run 1 Concept Roster

Generated 2026-05-16. Scope: 10 concepts at the intersection of haptics × sign-language CV × ruggedized computing.

Each concept was selected to avoid duplication with the existing library:
- `public/Projects/` (AgentArsenal, arcGun, ChooseYourOwnAdventure, CottageGrove912Group, CustomGameEngine, GameOfLife)
- `public/ESP32Codes/` (Microphones, Communications, Visuals & Art incl. FFT/FastLED, Robotics incl. DataGlove sender/receiver, Cameras incl. ESP32-CAM streaming, Clocks incl. DeafClock, MPU6050, CYD, CarrieBrainBadge)
- Prior haptic work: PULSE (audio-reactive broadcast), audio-reactive haptics, web-controlled PWM

## Roster

| # | Slug | Domain | Key differentiator vs. library |
|---|------|--------|--------------------------------|
| 1 | silent-siren-industrial | Factory floor DHH safety | Overhead mmWave/ToF (not glove input like DataGlove) |
| 2 | griplogic-atex | Petrochem operator alarm glove | Output glove, electrotactile, alarm-as-ASL semantics |
| 3 | handshake-kiosk | Public-space ASL triage | Zero-touch depth-cam recognition, IP65 enclosure |
| 4 | echopalm-cab | Emergency-vehicle cab alert | 60GHz cabin radar, ASL wakeword, seat haptic |
| 5 | tactile-terrain | SAR/military forearm compass | LRA bearing encoding in zero-vis ops |
| 6 | parashield-aqua | DHH SCUBA bone-conduction | 100m-rated parametric SLA shell, Morse-ASL on mastoid |
| 7 | subsonic-signer | Underwater diver-to-tender CV | Hyperbaric housing, Coral TPU, vest spatial haptic |
| 8 | fieldmend-medic | Combat/SAR medic trace-pad | Inverted flow: casualty traces ASL on medic's forearm |
| 9 | hushnet-classroom | DHH-friendly classroom IR mesh | Ceiling IR cluster queues raised-hand handshapes |
| 10 | vibeweld-helmet | Welding helmet ASL HUD + neckband | Depth-cam through ADV, neck haptic for arc-on commands |

## Methodology note

User's original prompt called for four specialist agents per concept (BUILDER / BOM / VC / GTM). Consolidated to **one builder agent per concept** that produces all four deliverables — same outputs, 4x less fan-out. Each builder is briefed to flag any part numbers or pricing as "verify-before-order" since LCSC/JLCPCB stock and prices cannot be live-checked from this session.
