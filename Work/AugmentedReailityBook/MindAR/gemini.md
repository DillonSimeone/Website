# Ford Pines Scanner AR | Professionalized v8.1

This project is a high-performance AR scanner interface inspired by Ford Pines (Gravity Falls). It uses **MindAR** for camera/image tracking and **Three.js** for rendering.

## 🛠️ Build Pipeline (Unified)
The project has been migrated from a disjointed 11ty + legacy-minify system to a modern **unified build pipeline**:

-   **Development**: `npx @11ty/eleventy --serve`
-   **Production Build**: `npm run build`
    -   **11ty**: Processes `.njk` and `.njk` templates, copies static assets to `dist/`.
    -   **esbuild**: Bundles the modular JavaScript into a single `app.min.js`, applying **tree-shaking** for Three.js to reduce size (from 1.1MB to ~600KB).
-   **Deployment**: Ready for static hosting from the `dist/` folder.

## 📂 Project Structure

-   `/.eleventy.js` — 11ty configuration (Static site generator).
-   `/esbuild.config.js` — JavaScript bundler and Three.js tree-shaking rules.
-   `/app/` — Source files.
    -   `index.njk` — Main entry point (Nunjucks template).
    -   `/style/styles.css` — Core scanner aesthetics.
    -   `/javascript/` — Modular logic:
        -   `app.js` — Main orchestrator.
        -   `anomaly.js` — Puzzle and anomaly tracking system.
        -   `WaveformRenderer.js` — CRT wave animation engine.
        -   `DevUI.js` — Interactive transform tuner.
        -   `CoreAR.js` — AR scene and renderer setup.
        -   `AudioManager.js` — Sound effect management.
        -   `smoothing.js` — High-precision pose filtering.
    -   `/assets/` — Sounds, models, and UI textures.
    -   `/milestones/` — Historical versions of the scanner (v0-v4).

## 🚀 Key Improvements (Recent Audit)
1.  **Tree-Shaking**: Optimized Three.js imports by replacing relative imports with bare specifiers and using esbuild aliases.
2.  **Modularization**: Broke down the 1000+ line dual-pipeline code into focused, reusable ES modules.
3.  **Cleanup**: Removed ~400 lines of dead code, orphaned hints, and redundant build scripts (`minify.js`, `ProduceProduction.bat`).
4.  **Renaming**: Standardized filenames to clean basenames (`appV4.js` → `app.js`).
5.  **Fixed Regressions**: Restored global access to `handleARFailure` for telemetry and debug scripts.

---
*Scanner S/N: 06182012-G // Ref: F.P. // System Offline.*