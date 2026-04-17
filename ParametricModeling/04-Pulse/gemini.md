# Project: Haptic Device Housing (ESP-NOW Follower)

This project is a high-performance, parametric 3D modeling environment designed for the rapid prototyping and manufacturing of haptic feedback devices. It explores the same "Vibration Device" project across three different "State of the Art" (2026) parametric modeling frameworks.

## 🚀 The Three Environments

The project is split into three directories, each using a different geometry kernel and design paradigm:

### 1. `/manifold` (Standard Engine)
*   **Paradigm**: Low-level, high-performance WASM kernel.
*   **Engine**: Raw Manifold-3D.
*   **Features**: The most complete version with specific motor presets (Type 130), thermal cooling grids, and active clamping logic.
*   **Performance**: ~5ms rebuild time.

### 2. `/forgeCad` (Declarative Studio)
*   **Paradigm**: AI-friendly, high-level declarative syntax.
*   **Engine**: Manifold backend with ForgeCAD's `param()` wrapping.
*   **Features**: Demonstrates how "Parametric Hot Reloading" works for developer-focused CAD.
*   **Vibe**: Clean, minimalist UI with focused parameters.

### 3. `/openJSCAD` (Functional CSG)
*   **Paradigm**: Functional Constructive Solid Geometry.
*   **Engine**: `@jscad/modeling` V2 (Pure JS).
*   **Features**: Geometry is a pure function of parameters. Uses the JSCAD modular API for extrusions and booleans.
*   **Renderer**: REGL-based rendering bridge to Three.js.

---

## 🚀 Key Engineering Features (Across Versions)

### 1. Sled-in-Shell Architecture
The housing uses a modular "Sled-in-Shell" design:
*   **Outer Shell**: A cylindrical tube with longitudinal internal tracks. The geometry uses **Outward-Expanding Wall Logic**, ensures internal clearance remains constant.
*   **Haptic Sled (Chassis)**: A slide-in board with integrated rails that lock into the shell tracks.

### 2. Parametric Component Pockets
The sled features adjustable pockets for:
*   **ESP32-C3 SuperMini**
*   **L298N Mini Motor Driver**
*   **TP4056 Charging Module**
*   **Lipo Battery**

---

## 🛠️ Technical Stack (2026 Stack)
*   **Rendering**: Three.js with `MeshPhysicalMaterial` for premium aesthetics.
*   **Dependency Management**: ESM imports via `esm.sh` and `unpkg`.
*   **UI/UX**: Glassmorphism dashboards with real-time feedback.

---

# Fun Facts

*   **Code vs. Geometry**: The logic for these models is ~30-50 KB, while the exported STL meshes are ~700 KB+.
*   **The Kernel**: Manifold (used in /manifold and /forgeCad) was originally a 20% project at Google and is now a global standard for robust boolean operations.
*   **Render Speed**: Recalculating the entire assembly takes less time than a single frame of a 60FPS video (~16ms).


