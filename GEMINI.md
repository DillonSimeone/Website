# Portfolio Website Documentation

## 1. Modular Architecture (Vite)
The website has been refactored from a monolithic `index.html` into a modular, production-ready system powered by **Vite**.

### Project Structure
*   **`src/`**: Contains the source code.
    *   **`index.html`**: The main template.
    *   **`partials/`**: Reusable HTML components (`nav.html`, `hero.html`).
    *   **`content/`**: Individual project cards and section content organized by category (`laser/`, `3dprinting/`, `work/`, `esp32/`).
    *   **`scripts/`**: Modularized logic (`indexScript.js`, `background.js`).
*   **`public/`**: Static assets (Images, PDFs, Mini-Projects) that are copied as-is to the build output.
*   **`dist/`**: The production build (ignored by Git).
*   **`legacy/`**: Original root files preserved for reference.

### Build Pipeline
The site uses an "Extreme Minification" process:
1.  **Modular Injection**: Handlebars partials and content cards are dynamically injected into the template.
2.  **Inlining**: All CSS and JavaScript are inlined into a single `dist/index.html` using `vite-plugin-singlefile`.
3.  **Compression**: `Terser` and `ViteMinifyPlugin` strip all whitespace, comments, and console logs.
4.  **Cleanup**: A custom post-build script removes unwanted folders (`venv`, `.pio`, `node_modules`) from the sub-project directories in `dist`.

---

## 2. Background Optimization System
The website uses a high-performance background system that combines the aesthetic of dynamic geometric patterns with the speed of static assets.

### How it works
1.  **Static Skeletons:** Instead of generating thousands of triangles in real-time, the site loads pre-calculated SVG "skeletons" stored as strings in `background.js`.
2.  **Dynamic Re-skinning:** Upon page load, the script picks a random color palette (via `randomColors.js`) and applies it to the static SVG paths.
3.  **Performance:** Switched from `trianglify.min.js` to a lightweight static model. CPU usage for background rendering is ~0%.

### Regeneration Tools (Moved to `legacy/`)
To change the "seed" or layout of the background, use the tools now located in the `legacy/` folder:
*   **`RegenerateBackground.bat`**: The one-click entry point.
*   **`rebuild.py`**: Orchestrates the generator flow.
*   **`generator.html`**: The math engine using `trianglify.min.js`.

---

## 3. CSS Architecture & Theming
*   **Theming**: Uses CSS variables (`--bg-primary`, `--neon-cyan`, etc.) for seamless Light/Dark mode switching. State is persisted via `localStorage`.
*   **Performance**: Implemented `content-visibility: auto` on heavy components like project cards to improve scroll performance.
*   **Global Layout**: Redundant rules for sections and grids have been merged into core selectors for consistency across all categories.

---

## 4. Maintenance & Deployment
*   **Dev Mode**: Run `npm run dev` for local development with hot-reloading.
*   **Build**: Run `npm run build` to generate the production `dist/index.html`.
*   **Deployment**: Automated via GitHub Actions (see `GitHubActions.md` for setup instructions). Deployment targets the `gh-pages` branch, keeping the `main` repository clean.
