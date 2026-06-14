# Suggestions for Improving ACCESS KNOB Paper and Web Engine

This document contains recommendations for preparing the academic paper [ACCESS_KNOB_draft.tex](file:///f:/Github/Website/public/ParametricModeling/06-SythKnobs/ACCESS_KNOB_draft.tex) for the SIGACCESS 2026 poster session and further developing the modeling engine [knob-parametric.html](file:///f:/Github/Website/public/ParametricModeling/06-SythKnobs/knob-parametric.html).

---

## 1. Academic Paper Enhancements (SIGACCESS 2026 Poster)

SIGACCESS reviewers look for accessibility impact, technical rigor, and clear research positioning. To strengthen the current Non-Human Subject Research (NHSR) draft:

### A. Elaborate on the Mechanical Torque Model
- **Add a Torque Table**: Insert a small LaTeX table contrasting standard commercial knob diameters (e.g., $10\text{ mm}$, $12\text{ mm}$, $15\text{ mm}$) with accessible diameter modifications (e.g., $25\text{ mm}$, $30\text{ mm}$, $35\text{ mm}$, $40\text{ mm}$). For each, calculate the mechanical advantage ratio and the relative grip force reduction.
- **Formulate Grip Shear Force**: In addition to torque, detail the mechanical shear force for palm-dragging. A taller knob increases the contact height $H$, increasing the contact area $A = \pi \cdot D \cdot H$. Calculate the friction force $F_f = \mu \cdot F_n$ (where $\mu$ is the friction coefficient of the material and $F_n$ is the normal force), showing how increased surface area allows lower normal force (grip squeeze) to achieve rotation.

### B. Strengthen the IRB Future Work Statement
- **Detailed Protocol Proposal**: Outline the exact protocol designed for future studies. Describe:
  - **Cohort Size**: $N = 12$ musicians with reduced hand strength (e.g., due to arthritis, stroke, muscular dystrophy, or neuropathy).
  - **Tasks**: Calibrate, print, install, and use custom slide-over vs. swap-in knobs during an active musical performance or synthesizer parameter-tweaking task.
  - **Evaluation Metrics**: Measure task completion time, error rates (accidental adjacent knob nudging), and System Usability Scale (SUS) scores.
  - **Qualitative Questions**: Assess the subjective feeling of creative control and agency.

### C. Expand 3D Print Material Analysis
- **PLA vs. PETG vs. TPU**: Contrast materials used for FDM fabrication.
  - **PLA (Polylactic Acid)**: Easy to print, stiff, but brittle and susceptible to warping under heat (e.g., in hot studio environments or cars).
  - **PETG (Polyethylene Terephthalate Glycol)**: Higher impact strength, better heat resistance, and slight flexibility, making it ideal for the clip-on tension of slide-over sleeves.
  - **TPU (Thermoplastic Polyurethane)**: A flexible filament. Suggest TPU for the slide-over sleeve interior to create a high-friction, non-slip lining that grips the original plastic knob without set screws.

---

## 2. Web Parametric Engine Improvements

Building on the direct numeric input fields added to [knob-parametric.html](file:///f:/Github/Website/public/ParametricModeling/06-SythKnobs/knob-parametric.html), the following improvements will make the tool a state-of-the-art accessible CAD utility:

### A. Screen-Reader Text Announcements (Aria-Live)
- **Problem**: Changing a slider or typing a number updates the 3D canvas visually, but screen readers are unaware of the resulting geometry or model updates.
- **Solution**: Add a hidden `aria-live="polite"` container that dynamically announces geometric summary changes.
  ```html
  <div id="sr-announcer" class="sr-only" aria-live="polite"></div>
  ```
  And trigger announcements in JS:
  ```javascript
  function announceChange(text) {
    document.getElementById('sr-announcer').textContent = text;
  }
  // Example: "Hexagonal knob with outer diameter 30 millimeters and height 22 millimeters configured."
  ```

### B. Sound & Auditory Representation (Sonic Parameter Mapping)
- **Concept**: Aligning with the Universal Music Design (UMD) ethos, map the geometric parameters to sound.
- **Implementation**: Using the browser's native **Web Audio API**, play a brief tone when parameters change.
  - **Diameter/Height**: Map size to oscillator volume or resonance depth.
  - **Groove Count**: Map count to the pitch frequency of a short sequence (e.g., higher counts play a faster series of clicks).
  - This allows BLV users to "hear" the shape of the knob they are designing before exporting it for print.

### C. Preset Synthesizer Profiles
- **Problem**: Users with reduced hand strength or vision may not know the exact bore size or knob spacings of their target hardware.
- **Solution**: Implement a "Synthesizer Preset" select box that pre-populates clearances, heights, and bore sizes.
  - **Moog Eurorack**: Bore $6.0\text{ mm}$ (knurled/round shaft), outer diameter max $20\text{ mm}$ due to dense faceplate layouts.
  - **Sequential Prophet**: Bore $6.35\text{ mm}$ ($1/4$ inch D-shaft), taller profile.
  - **Arturia MicroFreak**: Slide-over sleeves tailored exactly to original rubberized knobs.

### D. Keyboard & Focus Enhancements
- Ensure all custom interactive elements (like the shape selection grid buttons) are fully keyboard focusable (`tabindex="0"`) and triggerable using `Enter` or `Space` keys. Currently, they are styled `div`s with `onclick` events which are not natively keyboard-navigable.
