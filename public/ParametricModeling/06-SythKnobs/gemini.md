# Project: ACCESS KNOB (AI-Assisted CAD & Universal Music Design)

This folder contains the ACCESS KNOB parametric customization suite, a specialized assistive engineering tool designed to make music synthesizers and commercial physical interfaces fully playable for musicians with reduced grip strength, motor impairments, or low vision.

## 🚀 Key Features and Enhancements

### 1. Procedural WASM Geometry Kernel
- Powered by a WASM-compiled `Manifold` geometry engine that computes high-fidelity boolean operations on the client side in milliseconds.
- High-level parametric controls over geometry: grooves/flutes, taper, dimensions, and shape profiles.

### 2. Multi-Mounting and Shaft Profiles
- **Swap-In Mode**: Complete replacement of standard synthesizer knobs.
- **Slide-Over Mode**: Adaptive outer sleeve fitting snugly over original controls without disassembly, preserving instrument resale value.
- **Shaft Bores**: Generates custom bore flats/splines for **D-Shaft**, **Knurled/Splined**, and **Solid Round** mounting spindles in real time.

### 3. Blueprint Rendering Mode (Default)
- Overlays a translucent dark-blue solid body (`0x07294d`) with high-contrast glowing edge wireframes.
- Wireframe colors are dynamically color-coded to indicate mount mode: **bright cyan** (`0x00f2ff`) for Swap-In knobs, and **orange/amber** (`0xffaa00`) for Slide-Over sleeves.
- View toggle in the HTML toolbar allows instant switching between Rendered and Blueprint views without regenerating geometries.

### 4. 2D Vector SVG Stacking Exporter
- Outputs layered SVG vectors representing slices of the customized knob.
- Prompts user for material sheet thickness and laser kerf width (default 0.1mm) via a custom modal dialog.
- Automatically generates two alignment rods of width `thickness` and length `heightKnob + kerf`, along with corresponding slots in the layers to facilitate quick and accurate manual gluing/stacking.
- Compensates for laser kerf in slot and rod dimensions.

### 5. Preset Share/Save Feature
- Encodes full parameter sets to a compact base64 URL query string (`?cfg=...`).
- Copy-to-clipboard button generates share links instantly.
- Automatic parameter decoding on page load dynamically adds and highlights shared configs.

### 6. End-to-End Hands-Free Accessibility
- **Switch Control Focus States**: High-contrast glowing cyan outline (`#00f2ff`) and shadow for all interactive sliders and buttons, supporting camera-based gesture selectors.
- **Screen-Reader live announcements**: Spoken notifications (`aria-live="polite"`) for real-time model geometry and shaft updates.
- **Auditory Sonification**: Oscillator pitch mapping (Web Audio API) translates physical parameters into sound, allowing blind or low-vision users to "hear" the shape.
- **Haptic Vibration**: Interface feedback pulses (`navigator.vibrate()`) wrapped in try-catch blocks to prevent crashes on unsupported devices.

### 7. HTML Academic Poster & Print Engine
- **A0 Landscape Poster**: A print-optimized scientific presentation poster ([poster.html](file:///f:/Github/Website/public/ParametricModeling/06-SythKnobs/poster.html)) matching the customizer's engineering blueprint theme.
- **Vector Diagrams**: Includes responsive inline SVG schematics illustrating mounting mode/shaft configurations, laser-cut layer alignment rods, and the multimodal hands-free feedback loop.
- **Material & Mechanical Matrix**: Features technical tables evaluating torque reduction ratios and polymer/organic material damping (PLA vs. PETG vs. TPU vs. Bamboo damping).
- **Double-Blind & Camera-Ready Compatibility**: Formatted with full co-author metadata (Dillon Simeone, Shawn Trail, and Doga Cavdir) and high-contrast accessibility visual markers.

---

## 📂 Project Structure
```text
/06-SythKnobs/
├── SIGACCESS2026/        # Academic paper manuscript, figures, and compiled PDF
│   ├── ACCESS_KNOB_draft.tex  # Condensed 7-page LaTeX draft
│   ├── ACCESS_KNOB_draft.pdf  # Compiled submission PDF
│   ├── ProfileShapes.png      # Alternative text figures
│   └── OutputDetailsScreen.png # Alternative text figures
├── knob-parametric.html  # Customizer app with WebGL view, sliders, sharing, and SVG exporter
├── poster.html           # A0 landscape scientific presentation poster (HTML/PDF print-optimized)
└── gemini.md             # This local documentation
```
