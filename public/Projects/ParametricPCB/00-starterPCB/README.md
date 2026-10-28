# 00-starterPCB: Turnkey Parametric PCB Template

This directory provides a clean, modular, battle-tested starter template for creating new parametric PCB web applications in the Parametric PCB suite.

It is fully decoupled and powered by the single source of truth in `../shared/`.

---

## 1. Architecture Overview

```
public/ParametricPCB/
├── 00-commonParts/           # Offline core bundles (tscircuit-core.js, circuit-json-to-gerber.js)
├── shared/                   # Single Source of Truth
│   ├── pcb-configurator.css  # Universal Cyberpunk Design System & Layout
│   ├── three-pcb-viewer.js   # Responsive Three.js 3D Viewer with Decoupled Silkscreen
│   ├── svg-viewer.js         # Interactive Pan/Zoom & Rich Hover Tooltip Engine
│   ├── svg-pcb-renderer.js   # Universal 2D SVG Circuit Markup Generator
│   ├── pcb-rules.js          # Canonical JLCPCB 2-Layer Design Rules
│   ├── drc.js                # Real-Time Advisory JLCPCB Manufacturing DRC Engine
│   ├── export-utils.js       # Universal Gerber ZIP, BOM CSV, and CPL/PNP Exporter
│   └── check-overlays.mjs    # Automated SMT Pad & Through-Hole DRC Collision Detector
└── 00-starterPCB/            # Turnkey Starter Template
    ├── index.html            # Clean 100% full-height workspace referencing shared CSS
    ├── src/
    │   ├── circuit.js        # Declarative tscircuit React layout & manufacturing exports
    │   ├── footprints.js     # Library of verified modular footprints
    │   ├── pcb-rules.js      # Re-exports canonical shared rules
    │   ├── drc.js            # Re-exports canonical shared DRC engine
    │   └── ui.js             # Thin controller orchestrating shared visualizers
    └── README.md             # This guide
```

---

## 2. Features Out-of-the-Box

1. **Responsive Viewport Architecture (Zero Cutoffs)**:
   - Powered by `../shared/pcb-configurator.css` and a `ResizeObserver` in `three-pcb-viewer.js`.
   - Never clips at the bottom; dynamically scales to any screen height or window resize event.

2. **Interactive 2D Hover Inspection & Net Highlighting**:
   - Hover over any copper trace to see: Net Name, Traces From, Traces To, Layer, Segment Length, Total Net Length, and Trace Width.
   - Hover over any pad or plated hole to see: Component, Pin, Pin Function, Net Assignment, Connected Traces, Coordinates, Pad Size, and Drill Diameter.
   - Live glowing net highlight across all connected copper traces and pads.

3. **60 FPS Live Silkscreen Font Scaling**:
   - The Silkscreen Size slider updates the 2D canvas decal texture in < 2ms without freezing the UI or triggering expensive AST recompiles.

4. **1-Click Turnkey Manufacturing Exports**:
   - **Gerbers (.zip)**: Universal extensions (`.gtl`, `.gbl`, `.gto`, `.gbo`, `.gts`, `.gbs`, `.drl`) including both `.gko` and `.gml` for universal board outline recognition.
   - **BOM (.csv)**: Clean search comments and verified LCSC part numbers.
   - **CPL / PNP (.csv)**: Accurate SMT pick-and-place coordinates and JLCPCB rotations.

5. **Real JLCPCB Manufacturing DRC Engine**:
   - Integrated `pcb-rules.js` and `drc.js` checking trace width (≥ 0.15mm), trace-to-pad clearance (≥ 0.15mm), and via spacing against official JLCPCB 2-layer production standards.
   - Dynamic sidebar badge reports `DRC Passed (JLCPCB 2-Layer Compliant)` with pad counts and route statuses.

6. **Interactive Block Diagram & Pinout Tab**:
   - Tab 3 provides an instant visual ASCII schematic of power distribution (+5V VBUS, C_VBUS filter, power LED) and ESP32-C3 SuperMini strapping-safe GPIO breakouts.

7. **Automated Geometric DRC Audit**:
   - Verify zero copper pad overlaps before ordering:
     ```bash
     node shared/check-overlays.mjs 00
     ```

---

## 3. Creating a New Board in 3 Steps

### Step 1: Duplicate the Starter Template
Copy `00-starterPCB/` to your new project folder (e.g., `04-myNewProject/`):
```bash
cp -r 00-starterPCB 04-myNewProject
```

### Step 2: Define Your Components & Traces in `src/circuit.js`
Add your components to `compileCircuit()`:
```javascript
children.push(React.createElement(MyComponent, {
  name: "U1",
  pcbX: "0mm",
  pcbY: "0mm"
}));
```

Connect your logical rat's nest traces:
```javascript
children.push(React.createElement("trace", {
  from: ".U1 > .pin1",
  to: ".J1 > .pin1",
  name: "NET_VCC",
  width: "0.40mm"
}));
```

### Step 3: Run Collision Verification
```bash
node shared/check-overlays.mjs 04
```
Open `04-myNewProject/index.html` in your browser to inspect in 3D and 2D!
