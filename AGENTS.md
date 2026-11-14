# Portfolio Website Documentation

## 0. Strict Scoping & Token Efficiency (Agent Boundary Rules)
* **Confine to Requested Folders**: When the user specifies a directory (e.g., `public/MiniProjects/...`), agents MUST limit reads, searches, and edits strictly to that directory and its immediate files.
* **No Speculative Exploration**: Do NOT crawl parent directories, root files, build setups, or unrelated content trees unless explicitly directed by the user.
* **Autonomous Mini-Projects**: Projects under `public/MiniProjects/` are independent and self-contained with their own local styles and scripts.
* **Explicit Integration Only**: Only create or modify cards in `src/content/` when explicitly requested.

---

## 1. Human-in-the-Loop Testing (No Browser Subagents)
* **DO NOT spawn browser subagents** to test pages, clicks, or visual layouts.
* **Iterate on Feedback**: The user will reply with observations and/or ideas for refinement.

---

## 2. Modular Architecture (Vite)
The website is a modular SPA powered by **Vite** and **Handlebars**. Content is decoupled into HTML fragments in `src/content/` and injected into `src/index.html`.

### Project Structure
* **`src/`**: Source code (`index.html`, `partials/`, `content/`, `scripts/`, `styles/`).
* **`public/`**: Static assets and standalone mini-projects served as-is.
* **`dist/`**: Production build output (managed by user).

### Content Mapping (`src/content/` -> Handlebars variables)
* `laser/` -> `{{laserCards}}`
* `3dprinting/` -> `{{printingCards}}`
* `work/` -> `{{workCards}}`
* `major-projects/` -> `{{majorProjectCards}}`
* `mini-projects/` -> `{{miniProjectCards}}`
* `esp32/` -> `{{esp32Cards}}`
* `shop/` -> `{{shopCards}}`

---

## 3. Maintenance Tools
* **`ManageContent.bat`**: GUI server (`tools/content-manager/server.js`) on `http://localhost:3456` to reorder cards, edit titles, delete entries, and add new projects.
* **`CreateEntry.bat`**: CLI generator for adding content cards to `src/content/`.

---

## 4. Development Guidelines
* **DO NOT run `npm run build`**: Production builds are handled solely by the user.
* **Card Format**: Cards in `src/content/mini-projects/` use `<div class="grid-item"><h2>Title</h2><p>... </p><ul>...</ul></div>`.

