# Project: Parametric Modeling (AI-Assisted CAD)

This project explores the "State of the Art" (as of 2026) in code-first parametric 3D modeling using JavaScript and TypeScript. It serves as a testing ground for different geometry kernels and high-level CAD frameworks that are optimized for AI-assisted design.

## 🚀 The Three Approaches

We have implemented three parallel environments, each with a live Three.js viewport and parametric controls.

### 1. ForgeCAD / FluidCAD (`/01-ForgeCAD`)
*   **Paradigm**: High-level, declarative, and AI-friendly syntax.
*   **Engine**: Wraps the Manifold geometry kernel for robust operations.
*   **Key Feature**: Uses a `param()` pattern that allows AI agents to easily define adjustable sliders and "hot-reload" models instantly.
*   **Style**: Focused on Developer Experience (DX) and rapid prototyping.

### 2. OpenJSCAD V2 (`/02-OpenJSCAD`)
*   **Paradigm**: Functional Constructive Solid Geometry (CSG).
*   **Engine**: Pure JavaScript modular engine.
*   **Key Feature**: Predictable, programmatic API where the design is a pure function of its parameters.
*   **Implementation Note**: Uses the modular `@jscad/modeling` V2 API. Requires careful category awareness (e.g., `extrusions` instead of generic `operations`).

### 3. Manifold JS (`/03-Manifold`)
*   **Paradigm**: Low-level, high-performance geometry kernel.
*   **Engine**: WASM-based implementation of the Manifold library.
*   **Key Feature**: Near-instant boolean operations (unions, subtractions, intersections). It solves the "hot reloading bottleneck" of older software by performing geometry calculations in milliseconds.
*   **Style**: The raw "engine" used by more sophisticated tools like ForgeCAD.

---

## 🛠️ Technical Stack (2026 Stack)
*   **Rendering**: [Three.js](https://threejs.org/) with `MeshPhysicalMaterial` for high-fidelity crystal/neon aesthetics.
*   **Dependency Management**: Zero-install ESM workflow using [esm.sh](https://esm.sh) and Browser **Import Maps**.
*   **UI/UX**: Glassmorphism dashboard with real-time feedback sliders.
*   **Kernels**:
    *   **CSG**: OpenJSCAD (JS-native).
    *   **SDF/Manifold**: Manifold 3D (WASM).
    *   **B-Rep**: OpenCascade.js (via FluidCAD).

## 💡 AI-Assisted Modeling Patterns
For AI agents generating models in this project:
1.  **Prefer Manifold/ForgeCAD** for complex assemblies where boolean speed is critical.
2.  **Use JSCAD** for simple, functional parts where purely functional JS logic is required.
3.  **Aesthetics**: Always use vibrant, neon-themed materials to differentiate parametric segments.

---

## 📂 Project Structure
```text
/
├── 01-ForgeCAD/        # The high-level studio approach
├── 02-OpenJSCAD/       # The functional CSG approach
├── 03-Manifold/        # The raw WASM-kernel approach
├── serve_exploration.py # Simple server to launch all three
└── gemini.md           # This documentation
```
