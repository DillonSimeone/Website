# MODULE SPEC: postCombat (Live Specimen Surgery)

Suggested repo path: `gameDev/SPEC_postCombat.md`. Read `AGENTS.md` first for global rules; this file
only adds to them. This module is built and tested in isolation. You do NOT need to read the rest
of the game to build it.

---

## 0. READ THIS FIRST

**Your job:** build the post-combat surgery module and its standalone harness `postCombat.html`.

**Definition of done:** every check in section 10 passes in the harness, and section 12's
AGENTS.md patch is applied.

**You may create/edit only:**
- `public/MiniProjects/ApexParasite/postCombat.html`
- `public/MiniProjects/ApexParasite/src/postcombat/**` (new folder, all module code)
- `public/MiniProjects/ApexParasite/content/specimens/*.json` and `content/loot/*.json`
- `public/MiniProjects/ApexParasite/css/postcombat.css` (new file; do not edit `style.css`)
- `AGENTS.md` (per section 12)

**You must NOT edit:** `game.js`, `combat.js`, `hud.js`, `chimera.js`, `locations.js`, `skills.js`,
`parallax.js`, `index.html`, `style.css`. The existing `src/surgery.js` is superseded by this
module; leave it in place until the integration task in section 11 swaps it out.

**Import rule:** files in `src/postcombat/` may import only from their own folder and from
`src/types.js` (constants). Audio is injected (section 5.4), never imported directly into core logic.

**Project rules that apply (from AGENTS.md):**
- Vanilla ES modules, no build step, no CDN, no new dependencies. Do not run `npm run build`.
- NEVER use `alert()`, `prompt()`, or `confirm()`. Confirmations happen in-place in the DOM.
- No canvas-drawn silhouette creatures. The body is an art image plus an SVG hit-region overlay.
- Overlay z-index stays within the 60-100 combat/overlay band. Floating numbers and tooltips 3500+.

**Open questions are marked [OPEN].** Do not invent answers; build the stated default and put the
value in `config.js` so it can be changed.

---

## 1. Player fantasy

You are a parasite with a surgeon's patience. The fight is over; the body is a pantry of rare parts,
and it is dying under your hands. You are racing its pulse and your own hunger to take the best things.

## 2. Where this happens

Only after a fight or encounter, in the wilderness (forest, etc.). The specimen is either:
- **living**: incapacitated by hemorrhagic shock, still has a pulse, or
- **dead**: a carcass, including bodies found by event (e.g. "dead hunter and mangled wolf").

There is no "Dissolve / destroy evidence" verb in this module. (Evidence and Depravity are not this
module's concern. See Out of scope.)

## 3. Verbs and the one decision

| Verb | Available when | Cost |
|---|---|---|
| **Extract** organ | organ not yet taken, `requires` met, enough calories | calories + pulse (living) |
| **Clamp** a clamp point | specimen is **living**, pulse > 0, player has a suture | 1 suture + 1 calorie |
| **Take ground loot** (severed parts from combat) | always | free (0 pulse, 0 calories) |
| **Feast** | always | ends surgery, gives calories + Biomass EXP, forfeits remaining organs |
| **Leave** | always | ends surgery, forfeits remaining organs |

**The decision: extraction ORDER under two budgets.**
- **Pulse** (the specimen's life) drains as you work, and flatline is a cliff.
- **Calories** (your own energy) are the hard action limit. Every cut costs you.

Take the fragile valuable thing while pulse is high? Spend a suture to protect pulse first? Skip
the risky epic organ and bank two safe ones? Feast now to recover calories and lose the rest?
If clicking organs in any order wins equally, the module has failed (check 12).

## 4. Rules (all numbers live in `config.js`; the values below are starting points, not canon)

### 4.1 Turn model
No real-time timers. State changes only when the player acts. Animations are cosmetic.

### 4.2 Pulse (living only)
- Start: `input.pulsePct`. Dead specimens have no pulse and no pulse meter.
- Each **Extract** drains `organ.pulseCost`, reduced by any applied clamp that lists the organ in
  `slowedByClamp` (by that clamp's `drainReductionPct`).
- After each Extract or Clamp, **passive bleed** drains `BASE_BLEED` (start: 3), x1.5 if
  `bloodPct < 30`, reduced by the summed `bleedReductionPct` of applied clamps (cap 90%).
- `killsPulse` organs (e.g. heart): the organ resolves first, then pulse is set to 0.
- Pulse <= 0 triggers **Flatline** (4.6).

### 4.3 Calories (hard action limit)
- Extract cost by organ rarity (start): common 1, uncommon 2, rare 3, epic 5, legendary 8.
- Clamp cost: 1. Ground loot: 0.
- Actions the player cannot afford are disabled and show the reason ("Need 5 cal"). Surgery can never
  kill the player; calories are floored at what the player already has.
- Feast gives `specimen.feast.calories` (living specimens get x1.0; flatlined/dead x0.7 [OPEN]).

### 4.4 Extraction success
```
successPct = clamp(5, 95,
    organ.baseSuccessPct
  + SKILL_BONUS * input.player.surgerySkill      // start: 3 per level
  + input.player.precisionBonus                  // caller aggregates limb/tool precision
  - RARITY_PENALTY[organ.rarity]                 // common 0, uncommon 8, rare 16, epic 28, legendary 40
  - (region wounded ? WOUND_PENALTY : 0)         // start: 10
  - (organ.tags includes "fragile" && pulse < 50 ? (50 - pulse) / 2 : 0))
```

### 4.5 Outcomes (seeded RNG)
Each extract attempt draws exactly two numbers from the seeded stream, ALWAYS, in this order
(so replays stay identical regardless of branch): `r1`, `r2` in [0,100).

```
if r1 <= successPct:
    quality = (r1 <= successPct / 2) ? "pristine" : "intact"
else:
    missBy = r1 - successPct
    destroyPct = clamp(0, 95, RARITY_DESTROY_BASE[organ.rarity]     // common 5, uncommon 10, rare 20, epic 30, legendary 40
                              + missBy * 0.5
                              - input.player.surgerySkill * SKILL_SAVE)   // start: 2 per level
    quality = (r2 < destroyPct) ? DESTROYED : "damaged"
quality = min(quality, qualityCeiling(organ))        // 4.7
```
- `DESTROYED` organs are gone: listed in `lost` with `reason: "destroyed"`. Pulse and calories are
  still spent. The wound still opens.
- `damaged` organs are harvested at damaged quality.
- Quality tiers, low to high: `damaged < intact < pristine`.

### 4.6 Flatline
When pulse reaches 0 (from drain, not `killsPulse` unless the organ was last):
- Specimen state becomes `"dead"`. Meter shows FLATLINE. Clamps become unavailable.
- Every remaining organ tagged `fragile` is lost (`reason: "necrosis"`).
- Every other remaining organ's quality ceiling becomes `damaged` for the rest of the scene.
- Ground loot and Feast are unaffected.

### 4.7 Quality ceiling
`qualityCeiling(organ)` is the minimum of:
- dead-from-start specimen: `intact`
- post-flatline: `damaged` (non-fragile; fragile are already lost)
- region listed in `input.damage.woundedRegions`: `intact`
- otherwise `pristine`

### 4.8 Dependencies
`organ.requires: [organId]` means the listed organs must be extracted first (e.g. brain behind a
cranial plate). Locked organs render dimmed with their requirement in the tag.

### 4.9 Skill XP
Return `skillXp: { Surgery: n }`. Start: +1 per attempt, +2 per pristine success, +3 per rare+ success.
The module never touches SkillSystem; the caller applies it.

## 5. Public API

### 5.1 Pure core (no DOM, no audio, fully headless)
`src/postcombat/core.js`
```js
createSession(specimenDef, lootDefs, input, config) -> {
  getState(),                 // pulse, calories, organs[], clamps[], groundLoot[], ended, log
  canAct(action),             // { ok:boolean, reason?:string }
  act(action),                // returns Event[]  (see 5.3)
  isEnded(),
  result(),                   // SurgeryResult (section 6.2); valid once ended
}
// action = { type:'extract'|'clamp'|'take'|'feast'|'leave', id?:string }
```

### 5.2 View
`src/postcombat/index.js`
```js
createSurgery({ root, audio, content, onLog? }) -> {
  run(input) -> Promise<SurgeryResult>,   // resolves when the player ends surgery
  destroy(),                               // idempotent cleanup of all DOM/listeners
}
```
- `root`: the container element (in-game: `#surgical-field-overlay`; harness: its own div).
- `content`: `{ specimens: {id: SpecimenDef}, loot: {id: LootDef} }` loaded by the caller.
- `onLog(line)`: called with human-readable telemetry lines so the game can print them in its
  bottom log. The module never writes to the game's log element itself.

### 5.3 Events (returned by `act`, consumed by the view)
`organ_extracted {id, quality}`, `organ_failed {id, quality:'damaged'|'destroyed'}`,
`organ_lost {id, reason}`, `clamped {id}`, `pulse_changed {from, to}`, `flatline {}`,
`calories_changed {from, to}`, `ground_taken {id}`, `ended {endedBy}`.

### 5.4 Audio interface (injected)
```js
audio = { heartbeat(bpm, strength), flatline(), cut(), tear(), chime(rarity), lap(), clamp(), stop() }
```
The harness provides a stub that logs calls plus an adapter to the real `BioAudio` if available.
**Audio is never the only carrier of information.** Every cue has a visual equivalent
(heartbeat <-> pulse meter and body twitch; flatline <-> meter state and text banner).

## 6. Data contract

### 6.1 `SurgeryInput`
```json
{
  "specimenId": "verdant_thorn_beast",
  "state": "living",
  "pulsePct": 68,
  "bloodPct": 14,
  "damage": { "severedParts": ["antler_left"], "woundedRegions": ["flank"] },
  "player": {
    "calories": 112,
    "maxCalories": 120,
    "surgerySkill": 1,
    "precisionBonus": 0,
    "supplies": { "sutures": 2 }
  },
  "seed": 12345,
  "options": { "skipEntrance": false }
}
```
`state:'dead'` ignores `pulsePct`. `severedParts` ids must match `SpecimenDef.severable[].id`.

### 6.2 `SurgeryResult` (the ONLY thing the module returns)
```json
{
  "specimenId": "verdant_thorn_beast",
  "specimenKind": "beast",
  "harvested": [
    { "lootId": "bile_sac_thorax", "quality": "pristine", "rarity": "uncommon", "source": "organ" },
    { "lootId": "antler_stinger", "quality": "intact", "rarity": "rare", "source": "ground" }
  ],
  "lost": [
    { "lootId": "ocular_nerve_nexus", "reason": "destroyed" },
    { "lootId": "flank_viscera", "reason": "necrosis" }
  ],
  "caloriesSpent": 7,
  "caloriesGained": 25,
  "biomassExpGained": 4,
  "suppliesUsed": { "sutures": 1 },
  "skillXp": { "Surgery": 5 },
  "endedBy": "feast",
  "flatlined": true,
  "seed": 12345
}
```
`endedBy`: `feast | leave`. (Flatline alone does not end surgery; the player still chooses.)
`lost.reason`: `destroyed | necrosis | forfeited` (forfeited = left behind on Feast/Leave).
`specimenKind` is echoed from the def so the caller can apply Depravity or evidence rules.

### 6.3 `SpecimenDef` (one JSON per monster in `content/specimens/`)
```json
{
  "id": "verdant_thorn_beast",
  "displayName": "Verdant Thorn-Beast",
  "kind": "beast",
  "art": { "body": "assets/anatomy/thorn_beast.png", "size": [1024, 640], "keying": "none" },
  "baseVitals": { "pulse": 100 },
  "organs": [
    {
      "id": "bile_sac_thorax", "name": "Thoracic Bile Sac", "region": "thorax",
      "anchor": [512, 280],
      "hitShape": { "type": "ellipse", "rx": 60, "ry": 40 },
      "loot": "bile_sac_thorax", "rarity": "uncommon",
      "baseSuccessPct": 85, "pulseCost": 15,
      "tags": ["fragile"], "requires": [], "killsPulse": false,
      "slowedByClamp": ["thorax_artery"]
    }
  ],
  "severable": [
    { "id": "antler_left", "name": "Left Antler-Stinger", "loot": "antler_stinger", "rarity": "rare",
      "anchor": [200, 120], "coverShape": { "type": "ellipse", "rx": 50, "ry": 30 } }
  ],
  "clampPoints": [
    { "id": "thorax_artery", "name": "Thoracic Artery", "anchor": [480, 260],
      "drainReductionPct": 50, "bleedReductionPct": 15 }
  ],
  "feast": { "calories": 25, "biomassExp": 4 }
}
```
- Required per organ: `id, name, region, anchor, hitShape, loot, rarity, baseSuccessPct, pulseCost`.
- `hitShape` types: `ellipse {rx,ry}`, `rect {w,h}`, `polygon {points:[[x,y]...]}`. All in art pixel coordinates;
  the SVG overlay uses `viewBox` equal to `art.size`, so coordinates map 1:1 at any scale.
- `severable` parts are NOT organs. They appear as ground loot, and a dark stump patch (`coverShape`)
  is drawn over the art at that spot so the limb reads as missing.
- Content must validate on load (section 8.3). A bad def shows an error panel, not a blank screen.

### 6.4 `LootDef` (`content/loot/*.json`)
```json
{ "id": "bile_sac_thorax", "name": "Thoracic Bile Sac", "slot": "organ", "glyph": "🫀" }
```

## 7. Feel and feedback

The body is the interface. No side panels, tabs, or nav. The only persistent chrome: pulse meter,
calorie readout, suture count, sac icon, and the two exit buttons.

| Moment | Must see | Audio (with visual equivalent) |
|---|---|---|
| Entrance | View starts wide/tilted (CSS perspective, `rotateX` ~25deg to 0, scale ~0.55 to 1) and descends onto the body over ~1.4s; click or Space skips it. `options.skipEntrance` disables it. The caller owns fading out the battle UI. | Combat audio handled by caller; heartbeat begins for living |
| Living idle | Body breathes/twitches; intensity scales with pulse | Heartbeat tempo and strength follow pulse |
| Dead idle | Body still. No meter. | None |
| Hover organ | Region outline lights on body, callout tag lines up with the anchor and shows name, rarity, success %, pulse cost, calorie cost, a "FRAGILE" or "REQUIRES: X" badge if relevant | Soft tick |
| Hover clamp point | Marker highlights, tag shows pulse reduction and "1 suture" | Soft tick |
| Extract success | Incision opens at anchor, organ glyph lifts and flies to the sac icon, wound stays visible, quality color pops (damaged gray, intact white, pristine gold) | `cut()` then `chime(rarity)` |
| Extract fail | Torn wound, red flash; glyph shown ruined or shatters (destroyed) | `tear()` |
| Clamp | A clamp graphic appears at the point; affected organ tags update their costs immediately | `clamp()` |
| Pulse drop | Meter animates down; flashes red on big drops | Heartbeat updates |
| Flatline | Body goes limp, blood stops spreading, remaining fragile organs rupture and gray out, banner "FLATLINE" | `flatline()` |
| Feast | View pushes in, biomass shrinks, calories count up | `lap()` |
| Out of calories | Unaffordable tags dim with the needed amount | none |

**Layout and scale.** The body art is centered and fills ~55-65% of viewport height, using
`object-fit: contain`. Never stretch or upscale beyond 1.5x natural size. Callout tags fan radially
with leader lines to anchors and never overlap (greedy relaxation is fine). If more than 6 organs,
group tags by region and expand on hover.

**Ground loot** sits on the floor strip below/beside the body as small clickable tiles.

**Confirmation.** If the player hits Feast or Leave with unextracted organs, the button turns into
"CONFIRM: forfeit N organs" for 3 seconds. No browser dialogs.

**Accessibility.** All interactive regions are keyboard focusable (Tab / Enter). Everything with a
tooltip also has an `aria-label`.

## 8. Harness: `postCombat.html`

Standalone. Loads content over fetch (served by Vite), needs no game state, and is the verification
tool for this module.

### 8.1 Dev panel (collapsible, harness only, never shipped in-game)
- Specimen dropdown (from a `content/specimens/index.json` manifest you maintain)
- State: living / dead; pulse slider; blood slider
- Severed-parts checklist; wounded-regions checklist
- Player: calories, surgery skill, precision bonus, sutures
- Seed input, "new seed", **Run scene**, **Reset**, **Replay (same seed)**

### 8.2 Debug overlay toggles
- Draw all organ hit shapes, anchors, clamp points, and severable cover shapes on the art
- Show callout layout boxes
- Show live numbers: pulse, calories, per-organ effective successPct, destroyPct, quality ceiling

### 8.3 Validation and logging
- On load, validate every specimen and loot def: required fields, anchors inside `art.size`, all
  `loot`/`requires`/`slowedByClamp` references resolve, unique ids. Show a readable error list.
- Roll log: every action with organ, successPct, r1, r2, outcome.
- On end, print the full `SurgeryResult` JSON.
- "Copy bug report": input JSON + seed + ordered action list.

### 8.4 Headless modes (use `core.js` only, no DOM)
- `?auto=1&specimen=X&seed=N&script=...` runs a script and prints the result.
  Script tokens: `x:<organId>` extract, `c:<clampId>` clamp, `t:<severedId>` take ground loot, `f` feast, `l` leave.
  Example: `script=t:antler_left,c:thorax_artery,x:bile_sac_thorax,x:ocular_nerve_nexus,f`
- `?test=stats` runs 1000 seeds per scenario and prints success/destroy rates by rarity and skill.

## 9. Art contract

- One anatomy illustration per specimen: cutaway/top-down body with organs clearly separated and
  readable, on a dark background, at the declared `art.size`.
- **Do not chroma-key anatomy art.** The project's black-luminance keying (`AssetManager`) deletes dark
  pixels, which would punch holes in dark organs. Draw the image as-is over a dark panel
  (`keying: "none"`). Dark art is fine.
- Generation prompt starting point: *"top-down anatomical cutaway illustration of a [creature], dark
  fantasy, each organ distinct and clearly separated, clean readable shapes, dark background"*.
- **Fallback when art is missing:** render an SVG placeholder from the def data: labeled organ shapes
  over a body outline, with a visible "PLACEHOLDER ANATOMY" label. It must still make the ordering
  decision fully playable. Do not generate, upscale, or blur painted art.
- Combat creature art (`beast.jpg`) is NOT reused as anatomy art.
- **[OPEN]** Source of real anatomy art (hand-drawn / image-gen + cleanup / placeholder for now).
  Default: placeholder for all specimens.

## 10. Acceptance checks (pass/fail, demonstrable in the harness)

1. All content loads and validates; a deliberately broken def shows a readable error, not a crash.
2. Every organ hit shape and anchor lines up with its drawn organ in the debug overlay (placeholder or art).
3. Hover shows correct name, rarity, successPct, pulse cost, calorie cost, and badges.
4. Extract opens a persistent wound, flies the organ glyph to the sac, and updates pulse and calories.
5. Calories gate actions: with calories below an organ's cost, that organ is disabled with the reason shown. Player calories never go negative.
6. Clamp is available only on living specimens with sutures, consumes 1 suture + 1 calorie, and visibly lowers affected organs' pulse cost.
7. Passive bleed applies after Extract and Clamp and is reduced by clamps' `bleedReductionPct`.
8. Flatline: fragile organs lost (`necrosis`), others capped at `damaged`, clamps disabled, banner shown.
9. `killsPulse` organs resolve before pulse is zeroed.
10. Dead specimens: no pulse meter, no clamp, ceiling `intact`.
11. Severed parts appear as free ground loot (0 pulse, 0 calories) and show a stump patch on the body.
12. **Ordering matters:** on the Thorn-Beast fixture at the same seed, script A (limbs first, deep last) and script B (fragile first, deep second, limbs last) produce results that differ in `harvested` quality or contents. The stats test shows the difference holds across seeds, not just one.
13. Same input + seed + script gives a byte-identical `SurgeryResult` twice.
14. `?test=stats`: destroy rate rises with rarity and falls with `surgerySkill`.
15. Feast/Leave with unextracted organs requires the in-place two-step confirm; unextracted organs appear in `lost` as `forfeited`.
16. There is no Dissolve control anywhere, and no `alert/prompt/confirm` call in the module (grep proves it).
17. Every audio cue has a visible equivalent (verify with the audio stub muted).
18. `destroy()` removes all DOM nodes and listeners; calling `run` again afterward works.
19. Output validates against section 6.2 and contains nothing else.
20. Adding a new specimen needs only a JSON file, an art file (or placeholder), and a manifest entry. Zero code changes.

## 11. Integration (SEPARATE TASK, not part of this build)

A later task, done by whoever owns `game.js`/`combat.js`:
1. Build a `SurgeryInput` from combat results (severed limbs, wounded regions, blood %, pulse proxy) and from player state (calories, Surgery skill, sutures from inventory, precision from the chimera rig).
2. Call `createSurgery({root: #surgical-field-overlay, ...}).run(input)`.
3. Apply `SurgeryResult`: add harvested items to the carrier sac, subtract calories and supplies, add Biomass EXP, grant `skillXp`, handle Depravity from `specimenKind`.
4. Retire `src/surgery.js` and the old radial surgical code in `hud.js`.
5. Ensure every creature id used by `combat.js` and events has a SpecimenDef (fall back to `generic_beast`).

## 12. Starter content (required)

| Specimen | Kind | Purpose |
|---|---|---|
| `generic_beast` | beast | Fallback for any unmapped creature. Simple, 4 organs. |
| `dire_wolf` | beast | Baseline: 5 organs, one `killsPulse` heart, one clamp point. |
| `verdant_thorn_beast` | beast | Main test: 7 organs, 2 fragile, 1 `requires` chain, 2 clamp points, 1 severable antler. |
| `human_poacher` | human | Non-beast loot (satchel/items as organs with `slot:"gear"`), echoes `kind:"human"`. |

## 13. AGENTS.md patch (apply when done)

Add to **FILE MAP**:
```
* `postCombat.html`: Standalone harness for the post-combat surgery module (see gameDev/SPEC_postCombat.md).
* `src/postcombat/`: Surgery module. `core.js` (pure, headless session logic), `index.js` (view + createSurgery API),
  `config.js` (all tuning numbers), `harness.js`. Talks to the game ONLY via SurgeryInput/SurgeryResult.
* `content/specimens/*.json`, `content/loot/*.json`: data-driven monster anatomy and loot defs.
```
Add to **INSTRUCTIONS FOR FUTURE AGENTS**:
```
5. Module Boundaries: Modules with a spec in gameDev/ are developed in isolation. Read the spec, touch only the files it lists, and talk to other systems only through its documented input/output schema.
6. Tuning lives in config files, not in logic. Do not hardcode balance numbers.
7. Audio is never the only feedback channel; every sound has a visual equivalent.
```

## 14. Build order (do these in order, verify each before moving on)

1. `config.js`, content schema validation, 4 starter specimens as placeholder-art defs.
2. `core.js` with the full rule set; headless `?auto=` and `?test=stats` working. Checks 5-10, 12-14, 16 can pass before any UI exists.
3. Placeholder SVG renderer, body + hit regions + debug overlay. Checks 1-2.
4. Callout tags, hover, extract animations, wounds. Checks 3-4, 11.
5. Clamp, pulse meter, flatline visuals, ground loot, confirm flow. Checks 6-8, 15.
6. Entrance animation, audio hookup via the injected interface. Checks 17-18.
7. Final pass: checks 19-20, AGENTS.md patch.
