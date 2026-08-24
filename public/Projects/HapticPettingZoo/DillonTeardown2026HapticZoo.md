# Feel the Difference: A Haptic Petting Zoo

[https://www.crowdsupply.com/teardown/portland-2026/workshop/feel-the-difference-a-haptic-petting-zoo](https://www.crowdsupply.com/teardown/portland-2026/workshop/feel-the-difference-a-haptic-petting-zoo)  
[https://youtu.be/QELd3fTHwCc?si=CJ\_o00r7Oo0cxsiJ](https://youtu.be/QELd3fTHwCc?si=CJ_o00r7Oo0cxsiJ) 

(Post workshop update)  
HAXEL became the main meat of the workshop\! I made little HAXEL kits with three different haptics for each persons going to the workshop. One of the motors had a swappable head for different weights\!

[https://dillonsimeone.com/Projects/Haxel/index.html](https://dillonsimeone.com/Projects/Haxel/index.html)

**Teaser:**  
Experience haptics beyond phone buzzes: solenoids that tap back, servo-driven pressure patterns, thermal actuators, air-based haptics, and more. Learn to translate sound into tactile feedback using off-the-shelf parts and open-source designs.

**Public event description:**

Most people have only experienced one type of haptic feedback: the vibration motor in their phone. This workshop introduces you to many others.

**What You'll Experience:**  
Interact with 10+ haptic systems spanning multiple sensory modalities: sharp solenoid clicks, servo-driven pressure patterns, thermal actuators, audio-controlled fans, piezoelectric actuators, LRAs, ERMs, tactile transducers, and haptic knobs. Each station demonstrates a different approach to creating tactile feedback, from $2 DIY solutions to professional-grade systems, all synchronized to various inputs.

**What You'll Learn:**  
The principles of sensor-to-haptic translation: signal conditioning, cross-modal mapping, and how to normalize diverse inputs (audio, proximity, pressure, motion) into compelling tactile feedback. 

Discover how different actuator types engage different mechanoreceptors in your skin. Every exhibit includes technical documentation and QR codes linking to full BOMs, source code, and build guides, all using off-the-shelf parts you can order today.

**Why It Matters:**  
Haptic feedback transforms accessibility (especially for Deaf/Hard of Hearing communities), creates immersive experiences, and elevates UX design. Understanding the range of tactile technologies opens entirely new creative possibilities for your projects, whether you're building musical instruments, game controllers, assistive devices, or interactive installations.

**About you:**

Dillon Simeone is Deaf and specializes in audio-reactive haptic systems as a lead design engineer. As co-author of "GestoLumina: Gesture-Interpreted Light, Sound, and Haptics" (Aalborg University Press) and lead engineer at Universal Music Design, Dillon developed full-lifecycle haptic wearables for immersive accessibility, from conceptual sketches to functional prototypes with custom PCBs and real-time audio processing firmware. He was a guest lecturer at Portland Community College on Sonic Interface Design and a co-author of "Sonic Agency," published in ASSETS '25 (ACM SIGACCESS Conference on Computers and Accessibility). He leverages deep technical skills to build innovative, accessible, and immersive experiences.

**Supplemental material:**  
(Please provide additional information, including links, to where we can find out more about you or your project. Social media profiles, project repositories, demo videos, etc. are all helpful. This will help us evaluate your proposed session and provide detail to possible attendees.)

	Workshop spreadsheet:  
[https://docs.google.com/spreadsheets/d/1heyoUwS0wKtYUS269OiGlvpKymg1CAQsjZ5okWRXTRo/edit?usp=sharing](https://docs.google.com/spreadsheets/d/1heyoUwS0wKtYUS269OiGlvpKymg1CAQsjZ5okWRXTRo/edit?usp=sharing)   
   
Website:  
[https://dillonsimeone.github.io/Website/](https://dillonsimeone.github.io/Website/?page=LandingPage)

Youtube:  
[https://www.youtube.com/@Dillonsimeone/shorts](https://www.youtube.com/@Dillonsimeone/shorts) 

Published research papers:  
[https://vbn.aau.dk/en/publications/gestolumina-gesture-interpreted-light-sound-and-haptics-towards-a/](https://vbn.aau.dk/en/publications/gestolumina-gesture-interpreted-light-sound-and-haptics-towards-a/)

[https://doi.org/10.1145/3663547.3746396](https://doi.org/10.1145/3663547.3746396)

**Schedule requests:**  
We’ll need to schedule around America Sign Language Interpreters. Otherwise, surprise me\! 

# Personal notes

**Current inventory:**

1. **ERMs** (eccentric rotating mass \- phone buzzes)  
2. **LRAs** (linear resonant actuators \- precision vibration)  
3. **Solenoids** (sharp taps/recoils)  
4. **Servos** (programmable pressure patterns)  
5. **Tactile transducers/exciters** (bass shakers)  
6. **Centrifugal fans** (air pressure/wind)  
7. **Haptic knobs** (rotary feedback)  
8. **Woojer jacket** (wearable multi-actuator)

Possible:

* **Piezoelectric actuators** (crisp clicks)  
* **Voice Coils** (Sharp clicks)  
* **Thermal** (soldering iron → heatsink on Thermoelectric peltier → haptics )  
* **Kinetic** (Turn lever to turn a motor at high gear ratio to bring various haptics to life)  
* **Solar** (Sound-reactive lights shining onto solar panels to drive haptics)  
* **Motion** (Motion to Haptics)  
* **Presence** (LIDAR/Human detector to haptics)  
* **Camera** (Literally camera data to haptics... This makes blind people’s smartphones’ camera feature actually useful for them\!)  
* **Camera \+ AI** (Gestures to haptics)

...

[Petting Zoo Haptics](https://docs.google.com/document/d/1oL1xbIrwlcLgzNHDEu3GNeOFdh8Bdh7lENycOMDtfJM/edit?usp=sharing)

**Topics \-**

**Latency Budgets** Sensor-to-actuator delay. Target: \<20ms for synchronicity. Over 50ms breaks immersion.

**Signal Conditioning** Raw data processing. Includes debouncing, low-pass filtering, and jitter removal to stabilize haptic output.

**Cross-Modal Mapping** Translation logic. Mapping one data dimension (e.g., proximity) to another (e.g., vibration frequency).

**Safety Interlocks** Hardware/software protection. Thermal monitoring, current limiting, and duty-cycle caps to prevent component failure or white finger syndrome.

**Psychophysics** \- Just-Noticeable Difference (JND) thresholds.

**Mechanoreceptors \-** 

**Pacinian Corpuscles:** Map to high-frequency vibrations (200–300 Hz) using LRAs or tactile transducers.

**Meissner’s Corpuscles:** Map to lower-frequency "flutter" (10–50 Hz) using ERMs or solenoids.

**Merkel Disks:** Map to static pressure or slow indentation using servos or pneumatic bladders.

**Ruffini Endings:** Map to skin stretch or lateral displacement.

