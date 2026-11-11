# DJ Deaf Wish — Project Instructions & AI Assistant Guide

Welcome to the **DJ Deaf Wish** codebase for Nate Hergert.

### Master Documentation
Please read and follow [AGENTS.md](AGENTS.md) for full architectural guidelines, coordinate systems, and detailed code recipes.

---

### Key Operational Rules for AI Assistants
1. **Camera-Based "Pages"**:
   - There are no separate HTML subpages for content sections.
   - All "pages" are **3D camera waypoints (`STOPS`)** defined in [`src/three/world.js`](src/three/world.js).
   - Adding a new page requires registering a stop in `STOPS`, adding a dot to `index.html`, and connecting the modal card or 3D geometry in `src/app.js` and `src/data/gigs.js`.
2. **Vanilla ES Modules (Zero Build Step)**:
   - Do NOT run `npm build` or install bundlers.
   - Three.js is loaded natively via standard browser `importmap` in `index.html`.
   - All files use relative ES Module imports.
3. **Local Testing**:
   - Test locally using any static web server: `npx serve .` or `python -m http.server 8000`.
   - Never spawn headless browser subagents for visual checks without user consent; provide clear numbered testing instructions.
4. **Coordinate Integrity**:
   - 1 unit = 1 meter.
   - Centerline is `x = 0`.
   - Pyramid apex is at `(0, 460, -1500)`.
   - Do not adjust camera coordinates without verifying clearance against street building collision boundaries described in `AGENTS.md`.

---

### Quick Links
- Architecture & Page Recipe: [AGENTS.md](AGENTS.md)
- Content & Gig Data: [`src/data/gigs.js`](src/data/gigs.js)
- Camera & World Layout: [`src/three/world.js`](src/three/world.js)
- Application Controller: [`src/app.js`](src/app.js)
- Hidden Deployment & Zipper Tool: [`export.html`](export.html)
