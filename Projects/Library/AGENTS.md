# The Secret Library (Library of Babel)

A hidden, desktop-only ASCII 3D library. Every card on the portfolio becomes a book on a shelf in an endless hexagonal well. Clicking a book pulls it off the shelf, flies it to the camera, and unfolds it into the real, readable card.

Scope rule: work on the library stays inside `public/Library/`. The only outside touch points are listed under "Integration with the site"; change them only when explicitly asked.

---

## 1. How it is entered

The site owns the entry. The library owns everything after that.

* **Trigger**: holding the light/dark theme toggle for 800ms (`initLibraryHold` in `src/scripts/indexScript.js`). A normal click still toggles the theme.
* **URL**: `?page=library`, managed with the History API. The state is `{ library: true, previousPage, previousButton }`. Back, forward, and deep links all work. Screens up to 1024px wide (`libraryAllowed()` is false) get the normal site instead.
* **Lazy loading**: nothing loads until entry. `indexScript.js` runs `import(new URL('/Library/library.js', origin).href)`. The full URL is required: Vite dev rewrites relative dynamic imports with `?import`, which breaks files under `public/`.
* **Transition**: `body.library-entering` shatters and fades the site (CSS in `src/styles/style.css`). Then `body.library-open` hides the site while `library.js` mounts its own full-screen root.

### Integration with the site (outside this folder)

| File | What it does for the library |
| --- | --- |
| `src/scripts/indexScript.js` | Hold-to-enter, `enterLibrary` / `closeLibrary` / `leaveLibrary`, popstate, `?page=library` in `setUp()` |
| `src/styles/style.css` | Hold ring on `.theme-toggle`, `library-entering` / `library-open` body classes |
| `src/content/3dprinting/08-labyrinth.html` | The hidden portal card (see "Portal books") |
| `public/Labyrinth/` | The labyrinth behind the portal book, with its own `AGENTS.md` |

The module contract is two exports from `library.js`:

```js
enter({ onRequestExit, reducedMotion })  // idempotent, race-safe
exit()                                   // returns a Promise that resolves after the fade-out and cleanup
```

---

## 2. Files

All files are plain ES modules, served raw from `public/` (no Vite processing). Three.js r160 is imported by full URL from `cdn.jsdelivr.net`, which the CSP allows. Keep that exact URL in every file so the browser shares one module instance.

| File | Responsibility |
| --- | --- |
| `library.js` | Lifecycle, renderer, camera (flights, drag, wheel, keys), picking, index panel, plaques, hover label, day/night, adaptive quality, frame loop, cleanup |
| `well.js` | World constants, shared uniforms, **shared lighting GLSL**, world material, the recycled shelf rings, `adoptBook` / `onRebuild` for wanderers |
| `books.js` | `SECTIONS` table, harvests cards from the DOM, lays out card books, picking and hover highlight |
| `reader.js` | Book pull-out, flight to the camera, and FLIP unfold into the real card DOM node, plus the reverse |
| `pages.js` | Instanced falling pages with GPU flutter; the CPU mirror feeds the page shadows |
| `sky.js` | Sky dome (stars, moon, sun, circling clouds), godrays, dust |
| `wanderers.js` | Filler books that fly off, perch on rails like birds, and re-shelve elsewhere |
| `ascii.js` | Quarter-resolution render plus a glyph-atlas post-pass (`' .:-=+*#%@'`) |
| `library.css` | Loaded on demand by `library.js`: root, index panel, plaques, label, reader card |

---

## 3. How it is built

### World geometry
* A hexagonal shaft with apothem `R = 6`. One gallery floor every `H = 4.3` units, with `SHELVES = 5` shelves per wall.
* **Recycled rings**: only `RINGS = 10` floors exist (3 below the camera, 6 above). Floor `f` lives in ring `f mod RINGS` and is rebuilt when the camera moves. Filler books come from a seeded `mulberry32(floor)`, so a floor always looks the same when revisited.
* Everything in a ring is one `InstancedMesh` of unit boxes (panels, boards, pilasters, slabs, rails, books). Unused instances are hidden with a zero-scale matrix.
* Floors dissolve with a screen-door `discard` near the edges of the loaded range (`LIGHTING_DEFINES` `FADE_*`). That is why ring recycling never pops.

### Lighting (all faked, all in `LIGHTING_GLSL`)
* No three.js lights. Every custom material includes `LIGHTING_GLSL` and spreads `LIGHTING_DEFINES` into its `defines`. **A new material must do both, or it will fail to compile** (the chunk references `BEAM_COUNT`, `SHADOW_CASTERS`, and `FADE_*`).
* `beamLight(p)`: distance from `p` to each slanted beam line (`uBeams`, along `uBeamDir`).
* `pageShadow(p)`: blob shadows of up to 24 nearby pages, projected along the beam direction.
* `shadeSurface(base, p, n)`: ambient, diffuse, beams, candle glow near the camera, and a darkening with depth. Fog goes to haze above and to black below.
* `uDay` (0 is night, 1 is day) tints the haze, the beams, and the ambient light.

### Uniforms
`createSharedUniforms()` returns one object shared by reference across all materials: `uTime`, `uCam`, `uReveal` (fade-in), `uDay`, `uBeamDir`, `uBeams[]`, `uShadows[]`. Update them once per frame in `library.js`; every material sees the change.

### Rendering
* Pixel ratio 1, no antialiasing, `ColorManagement.enabled = false`, linear output.
* ASCII mode (default, toggled with A): the scene renders to a target at 0.25 scale, then `ascii.js` maps luminance to glyphs in 8px cells. Fine details (stars, dust) should stay at least one quarter-resolution pixel wide.
* Adaptive quality: if the frame average stays above 20ms, the page count halves (never below 90).

### Cards to books (`books.js`)
1. `SECTIONS` maps each site section to a DOM selector, a floor, a wall (0 to 5), and a hue.
2. `layoutCards()` runs **at every library entry**. It queries the live DOM, so books always match the current page.
3. Book titles come from the card's first `h2`, `h1`, or `h3`.
4. Books fill the eye-level shelf first (shelf order `[2, 1, 3, 0, 4]`), centred on the wall.
5. The occupied ranges are returned as `occupancy`, so `well.js` leaves gaps there for filler books.

Capacity: one wall holds about 30 books per shelf, so about 150 per section. **Cards beyond capacity are silently left out.** If a section outgrows its wall, give it two walls (see "Extending").

### Reading (`reader.js`)
The real card element moves into the reader overlay, with a comment node left as its placeholder, and moves back on close or exit. Galleries, links, and scripts inside the card keep working, and nothing is cloned. `restore()` is always called on exit, so the card is back in the site before the library disposes.

### Portal books (the way into the labyrinth)
* A card with `data-portal="labyrinth"` becomes a portal book. The only one today is `src/content/3dprinting/08-labyrinth.html`, a hidden `.library-only` div in the hobby section. Its class is not `.artwork`, so the hobby side directory never lists it, and `hidden` keeps it off the site.
* Portal books are violet, pulse (`cards.pulse(t)`), and show "???" on hover.
* Opening one runs `openPortal` in `reader.js`: pull out, fly to the front, then swap the closed book for `portalBook` (two hinged covers with page blocks, one InstancedMesh). It swings open, glows, and the camera dives into the pages with a white flash (`.lib-portal-flash`). `returnFromPortal` plays this backwards before the book flies home. `onPortal` then pushes `?page=labyrinth` (state gains `labyrinth: true, labyrinthPushed: true`).
* `library.js` lazy-imports `/Labyrinth/labyrinth.js` and pauses itself (`lib-paused`, no rendering, GPU resources kept). It calls `enter({ books, day, reducedMotion, onRequestExit })`, where `books` is every non-portal card as `{ el, title, section, color }`.
* Leaving: labyrinth Esc calls `onRequestExit`. That goes `history.back()` if the library pushed the entry; otherwise (deep link) it replaces the state with `?page=library`. The library's own `popstate` listener closes or opens the labyrinth, resumes rendering, and `returnFromPortal()` flies the book home.
* `?page=labyrinth` loaded directly opens the library and goes straight into the labyrinth.

### Input
* A drag of 5px or more turns the camera; a smaller movement counts as a click.
* On release, `pickAt()` checks for a card book within `READ_DISTANCE` (6.5) and opens it. Otherwise it tests the section walls (`pickSection`, a ray-plane test with generous margins) and flies there. Plaques are buttons that fly too.
* Keys: 1 to 5 go to sections, arrows or PageUp/PageDown change floor or wall, A switches the look, N switches day/night, Esc closes the reader and then leaves. Esc is ignored while the site's `.gallery-modal.active` is open.

### Wanderers (`wanderers.js`)
Up to 8 filler books at a time. `well.adoptBook(floor)` hides a random filler instance and returns its pose, size, and colour. The book is drawn as two hinged halves: the spine is the hinge and the covers are the wings.

The state machine runs `pull → turn → fly → (alight → perch → turn → fly) → tuck → rest`, then may take off again. Vacated slots go into a free-slot pool, and books land only in slots another book left.

When a ring rebuilds (`well.onRebuild`), any wanderer tied to it despawns and that ring's free slots are dropped. Wanderers also despawn when more than 3.5 floors from the camera. They are disabled under reduced motion.

---

## 4. Maintenance

* **New cards need nothing.** Adding a card to `src/content/<section>/` puts it in the page (through Handlebars) and therefore in the library on the next entry.
* **Card markup changes**: if a section's card wrapper class changes, update that section's `selector` in `SECTIONS`. Selectors mirror each section's `.section-nav` `data-target-container` in `src/index.html`.
* **Shader errors** show up only in the browser console, at library entry. JS syntax can be checked by copying files to `.mjs` and running `node --check`.
* **Cleanup**: anything created in `createLibrary` (DOM, listeners, geometries, materials, meshes) must be released in `destroy()`. Every module exposes `dispose()`.
* **Performance budget**: one ring instanced mesh (about 16k instances), one card mesh, and one page mesh, plus additive beams and one dust `Points`. Avoid per-frame allocations in hot loops; reuse scratch vectors as the existing modules do.
* **Testing**: no browser subagents. Give the user numbered test steps (see the root `AGENTS.md`). Never run `npm run build`.

---

## 5. Extending

### Add a new section
1. Add the section to the site first (new content folder, Handlebars variable, `<article id="...">`).
2. Add an entry to `SECTIONS` in `books.js`: `{ id, name, selector, floor, wall, hue }`. Pick an unused floor/wall pair. Existing sections step down 2 floors each (0, -2, -4, -6, -8), so the next would be `floor: -10`.
3. The index panel, plaques, counts, and number keys all read from `SECTIONS`. Number keys cover only 1 to 5, so widen the `/^[1-5]$/` test in `library.js` for more sections.

### Let a section use more than one wall
Extend `layoutCards()` so that when a section's shelves fill up, it continues on `(wall + 1) % 6` of the same floor, adding occupancy for that wall. `flyToSection` aims at the first wall.

### Add a new visual effect
* Create a module exporting `createX(scene, U, ...)` that returns `{ update?, dispose }`.
* For lit or fogged surfaces, include `LIGHTING_GLSL` and spread `LIGHTING_DEFINES`. For additive glows, follow `beamMaterial` in `sky.js`.
* Wire it into `library.js`: create, update in `frame()`, and dispose in `destroy()`.
* Check it in both ASCII and shaded modes and in both day and night.

### Tweak the feel
| What | Where |
| --- | --- |
| Floor spacing, shaft width, shelf count | constants at the top of `well.js` (card layout and wanderers follow) |
| Fade band at the top and bottom | `LIGHTING_DEFINES` in `well.js` |
| Moon/sun growth when climbing | `closeness` in the `createSky` shader |
| Beam count, strength | `BEAM_COUNT` (`well.js`), `beamMaterial` strengths (`sky.js`) |
| Dust amount, size | `createDust(count)`, `setPointSize` calls in `library.js` |
| Number of wandering books, speed | `MAX`, `FLY_SPEED` in `wanderers.js` |
| Glyph ramp, cell size | `createAscii` options in `ascii.js` |
| Default day/night | `dayGoal` in `library.js` (follows `body.dark-mode`) |
