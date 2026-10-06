---
name: parametric-pcb-designer
description: Comprehensive guidelines, EDA rules, and design patterns for building browser-based parametric PCBs with tscircuit, Three.js, and JLCPCB turnkey SMT assembly.
---

# Parametric PCB Design & Manufacturing Skill

This skill defines the engineering specifications, EDA design patterns, manufacturing rules, and failure-mode mitigations for designing parametric printed circuit boards within the `public/ParametricPCB/` suite.

---

## 1. Tooling Architecture & Offline Bundling

Browser-based parametric PCB design pairs **React-like JSX/declarative ASTs** (`tscircuit`) with **Three.js** (3D inspection) and **interactive SVGs** (2D layout & schematic).

### 1.1 Local Module Bundling (Bypassing CDN & MIME Hazards)
- **Problem**: Remote CDN imports (`esm.sh`, `unpkg`, `cdnjs`) for heavy EDA compilers fail under strict browser security policies (`X-Content-Type-Options: nosniff`), local offline dev servers, or internet drops.
- **Rule**: Bundle core EDA engines locally inside `public/ParametricPCB/00-commonParts/`:
  - `tscircuit-core.js`: Programmatic AST compiler and rat's nest autorouter.
  - `circuit-json-to-gerber.js`: Gerber RS-274X and Excellon drill generator.
- Load local libraries via explicit relative script tags or browser ESM. For Three.js in standalone submodules, use vetted versioned CDNs (`https://esm.sh/three@0.136.0`) with proper fallbacks.

### 1.2 Dual-Mount Hybrid Footprints (THT + SMD)
For mechanical vibration resistance and prototyping flexibility:
- Breakout headers (MCUs, IMUs, sensors, power terminals) must define dual-mount pads in `src/footprints.js`:
  - **SMD Rectangular Pad**: `width = 1.6mm`, `height = 1.6mm` on top copper layer.
  - **Plated Through-Hole (THT)**: `hole_diameter = 1.0mm`, `outer_diameter = 1.9mm` centered on the pad.
- Modules can be soldered flush against the board as surface-mount castellations, or through-hole soldered with standard 2.54mm square pin headers.

---

## 2. Electrical Design & Circuit Topologies

### 2.1 Low-Side N-FET Flyback Diode Polarity (The Inductive Dead-Short Trap)
- **Inductive Load Physics**: DC motors, solenoids, and coils generate severe inductive kickback spikes ($V = -L \frac{di}{dt}$) upon PWM turn-off.
- **Circuit Rule**:
  - Flyback diode (`D_HAP`, e.g., SS14 Schottky) MUST have its **Cathode on the positive rail ($V_{SYS}$)** and its **Anode on the MOSFET Drain**.
  - During normal operation, the diode is **reverse-biased** (inactive).
  - When the MOSFET turns off, the collapsing magnetic field forces the drain voltage above $V_{SYS}$, forward-biasing the diode and safely circulating the flyback current through the supply rail.
- **CRITICAL REVERSAL HAZARD**:
  - If Cathode is placed on Drain and Anode on $V_{SYS}$, the diode is forward-biased the instant the MOSFET turns on.
  - The moment PWM asserts HIGH, a **dead short** forms from $V_{SYS} \to \text{Diode} \to \text{MOSFET} \to \text{GND}$, immediately destroying the diode or MOSFET.

```
       +--- V_SYS (3.7V - 4.2V) ---+
       |                           |
   +-------+                     [===] D_HAP (Cathode Band to V_SYS)
   | Motor |                       |
   +-------+                       |   (Anode to Drain)
       |                           |
       +------------+--------------+
                    |
                 Drain (D)
  GPIO --[100Ω]-- Gate (G)   AO3400A (N-MOSFET)
                    |
                 Source (S)
                    |
                   GND
```

### 2.2 Addressable LED High-Side Power Isolation (Parasitic Quiescent Drain)
- **Parasitic Drain**: WS2812B / SK6812 smart LEDs draw $0.8\text{mA}$ to $1.2\text{mA}$ per pixel even when turned off in software. A 64-LED baton strip consumes $50\text{--}75\text{mA}$ idle current, draining a 1000mAh LiPo in 13 hours of sleep.
- **High-Side Switching Rule**:
  - Use a high-side P-Channel MOSFET (`AO3401A`) between the power rail ($V_{SYS}$) and the LED `5V` strip rail.
  - Source to $V_{SYS}$, Drain to LED Strip `5V`.
  - Gate pulled HIGH to Source via $100\text{k}\Omega$ resistor (`R_LED_PU`) to keep LEDs OFF by default.
  - Drive P-FET Gate using a small N-Channel MOSFET (`AO3400A`) driven by an ESP32 GPIO.
- **NEVER use Low-Side Ground Switching on LEDs**:
  - Unpowered LEDs sharing a common 3.3V logic line will sink return current through the ESP32 GPIO's internal ESD protection diodes, causing latch-up, overheating, or GPIO pin damage.
- **Firmware Power Sequencing**:
  1. *Power ON*: Assert LED Power Gate HIGH $\to$ wait 5ms for rail settling $\to$ send data pulses.
  2. *Power OFF*: Pull DAT pin LOW (or Hi-Z input) $\to$ de-assert LED Power Gate.

### 2.3 Automatic Power-Path Management
- `AO3401A P-MOS (Q_PWR)` + `SS14 Schottky (D_PWR)` + `100kΩ Resistor (R_PWR)`:
  - When USB 5V (`VBUS`) is connected, Gate is pulled HIGH by VBUS, switching P-MOS OFF. The LiPo battery is completely isolated from the system load and cannot back-feed or overcharge. System runs on USB power through `D_PWR`.
  - When USB 5V is unplugged, Gate is pulled LOW to GND by `R_PWR`, switching P-MOS fully ON ($R_{DS(on)} < 30\text{m}\Omega$). Battery powers system with virtually zero voltage drop.

---

## 3. JLCPCB SMT Manufacturing & Assembly Rules

### 3.1 Strict BOM & CPL 1-to-1 Parity
JLCPCB automated assembly validates every designator across both files:
- **Rule**: If a designator exists in the BOM, it MUST exist in the CPL. If a designator exists in the CPL, it MUST exist in the BOM.
- Breakout sockets, manual through-hole pin headers (`J_BAT`, `J_LED`, `U_MCU`, `U_IMU`), and mounting holes must NOT be in the factory SMT BOM or CPL files.
- Filter both files using an explicit whitelist array:
  ```javascript
  const smdDesignators = [
    "U_CHG", "Q_PWR", "Q_FET", "Q_LED_PWR", "Q_LED_EN",
    "D_PWR", "D_HAP", "R_PROG", "R_PWR", "R_GATE",
    "R_LED_PU", "R_LED_GATE", "C_VIN", "C_BAT"
  ];
  ```

### 3.2 JLCPCB SOT-23 & Diode CPL Pick & Place Rotations
JLCPCB tape-and-reel feeders use standard pocket orientations that often differ from CAD footprints by 90° or 180°:

| Component Type | Package | Nominal Pin 1 Location | Required JLCPCB CPL Rotation | Rationale / Verification |
|---|---|---|---|---|
| **AO3400A / AO3401A** | SOT-23 | Pin 1 = Gate (Bottom-Left) | **270° CCW** (`rotation = 270`) | Aligns Pin 1 (G) to bottom-left pad, Pin 2 (S) to bottom-right pad, and Pin 3 (D) to top pad in standard vertical orientation. |
| **SS14 / 1N5819** (Standard) | SOD-123 | Pin 1 = Cathode (Band) | **0°** | Cathode on right pad, Anode on left pad. |
| **SS14 Flyback (D_HAP)** | SOD-123 | Pin 1 = Cathode (Band) | **180°** | Cathode on left pad ($V_{SYS}$ rail), Anode on right pad (FET Drain). |
| **MCP73831** | SOT-23-5 | Pin 1 = STAT | **0°** or **180°** | Verify pin 1 notch aligns with PCB silkscreen dot in JLCPCB 3D DFM viewer. |
| **0603 / 0805 Passives** | SMD 0603 | Symmetrical | **0°** (Horizontal) / **90°** (Vertical) | Pin 1 on left (0°) or top (90°). |

*Always verify orientation in the JLCPCB 3D DFM viewer before submitting orders.*

### 3.3 Factory Basic / Preferred Part Sourcing (LCSC Part Numbers)
Prefer JLCPCB Basic and Extended parts with high reel stock to avoid reel setup surcharges:
- **AO3400A** (N-FET SOT-23, 30V 5.7A): `C20917`
- **AO3401A** (P-FET SOT-23, -30V -4.2A): `C15127`
- **SS14** (Schottky Diode SOD-123, 40V 1A): `C22452`
- **MCP73831T-2ACI/OT** (LiPo Charger SOT-23-5, 4.2V 500mA): `C14878`
- **10kΩ 0603 1%** (Gate Pulldown, Uniroyal): `C25804`
- **100kΩ 0603 1%** (Power Path Pullup, Uniroyal): `C25803`
- **2kΩ 0603 1%** (Prog Current 500mA, Uniroyal): `C17975`
- **4.7µF 0603 10V / 25V X5R** (Decoupling Caps): `C15849`

---

## 4. tscircuit Routing Engine & DRC Enforcements

### 4.1 Trace Width Clamping (JLCPCB 6 mil / 0.15mm DRC Rule)
- **Problem**: The `tscircuit` autorouter generates 0.100mm terminal stubs by default, triggering hard DRC rejection at JLCPCB (minimum width is 0.15mm / 6 mil).
- **Rule**: Run a post-processing clamp pass over `circuitJson` before generating Gerbers:
  ```javascript
  for (const item of circuitJson) {
    if (item.type === "pcb_trace" && Array.isArray(item.route)) {
      if (typeof item.width === "number" && item.width < 0.15) {
        item.width = 0.20;
      }
      for (const pt of item.route) {
        if (typeof pt.width === "number" && pt.width < 0.15) {
          pt.width = 0.20;
        }
      }
    }
  }
  ```

### 4.2 The `through_pad` (0,0) NaN Vector Bug
- In tscircuit, route points for plated through-holes use `{ start: { x, y }, end: { x, y }, route_type: "through_pad" }` without top-level `.x` or `.y`.
- Reading `p.x` produces `undefined`, and math expressions like `Math.max(min, p.x)` evaluate to `NaN`.
- In browser SVG, `<line x1="NaN" y1="NaN" ...>` causes browsers to fallback to `(0, 0)`, rendering wild diagonal artifact lines across the entire canvas.
- **Rule**: Always extract coordinates via:
  ```javascript
  function extractPoint(p) {
    if (!p) return null;
    const x = typeof p.x === "number" ? p.x : (p.start?.x ?? p.end?.x ?? null);
    const y = typeof p.y === "number" ? p.y : (p.start?.y ?? p.end?.y ?? null);
    if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y, layer: p.layer || p.start_layer || "top" };
  }
  ```

### 4.3 Plated Mounting Holes (M3 Fasteners)
- Place plated holes using `React.createElement("platedhole", { holeDiameter: "3.2mm", outerDiameter: "4.8mm", shape: "circle" })`.
- This ensures Tool 10 drill commands are output to Excellon `.drl` files and annular copper rings are rendered on both Top Copper (`.gtl`) and Bottom Copper (`.gbl`).
- Maintain $\ge 1.0\text{mm}$ web between hole pad edge and board outline to avoid mechanical fracture.

---

## 5. Silkscreen Generation & Gerber Export Rules

### 5.1 Gerber Legend Generation (The Blank Silkscreen Trap)
- **Problem**: Fabricators report `audioMotionBaton_TopSilkscreen.gbr` is completely blank.
- **Root Cause**: Silkscreen text rendered onto Three.js decals or 2D SVG canvas only exists in the browser DOM. `circuit-json-to-gerber.js` generates silkscreen layers strictly from `{ type: "pcb_silkscreen_text" }` objects inside `circuitJson`.
- **Rule**: All silkscreen text, pin labels, and branding must be defined as `<silkscreentext>` React elements inside `circuit.js`:
  ```javascript
  React.createElement("silkscreentext", {
    text: "5V",
    pcbX: `${x}mm`,
    pcbY: `${y}mm`,
    layer: "top", // or "bottom"
    fontSize: "0.85mm",
    anchorAlignment: "center"
  })
  ```

### 5.2 Bottom Layer Silkscreen Mirroring
- In Gerber RS-274X (`.gbo`), CAD coordinates share the same $(X, Y)$ plane as top layer.
- `circuit-json-to-gerber.js` automatically mirrors glyph strokes horizontally for the bottom layer.
- Pin labels placed at $(X, Y)$ on the bottom layer will naturally align with through-hole pins when viewed from the underside of the PCB.

### 5.3 Vector QR Code Silk Generation
- Do not attempt to import raster PNG decals into Gerbers.
- Generate high-resolution vector QR codes directly in silkscreen using run-length horizontal `silkscreenpath` strokes:
  ```javascript
  React.createElement("silkscreenpath", {
    layer: "bottom",
    route: [{ x: xStart, y: yPos }, { x: xEnd, y: yPos }],
    strokeWidth: `${moduleSize}mm`
  });
  ```
- Isolated single modules ($x_1 = x_2$) flash a solid circular aperture of diameter `strokeWidth`.
- Scans cleanly with 100% optical decode fidelity on physical boards.

---

## 6. Physical Verification: Laser Fit Testing (1:1 Extracts)

Before placing PCB production orders, generate 1:1 scale extracts for laser cutting test jigs:
1. **`outline_pads.svg` / `.png`**: Cut lines for board profile, drill holes, and SMD pad locations.
2. **`silkscreen.svg` / `.png`**: Top silkscreen layer for visual alignment.
3. **`silkscreen_bottom.svg` / `.png`**: Underside silkscreen layer.
4. **`laser_combined_testfit.png`**: Composite sheet rendered at 600 DPI.
- Laser cut onto 1.6mm acrylic, chipboard, or wood. Physically test fit into wand/baton tubing, check component socket clearance, and verify battery fit.

---

## 7. Turnkey Deliverables Checklist

When completing a Parametric PCB project, verify the presence of all five artifacts:
- [ ] **`Gerbers (.zip)`**: GTL, GBL, GTS, GBS, GTO, GBO, GML, and DRL/TXT.
- [ ] **`BOM (.csv)`**: Designator, Quantity, Value, Footprint, LCSC Part Number.
- [ ] **`CPL (.csv)`**: Designator, Mid X, Mid Y, Layer, Rotation.
- [ ] **`writeUp.md`**: Complete circuit explanation, bill of materials, and iron pan DIY soldering guide.
- [ ] **`Laser Extracts`**: 600 DPI PNGs and SVGs for physical test fits.
