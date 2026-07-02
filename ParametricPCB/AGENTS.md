# Parametric PCB Configurator Developer Documentation

This document explains the architecture, lessons learned, and recommended workflows for developers and future AI agents working on this project.

---

## 1. Project Overview & Architecture

The project is a browser-based, high-performance Parametric PCB Configurator built with **tscircuit-core** and **Three.js**.

- **`src/circuit.js`**: Handles the programmatic compilation of the PCB layout using tscircuit React elements. It builds the components, place vias, routes traces, and generates manufacturing artifacts (BOM, PNP, Gerbers).
- **`src/ui.js`**: Controls the user interface. It contains three visualizers:
  1. **PCB Route (2D SVG)**: Zoomable, draggable vector layout displaying top (solid) and bottom (dashed) copper layers with interactive hover tooltips.
  2. **3D Model (Three.js)**: Rotatable 3D model featuring real copper layer offsets, via cylinders, animated rainbow HSL LED lights, and silkscreen decals.
  3. **Schematic (2D SVG)**: Circuit schematic displaying logical connections (VDD, DATA, GND).

---

## 2. Key Developer Lessons Learned

### A. Local Bundling over CDN Imports
- Browser CORS and MIME-type restrictions block arbitrary CDN imports for complex ESM systems. We bundle and load `tscircuit-core.js` and `circuit-json-to-gerber.js` locally in `00-commonParts/` to ensure offline stability.

### B. Custom footprint definitions in tscircuit
- Standard `<smtpad>` components inside footprint tags must define:
  - `portHints`: Passed as an array, e.g. `["pin1"]`.
  - `pcbX` & `pcbY`: Position strings (e.g. `"-0.95mm"`).
  - `layer`: Target copper placement (e.g. `"top"`).

### C. Multi-Layer Routing & Via Crossover Transitions
- The default in-browser sub-routing-solver routes on a single layer unless crossings force layer transitions. 
- To prevent overlapping trace shorts, **place manual `<via />` components** at intersection points:
  - Connect the top-layer SMT pad to the via.
  - Connect the via to the target bottom pad.
  - This forces the solver to route segments on the bottom layer (`layer: "bottom"`), resulting in correct, short-circuit free layouts.

### D. Component Designator Lookup
- The compiled physical `pcb_component` objects use generated IDs (e.g. `pcb_component_0`). To display user-friendly designators (like `U1`, `J_MID1`):
  - Cross-reference the physical component's `source_component_id` with the corresponding `source_component` in `circuitJson` to retrieve the real `.name` string.

### E. Trace Segment Layer Rendering
- Do not check `trace.route[0].layer` to style the entire trace. Vias switch layers mid-route.
- Iterate over the route points segment-by-segment (`p1` to `p2`) and style each segment individually based on `p1.layer` (e.g., solid for `"top"`, dashed/translucent for `"bottom"`).

### F. 3D Decal Silkscreen Text
- To visualize silkscreen text labels in Three.js without complex font loaders, generate a 2D canvas dynamically, render the labels onto it using standard canvas 2D contexts, and project it as a transparent decal texture (`THREE.CanvasTexture`) at `y = 0.81mm` on the top surface of the PCB substrate.

### G. Three.js Substrate & Component Heights
- Centering the board substrate at `y = 0.0` (spanning `-0.8mm` to `0.8mm` for a `1.6mm` board) makes coordinate math intuitive.
- SMT components must be positioned at `y = 0.8mm` to sit on the board's top surface.
- SMT pads and top trace copper should be drawn at `y = 0.81mm` to sit on top of the substrate.
- OrbitControls should not restrict the `maxPolarAngle` if the user needs to inspect the bottom layer.

### H. Smooth 3D Copper Traces
- Rather than rendering discontinuous 3D boxes for trace routes (which leave gaps/overlaps at angled corners), group consecutive route points residing on the same layer.
- Render these groups using `THREE.TubeGeometry` with a radius of `width / 2` to obtain smooth, continuous rounded 3D wire paths.

### I. Silkscreen Texture Visibility & Collision-Free Text
- Enable `polygonOffset: true` with a factor of `-1` on the silkscreen material (`THREE.MeshBasicMaterial`) and set `silkTexture.needsUpdate = true` to prevent WebGL Z-fighting.
- When generating random text labels on the silkscreen, maintain an obstacles list of component boundaries (LEDs, headers) and margins, checking rectangle overlaps (`minX, maxX, minY, maxY`) before drawing to prevent text overlap.

### K. Fast Client-Side Panelization
- For grid arrays (like rows and columns of identical sub-boards), compiling a single board layout via tscircuit and then copy-pasting/shifting coordinates programmatically in JavaScript is significantly faster (milliseconds) than executing a full nested tscircuit compilation grid loop.

### L. Component Prefix Filtering
- When duplicate boards in a panel are prefixed with `R{row}_C{col}_` to avoid designator overlaps, ensure the 2D layout and 3D visualizers strip the grid prefix using a regular expression like `/^R\d+_C\d+_/` before matching the component type (e.g., checking for LEDs starting with `"U"` or headers with `"J"`).

### M. Realistic Unplated Drill Holes (Mousebites)
- Render unplated mousebite via drill holes as simple dark/black cylinder meshes (`1.62mm` high to prevent Z-fighting) with no top/bottom gold copper pad rings (`outer_diameter === hole_diameter`), and draw them inside breakaway tab bridging meshes.

---

## 3. Recommended Workflow for Future Agents

1. **Keep Compile Fast**: Avoid automatic updates on every slider dragging interaction. Use styled number inputs with an **Update** button to trigger compilation on demand.
2. **Coordinate Math**: The board substrate has thickness `1.6mm` (centered at `0`). Keep top copper elements at `y = 0.81mm` and bottom copper at `y = -0.81mm` in Three.js.
3. **DRC Validation**: Always verify trace segment layers via the interactive hover tooltips in the "PCB Route" view to ensure crossings use vias and run on opposite copper layers.
