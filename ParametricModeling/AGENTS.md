# Project: Parametric Modeling (AI-Assisted CAD)

This project explores the "State of the Art" (as of 2026) in code-first parametric 3D modeling using JavaScript and TypeScript. It serves as a testing ground for different geometry kernels and high-level CAD frameworks that are optimized for AI-assisted design.

## The Three Approaches

We have implemented three parallel environments, each with a live Three.js viewport and parametric controls.

### 1. ForgeCAD / FluidCAD (`/01-ForgeCAD`)
* **Paradigm**: High-level, declarative, and AI-friendly syntax.
* **Engine**: Wraps the Manifold geometry kernel for robust operations.
* **Key Feature**: Uses a `param()` pattern that allows AI agents to easily define adjustable sliders and "hot-reload" models instantly.
* **Style**: Focused on Developer Experience (DX) and rapid prototyping.

### 2. OpenJSCAD V2 (`/02-OpenJSCAD`)
* **Paradigm**: Functional Constructive Solid Geometry (CSG).
* **Engine**: Pure JavaScript modular engine.
* **Key Feature**: Predictable, programmatic API where the design is a pure function of its parameters.
* **Implementation Note**: Uses the modular `@jscad/modeling` V2 API. Requires careful category awareness (e.g., `extrusions` instead of generic `operations`).

### 3. Manifold JS (`/03-Manifold`)
* **Paradigm**: Low-level, high-performance geometry kernel.
* **Engine**: WASM-based implementation of the Manifold library.
* **Key Feature**: Near-instant boolean operations (unions, subtractions, intersections). It solves the "hot reloading bottleneck" of older software by performing geometry calculations in milliseconds.
* **Style**: The raw "engine" used by more sophisticated tools like ForgeCAD.

---

## ️ Technical Stack (2026 Stack)
* **Rendering**: [Three.js](https://threejs.org/) with `MeshPhysicalMaterial` for high-fidelity crystal/neon aesthetics.
* **Dependency Management**: Zero-install ESM workflow using [esm.sh](https://esm.sh) and Browser **Import Maps**.
* **UI/UX**: Glassmorphism dashboard with real-time feedback sliders.
* **Kernels**:
 * **CSG**: OpenJSCAD (JS-native).
 * **SDF/Manifold**: Manifold 3D (WASM).
 * **B-Rep**: OpenCascade.js (via FluidCAD).

## AI-Assisted Modeling Patterns
For AI agents generating models in this project:
1. **Standardize on ForgeCAD**: ForgeCAD is our chosen standard framework for all projects. It wraps the WASM-based Manifold engine for near-instant boolean calculations and provides the `param()` pattern for real-time adjustable sliders.
2. **Legacy Engines**: OpenJSCAD and raw Manifold JS are maintained for reference, but new projects and components should be built using the ForgeCAD paradigm.
3. **Aesthetics**: Always use vibrant, neon-themed materials (e.g. `MeshPhysicalMaterial` with glowing neon glassmorphic aesthetics) to differentiate parametric segments.

---

## Project Structure
```text
/
├── 00-CommonParts/      # Reusable parametric components and utilities
│   ├── Exporter/        # Shared STL and SVG exporter libraries
│   └── ...
├── 01-ForgeCAD/         # The high-level studio approach
├── 02-OpenJSCAD/        # The functional CSG approach
├── 03-Manifold/         # The raw WASM-kernel approach
├── 06-SythKnobs/        # Access Synth Knobs parametric configurator
│   └── src/             # Modular JS code split (state, geometry, ui)
├── 12-Potentiometer/    # Parametric box enclosure project
└── ...
```

---

## 🛠️ Modularization & Refactoring Standards

To maintain code readability and make AI-assisted improvements easier, we enforce the following architectural rules for all projects:

1. **500-Line Limit per File**:
   * Avoid massive monolithic scripts inside HTML templates.
   * Split business logic into dedicated JavaScript module files under a project's `src/` directory (e.g., `state.js`, `geometry.js`, `ui.js`).
   * Each file should ideally stay under **500 lines** of code.

2. **Standardized Directory Architecture**:
   * **`state.js`**: Holds runtime state variables, parameter collection (`getParams`), slider synchronization, haptic feedback, and audio context tone scaling.
   * **`geometry.js`**: Contains geometry kernel setup (e.g., Manifold WASM), 3D canvas viewport loops, and Three.js mesh mappings.
   * **`ui.js`**: Binds DOM event listeners, handles presets, triggers batch mutations, and serves as the orchestrator.

3. **Shared Exporter Libraries**:
   * Any geometry export formats (such as ASCII `.stl` or 2D layered `.svg` for laser cutting) are treated as shared features.
   * Place exporters in the `00-CommonParts/Exporter/` directory (e.g., `stl.js` and `svg.js`) so that any parametric configurator in the workspace can import and reuse them.

