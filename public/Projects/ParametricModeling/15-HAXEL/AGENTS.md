# Project: HAXEL — Dense Electronics Enclosure

Evolution of [04-Pulse](../04-Pulse/AGENTS.md). A parametric "borg cube" enclosure that packs electronic components as densely as possible into a 3D-printable rectangular shell.

## Architecture: Sled-in-Cube

Unlike PULSE's cylindrical sled-in-shell (which had dead space and M3 alignment issues), HAXEL uses a **rectangular prism** with a **slide-out component tray** (sled).

### Key Components
| Part | Dimensions (W×D×H mm) |
|:---|:---|
| ESP32-C3 SuperMini | 18.0 × 22.5 × 4.6 |
| TP4056 Charger | 17.2 × 28.0 × 4.2 |
| LiPo Battery | 36.0 × 20.0 × 9.0 |
| L298N Mini H-Bridge | 24.7 × 21.0 × 5.0 |
| Type 130 Motor | 15.0 × 19.0 × 19.0 |

### Assembly
1. **Shell** — Rectangular box with M3 corner screw holes, slide-rail grooves, USB port cutouts, motor shaft exit
2. **Lid** — Screw-on top cover with lip insert and matching M3 holes
3. **Sled** — Component tray with pockets for all 5 parts, slide rails, wire routing holes
4. **Motor Clamp** — U-bracket with M3 bolt-through holes (lifted from PULSE)

### Packing Layout
- **Bottom layer**: Motor + Battery (side by side)
- **Top layer**: L298N + ESP32 + TP4056 (USB ports face front)

## Technical Stack
- **Geometry**: Manifold WASM (raw kernel)
- **Rendering**: Three.js with MeshPhysicalMaterial
- **UI Style**: Neobrutalism (thick borders, hard shadows, Space Grotesk + Syne fonts)
- **Dependencies**: Zero-install ESM via import maps
- **Exports**: ASCII STL via shared `00-CommonParts/Exporter/stl.js`

## File Structure
```
15-HAXEL/
├── index.html          # Main page (3-column layout)
├── style.css           # Neobrutalism design system
├── AGENTS.md           # This file
└── src/
    ├── main.js         # Orchestrator — rebuild, mesh lifecycle
    ├── state.js        # Runtime params, meshes, context, colors
    ├── manifoldInit.js # WASM initialization
    ├── viewport.js     # Three.js scene, camera, lights
    ├── geometry.js     # Shell, lid, sled, clamp, component ghosts
    └── ui.js           # Slider sync, visibility, export handlers
```
