# Universal Music Design — Haptic Petting Zoo Workshop Slides

Slide 1: Title Slide
- Feel the Difference: A Haptic Petting Zoo
- Dillon Simeone
- Deaf Lead Design Engineer @ Universal Music Design
- Teardown 2026 // Portland, OR
- Haptic & Light Interfaces Powered by ESP32s

Slide 2: Welcome to the Haptic Petting Zoo
- Most people have only experienced one type of haptic: phone vibration motors.
- Interact with 10+ stations across different sensory modalities.
- Featured Actuators: Solenoid taps, servo pressure, thermal plates, audio reactive fans, piezo actuators, ERMs, LRAs, voice coil transducers, and haptic knobs.
- Goals: Learn sensor-to-haptic signal translation and cross-modal mapping.

Slide 3: Core Hardware: DFRobot Beetle ESP32-C6
- Our Microcontroller of Choice: DFRobot Beetle ESP32-C6 (only $4.90!).
- Ultra-compact: Tiny footprint, perfect for haptic rings, tags, and small wearables.
- LiPo Charger Inbuilt: Safe onboard lithium battery charging circuit.
- Specs: RISC-V CPU (WiFi 6, BLE 5, Zigbee / Thread / Matter).
- Runner Up: ESP32-C3 Supermini (extremely cheap, but lacks battery manager).

Slide 4: Haxel: Open Haptic Development Environment
- Main Software Interface: Haxel (F:\Github\Website\public\Projects\Haxel).
- Web Bluetooth Control: Connect and control your Firebeetle directly from a web browser.
- Real-Time Visualization: Monitor input sensors (audio, pressure) and map them to actuator outputs.
- Low-Friction Prototyping: Test signal mapping and synthesize sensations instantly.

Slide 5: Mechanoreceptors: How We Feel
- Designing haptics requires targeting specific receptors in the skin:
- Pacinian Corpuscles: Target with high-frequency vibrations (200-300 Hz) using LRAs & transducers.
- Meissner Corpuscles: Target with low-frequency vibrations or slip (30-50 Hz) using ERM buzzers.
- Merkel Discs & Ruffini Endings: Target with static pressure and stretch using servos & solenoids.

Slide 6: Actuator Modality 1: Solenoids & Servos
- Merkel / Ruffini receptors respond to physical pressure and impact.
- Solenoids: Deliver high-impact sharp taps and clicks. Excellent for UI confirmations.
- Servos: Provide steady, continuous pressure patterns and stretch sensations.
- Pros: Simulates structural realism. Cons: Heavy, bulky, and power-hungry.

Slide 7: Actuator Modality 2: ERMs & LRAs
- Eccentric Rotating Mass (ERM): Asymmetric weight spinning on a DC motor.
- ERM Tip: Running at 100% feels like cheap buzzing; pulse forward-reverse to get sharp snaps.
- Linear Resonant Actuator (LRA): Magnetic mass mounted on a spring.
- LRA Tip: Extremely crisp clicks, but MUST be driven at its specific resonant frequency!

Slide 8: Actuator Modality 3: Advanced Modalities
- Mini Bass Shaker (8 Ohm) Catch: Requires AC audio power (analog amplifier). DC offset/clipping will cause overheating and tear them apart.
- Piezoelectric Actuators Catch: Extremely high voltage drive requirements (60V to 150V+), requiring specialized boost converters/drivers. Fragile to bending.
- Thermal Actuators (Peltier) Catch: Requires massive wattage (high current: 12V 5.8A). Must use large heat sinks to avoid instant burnout.
- Fans / Air Haptics Catch: Deafeningly loud when pushed to their limits to simulate strong wind/airflow.

Slide 9: Haptic Circuits: MOSFETs & H-Bridges
- PWM Duty Cycle Example: Sweeps duty cycle from 0% to 100% and back to demonstrate pulse width modulation power delivery.
- High-Power MOSFET Driver (~$1.00): DC 5V-36V 15A driver. Perfect for high-power thermal plates. Remember right wire gauge & heatsink!
- Mini Dual H-Bridge (~$0.50): L298N 2V-10V 1.5A driver. Provides forward/backward polarity control with minimal voltage drop.

Slide 10: Power Delivery: USB-C PD Decoy
- Heavy solenoids, Peltier plates, and transducers require more than 5V from the USB port.
- USB-C Power Delivery (PD) Decoy: Configures voltage requests directly from chargers.
- Adjustable: Request 9V, 12V, 15V, or 20V depending on actuator needs.
- Safety: Ensures high current is negotiated safely without burning out controller boards.
- Power delivery decoy: Requests 5, 9, 12, 15 or 20 voltage from USB-C chargers, configurable via switches on the top.

Slide 11: Digital Signal Processing: FFT & Smoothing
- Fast Fourier Transform (FFT): Separates incoming audio signals into distinct frequency bins.
- Frequency Mapping: Map low bins (bass) to body transducers, mid bins to LRAs on hands.
- Normalizing & Smoothing: Raw signals are jittery. Use delta smoothing and averaging in loops.
- Rule of Thumb: Stay within non-blocking millis() loops to keep response times under 15ms.

Slide 12: Sensation Synthesis: Illusion of Wetness
- Humans have no hygroreceptors (wetness receptors). We perceive wetness by combining signals:
- Wetness = Low Friction (Mechanoreceptors) + Rapid Cooling (Thermoreceptors).
- We simulate wetness by combining a slick haptic vibration pattern with a Peltier plate cooling step.
- Many complex sensations can be synthesized using multi-modal haptics!

Slide 13: Immersive Accessibility & Universal Music Design
- Universal Music Design: Bridging the gap between the hearing and Deaf worlds.
- Sensory Substitution: Translating acoustic performance spaces into vibro-tactile and visual signals.
- Audio Reactive Masks: Keeps performers synchronized through real-time light pulses and frequency-mapped haptic straps.

Slide 14: Responsibility & Safe Design Guidelines
- Hand-Arm Vibration Syndrome (HAVS): Prolonged strong vibrations cause permanent nerve/vessel damage.
- Strobing Effects: Flashing lights can trigger seizures. Maintain frequencies outside photo-sensitive zones.
- Sensitive Zones: NEVER place active haptics directly on the eyeballs (immune-privileged area).
- Material Safety: Avoid nickel, latex, and cheap adhesives on wearable straps to prevent allergic dermatitis.

Slide 15: Petting Zoo Interactive Stations
- Walk around the DreamTENT stations to test the haptic petting zoo.
- QR Codes: Scan the QR code at each station to download full schematics, source code, and BOMs.
- Try it yourself: Open the Smartphone Haptics miniproject (Android Chrome) to test the Web Vibration API.

Slide 16: Q&A & Discussion
- Questions & Discussion.
- Collaborate: Universal Music Design pathways, open-source haptic setups, and maker resources.
- Thank you for attending Teardown 2026!
- Access Haxel workshop files on DillonSimeone/Website GitHub repository.

