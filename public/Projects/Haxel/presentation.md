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
- Use the four photo cards below as visual anchors: Gelu 1, Gelu 2, Gelu 3, and Haptic Gloves.
- Walk through the timeline from research to datagloves, concluding with the pocketables solution at the bottom.

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

Slide 11: How Motors Are Made
- Brushed vs brushless (BLDC) motors. Commutator wear vs electronic switching.
- Demagnetization: Curie threshold details. Continuous duty thermal risks in wearables.

Slide 12: Advanced Modalities
- Full-size table with product photos restored.
- Bass shaker AC requirement, piezo voltage, Peltier current, fan noise.

Slide 13: MOSFETs & H-Bridges
- PWM ribbon follows live audio envelope.
- GPIO to MOSFET to motor power path.

Slide 14: USB-C PD Decoy
- Under one dollar. Unlocks 9 to 20V for heavy actuators.

Slide 15: DSP FFT & Frequency Mapping
- Top: live mic bins. Bottom: floating ERM/LRA swarm colored by bass/mid/treble.
- Red motors react to bass, yellow to mid, blue to treble.

Slide 16: Audio-Reactive Sensing: MAX4466 & Telemetry
- Demonstrate the real-time tactile telemetry stream (toggle between Classic, Symmetric, Waterfall, and Orbit modes).
- Emphasize MAX4466 simplicity for workshops: zero protocol overhead compared to I2S, 3 wires only (3.3V, GND, GPIO 6).
- Walk through device registry provisioning: select Analog Mic, assign Pin 6, save, and telemetry streams immediately.

Slide 17: Haxel Live Coding Cookbook
- Show the four live coding examples: LFO phase, SVF filter, Attack/Release envelope follower, and Natural decay.
- Demonstrate real-time compilation and visual canvas responses.

Slide 18: Existing Wearables: Lessons Learned
- Woojer Vest (top): dynamic audio-tactile vest but limited frequency response.
- Haptic Shoes (bottom-left): expensive, hard to size and wash.
- Buttkicker (bottom-right): powerful, stationary, neighbor-unfriendly.

Slide 19: Safe Wearable Design & Thermal Reality
- HAVS, photosensitivity, eye safety, latex/nickel allergies.
- Emphasize thermals: closed wearables heat up fast, demagnetize, or burn skin. Duty cycles and design limits.

Slide 20: Petting Zoo Stations & Q&A
- Thank audience for attending the petting zoo workshop.
- Reference the three QR codes displayed: HAXEL Portal (left), Venmo Support (center), and Smartphone Haptics (right).
- Remind people that Venmo verification needs the last 4 digits of the phone number: 7082.
- Direct audience to step up, test the stations, scan codes, and play with Smartphone haptics.
