# Sheet-to-Tube Cylinder Cap Configurator

This mini-project is a code-first parametric 3D configurator designed to generate custom 3D-printable caps, seam brackets, and motor gear drive housings to roll flat plastic sheets into cylindrical tubes.

## 📁 Project Structure

The project has been modularized to separate state, geometry calculation, UI interaction, viewport rendering, and file exporting:

*   **[index.html](file:///f:/Github/Website/public/ParametricModeling/09-SheetToTube/index.html)**: Main HTML structure. Loads **`src/main.js`** as a module.
*   **[style.css](file:///f:/Github/Website/public/ParametricModeling/09-SheetToTube/style.css)**: Cyberpunk technical layout styling.
*   **`src/`**: Modularized logic files:
    *   **[main.js](file:///f:/Github/Website/public/ParametricModeling/09-SheetToTube/src/main.js)**: Orchestrator that bootstraps the loader, UI listeners, viewport, and manages the mesh rebuild loop.
    *   **[state.js](file:///f:/Github/Website/public/ParametricModeling/09-SheetToTube/src/state.js)**: Central state holding application parameters, colors, visibilities, and mesh/context references.
    *   **[viewport.js](file:///f:/Github/Website/public/ParametricModeling/09-SheetToTube/src/viewport.js)**: Configures the Three.js scene, camera, lights, orbit controls, window resizing, and frame loop.
    *   **[manifoldInit.js](file:///f:/Github/Website/public/ParametricModeling/09-SheetToTube/src/manifoldInit.js)**: Asynchronously boots up the Manifold WASM geometry kernel.
    *   **[geometry.js](file:///f:/Github/Website/public/ParametricModeling/09-SheetToTube/src/geometry.js)**: Aggregator index that re-exports all sub-geometry modules:
        *   **[geometry/helpers.js](file:///f:/Github/Website/public/ParametricModeling/09-SheetToTube/src/geometry/helpers.js)**: Cylinder mesh builders and Three.js translation wrappers.
        *   **[geometry/caps.js](file:///f:/Github/Website/public/ParametricModeling/09-SheetToTube/src/geometry/caps.js)**: Groove boundaries and top/bottom end-cap structures.
        *   **[geometry/brackets.js](file:///f:/Github/Website/public/ParametricModeling/09-SheetToTube/src/geometry/brackets.js)**: Custom seam fasteners and clearance notch cuts.
        *   **[geometry/gears.js](file:///f:/Github/Website/public/ParametricModeling/09-SheetToTube/src/geometry/gears.js)**: Crown rings, pinions, and custom spur gear calculations.
        *   **[geometry/motorHolder.js](file:///f:/Github/Website/public/ParametricModeling/09-SheetToTube/src/geometry/motorHolder.js)**: Horizontally aligned Type 130 motor housings, tolerances, and retaining screws.
        *   **[geometry/connector.js](file:///f:/Github/Website/public/ParametricModeling/09-SheetToTube/src/geometry/connector.js)**: Flanged center wiring slip ring guides.
    *   **[ui.js](file:///f:/Github/Website/public/ParametricModeling/09-SheetToTube/src/ui.js)**: Binds sliders/buttons to states, updates HUD details, and renders dimensioning overlay leader lines.
    *   **[exporter.js](file:///f:/Github/Website/public/ParametricModeling/09-SheetToTube/src/exporter.js)**: Converts watertight Manifold geometries into downloadable binary STL files.

## ⚙️ Key Mechanisms
1. **Parametric Clearance**: Subtracted a $2\text{ mm}$ deep radial clearance notch inside the motor holder's central column to comfortably fit horizontal Type 130 DC motor backing journals.
2. **Oriented Screw Holes**: Spun the M3 flange screw holes pattern by $90^\circ$ (to $90^\circ, 210^\circ, 330^\circ$) to guarantee they avoid intersecting the motor pocket cutouts from the top cap sides.
