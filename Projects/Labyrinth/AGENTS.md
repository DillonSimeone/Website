# The Dimensional Labyrinth

An endless, mapless maze behind a hidden book in the secret library (`public/Library/`). You move through it one cell at a time by scrolling. Cells fade in out of the darkness ahead and dissolve behind you. Some cells open into impossible rooms or windows onto endless scenes, and some hold glowing books from the library that you can read.

Scope rule: labyrinth work stays inside `public/Labyrinth/`. Its only contract with the outside is the `enter` / `exit` API that `public/Library/library.js` calls.

---

## 0. Working on one thing at a time (read this first)

Every style, scene, room and shape lives in its own small file, and **the editor** renders any one of them in isolation. To fix or polish something, read only the files the editor lists, not the whole folder.

* **Open**: `/Labyrinth/editor.html` on the dev server (for example `http://localhost:5173/Labyrinth/editor.html`).
* **Settings live in the URL**: `?room=forest&style=crystal&shape=round&layout=left&view=scene&seed=3`. The user can paste that link into the chat to say exactly what they are looking at.
* **"Files for this view"** in the panel lists the source files behind what is on screen. Start there.
* **Live reload**: the page polls every labyrinth file and reloads when one changes, keeping the camera. Save a file and the user sees the result a second later.
* **Errors**: JS errors and shader compile errors appear in a red box at the bottom right (full shader source in the console). Ask the user to paste it.

| Working on | Read | Usually also needs |
| --- | --- | --- |
| A style | `styles/<id>.js` | `styles/common.js` (helpers) |
| A scene | `scenes/<key>.js` | `scenes/frame.js` (uOut, uFloor, helpers) |
| A room | `rooms/<key>.js` | `rooms/kit.js` (materials, placement helpers) |
| The moon pool's tree | `rooms/tree.js` | `rooms/pool.js` (where it stands) |
| A critter | `critters/<key>.js` | `critter.js` (habitat, wall distances), `rooms/kit.js` |
| A cell shape | the entry in `shapes.js` | `grid.js` (sizes) |
| Walls, doors, stairs, side paths | `build.js` | `grid.js` |
| Path generation, zones, rarity | `cells.js`, `rarity.js` | |
| Walking, camera, input | `labyrinth.js` | |

Editor settings: room (any room or scene), critter, style, blend-from style, shape, layout (straight, left, right, stairs up, stairs down), view (walk at eye level, overview without ceiling or fog, scene fullscreen), side paths, found book, neighbours, roof in overview, ASCII, day, time speed, and seed (rebuilds random details exactly).

The editor builds only three cells, so it cannot show problems caused by other cells of the maze, such as a slab from a cell stacked above. If something appears in the maze but not in the editor, suspect `cells.js` (occupancy) first. In walk view, scroll or W/S moves along the path and F faces a scene room's window.

---

## 1. How you get here and back

```
Website --hold theme toggle--> Library --pull the violet "???" book--> Labyrinth
Labyrinth --Esc--> Library (the book flies back to its shelf) --Esc--> Website
```

* **The portal book** comes from `src/content/3dprinting/08-labyrinth.html`, a `hidden` `.library-only` div with `data-portal="labyrinth"`. The site never shows it; the library turns it into a pulsing violet book that swings open and pulls you in. See "Portal books" in `public/Library/AGENTS.md`.
* **URL**: `?page=labyrinth`. The library pushes it with state `{ library: true, labyrinth: true, labyrinthPushed: true, ... }`. Back and forward work through the library's `popstate` listener. A direct deep link opens the library and goes straight in.
* **Lifecycle** (called by the library, which pauses its own rendering meanwhile):

```js
enter({ books, day, reducedMotion, onRequestExit })  // idempotent, race-safe
exit()                                               // Promise; resolves after the white veil and cleanup
```

`books` holds every non-portal library card as `{ el, title, section, color }`. `day` is 0 (night) or 1 (day), taken from the library's day/night state.

---

## 2. Files

Plain ES modules served raw from `public/`. Three.js r160 is imported by the same full CDN URL the library uses, so the module instance is shared.

| File | Responsibility |
| --- | --- |
| `labyrinth.js` | Lifecycle, renderer, camera, walking (scroll, W/S, arrows), free look, the scene-room tug, picking found books, whispers, Esc, cleanup |
| `cells.js` | The endless path: zones, rarity picks, look-ahead, occupancy, side paths, rooms and tomes per cell, fading, `sceneOf` |
| `build.js` | `buildCell(cell, { U, kit })`: slabs, walls and doorways, side-path tunnels, stairs, the shape, the room, the critter and the tome. Shared by the maze and the editor |
| `shapes.js` | Cell shapes (`SHAPES`), each a small `build(k)` function |
| `grid.js` | Sizes (`CELL`, `LEVEL`, `WALL_H`, doors), directions, `nodeOf`, `doorBetween`, `yawOf` |
| `rarity.js` | Encounter counts and weighted picks, saved in `localStorage` |
| `styles/common.js` | `COMMON_GLSL` (noise, voronoi, hue, fog, dissolve, lantern, tome light, sky), `MASK`, `glowBlending`, shared uniforms |
| `styles/index.js` | `STYLES` list, assembles `styleSurface()` from the style files, `createCellMaterial` |
| `styles/<id>.js` | One style each |
| `scenes/frame.js`, `scenes/index.js`, `scenes/<key>.js` | Window scenes: shared uniforms and helpers, the `SCENES` list, one scene each |
| `rooms/kit.js` | Room helpers: `portalMaterial`, `litMaterial`, `glowSprite`, `makeRoom`, `asideSpot`, portals, balcony |
| `rooms/index.js`, `rooms/<key>.js`, `rooms/scene.js` | `ROOM_TYPES` and room lists, one room each, the generic scene room |
| `rooms/tree.js` | `createTree()`: procedural branching tree with bark and leaf shaders |
| `critter.js`, `critters/<key>.js` | Critter registry (`CRITTERS`, `critterOptions`, `createCritter`), habitat and per-shape fit; one creature each |
| `tomes.js` | Glowing found books and the reading overlay |
| `ascii.js` | Masked composite: shaded pixels, ASCII glyphs and ink-on-paper glyphs in one frame |
| `editor.html`, `editor.js`, `editor.css` | The isolated editor (section 0) |
| `labyrinth.css` | Root, white veil, hint, whisper, hover label, reading overlay (loaded on demand) |

---

## 3. How it is built

### The path (`cells.js`)
* Grid squares are `CELL = 4` units, floors are `LEVEL = 3.4` apart, walls are 3.2 high, and the eye is at 1.6 (`grid.js`).
* Directions and sides share one index: 0 north (-z), 1 east (+x), 2 south (+z), 3 west (-x).
* `cells` is an ordered array. About 3 cells stay behind the viewer and 5 ahead, plus one **pending** cell at the end whose exit is still undecided. `extend()` decides the pending cell's exit, builds it, and appends a new pending cell.
* **No overlaps**: `occupied` maps `gx,gz,level` to its owner: cells, side-path squares (`stub`), the square above a raised shape, the square above a `skyCeiling` room and below a `noFloor` room (`claimOpenings`), and the square a staircase leads into (`ahead`). New cells only take free squares. If an open room's square above or below is taken, the room is dropped (a moon pool moves to the next garden cell).
* **Look-ahead**: each candidate exit (flat or stairs) is scored with `reach()`, a small flood fill counting free squares reachable from it. Only exits with at least `SAFE_REACH` (12) are taken normally, and side paths that would drop the next cell below that are skipped. This stops the path from coiling into a dead end, which used to force a staircase through live cells. The boxed-in fallback remains but logs a warning.
* **Fading**: each cell has a `fade` uniform shared by all its materials. `dissolve()` discards pixels by a screen-door pattern, and `darkness()` adds fog to black and blacks out anything past the cell edge. Cells more than 3 behind fade to 0 and are released.
* **Walking** (`labyrinth.js`): a step goes centre, door, next centre in about a second, turning the camera smoothly toward the direction of travel. Drag looks anywhere. A step ending in a scene room eases the view toward its window (`sceneOf`, `updateTug`) until the visitor drags.

### Zones
A **zone** is a run of cells sharing a style, a shape and a theme (`nextZone`):

| Theme | Length | What happens |
| --- | --- | --- |
| halls | 3 to 6 | Corridors with side paths and stairs; rooms at least 2 cells apart (30% chance), drawn from every scene and strange room |
| void | 3 to 4 | Every corridor cell floats in the star void |
| garden | 4 to 6 | Hedge style, no stairs, one moon pool |

After a halls zone there is a 30% chance of a special theme.

### Rarity (`rarity.js`)
Rooms, critters, styles, shapes and special themes are all picked with `rarity.pick(pool, keys)` and recorded with `rarity.note(pool, key)` when generated. Each extra encounter multiplies an item's weight by `FALLOFF` (0.015) relative to the least-met item in its pool, so unseen things come first almost every time and repeats only start once everything has been met. Counts persist in `localStorage` (`labyrinth.seen.v1`), so returning visitors keep discovering. To start over, clear that key.

### Shapes (`shapes.js`)
Shapes are layered inside the square box, whose walls stay behind as the outer shell. `effectiveShape()` in `build.js` forces square for stairs and `square` rooms (scenes, Babel, clockwork), for `plainOnly` shapes when a room is present, and for `needsRoof` shapes under a sky ceiling.

| Shape | Build |
| --- | --- |
| square | the plain box |
| octagon | diagonal walls across every corner, door edge to door edge |
| round | a ring of 24 panels at radius 1.7, arched gaps with short vestibules to each doorway, and a flattened dome (raised) |
| pillared | four columns and beams (plain cells only) |
| vaulted | two crossing barrel vaults (raised, needs a roof) |
| narrow | solid corners, closed arms and a low ceiling: a cramped passage that only opens where doorways are (plain cells only) |

Raised shapes claim the square above them and fall back to square if it is taken.

### Styles (`styles/`)
One shader, `styleSurface(int s, ...)`, is assembled from the style files. Each file is one branch that sees `p`, `n`, `uv`, `isFloor`, `isCeiling` and writes `albedo`, `emissive`, `tint`, `ambient`, `mask`. The first cell of a new zone blends from the old style across its length.

| Style | Look | Rendering |
| --- | --- | --- |
| sandstone | bricks and tiles, flickering torchlight | shaded |
| obsidian | black glass with pulsing cyan veins | shaded |
| hedge | leafy walls, gravel, open sky ceiling | shaded |
| blueprint | navy with a white grid and outlined edges | shaded |
| ink | paper walls | inverted ASCII (ink glyphs) |
| phosphor | green grid | ASCII |
| amber | old wood planks | ASCII |
| crystal | faceted amethyst and teal, glowing seams | shaded |
| ruins | weathered blocks, moss creeping up | shaded |
| vapor | gradient walls, glowing grid floor and ceiling | shaded |
| glass | coloured panes in lead | shaded |
| rain | falling code columns | ASCII |
| ice | pale ice, cracks, frost glints | shaded |

### Mixed rendering (`ascii.js`)
**Alpha carries a mask, not transparency** (`MASK`): `0` shaded, `0.5` light glyphs on dark, `1` ink glyphs on paper. The composite decides per 8px cell from the cell's centre pixel. Every opaque material must write its mask into `gl_FragColor.a`; additive effects must use `glowBlending()`; clear alpha is 0.

### Rooms (`rooms/`) and scenes (`scenes/`)
Room flags: `skyCeiling` drops the ceiling slab, `noFloor` the floor slab, `window` cuts a wide opening in one solid wall, `square` forces the plain box.

* **Portal quads** draw far scenery on small flat quads whose shader traces the camera ray (`portalScene(ro, rd)`, `ro` is the camera). They look endless but never leave the cell.
* **Scene rooms** (one per scene, built by `rooms/scene.js`): a balcony and a window. Scenes get `uOut` (out of the window) and `uFloor`, and set their own tug `pitch`. Ocean at sunset, twin-sun dunes, golden forest, beneath the sea, above the rainbow, the watcher at the falls, a star going nova.
* **Moon pool**: sky ceiling, reflective water crossed by stepping stones, grass, fireflies, and a procedural tree (`rooms/tree.js`) against a wall or in a corner (`asideSpot`). The moon (`uBody`) is tilted away from the tree, and the tree keeps its branches out of a column above the cell centre, so standing in the pool you can always see the moon. Moonlight (sunlight by day) falls as soft library-style beams: additive open cylinders with edge falloff, drifting streaks, dust motes and a glow where they land, matching `BEAM_FRAG` in `public/Library/sky.js`.
* **Tree generator** (`createTree(room, ctx, base, opts)`): recursive branches with jitter, a pull upward and away from the wall, and `confine()` keeping them inside the cell and under the ceiling. Branches merge into one tube mesh with a bark shader (ridges, moss, sky light). Leaves are instanced cards with a leaf-shaped cutout, veins, translucency and wind flutter.
* **Star void**, **Babel fragment**, **Lantern ascent**, **The upside-down parlour**, **Indoor rain**, **Clockwork**.

### Critters (`critter.js`, `critters/`)
About 30% of non-stair cells (`CRITTER_CHANCE` in `cells.js`) get one critter kind, picked through rarity from the kinds whose habitat fits: `habitatOf()` reports whether the cell has a floor, a ceiling and solid walls.

| Critter | Needs | Behaviour |
| --- | --- | --- |
| worm | floor | Two earthworms with a segment trail and peristalsis; they dive into the floor and surface elsewhere |
| beetle | floor | Three beetles wander, pause and twitch antennae, with a tripod leg gait; they scatter when you come within 1 m |
| spider | ceiling, walls | A glinting web in a wall and ceiling corner; the spider lowers itself on a thread, dangles, climbs back, and flees upward if you get close |
| ants | floor, walls | A two-way column marching along the foot of a wall between two holes |
| moth | anywhere | Moths circle idly, then flutter just ahead of your lantern while you are in their cell |
| snail | walls | Climbs a wall slowly, eye stalks waving, leaving a glistening trail |

`createCritter` adds `floorY`, `ceilingY`, `wall` (inner wall face distance), `wallSpan` (how far along the wall stays flat; an angle on round cells), `roam` (clear floor half-width), `wallFrame(side)` and `randomFloorPoint()` per shape (`FIT` in `critter.js`), and skips the side with a scene window. Critters that move by velocity use `makeClock()`, which turns time into a capped frame delta.

### Found books (`tomes.js`)
About 1 plain corridor in 5 holds a random library card, avoiding recent repeats. It floats open over a pedestal against a solid wall (`tomeInset` per shape) and lights the walls near it. Clicking it moves the real card element into the overlay and puts it back on close or exit.

---

## 4. Maintenance

* **Test in the editor first**, then in the maze. Shader errors only appear at runtime; JS syntax can be checked by copying files to `.mjs` and running `node --check`.
* **`ShaderMaterial.clone()` copies uniforms**, which breaks the shared `fade` and time uniforms. Always build a new material from the context.
* **Every material in a cell must use the cell's `fade` and `cellCenter`** (`cellUniforms(ctx)` in `rooms/kit.js`), or it will pop instead of dissolving.
* **Cleanup**: `buildCell` returns `dispose()` for the cell mesh, material, room, critter and tome. Rooms register geometries and materials with `add` / `track`. `destroy()` in `labyrinth.js` disposes the rest and always calls `reader.restore()`.
* **Randomness**: builders use `Math.random()`. The editor swaps in a seeded generator while building so a seed rebuilds exactly; keep using `Math.random()` so that keeps working.
* **Testing**: no browser subagents. Give the user numbered test steps (root `AGENTS.md`). Never run `npm run build`.
* The editor ships with the site at `/Labyrinth/editor.html`. It is harmless, but can be deleted from the build output if unwanted.

---

## 5. Extending

### Add a style
1. Create `styles/<id>.js` exporting `{ id, name, mask, glsl }` (the branch body).
2. Import it in `styles/index.js` and add it to `STYLES`. Rarity counts are keyed by `id`, so order doesn't matter.

### Add a scene
1. Create `scenes/<key>.js` exporting `{ name, pitch, glsl }`, where glsl defines `vec3 portalScene(vec3 ro, vec3 rd)`.
2. Add it to `LIST` in `scenes/index.js`. It becomes a room automatically and joins the halls' room pool.

### Add a room
1. Create `rooms/<key>.js` exporting `{ name, build(ctx), ...flags }`. Use `makeRoom()`, `add()`, `track()`, `onUpdate()`, and return `room.result()`.
   * `ctx`: `U, fade, cellCenter, center` (floor centre), `entrySide`, `exitSide`, `solidSides`, `windowSide`, `shape`.
   * Keep the walking line (door to centre to door) clear; `asideSpot(ctx, distance)` gives a spot against the solid walls. Stay within the 3.6 x 3.6 interior (round cells: radius 1.7).
2. Import it in `rooms/index.js`, add it to `ROOM_TYPES`, and to `STRANGE_ROOMS` if the halls should place it.

### Add a critter
1. Create `critters/<key>.js` exporting `{ name, fits(habitat), build(ctx) }`. Build it like a room (`makeRoom()`, kit materials) and return `room.result()`. Keep it small; `update(t, camera)` runs every frame.
2. Import it in `critter.js` and add it to `CRITTERS`. It joins the rarity pool and the editor's critter list automatically.

### Add a shape or theme
* Shape: add an entry to `SHAPES` in `shapes.js` with `build(k)` and any of `raised`, `needsRoof`, `plainOnly`, `tomeInset`. It joins the rarity pool automatically.
* Theme: add it to `SPECIAL_THEMES` and handle it in `nextZone` and `chooseRoom` (`cells.js`).

### Tune the feel
| What | Where |
| --- | --- |
| Cells kept ahead and behind, fade time | `AHEAD`, `BEHIND`, `FADE_SECONDS` in `cells.js` |
| Dead-end avoidance | `SAFE_REACH` in `cells.js` |
| Chances of stairs, side paths, rooms, books, critters | `extend()`, `chooseRoom()`, `finalize()`, `CRITTER_CHANCE` in `cells.js` |
| Zone lengths and theme odds | `nextZone()` in `cells.js` |
| How strongly repeats are avoided | `FALLOFF` in `rarity.js` |
| Step duration, wheel sensitivity, scene tug | `stepSeconds`, `WHEEL_STEP`, `updateTug()` in `labyrinth.js` |
| Fog distance | `darkness()` in `styles/common.js` |
| Glyph ramp and cell size | `createMaskedAscii` in `ascii.js` |

### Toward WebXR
Rendering (`ascii.render`), the camera pose (`pos`, `yaw`, `look`), and input are kept separate in `labyrinth.js`. A VR mode would set the camera from the XR pose, map a controller button to `request(1)` / `request(-1)`, and render shaded only.
