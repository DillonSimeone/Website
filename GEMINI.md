# Portfolio Website Documentation

## 1. Background Optimization System
The website uses a high-performance background system that combines the aesthetic of dynamic geometric patterns with the speed of static assets.

### How it works
1.  **Static Skeletons:** Instead of generating thousands of triangles in real-time, the site loads pre-calculated SVG "skeletons" stored as strings in `background.js`.
2.  **Dynamic Re-skinning:** Upon page load, the script picks a random color palette (via `randomColors.js`) and applies it to the static SVG paths. This provides a unique look on every visit with zero geometry-calculation overhead.
3.  **Performance:** Switched from the `trianglify.min.js` library (44KB + CPU heavy) to a lightweight ~200-path static model. CPU usage for background rendering is effectively 0%.

### Interactive Effects
The background still supports premium interactive features:
*   **Glow Trace:** Triangles light up as the cursor moves over them.
*   **Shatter Effect:** Clicking the main name triggers a physics-based "shatter" animation (defined in `indexScript.js`).

---

## 2. One-Click Background Regeneration
To change the "seed" or layout of the background across all devices, a dedicated build tool is provided.

### Files Involved
*   **`RegenerateBackground.bat`**: The one-click entry point. Run this to start the process.
*   **`rebuild.py`**: A Python script that orchestrates the workflow:
    1.  Starts a temporary local server (Port 8085).
    2.  Opens your default browser to `generator.html`.
    3.  Receives the new SVG patterns back from the browser.
    4.  Updates `background.js` with the fresh data.
*   **`generator.html`**: The math engine. It uses the original `trianglify.min.js` in a headless context to generate new high-quality patterns.

### Usage
Double-click `RegenerateBackground.bat`. A browser tab will open briefly, generate new patterns, and close automatically. Refresh your portfolio to see the new layout!

---

## 3. CSS Architecture & Performance
The styling system has been refactored for maintainability and speed.

### Consolidations
*   **Global Layout:** Redundant rules for `section`, `.grid`, and `.grid-item` have been merged into core selectors. All main pages (Work, Projects, Hobby, ESP32) now inherit a consistent base layout.
*   **Theming:** Uses CSS variables (`--bg-primary`, `--neon-cyan`, etc.) for seamless Light/Dark mode switching.
*   **Lazy Rendering:** Implemented `content-visibility: auto` on heavy components like project cards and artwork grids. This allows the browser to skip rendering off-screen content, significantly improving scroll performance on long pages.

### Maintenance
*   **Root `style.css`**: The single source of truth for all styling.
*   **Variables**: Modify variables in the `:root` and `body.dark-mode` blocks to update the site's accent colors globally.
