# Feel the Difference: A Haptic Petting Zoo, Speaker Notes

Slide 1: Feel the Difference (title)
- Welcome attendees to Teardown 2026 DreamTENT workshop.
- Press arrow or click once to authorize microphone for live audio-reactive visuals.
- Title canvas: blue circle and yellow square bounce around the slide continuously.

Slide 2: Welcome to the Haptic Petting Zoo
- Most people only know phone vibration. Today they feel many actuator types at the stations.
- QR codes at every exhibit link to BOMs and source on GitHub.

Slide 3: Mapping Accessibility to Haptics
- Universal Music Design mission: shared performance spaces for hearing and Deaf artists.
- Reference GestoLumina and Sonic Agency (ASSETS '25) briefly.

Slide 4: Core Hardware: Beetle ESP32-C6
- Beetle C6 at $4.90: built-in LiPo charger is the killer feature for wearables.
- Warn about cheap TP4056 modules. Safety story from Prezi.

Slide 5: Software – MicroPython vs PlatformIO
- Two-column comparison. MicroPython: instant REPL, great for workshops, but heavier on power and limited libraries.
- PlatformIO: compiled C/C++, massive ecosystem, amazing CLI. This is the clear winner for production firmware and developing shims.
- Emphasize that PlatformIO's CLI is language-agnostic: wrap it in Python, Node, Electron, or anything else and you get a custom GUI toolchain in an afternoon.
- Bottom row: animated mockup of the PlatformIO Web Uploader — a thin web GUI over `pio run -t upload`. Walk through select project, flash, ESP32 blinks.
- Mention the uploader lives in the ESP32Codes/_tooling/uploader directory.

Slide 6: GestoLumina & UMD Journey
- Use the three photos on the right as visual anchors while you walk the timeline.
- GeLu research to masks to datagloves. Keep it quick.

Slide 7: Mechanoreceptors
- All three frequency waves animate simultaneously. No clicking required.
- Tie each band to actuator types at the petting zoo stations.

Slide 8: Solenoids & Servos
- Live animation on the right: solenoid tap and servo pressure arm.
- Send attendees to physical stations after this slide.

Slide 9: ERMs & LRAs
- ERM disc spins with live mid energy. LRA mass shuttles with treble.
- Correct LRA myth: off-resonance still vibrates, just inefficient (heat, not silence).

Slide 10: How Vibration Motors Work
- Cross-section animation: coil, magnets, offset mass.
- Plain language: wire around a shaft, magnetic fields push it. That oscillation is vibration.

Slide 11: Advanced Modalities
- Full-size table with product photos restored.
- Bass shaker AC requirement, piezo voltage, Peltier current, fan noise.

Slide 12: MOSFETs & H-Bridges
- PWM ribbon follows live audio envelope.
- GPIO to MOSFET to motor power path.

Slide 13: USB-C PD Decoy
- Under one dollar. Unlocks 9 to 20V for heavy actuators.

Slide 14: DSP FFT & Frequency Mapping
- Top: live mic bins. Bottom: floating ERM/LRA swarm colored by bass/mid/treble.
- Red motors react to bass, yellow to mid, blue to treble.

Slide 15: Live Fleet Command
- CONNECTION (read the box on slide):
  - Fleet master uses WiFi SoftAP at 192.168.4.1, NOT Bluetooth.
  - Laptop runs presentation from localhost via present.bat.
  - Fleet API: HTTP POST /json/fleet (proxied). Telemetry: WebSocket ws://192.168.4.1/ws.
  - Followers use ESP-NOW from the leader. Bluetooth is only for single-device bluetooth.html.
- Workshop pinout on slide: GPIO 6 motor PWM, GPIO 5 LEDs, I2S mic pins via portal.
- Flash c3WIFILED_MASTER build before the show. Test E-stop first.

Slide 16: Illusion of Wetness
- No demo button. Walk the formula and point to the Prezi visual.
- Direct people to the thermal plus vibration station in the tent.

Slide 17: Immersive Accessibility & UMD
- Jazz Prism / audio reactive masks photo on the right.

Slide 18: Existing Wearables
- Three cards with Prezi crop images: shoes, vest, Buttkicker.
- Form factor and receptor matching matter more than raw power.

Slide 19: Safe Design & Thermals
- HAVS, strobing, eye safety, materials.
- Thermal section: motors heat faster than speakers. Duty limits, airflow, heatsinks.

Slide 20: Petting Zoo Stations & Q&A
- Station walkthrough. Smartphone Haptics QR for Android.
- Thank Crowd Supply / Teardown.
