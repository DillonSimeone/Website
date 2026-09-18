# Cochlear Emulator & Haptic Mapper — Development Roadmap

This document outlines the development roadmap and design goals for the Cochlear Emulator & Haptic Mapper, incorporating feedback from Dillon Simeone and Sean Wolfe's collaborative studio visit (July 28, 2026).

---

## 1. Cochlear Simulation Redesign (CI Auditory Realism)

### Current Limitations
The standard **noise-vocoded carrier** model commonly found in academic research sounds too jagged, harsh, and introduces extra unnatural oscillations and modulation artifacts. As a bilingual user with a working hearing ear and a cochlear implant, Sean verified that this does not match the actual, smoother, tone-centric experience of real CI hearing.

### Tuned Sine Oscillator Model
To deliver a high-fidelity simulation of subjective CI hearing, we will redesign the carrier synthesis pipeline:
1. **Bandpass Filtering**: Maintain the logarithmic filterbank using Greenwood's function (e.g., 16 or 22 bands).
2. **RMS Envelope Followers**: Extract the real-time envelope amplitude of each band with low-pass smoothing.
3. **Pure Tone Carriers**: Replace noise-band carriers with pure sine wave oscillators tuned specifically to the center frequency of each analysis band.
4. **Envelope Plucking**: Use the envelope followers to dynamically modulate (pluck/strum) the amplitude of the corresponding sine oscillators, summing the signals back together in a master mixer. This will produce a smoother, clean, tone-based emulation that mimics electrode stimulation.

---

## 2. Dynamic Electrode Pairing & Frequency Redistribution

### Clinical Context
In clinical audiologist settings, if a patient has specific electrode dropouts or nerve sensitivities, the CI processor automatically pairs down and redistributes the sound spectrum bandwidth across the remaining active electrodes. For example, Sean has his 16th electrode (the highest high-frequency electrode at the cochlear base) manually disabled to prevent cross-signal interference (channel interaction) with adjacent lines, which improves overall speech and pitch accuracy by shifting those high frequency ranges down to active channels.

### Implementation Goals
* **Electrode Toggles**: Add UI checkboxes to manually deactivate/mute specific frequency bands.
* **Auto-Redistribution Matrix**: Write a DSP utility in `scripts.js` that dynamically recalculates Greenwood frequency limits when a channel is disabled, automatically widening the bandpass bandwidth of adjacent active filters to cover the lost ranges.
* **Custom Electrode Profiles**: Allow users to save custom audiologist-style pairing maps (e.g., deactivating high-frequency electrode 16 to shift higher transients down, or compressing 16 bands into 6 active zones).

---

## 3. MIDI-to-Tactile Composer (Woojer & Wearable Integration)

### Spatial Haptic Patterning
Sean highlighted that MIDI is a highly versatile control protocol for haptic composition. Rather than relying on simple audio-to-haptic routing, composers want to control individual tactile actuators directly:
* **Actuator-to-Note Mapping**: Map MIDI notes directly to physical actuator coordinates on the body (e.g., Note `C3` triggers the left shoulder, `D3` triggers the right shoulder, `E3` triggers the stomach).
* **Velocity-to-Intensity Mapping**: Use MIDI note-on velocity (`0-127`) to scale haptic driver intensities (`0-255`) continuously.
* **Spatial Trailing (Crawling)**: Create predefined MIDI sequences that trigger haptic sweeps (e.g., vibrations crawling up the stomach, chest, and arms, or sweeping across the back).
* **Ergonomic Positioning**: Place actuators off-spine (to the sides of the back, shoulders, arms, chest, and stomach) using lightweight webbing or a tactical vest to maximize tactile feedback clarity.

---

## 4. Alternative Cross-Modal Tactile Senses (Future Explorations)

To expand sensory access beyond vibrotactile gear, the roadmap outlines alternative physical computing interfaces:

### Pneumatic (Air Pressure) Textures
* **Mechanism**: Integrate low-power micro-valves to blow gentle air puffs on highly sensitive skin zones (like the neck or shoulders).
* **Application**: Use gentle air pressure changes to represent soft high-frequency transients (like hi-hats, brush snares, or soft woodblocks) that are difficult to translate cleanly through heavy vibration motors.

### Thermal (Temperature) Mapping
* **Mechanism**: Place low-voltage Peltier heating/cooling plates in contact with the skin.
* **Application**: Map sound textures and instrument groups to temperature differences (e.g., mapping deep, warm bass kicks to thermal heat, and crisp, sharp snares to cold drops).

### Power Optimization
* **Goal**: Optimize micro-controller code (LEDC PWM on ESP32-C3 Supermini) to minimize battery drain, ensuring wearable systems can run for hours on compact power banks.
