# Portfolio Website Documentation

## 0. Strict Scoping & Token Efficiency (Agent Boundary Rules)
* **Confine to Requested Folders**: When the user specifies a directory (e.g., `public/MiniProjects/...`), agents MUST limit reads, searches, and edits strictly to that directory and its immediate files.
* **No Speculative Exploration**: Do NOT crawl parent directories, root files, build setups, or unrelated content trees unless explicitly directed by the user.
* **Autonomous Mini-Projects**: Projects under `public/MiniProjects/` are independent and self-contained with their own local styles and scripts.
* **Explicit Integration Only**: Only create or modify cards in `src/content/` when explicitly requested.

---

## 1. Human-in-the-Loop Testing (No Browser Subagents)
* **DO NOT spawn browser subagents** to test pages, clicks, or visual layouts.
* **Provide Numbered Test Steps**: When code is ready for verification, output a numbered step-by-step test plan for the user to try in their browser:
  Actions to perform / URL or file to open
  Expected outcome to observe
* **Iterate on Feedback**: The user will reply with corresponding step-by-step observations, confirmation, or ideas for refinement.

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
* `mini-projects/` -> `{{miniProjectCards}}`
* `esp32/` -> `{{esp32Cards}}`
* `shop/` -> `{{shopCards}}`

---

## 3. Maintenance Tools
* **`ManageContent.bat`**: GUI server (`tools/content-manager/server.js`) on `http://localhost:3456` to reorder cards, edit titles, delete entries, and add new projects.
* **`CreateEntry.bat`**: CLI generator for adding content cards to `src/content/`.

---

## 3b. Labyrinth Editor (Isolated Work)
* The Dimensional Labyrinth (`public/Labyrinth/`) has an isolated editor at `/Labyrinth/editor.html` on the dev server. It renders one style, shape, room, scene or critter from URL settings and live-reloads on save.
* When the user pastes an editor link, read only the files its "Files for this view" panel lists. Workflow and file map: `public/Labyrinth/AGENTS.md` section 0.

---

## 3c. Local Headless AI Video Generation (`Thresholds`)
* **Engine Location**: `E:\AI\ImageGeneration\generate_video.py` using `E:\AI\ImageGeneration\venv\Scripts\python.exe`.
* **Hardware Profile**: NVIDIA GeForce RTX 5060 Ti (16 GB VRAM).
* **Strict Disk Rule**: **NEVER write or cache on `C:`**. All HuggingFace caches and models MUST reside on `E:\AI\ImageGeneration\hf_cache` (`HF_HOME` & `HF_HUB_CACHE` enforced).
* **Current Status**:
  - `Thresholds` website frontend is complete with 12 photographic plates, Web Audio ambient engine, and video layer with fade-to-black scene transitions (`public/MiniProjects/Thresholds/`).
  - LTX-Video pipeline runs headlessly on the GPU via sequential CPU offload, but test outputs (`output_test_ltx.mp4`) are currently rendering nearly static (lack sufficient dynamic motion/animation from the conditioning frame).
* **Next Session Tasks**:
  1. Investigate and fix LTX-Video motion dynamics: adjust conditioning noise/denoise parameters (`decode_timestep`, `decode_noise_scale`), motion guidance scale, or explore Wan2.1 / SVD-XT integration in `E:\AI\ImageGeneration`.
  2. Batch-generate videos for the 11 remaining passages (`generate_video.py --thresholds`) into `public/MiniProjects/Thresholds/assets/videos/`.
* Reference documentation: `E:\AI\ImageGeneration\AGENTS.md`.

---

## 3d. Apex Parasite: Chimera Odyssey (`public/MiniProjects/ApexParasite/`)
* **Project Directory**: `public/MiniProjects/ApexParasite/`
* **Codex & Master Architectural Plan**: `public/MiniProjects/ApexParasite/gameDev/APEX_PARASITE_REDESIGN_PLAN.md`
* **Agent Documentation**: `public/MiniProjects/ApexParasite/AGENTS.md`
* **Stack & Architecture**:
  * 2.5D multi-plane spring-physics parallax canvas with dynamically keyed modular dark-fantasy art assets (`assets/`, `src/assets.js`).
  * Procedural Web Audio synthesis (`src/audio.js`).
  * Recursive node-socket organ chimera tree (`src/chimera.js`), mental bandwidth, discrete limb combat targeting (`src/combat.js`), live specimen surgical triage (`src/surgery.js`), DCSS cross-training (`src/skills.js`), and Persona 5 high-contrast bio-cyberpunk UI.

## 3e. Parametric PCB Suite (`public/ParametricPCB/`)
* **Project Directory**: `public/ParametricPCB/`
* **Master Engineering Skill**: [`public/ParametricPCB/SKILL.md`](file:///f:/Github/Website/public/ParametricPCB/SKILL.md) (Covers tscircuit architecture, JLCPCB SMT manufacturing rules, BOM/CPL parity, SOT-23 rotation tables, flyback diode polarity rules, trace width clamping, and laser test-fit protocols).
* **Subprojects**:
  - `public/ParametricPCB/01-V6Led/`: Parametric 6-LED strip configurator with mousebite panelization.
  - `public/ParametricPCB/02-audioMotionReactiveLedHapticPCB/`: Turnkey Baton Carrier PCB with ESP32-C3 SuperMini, MPU6050/6500 IMU, INMP441/MAX4466 microphones, AO3400A/AO3401A power and haptic drivers, high-side LED isolation, dual-side silkscreen mirroring, vector QR code, M3 mounting holes, and 600 DPI laser test fits. Reference: [`public/ParametricPCB/02-audioMotionReactiveLedHapticPCB/AGENTS.md`](file:///f:/Github/Website/public/ParametricPCB/02-audioMotionReactiveLedHapticPCB/AGENTS.md).
  - `public/ParametricPCB/03-compactAudioMotionSquarePCB/`: Compact Dense Square Reactive Controller PCB (38×38mm) with back-to-back 3D stacking (ESP32 on top, MPU on backside), 3× addressable LED outputs, dual haptic PWM drivers, dual microphones, LiPo charger with auto power-path, and standard 31×31mm M3 bolt pattern. Reference: [`public/ParametricPCB/03-compactAudioMotionSquarePCB/AGENTS.md`](file:///f:/Github/Website/public/ParametricPCB/03-compactAudioMotionSquarePCB/AGENTS.md).
* **Agent Guidelines**:
  - Confine work strictly to `public/ParametricPCB/`.
  - When editing circuits or exports, always maintain strict 1-to-1 BOM/CPL parity and verify diode/MOSFET orientations against `SKILL.md`.

---

## 4. Development Guidelines
* **DO NOT run `npm run build`**: Production builds are handled solely by the user.
* **Card Format**: Cards in `src/content/mini-projects/` use `<div class="grid-item"><h2>Title</h2><p>... </p><ul>...</ul></div>`.

