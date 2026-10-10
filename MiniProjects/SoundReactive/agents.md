# Sound-Reactive Arts Project Documentation

Welcome! This workspace is a curated hub for high-performance, visually stunning sound-reactive web installations.

## Project Aims
1. **Interactive Audio Visuals**: Create immersive, real-time web-based visualizers using Three.js, Canvas2D, and WebGL driven by the Web Audio API.
2. **Modular Architecture**: Every art project is completely self-contained in its own directory (e.g., `ripple/`, `spectrum/`, etc.) with its own HTML, CSS, and JS.
3. **Neo-Noir HUD**: The root dashboard acts as a futuristic "Case File" case-board or central command hub (HUD), styled with an immersive neo-noir theme (typewritten fonts, high-contrast monochrome values, halftone print overlays, and vintage neon/monochrome styling).

## Project Structure
- `index.html`: The neo-noir hub/dashboard.
- `hud-style.css`: Stylesheet implementing the halftone grit, typewriter aesthetics, and high-contrast styling for the hub.
- `<art-folder>/`: Individual, modular sound-reactive arts (e.g. `ripple/ripple.html`).

## Guidelines for Adding New Projects
1. Create a new folder at root (e.g. `spectrum/`).
2. Add your main HTML file inside it (e.g., `index.html`).
3. Keep all JS, CSS, and asset dependencies scoped within that folder.
4. Add a new card to the root dashboard `index.html` following the same neo-noir case file format.
