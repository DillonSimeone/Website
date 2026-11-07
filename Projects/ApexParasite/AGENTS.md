# APEX PARASITE — AI AGENT SYSTEM DOCUMENTATION

> **AGENT DIRECTIVE:** Every AI agent working on this codebase MUST review and update this `AGENTS.md` whenever adding, modifying, or refactoring features, schemas, APIs, or systems. Keep content compact, dense, and unambiguous.

---

## 0. MASTER DESIGN CODEX & PHILOSOPHY
* **Full Architectural Codex & Design Plan**: [`gameDev/APEX_PARASITE_REDESIGN_PLAN.md`](./gameDev/APEX_PARASITE_REDESIGN_PLAN.md)
* **High Concept**: "A spaceship/mechsuit builder, but earth-bound, and the spaceship is your organic body constructed from parts of fey beasts and humans you defeat."
* **Aesthetic Standard**: Persona 5 bio-cyberpunk typography, high-contrast palette (Black `#05070a`, Crimson `#f43f5e`, Gold `#f59e0b`, Cyan `#00f0ff`), 2.5D spring-physics parallax, and visceral screen shake.

---

## 1. PROJECT METADATA & STACK
* **Directory**: `public/MiniProjects/ApexParasite/`
* **Visual Engine**: 2.5D Multi-Plane Parallax Stage (`src/parallax.js`) + Modular Chroma-Keyed Sprites (`src/assets.js`) + Interactive SVG Hitboxes.
* **Audio Engine**: Web Audio Procedural Synthesis (`src/audio.js`): Heartbeat tempo, reality shatter, electric nerve twitches, wet incisions, bone crushes, and squelches.
* **Architecture**: Event-driven modular subsystem graph (ChimeraTree, AnatomicalCombat, LocationEngine, SurgicalField, SkillSystem, AssetManager, GameHUD).
* **Dependencies**: Native HTML5 Canvas / Web Audio / Local ES Modules. No external CDN dependencies; served via Vite dev server.

---

## 2. FILE MAP
* `gameDev/`:
  * `APEX_PARASITE_REDESIGN_PLAN.md`: Complete system codex, balance formulas, lore on Human Champions & Depravity, and Step-by-Step gameplay walkthrough from start menu to forest surgery.
* `assets/`:
  * `house.jpg`: Medieval Tudor half-timbered gothic house with glowing amber leaded windows.
  * `spire.jpg`: Ominous gothic cathedral stone spire with flying buttresses.
  * `lamp.jpg`: Victorian gothic wrought-iron street gas lamp post with warm amber lantern glow.
  * `tree.jpg`: Ancient primeval redwood trunk draped in glowing emerald moss and roots.
  * `beast.jpg`: Chimera apex predator with razor scythe arms, thorn mantle, and toxic green eyes.
* `index.html`: Main viewport, start menu overlay, top status bar, parallax canvas, angular action ribbon, combat targeting stage viewport, radial surgical triage overlay, and Persona 5 modals (Assembly Rig, Crucible, Skills, Market, Tavern, Sanctuary, Codex, Game Over).
* `css/style.css`: High-contrast styling, angular skew ribbons, floating reticles, radial surgery layouts, market/tavern grids, and modal z-index hierarchy (`.p5-modal-backdrop` at `z-index: 3000`).
* `postCombat.html`: Standalone harness for the post-combat surgery module (see gameDev/SPEC_postCombat_phase2.md).
* `src/postcombat/`: Surgery module. `core.js` (pure, headless session logic), `index.js` (view + createSurgery API),
  `config.js` (all tuning numbers), `harness.js`. Talks to the game ONLY via SurgeryInput/SurgeryResult.
* `content/templates/*.json`: Body-plan templates (slots, clamp points). Species files patch templates.
* `src/postcombat/body.js`: Deterministic per-body generation (per-slot hashed RNG). `balance.js`: balance test harness.
* `content/specimens/*.json`, `content/loot/*.json`: data-driven monster anatomy and loot defs.
* `src/`:
  * `assets.js`: `AssetManager`. Loads modular assets on black backgrounds and dynamically keys out black luminance via luminance thresholding & alpha feathering into cached transparent offscreen canvases.
  * `start_menu.js`: `StartMenu`. The Awakening title screen, 2D scanline & spore canvas, 3D mouse perspective tilt, Bio-Essence Sanctuary (persisted via `localStorage` key `apex_parasite_meta_v1`), Codex tabs, and screen shatter burrowing transition.
  * `parallax.js`: `ParallaxStage`. Multi-plane 2.5D parallax (Layer 0 Sky/Moon, Layer 1 Cathedral Spires / Far Canopy, Layer 2 Tudor Houses / Giant Redwoods, Layer 3 Gas Lamps / Godrays, Layer 4 Floor / Blood Pool, Layer 5 Stone Archway / Foreground Vines). Spring-physics mouse tilt, screen shake, and slash VFX.
  * `game.js`: `GameEngine`. Master orchestrator connecting ChimeraTree, ParallaxStage, AnatomicalCombatEngine, LocationEngine, SurgicalField, SkillSystem, GameHUD, and AssetManager. Manages calories, blood, biomass, shillings, active bounties, and run reset cleanups.
  * `combat.js`: `AnatomicalCombatEngine`. Discrete limb targeting, hover reticle math, mid-combat limb severance, expanding arterial blood pool, hemorrhagic shock collapse (<20% blood), and guild bounty payouts.
  * `hud.js`: `GameHUD`. Status bar telemetry, angular action ribbons, interactive creature SVG targeting, damage flyoff numbers, radial surgical stage, market modal, tavern modal, and game over modal.
  * `chimera.js`: `ChimeraTree`, `BodyPartNode`, `RefrainAlchemyCrucible`. Recursive node-socket graph (Torsos on Torsos, Forearms on Forearms), limb XP, and mental bandwidth draw.
  * `surgery.js`: `SurgicalField`. Post-combat living specimen triage with Vital Pulse shock meter, pristine live extraction, flatline necrosis, and biomass feasting.
  * `locations.js`: `LocationEngine`. Menu-driven travel across City, Primeval Forest, Wilderness, and Camp. Calorie drain calculated from mass, terrain, and weather.
  * `skills.js`: `SkillSystem`. Emergent hidden skills (Combat, Surgery, Foraging, Sneaking, Inspection), DCSS Cross-Training (40% cross-XP), and awakening banners.
  * `types.js`: Bitmask constants, glyph indexes, element affinities, rarity configs, and active ability registry.
  * `audio.js`: `BioAudio`. Web Audio procedural synthesizer.
  * `main.js`: Bootstrapper and keyboard shortcut dispatcher (`Tab/C` Assembly, `K` Skills, `M` Mute, `Esc` Close, `1-5` Combat strikes).

---

## 3. CORE ARCHITECTURAL RULES & CONTRACTS

### A. Modular AI Asset Generation & Chroma Keying Pipeline
* **Generation**: All modular assets are generated with prompts ending in `"isolated on a pure solid black background, dark fantasy environment/creature asset, clean silhouette, high contrast"`.
* **Keying**: `AssetManager.loadAndProcess()` reads pixels, measures `maxVal = max(r, g, b)`, and sets alpha:
  * `maxVal <= threshold`: alpha = 0 (100% transparent).
  * `threshold < maxVal < threshold + feather`: smooth alpha ramp.
* **Storage**: Cached in memory as offscreen canvas sprites (`HTMLCanvasElement`) for instantaneous GPU-accelerated drawing via `ctx.drawImage()`.

### B. Single-Entity Combat Targeting Viewport
* **Exactly One Figure**: `parallax.js` MUST NEVER draw a duplicate silhouette creature on canvas during combat.
* **Viewport Structure**: `#stage-creature-viewport` contains `.creature-figure-wrapper`, which renders:
  1. `<canvas id="creature-sprite-canvas">`: Draws the transparent modular beast sprite (`beast.jpg`).
  2. `<svg id="creature-target-svg">`: Overlaid SVG hitbox groups (`data-limb="head"`, `"thorax"`, `"weapon_l"`, `"weapon_r"`, `"legs"`).
* **Movement**: The `.creature-figure-wrapper` breathes continuously via `@keyframes creatureIdleBreathe`.
* **Hover & Strike**: Hovering any limb highlights that specific limb in red/cyan wireframe and opens `#combat-hover-reticle`. Clicking strikes that limb, triggering screen shake, arterial blood pooling, and rising damage numbers (`.combat-float-num`).

### C. Clean Run Reset Protocol
Whenever a run ends, the player dies, or a new run starts (`game.resetGame()`, `game.startHostCycle()`, `game.handleGameOver()`):
1. `game.combat.activeBattle = null`
2. `game.parallax.clearEncounterTarget()` (resets `encounterEntity = null` and `bloodPoolSize = 0`)
3. Hide `#combat-stage-overlay` and `#surgical-field-overlay`
4. Unhide `#action-ribbon-container`
5. Reset location to `'CITY'` and refresh all status bars.

### D. UI Z-Index Hierarchy
* Canvas Viewport: `z-index: 1-10`
* Combat Stage & Overlays: `z-index: 60-100`
* Start Menu Overlay (`.start-menu-overlay`): `z-index: 2000`
* Persona 5 Modal Backdrops (`.p5-modal-backdrop`): `z-index: 3000` (MUST be greater than 2000 so Sanctuary, Codex, and Game Over modals render cleanly over the Start Menu).
* Floating Damage Numbers & PoE Tooltips: `z-index: 3500+`

### E. Settlement Economy (City Hub)
* **Market (`#market-modal`)**: Tracks player `shillings` (starts at 60). Allows purchasing limited supplies (Linen wraps, sutures, rations, poacher cleavers, bone studs) and selling harvested carrier sac organs for cash.
* **Tavern (`#tavern-modal`)**: Hunter Guild Bounty Board tracks contracts (e.g. *Verdant Thorn-Beast*, *Apex Scythe-Mantis*). Fulfilling contracts automatically awards shillings and biomass EXP. Hearthfire serves venison stew (+50 Cal).

---

## 4. INSTRUCTIONS FOR FUTURE AGENTS
1. **Never Reintroduce Canvas Silhouette Creatures**: Combat creature targeting belongs solely to `#stage-creature-viewport` with modular sprites and SVG hitboxes.
2. **No Alert/Prompt Dialogs**: NEVER use `window.alert()` or `window.prompt()`. All UI actions must be executed in-place via DOM events, modal overlays, or keypresses.
3. **No Build Step**: Do NOT run `npm run build`. Keep ES modules cleanly importable.
4. **Maintain this Document**: Whenever altering gameplay balance, adding locations, or changing UI layouts, update `AGENTS.md` immediately.
5. **Module Boundaries**: Modules with a spec in `gameDev/` are developed in isolation. Read the spec, touch only the files it lists, and talk to other systems only through its documented input/output schema.
6. **Tuning Lives in Config Files**: Tuning lives in config files, not in logic. Do not hardcode balance numbers.
7. **Audio Visual Equivalence**: Audio is never the only feedback channel; every sound has a visual equivalent.
8. **Harvested Items Carry Condition**: Harvested items carry `condition` (1-100). Anything consuming them (rig stats, alchemy, market) MUST scale by condition/100.
9. **Never Hardcode Harvestables**: Never hardcode a species' harvestables. Add or edit a template/species JSON, then run `postCombat.html?test=balance`.
10. **Per-Seed Body Generation**: Bodies are generated per seed. Never reuse a seed across encounters; derive it from run seed + encounter id.
