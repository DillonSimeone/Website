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

### N. Decoupled Texture Scaling (60 FPS Live Updates)
- Sliders for cosmetic or visual attributes (such as silkscreen font scaling, label toggles, or color themes) must NEVER trigger a full tscircuit AST recompile (`compileCircuit()`).
- Recompiling AST freezes the UI for 300–800ms and resets the camera/orbit controls.
- Instead, clear and redraw the offscreen HTML5 canvas texture (`drawSilkscreenDecal()`), set `silkTexture.needsUpdate = true`, and dynamically update SVG attributes. This delivers 60 FPS real-time feedback with < 2ms latency.

### O. Plated Hole Annular Rings vs Mock Boxes (Zero Z-Fighting)
- Never create solid 3D mock component boxes over through-hole drill barrels.
- Render plated holes strictly as gold annular pad rings using `THREE.RingGeometry(rHole, rOuter, 24)` on the top ($z = 0.81$) and bottom ($z = -0.81$) surfaces with a central dark cylinder drill core (`THREE.CylinderGeometry(rHole, rHole, 1.64, 16)` at $z = 0$).
- Render SMT copper pads as thin slabs (`THREE.BoxGeometry(w, h, 0.03)`) at $z = 0.815$.

### P. Dual-Mount Footprint Architecture (THT + SMD)
- For high-reliability modular PCBs subjected to mechanical vibration (e.g. baton wands, hand-held instruments), specify dual-mount pads in `footprints.js` for all breakout headers:
  - SMT pad (`1.6mm x 1.6mm`) on the copper layer.
  - Plated through-hole (`hole_diameter = 1.0mm`, `outer_diameter = 1.9mm`) at the exact center.
- Enables versatile assembly: modules can be soldered flush against the board or mounted using standard 2.54mm pin headers.

### Q. tscircuit through_pad Route Point Structure (The (0,0) Vector Bug)
- In tscircuit, route points in `pcb_trace.route` are not always `{ x, y }`.
- When transitioning through a plated hole, elements with `route_type: "through_pad"` store `{ start: { x, y }, end: { x, y } }` without top-level `.x` or `.y`.
- Accessing `p.x` produces `undefined`, and math expressions like `Math.min(min, p.x)` evaluate to `NaN`.
- In browser SVG, `<line x1="NaN" y1="NaN" ...>` defaults `(x1, y1)` to `(0, 0)`, drawing a stray diagonal line from the SVG viewport origin straight into the pad!
- **Rule**: Always extract coordinates via `p.x ?? p.start?.x ?? p.end?.x` and verify `Number.isFinite()` before generating SVG `<line>` or Three.js vectors.

### R. Viewport Responsive Sizing & ResizeObserver (Zero Bottom Cutoffs)
- In Three.js canvas containers nested in flex/grid layouts, setting fixed initial dimensions or relying on unconstrained block sizing causes height clipping on high-res monitors or initial loads.
- Always use the unified `.workspace` flex column with `.viewport-canvas` set to `position: absolute; inset: 0; width: 100%; height: 100%`.
- Attach a native `ResizeObserver` directly to the container to dynamically invoke `onResize()` whenever the DOM or viewport dimensions change.

### S. Unique Component Trace Names (No Duplicate Trace Name Errors)
- In tscircuit React, setting the `name` prop on `<trace>` assigns a component name inside the subcircuit.
- If multiple `<trace>` components share the exact same `name` (e.g. `name: "NET_GND"` or `name: "NET_5V"`), tscircuit records a `pcb_trace_error`: `"Multiple components found with name ... in subcircuit ... Component names must be unique within a subcircuit."`
- **Rule**: Always assign unique names using `${netName}__${key}` (e.g. `NET_GND__tr_bat_gnd`). In visualizers (`svg-pcb-renderer.js`), extract the clean net name via `rawNet.split("__")[0]`.

### T. Fast Netlist Registration via Platform routingDisabled
- Do not wrap `<trace>` elements in `if (!skipRouting)`. Doing so omits traces in fast mode, leaving all pads showing `NC` (unrouted) on hover tooltips.
- Instead, always add traces to the circuit, and pass `routingDisabled: skipRouting` to `new Circuit({ platform: { routingDisabled } })`.
- This provides instant netlist verification (<1s) and full pad tooltip functionality, while running the heavy geometric sub-solvers only when full autorouting is explicitly enabled.

### U. tscircuit <chip> pinLabels Schema (Numeric Keys)
- `<chip>` elements in tscircuit strictly require `pinLabels` keys to be numeric: `"pin1"`, `"pin2"`, etc.
- Passing non-numeric keys (like `pinA1`, `pinB12`, `pin_sh1`) causes tscircuit to throw `source_failed_to_create_component_error`, completely omitting the component from `circuitJson` and leaving all traces connected to it orphaned.

---

## 3. Recommended Workflow for Future Agents

1. **Keep Compile Fast**: Avoid automatic updates on every slider dragging interaction. Use styled number inputs with an **Update** button to trigger compilation on demand. For visual decal adjustments, decouple texture updates from layout recompiles.
2. **Coordinate Math**: The board substrate has thickness `1.6mm` (centered at `0`). Keep top copper elements at `y = 0.81mm` and bottom copper at `y = -0.81mm` in Three.js.
3. **DRC Validation**: Always verify trace segment layers via the interactive hover tooltips in the "PCB Route" view to ensure crossings use vias and run on opposite copper layers.
4. **Master Engineering Skill**:
   - Refer to [SKILL.md](SKILL.md) for full EDA architecture, JLCPCB SMT manufacturing rules, SOT-23 rotation tables, flyback diode polarity rules, trace width clamping, and laser test-fit protocols.
5. **Project Index**:
   - `00-starterPCB/`: Turnkey Starter Template with 3D/2D visualizers, live trace & pad hover tooltips, real-time JLCPCB manufacturing DRC (`pcb-rules.js` & `drc.js`), Architecture/Pinout schematic panel, component callouts, decoupled silkscreen scaling, and instant exports powered by `shared/`.
   - `01-V6Led/`: Parametric 6-LED strip configurator with mousebite panelization.
   - `02-audioMotionReactiveLedHapticPCB/`: Turnkey Baton Carrier PCB with ESP32-C3 SuperMini, MPU6050/6500 IMU, INMP441/MAX4466 microphones, AO3400A/AO3401A power and haptic drivers, dual silkscreen mirroring, vector QR code, M3 mounting holes, and 600 DPI laser test fits.
   - `03-compactAudioMotionSquarePCB/`: Compact Dense Square Reactive Controller PCB (38×38mm) with back-to-back 3D stacking (ESP32 on top, MPU on backside), 3× addressable LED outputs, dual haptic PWM drivers, dual microphones, LiPo charger with auto power-path, and M3 mounting pattern.
   - `04-smdAudioMotionBatonPCB/`: All-in-One Turnkey SMD Baton Controller PCB (22×110mm). Eliminates socketed dev boards with a directly soldered ESP32-C3-WROOM-02-N4 module, onboard MPU-6050 IMU, INMP441 digital I2S microphone, USB Type-C native CDC/JTAG flashing, ME6211 3.3V LDO, TP4054 LiPo charger with auto power-path, high-side LED power gate, and haptic PWM driver. 100% factory assembled by JLCPCB SMT in a single order.
   - `shared/`: Single Source of Truth (`pcb-configurator.css`, `three-pcb-viewer.js`, `svg-viewer.js`, `svg-pcb-renderer.js`, `pcb-rules.js`, `drc.js`, `export-utils.js`, `footprints.js`, `check-overlays.mjs`, `audit-footprints.mjs`, `audit-netlist.mjs`, `fetch-easyeda-footprint.mjs`, `test-headless.mjs`).
   - `ideas.md`: Next-generation PCB hardware roadmap mapped directly to active firmware prototypes in `public/ESP32Codes/PlatformIO/` (DeafAlert Mesh Node, CH32V003 ThermoHaptic Bio-Disc, DataGlove Dorsal Hub, 40kHz Ultrasonic Array, NeuralBadge SAO, Matter Radar Puck, etc.).

---

## 4. Copper Pad & Pin Collision Verification Tool

The suite includes an automated geometric collision detector in `shared/check-overlays.mjs` that audits physical copper overlaps between SMT pads and through-hole pins/holes:

### Usage Commands
```bash
# Run against default / active project (PCB 04)
npm test
node shared/check-overlays.mjs

# Target a specific subproject
node shared/check-overlays.mjs 01
node shared/check-overlays.mjs 02
node shared/check-overlays.mjs 03
node shared/check-overlays.mjs 04

# Custom clearance threshold (default 0.20mm) or JSON output
node shared/check-overlays.mjs 04 --clearance=0.25
node shared/check-overlays.mjs 04 --json
```

### Audited Rules
- **Physical Overlaps (`overlap > 0mm`)**: Detects direct circle-circle, circle-rect, and rect-rect copper intersections across top and bottom layers (THT penetrates both layers).
- **Clearance Warnings (`gap < 0.20mm`)**: Flags pads that don't collide but are too close for reliable JLCPCB standard solder mask dam manufacturing.
- **Reporting**: Outputs exact component designator, pin name, layer, bounding dimensions, center coordinates `(x, y)`, and overlap depth.

---

## 5. Footprint Safety Library & IPC Auditor

To eliminate component mismatch risks, tombstoning, and pad overhangs at assembly:
- **`shared/footprints.js`**: Centralized, IPC-7351 compliant footprint library shared across all subprojects.
- **`shared/audit-footprints.mjs`**: Automated auditor verifying pad pitch, inner solder mask clearance gaps, outer lead spans, and THT annular rings (annular ring $\ge 0.35\text{mm}$).

```bash
# Run footprint safety audit
node shared/audit-footprints.mjs

# Full suite pre-flight check (footprints + collision audit + netlist audit)
npm test
```

---

## 6. EasyEDA / JLCPCB Factory Footprint Extractor

To extract the exact manufacturer CAD pad dimensions directly from JLCPCB's component database by LCSC ID:

```bash
# Query any LCSC part number (e.g. C8598, C20917, C382138, C165948)
node shared/fetch-easyeda-footprint.mjs C165948
npm run fetch-footprint C8598
```

Outputs:
- Official package title (e.g. `USB-C_SMD-TYPE-C-31-M-12_1`)
- Exact millimeter pad coordinates `(x, y)` and pad dimensions `(w, h)`
- Two-pin geometry analysis (pitch, outer span, inner gap)
- Drop-in tscircuit React component template ready to paste into `shared/footprints.js`.

---

## 7. Unified Netlist & Unrouted Pin Auditor

To guarantee that all components are 100% wired with zero isolated, floating, or unrouted pads:

```bash
# Audit active project (PCB 04)
node shared/audit-netlist.mjs

# Target specific projects
node shared/audit-netlist.mjs 04
node shared/audit-netlist.mjs 03
node shared/audit-netlist.mjs 00

# JSON output for automated CI
node shared/audit-netlist.mjs 04 --json
```

Audited Checks:
1. **Zero Architecture/Compilation Errors**: Fails if any `pcb_trace_error`, `source_failed_to_create_component_error`, or `pcb_footprint_overlap_error` is present.
2. **100% Pin Connectivity**: Verifies every pin on passives (R, C, D), ICs, MOSFETs, regulators, and connectors is mapped to a logical trace net.
3. **Intentional NC Recognition**: Explicit NC pins (like `U_LDO.NC` Pin 4) and allowlisted auxiliary test pins (`U_MCU.IO20_RX`, `U_MCU.IO21_TX`) are clearly marked without triggering false failures.
4. **Terminal Reporting**: Prints pin counts, routed percentages, and exact coordinates of any unrouted pins.

---

## 8. Live JLCPCB Supply, Stock & SMT Cost Auditor

To audit real-time warehouse stock, catch out-of-stock shortfalls, detect LGA "Standard Only" inspection flags, and get exact PCBA assembly quotes directly from JLCPCB's live API:

```bash
# Audit active project (Project 04)
npm run check-supply
node shared/check-jlc-supply.mjs 04

# Audit with custom quantity (e.g. 30 boards)
node shared/check-jlc-supply.mjs 04 --qty=30

# Query any single LCSC part code or search keywords
node shared/check-jlc-supply.mjs C2934560
node shared/check-jlc-supply.mjs --search="ESP32-C3"
```

Audited Features:
1. **Live Warehouse Stock**: Queries JLCPCB's overseas component catalog API in real time. Flags zero-inventory shortfalls and low-stock components (< 100 units).
2. **Library Classification**: Distinguishes Basic ($0 feeder setup) from Extended ($3.00 setup) components.
3. **Assembly Mode Warnings**: Identifies LGA/BGA packages requiring "Standard PCBA" with automated X-ray inspection ($24 base fee) versus "Economic PCBA" ($8 base fee).
4. **Full PCBA Order Quote**: Calculates total component costs, extended feeder fees, base engineering setup fee, laser stencil fee, and solder joint fees for any order volume.

---

## 9. Headless Browser Compilation & Visualizer Runner

To verify that WebGL 3D, 2D vector layouts, and DOM event listeners compile without runtime exceptions (bypassing browser subagents):

```bash
# Run headless browser verification on Project 04
npm run test:browser
node shared/test-headless.mjs 04

# Test with full 2-layer autoroute solver pass
node shared/test-headless.mjs 04 --reroute
```

Audited Features:
1. **Headless Chrome Automation**: Launches a clean Puppeteer instance targeting `http://localhost:5173/ParametricPCB/04-smdAudioMotionBatonPCB/index.html`.
2. **WebGL & Canvas Validation**: Verifies Three.js initializes its WebGL context, mounts shaders, and renders meshes at 60 FPS without crashing.
3. **Console Log & Error Capture**: Traps unhandled JavaScript errors, missing DOM variables, undefined route modes, or SVG renderer method mismatches.

---

## 10. PCBA Assembly Mode Rules & Sourcing Lessons

1. **"Qty 0" on JLCPCB is NOT "Out of Stock"**:
   - The BOM review table has no warehouse stock column. `Qty` is the number of parts JLCPCB will place on your boards.
   - Unchecked or warning-flagged rows display `Qty: 0`. Always unroll BOMs to 1 row per designator so all rows auto-select cleanly.
2. **Economic PCBA ($8) vs. Standard PCBA ($24)**:
   - The MCU (`ESP32-C3`) is `ProductType: 0` (supported in $8 Economic PCBA).
   - Only LGA packages (like `LSM6DS3TR-C` and `WMM7037AT2`) force Standard PCBA ($24) because their solder balls are concealed underneath and require X-ray inspection.
   - However, modern LGA sensors are so cheap ($1.32) that paying the $24 Standard fee is cheaper overall than paying $4.63 for older QFN sensors ($33 more in chips for 10 boards) to chase the $8 Economic setup fee.
3. **Carrier vs. Turnkey SMT Threshold**:
   - For **1–20 boards**: Carrier PCBs (Projects 00, 02, 03) are unbeatable at **~$2.70 – $3.50 per baton** with $2 bare PCBs and $1 AliExpress dev boards.
   - For **30–50+ boards**: All-SMD PCBs (Project 04) reach the scale sweet spot at **~$7.00 / board fully assembled**, eliminating hand soldering entirely.

---

## 11. Interactive PCB Studio Workbench & Declarative Layout Architecture

Dedicated browser-based CAD co-design studio (`editor.html`) powered by local Express server (`shared/studio-server.mjs`) to eliminate tedious chat token burns when positioning silkscreen, polarity markers, and components:

### Launch Commands
```bash
# Launch local Express studio server and open default browser at PCB 03
npm run studio
# Or double click:
LaunchStudio.bat

# Run standalone silkscreen & polarity DRC audit
npm run audit-silkscreen
node shared/audit-silkscreen.mjs 03
node shared/audit-silkscreen.mjs 00
```

### Core Features & Architecture
1. **Declarative `src/layout.json` Sidecars**:
   - Single source of truth for component coordinates `(x, y, rotation)` and silkscreen elements.
   - Shared by both static browser showcase pages (`fetch`) and Express disk read/writes (`node:fs`).
2. **60 FPS Decoupled Dragging & Rotation**:
   - Dragging silkscreen labels, polarity markers, or components updates coordinates and runs SAT OBB collision detection in < 1.5ms without AST recompilation.
   - Copper pads and component courtyards move live during drag; traces dim to indicate stale state until clicking **🔀 Route**.
3. **Tethered Polarity & Pin-1 Markers**:
   - Diodes, LEDs, and ICs automatically emit cathode U-bars, `+`/`-`, and Pin-1 dots that rotate and move with the parent component while supporting per-marker local `(dx, dy, rotation, fontSize, visible)` offsets.
4. **Web-Dev Font Size Presets & Physical 1:1 Scale**:
   - Clickable presets mapped to hand-held reading distances: `JLC Min` ($0.80\,\text{mm}$), `8px Tiny` ($1.00\,\text{mm}$), `10px Small` ($1.20\,\text{mm}$), `12px Body` ($1.50\,\text{mm}$), `16px Head` ($2.00\,\text{mm}$), and `24px Hero` ($3.00\,\text{mm}$).
   - Real-world 1:1 screen zoom with credit-card calibration modal ($85.6\,\text{mm}$ standard ID card) to test naked-eye legibility before ordering boards.
5. **Point-to-Point Caliper Ruler**:
   - Magnetic snap to pad centers, pad edges, drill holes, and board corners showing distance, $\Delta X$, $\Delta Y$, and angle.
6. **1-Click Fab Package Publishing**:
   - Hit `Ctrl+S` to write `src/layout.json` to disk in < 10ms.
   - Click **📦 Publish Fab** to automatically compile layout, run DRC, and output updated `_Gerbers.zip`, `_BOM.csv`, `_CPL.csv`, and `_routed.stl` directly into the project folder.


