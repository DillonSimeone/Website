# Deaf-Accessible Frequency Spawner (Pixelblaze)

A sound-reactive, sensory-substitution LED pattern designed for the **Pixelblaze** (v2 and v3) with the **Sensor Expansion Board**. 

This pattern is built to make musical structure, rhythm, and polyphony visually decipherable to **Deaf and Hard-of-Hearing (DHH)** audiences by color and light dynamics alone.

---

## Patterns in this Directory

1. [**`frequency_spawner.js`**](./frequency_spawner.js) — **Stochastic Peak Particle Spawner**
   - Extracts the Top 3 global peaks across 32 bins with neighborhood suppression.
   - 60% / 25% / 15% weighted stochastic spawning of decaying pixels.
   - Attack desaturation ("white-hot core") and PI controller automatic gain.

2. [**`cymatic_ripples.js`**](./cymatic_ripples.js) — **Cymatic Wavefronts & Traveling Ripples**
   - Physical acoustic wave simulation based on cymatics (vibrations traveling through a medium).
   - Low bass kicks emit broad, heavy, slow-rolling crimson tidal waves.
   - Midrange melody emits fluid emerald/cyan pulses.
   - High cymbals/shimmer emit ultra-fast razor-thin violet shockwaves.
   - Additive optical interference creates luminous polychromatic bursts where waves intersect.
   - Supports 1D strips, 2D matrices, and **3D 6-sided cubes** (spherical acoustic wavefronts expanding from the hollow center through all 6 faces).

3. [**`cube_64x6_map.js`**](./cube_64x6_map.js) — **3D Pixel Map for 6-Sided Cube (384 Pixels)**
   - Maps 6 faces $\times$ 64 pixels (8x8 matrix per face).
   - Generates 3D coordinates $(x, y, z)$ with configurable serpentine/zig-zag wiring support.
   - Also provided as raw JSON in [`cube_64x6_map.json`](./cube_64x6_map.json).

---

## Sensory Substitution Design & Accessibility

Translating acoustic music into light for deaf individuals requires addressing psychoacoustic clarity:

### 1. Monotonic Chromatic Mapping (0.00 Red $\rightarrow$ 0.82 Violet)
* **The Wrap-Around Problem**: Standard HSV cycles $1.0$ directly back to $0.0$ (Red). In music visualization, this causes sub-bass kick drums and ultrasonic cymbals to share the same color.
* **The Solution**: Frequencies are mapped across the 32 sensor board bins into a monotonic spectrum capped at $0.82$ (Deep Violet/Magenta):
  - **Sub-Bass & Kicks ($37\text{--}100\text{ Hz}$)**: Deep Crimson Red $\rightarrow$ Vermilion
  - **Basslines ($100\text{--}250\text{ Hz}$)**: Warm Amber & Tangerine
  - **Vocal / Midrange Core ($250\text{--}2000\text{ Hz}$)**: Yellow, Lime & Electric Cyan
  - **Percussive Highs & Cymbals ($2000\text{--}10000\text{ Hz}$)**: Royal Blue & Radiant Violet

### 2. Polyphonic Tri-Peak Extraction (Option A: Global Top 3 with Spacing)
* Music is polyphonic. A deaf observer needs to perceive the bass rhythm, vocal melody, and percussive hi-hats occurring at the same time.
* The pattern analyzes the 32 frequency bins and extracts the **Top 3 Peaks** using neighborhood suppression ($\pm 2$ bins minimum separation):
  - **Peak 1 (Dominant component)**: Awarded **60%** of pixel spawns.
  - **Peak 2 (Secondary harmonic / counter-melody)**: Awarded **25%** of pixel spawns.
  - **Peak 3 (Tertiary detail / percussive air)**: Awarded **15%** of pixel spawns.

### 3. Tactile Attack Transients ("White-Hot Core")
* When an instrument strikes forcefully, the pixel momentarily desaturates toward bright white, giving a crisp visual punch that mirrors physical transient perception. As the note rings out, saturation rapidly restores into the rich frequency hue.

### 4. Automatic Gain Control (PI Controller)
* Incorporates a Proportional-Integral (PI) feedback loop targeting ~22% average brightness fill. Whether listening to quiet conversational speech or loud live concert audio, the visuals maintain optimal dynamic range without blowing out or going dark.

### 5. Built-in 4-Track Sequencer Simulation
* When no Sensor Expansion Board is connected (`energyAverage == -1`), the pattern automatically generates a simulated 4-track electronic drum & synth groove (Kick drum, Bassline, Lead synth, and 16th-note Hi-Hats). This allows immediate testing in the Pixelblaze web simulator or standalone sequencer.

---

## How to Install on Pixelblaze

### 1. Set Up the 3D Cube Pixel Map
1. Open your Pixelblaze Web Interface in a browser.
2. Click on the **Mapper** tab at the top.
3. Paste the contents of [`cube_64x6_map.js`](./cube_64x6_map.js) into the editor (or paste the raw array from [`cube_64x6_map.json`](./cube_64x6_map.json)).
4. Click **Save**. Pixelblaze will instantly render a 3D interactive wireframe preview of the 6-sided cube!

### 2. Install the Pattern
1. Click on the **Edit** tab (or **New Pattern**).
2. Copy the entire contents of [`cymatic_ripples.js`](./cymatic_ripples.js) (or [`frequency_spawner.js`](./frequency_spawner.js)) and paste into the code editor.
3. Click **Save** and assign a name (e.g., *Sound - Cymatic Ripples 3D*).
4. Watch the expanding spherical acoustic wavefronts propagate seamlessly across all 6 faces of your cube!

---

## UI Sliders (`cymatic_ripples.js`)

The pattern exports four interactive sliders in the Pixelblaze UI:

| Slider | Description | Default |
| :--- | :--- | :--- |
| **Speed** | Modulates acoustic wave propagation velocity across the 3D medium. | $1.0\times$ |
| **Width** | Scales acoustic wavelength (from razor-thin laser rings to broad tidal swells). | $1.0\times$ |
| **Gain** | Direct multiplier on transducer onset sensitivity. | $1.0\times$ |
| **Direction** | Toggles between Symmetrical Center-Outward (0.0) and Linear (1.0). | Symmetrical |
