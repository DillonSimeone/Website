# Audio & Motion Reactive Light Baton PCB - Agent Codex & Learnings

Reference: [AGENTS.md](AGENTS.md)

## 1. Executive Summary & Architecture Map
- **Project**: Parametric PCB configurator for audio/motion-reactive light baton (`public/ParametricPCB/02-audioMotionReactiveLedHapticPCB/`).
- **Form Factor**: Narrow tubular PCB ($20\text{mm} \times 115\text{mm}$) fitting $22\text{mm}$ OD / $19\text{--}20\text{mm}$ ID polycarbonate wand/baton tubing.
- **Topology**: Turnkey Carrier PCB with factory-assembled SMT discretes + pluggable through-hole/hybrid sockets for modular breakouts.

## 2. Hard-Learned Traps & Technical Resolutions

### 2.1 The NaN Vector Trap (tscircuit Route Coordinates)
- **Failure Mode**: Browser SVG renderer draws stray copper trace lines stretching from top-left $(0, 0)$ corner across the entire board.
- **Root Cause**: `tscircuit` generates route points with two distinct schemas:
  - Wire segments: `{ x: number, y: number, route_type: "wire" }`
  - Pad endpoints: `{ start: { x, y }, end: { x, y }, route_type: "through_pad" }` without top-level `.x` or `.y`.
  - Naive property access `p.x` returns `undefined`. `Math.max(min, undefined)` evaluates to `NaN`. SVG `<line x1="NaN">` falls back to `(0, 0)`.
- **Enforced Fix**:
  - Module-scoped coordinate extractor:
    ```javascript
    function extractPoint(p) {
      if (!p) return null;
      const x = typeof p.x === "number" ? p.x : (p.start?.x ?? p.end?.x ?? null);
      const y = typeof p.y === "number" ? p.y : (p.start?.y ?? p.end?.y ?? null);
      if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x, y, layer: p.layer || p.start_layer || "top" };
    }
    ```
  - Always guard with `Number.isFinite()` and clamp both 2D SVG lines and 3D Three.js tubes to $[\pm(\text{halfW} - 0.4\text{mm}), \pm(\text{halfL} - 0.4\text{mm})]$.

### 2.2 Excellon Drill Generator Argument Schema
- **Failure Mode**: `convertSoupToExcellonDrillCommands(circuitJson)` crashes silently or produces empty drill files, breaking Gerber ZIP exports.
- **Root Cause**: Unlike `convertSoupToGerberCommands(circuitJson)` which accepts raw circuit JSON, `convertSoupToExcellonDrillCommands` expects an options object `{ circuitJson, is_plated: true }`.
- **Enforced Fix**:
  ```javascript
  const drillCommands = convertSoupToExcellonDrillCommands({ circuitJson, is_plated: true });
  const drill = stringifyExcellonDrill(drillCommands);
  ```

### 2.3 3D Rendering Z-Fighting & Mesh Layering
- **Failure Mode**: Severe visual flickering and dark mesh artifacts through hole interiors when rotating 3D view.
- **Root Cause**: Drawing monolithic 3D component bounding boxes over through-holes clips into hole geometry and produces co-planar face z-fighting with the FR4 substrate.
- **Enforced Fix**:
  - Layer coordinates on 1.6mm substrate ($z \in [-0.80, +0.80]\text{mm}$):
    - Substrate: $z = 0.0\text{mm}$ (`BoxGeometry` height 1.6mm)
    - Plated Annular Rings (`RingGeometry`): $z = \pm 0.81\text{mm}$
    - Drill Barrel (`CylinderGeometry`): $z = 0.0\text{mm}$, height 1.64mm (punches cleanly through)
    - SMD Pads (`BoxGeometry`): $z = \pm 0.815\text{mm}$, height 0.03mm
    - Copper Traces (`TubeGeometry`): $z = \pm 0.82\text{mm}$, radius 0.15mm
    - Silkscreen Decal (`PlaneGeometry`): $z = 0.825\text{mm}$ with `depthWrite: false` and `polygonOffset: true`

### 2.4 High-Speed Decoupled Silkscreen Scaling (60 FPS Performance Pattern)
- **Failure Mode**: Live slider adjustment of silkscreen font size froze the application for 400–900ms per step and reset camera orbit angles.
- **Root Cause**: Recompiling the entire tscircuit React AST graph on slider events.
- **Enforced Fix**:
  - Decouple visual decal rendering from circuit compilation:
  - 3D: Redraw to an offscreen 2048px HTML5 canvas and flag `activeSilkTexture.needsUpdate = true` (< 2ms execution).
  - 2D: Update SVG text attributes directly via `data-base-size * scaleFactor` (< 1ms execution).

### 2.5 Board Edge Pad Keepout (DRC Violation on Narrow Baton)
- **Failure Mode**: ESP32-C3 SuperMini 2.0mm pad rings at $x = \pm 8.89\text{mm}$ violated JLCPCB $> 0.30\text{mm}$ board edge clearance on 20mm width boards (only $0.11\text{mm}$ clearance).
- **Enforced Fix**:
  - Reduced pad outer diameter from $2.0\text{mm}$ to $1.75\text{mm}$ with $0.95\text{mm}$ drill hole.
  - Clearance increased to $\ge 0.235\text{mm}$ on 20mm width and $> 0.735\text{mm}$ on 21mm width, passing all DRC checks with zero edge collision.

### 2.6 High-Current Motor Return vs Logic AD0 Ground Separation
- **Failure Mode**: Automated rat's nest routing daisy-chained the haptic motor MOSFET source return through the GY-521 IMU module's AD0 pin to reach ground.
- **Root Cause**: Tying AD0 to the system ground net allowed the shortest-path router to use AD0 as an intermediate hop for the 500mA motor pulsed ground return, causing ground bounce.
- **Enforced Fix**:
  - GY-521 and standard MPU breakouts incorporate an onboard 4.7kΩ pulldown resistor on AD0 to ensure default `0x68` address.
  - Leaving AD0 unrouted on the carrier board preserves `0x68` addressing while cleanly isolating high-current motor ground return on a direct, dedicated ground trunk.

### 2.7 Flyback Diode Polarity & Inductive Protection (Dead Short Trap)
- **Failure Mode**: Diode or MOSFET instantly burns out upon activating haptic motor.
- **Root Cause**: Inverting flyback diode polarity (`Cathode` on Drain, `Anode` on $V_{SYS}$). The instant the low-side N-FET turns on, the diode becomes forward-biased, creating a direct dead short from $V_{SYS}$ to GND.
- **Enforced Fix**:
  - Connect **Cathode (Band) to $V_{SYS}$** and **Anode to MOSFET Drain**.
  - Diode remains reverse-biased during motor run and clamps negative inductive kickback when the FET switches off.
  - Set CPL rotation for `D_HAP` to **180°** so the physical Cathode band mounts on the $V_{SYS}$ pad.

### 2.8 High-Side WS2812B Power Switching (Parasitic Drain Elimination)
- **Failure Mode**: 1000mAh single-cell LiPo completely drains in 13 hours even when MCU is in deep sleep with LEDs turned "off" in firmware.
- **Root Cause**: WS2812B pixels draw 0.8–1.2mA quiescent current each while idling. A 64-LED baton strip constantly wastes 50–75mA.
- **Enforced Fix**:
  - High-side P-Channel MOSFET (`AO3401A`, `Q_LED_PWR`) switches the LED 5V/VSYS rail.
  - 100kΩ pull-up (`R_LED_PU`) keeps P-FET off by default.
  - Low-side N-Channel MOSFET (`AO3400A`, `Q_LED_EN`) driven by GPIO 8 cleanly pulls the P-FET gate to GND when active, with 10kΩ gate pull-down (`R_LED_GATE`) preventing spurious turn-on during boot.
  - Never switch LED ground (causes parasitic phantom powering and latch-up through MCU data line ESD diodes).

### 2.9 JLCPCB CPL SOT-23 Rotation & Diode Alignment
- **Failure Mode**: Components arrive rotated 90° off in JLCPCB assembly preview or bridge adjacent pads.
- **Root Cause**: JLCPCB tape feeders align Pin 1 at a different orientation than default EDA footprints.
- **Enforced Fix**:
  - `AO3400A` / `AO3401A` (SOT-23): Set CPL rotation to **270° CCW** (`rotation = 270`).
  - `D_PWR` (SS14 SOD-123): Rotation **0°** (Cathode on right pad).
  - `D_HAP` (SS14 SOD-123): Rotation **180°** (Cathode on left pad / $V_{SYS}$).

### 2.10 Strict 1-to-1 BOM & CPL Parity (Missing Data Error)
- **Failure Mode**: JLCPCB DFM assembly rejects order: *"The below parts won't be assembled due to data missing. [Designators] don't exist in CPL file."*
- **Root Cause**: Listing through-hole sockets, test points, or mounting holes in BOM without CPL centroids, or vice-versa.
- **Enforced Fix**:
  - Both BOM and CPL must be filtered by the exact same array of 14 SMT factory parts: `smdDesignators`.

### 2.11 Trace Width Clamping (JLCPCB 6 mil DRC Rule)
- **Failure Mode**: JLCPCB automated DRC rejects Gerber files with 0.100mm trace width errors.
- **Root Cause**: `tscircuit` autorouter generates 0.100mm terminal stubs by default.
- **Enforced Fix**:
  - Post-process `circuitJson` before Gerber export, clamping any trace or route point with `width < 0.15` to `0.20mm`.

### 2.12 Vector QR Code Silkscreen Generation
- **Implementation**: Binary QR matrix converted into horizontal run-length `silkscreenpath` strokes in tscircuit AST.
- **Result**: Vector Hershey stroke generation produces crisp, scalable QR codes in Gerbers with 100% optical decode fidelity.

### 2.13 M3 Corner Mounting Holes
- Placed 4× plated through-holes ($\varnothing 3.2\text{mm}$ drill, $\varnothing 4.8\text{mm}$ annular pad) at $(\pm 6.5\text{mm}, \pm 53.5\text{mm})$ for M3 screw fastening into wand end-caps with $\ge 1.0\text{mm}$ edge web.

### 2.14 Side-Mounted IMU Architecture (GY-521 Tube Clearance)
- **Failure Mode**: Centering the GY-521 MPU-6050/6500 header at $x = 0$ caused the 15.6mm module body to poke out past the 20mm round tube boundary by ~5.0mm, preventing the baton PCB from sliding into standard 20mm ID wand tubing.
- **Root Cause**: GY-521 headers run along the outer perimeter of the breakout board rather than the centerline.
### 2.14 Side-Mounted IMU Architecture (GY-521 Tube Clearance & Vertical Spacing)
- **Failure Mode**: Centering the GY-521 MPU-6050/6500 header at $x = 0$ caused the 15.6mm module body to poke out past the 20mm round tube boundary by ~5.0mm. Furthermore, mounting too low caused Pin 8 (`INT`) to sit within 0.2mm of `J_LED3`'s 5V pad.
- **Root Cause**: GY-521 headers run along the outer perimeter of the breakout board rather than the centerline.
- **Enforced Fix**:
  - Shifted `U_IMU` header to $x = -6.8\text{mm}$ and lifted up to `pcbY = 28.5mm` (`halfL - 29.0`).
  - Placed with body oriented facing inward, the 15.6mm breakout spans $x \in [-8.3\text{mm}, +7.3\text{mm}]$, nesting 100% inside the 20mm circular tube boundary with 1.7mm left clearance and 2.7mm right clearance (0mm protrusion).
  - Pin 8 (`INT` at $y = 19.61\text{mm}$) has a generous **$5.11\text{mm}$ vertical clearance** above `J_LED3` ($y = 14.5\text{mm}$).
  - Preserved AD0 unrouted to isolate sensitive logic from motor return currents.

### 2.15 ESP32-C3 ADC Pin Constraints & Triple Addressable LED + Button Architecture
- **Hardware Constraint**: On ESP32-C3, ADC channels are strictly confined to GPIO 0 through 5 (ADC1: CH0-CH4 on GPIO 0-4; ADC2: CH0 on GPIO 5). Pins GPIO 9, 20 (RX), and 21 (TX) **do not have ADC converters** and cannot read analog microphones like MAX4466.
- **Enforced Fix**:
  - `MAX4466` must remain anchored to GPIO 0 (`ADC1_CH0`).
  - Addressable LED channels: `J_LED1` (Top Tip on GPIO 6), `J_LED2` (Upper Right on GPIO 20 / RX), and `J_LED3` (Upper Left on GPIO 21 / TX).
  - All 3 LED channels share the high-side switched power rail (`NET_5V_LED_SW`) governed by `Q_LED_PWR` (AO3401A) and `Q_LED_EN` (AO3400A).
  - Controlled from **GPIO 10** (pure digital non-strapping pin) with 10kΩ pull-down `R_LED_GATE`.

### 2.16 ESP32-C3 Strapping Pin Hardware Compatibility Matrix
- **Boot Strapping Rules**:
  - `GPIO 2`: Must be HIGH for SPI flash boot. *Resolved*: Pulled HIGH to 3.3V by GY-521 onboard 4.7kΩ I2C pull-up.
  - `GPIO 8`: Must be HIGH for serial download bootloader mode. *Resolved*: Assigned to INMP441 `SD` (High-Z at reset) and pulled HIGH by SuperMini onboard LED resistor to 3.3V. Never place a pull-down resistor on GPIO 8.
  - `GPIO 9`: Must be HIGH for SPI flash boot (LOW enters download boot). *Resolved*: Never connect unpowered LED strips to GPIO 9 (unpowered ESD diodes drag GPIO 9 LOW and brick boot). Dedicated to `J_BTN` (2-pin header to GND) with internal weak pull-up holding it HIGH.
  - `GPIO 10`: Non-strapping pin. Dedicated to High-Side Switch enable with 10kΩ pull-down.

### 2.17 Onboard 2-Column Pinout Silkscreen Reference Map
- **Layout Optimization**: Placed a 2-column reference map directly onto the PCB in the open area next to `U_IMU` ($x \in [-4\text{mm}, +8\text{mm}]$, $y \in [24.5\text{mm}, 38\text{mm}]$).
- **Structure**:
  - Header: `audioMotionReactive` / `LedHapticPCB PINOUT`
  - Left column: `G0: ADC MIC`, `G1: I2S WS`, `G2: IMU SDA`, `G3: IMU SCL`, `G4: I2S SCK`, `G5: IMU INT`, `1S LIPO/USB`
  - Right column: `G6: LED1 TOP`, `G7: HAPTIC`, `G8: I2S SD`, `G9: BTN/BOOT`, `G10: LED PWR`, `G20: LED2 RX`, `G21: LED3 TX`
- **Avoid Overlap**: Leaves $> 6.0\text{mm}$ clearance above `J_LED2` and `J_LED3`, preventing any silkscreen collisions. Mirrored on both Top (`.gto`) and Bottom (`.gbo`) layers.

## 3. Automation & Turnkey Deliverables
1. **Always export turnkey triplets**:
   - `Gerbers (.zip)`: RS-274X copper, solder mask, silkscreen, edge cuts, Excellon drills.
   - `BOM (.csv)`: 14 factory SMT parts with verified LCSC part numbers.
   - `CPL (.csv)`: 14 pick & place centroids with verified JLCPCB rotations.
   - `writeUp.md`: Circuit breakdown and DIY iron-pan assembly guide.
   - `Laser Extracts`: 600 DPI PNGs and 1:1 SVGs for physical acrylic/wood test fits.
