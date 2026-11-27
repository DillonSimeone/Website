# DJ Deaf Wish // AI Agent & Developer Architecture Guide

This guide is designed for AI coding agents (Gemini, Claude, Cursor, Copilot, ChatGPT) and human developers maintaining and extending the **DJ Deaf Wish** website for Nate Hergert.

---

## 1. Project Philosophy & Identity

- **Artist**: Nate Hergert (DJ Deaf Wish) — Deaf advocate, acoustic researcher, and electronic musician based in Portland, Oregon.
- **Mission**: Universal Music Design & Deaf Sonic Agency — centering tactile sub-bass vibration (40–80 Hz), real-time synesthetic visual telemetry, and physical acoustic accessibility.
- **Experience**: One continuous 3D Three.js cyberpunk boulevard. The visitor travels backward down a rain-slicked neon street with an imposing 460 m gold pyramid at the northern terminus (`z = -1500`). Pages on this site are **not separate HTML documents**; they are **3D camera waypoints and stops** in world space.
- **Tech Stack**:
  - Pure vanilla ES Modules (no build steps, no webpack/vite bundling required to run or deploy).
  - Modular CSS architecture under `src/styles/` (`base.css`, `hud.css`, `panels.css`, `stage.css`, `settings-disc.css`, `cards-modals.css`, `mobile.css`).
  - Native browser `importmap` loading Three.js `0.160.0`.
  - Web Audio API (single-pass 7-band FFT spectrum analyzer, peak-frequency hue tracking, live BPM estimator, procedural multi-preset `DemoSynth`, microphone line-in).
  - Web Haptics API (`navigator.vibrate` sub-bass haptic feedback).
  - CSS3D + WebGL hybrid renderer (freestanding physical hoardings and vinyl settings disc).

---

## 2. World Coordinate System & Reference Units

All Three.js coordinates use **1 unit = 1 meter**.

```
                           NORTH (z = -1500)
                             [ PYRAMID ]
                                  ▲
                                  │
                                  │  (z = -170, Plaza & Street End)
                                  │
   WEST (-X)                      │                      EAST (+X)
   -------------------------------┼-------------------------------
   Bio Firewall (x = -38)         │        Gig Tower Skyscraper (x = 31)
   Sidewalk (x = -16 to -10)      │        Sidewalk (x = 10 to 16)
   Audio Hoarding (x = -12)       │        Live Rig Hoarding (x = 12)
   Title Mural (x = -140)         │        Technical Rider Mural (x = 38)
                                  │
                                  │  (z = +280, Street Mouth)
                                  ▼
                           SOUTH (Camera Start)
```

- **X Axis**:
  - `x = 0`: Street centerline.
  - `+X` (East / Right): Gig Tower skyscraper (`x = 31`), Technical Rider firewall (`x = 38`), Live Rig hoarding (`x = 12`), and the **East Neon Oasis** park (`x = 64..212, z = -5..295`, centered `(138, 0, 145)` with planar-reflecting Chladni cymatic pool, northern arched footbridge, glowing trees & paths).
  - `-X` (West / Left): Bio firewall (`x = -38`), Audio Station hoarding (`x = -12`).
- **Y Axis (Height)**:
  - `y = 0`: Street road surface.
  - `y = 1.7m - 3.2m`: Pedestrian eye height.
  - `y = 30m - 120m`: Gig Tower elevator skyscraper.
  - `y = 460m`: Pyramid Apex (`APEX`).
- **Z Axis (Depth)**:
  - `z = +280`: Street mouth (camera position at end of street walk).
  - `z = -170`: Street canyon end / entrance to the pyramid plaza.
  - `z = -1500`: Pyramid center.

---

## 3. The "Page" Architecture (Camera Stops)

The site features discrete pages that the user navigates between via:
- Bottom navigation pill (`PREV` / `NEXT`).
- Keyboard arrows (`Left / Right` or `Up / Down`).
- Mouse wheel / touch swipe.
- Section dot indicators on the left HUD.
- URL hash (`#agency`, `#codafest`, `#wdt`, `#confluence`, `#ada`, `#rider`, `#audio`, `#links`).

### Current Stop Manifest (`src/three/world.js` -> `STOPS`)

| Stop Index | ID | Page Title | Camera Position `[x, y, z]` | Yaw / Pitch | Description |
|---|---|---|---|---|---|
| `0` | `agency` | `Who: DJ Deaf Wish` | `[-36, 21, -44]` | `-2°, 0°` | Bio mural on left firewall |
| `1` | `codafest` | `Gigs: CodaFest` | `[-32, 112, -85]` | `32°, -2°` | Gig Tower West face + Video billboard & pop-up modal |
| `2` | `wdt` | `Gigs: Timberfest` | `[31, 108, -200]` | `178°, -3°` | Gig Tower North face + pop-up modal |
| `3` | `confluence` | `Studio: Confluence` | `[82, 108, -140]` | `-90°, -2°` | Gig Tower East face ($97k OCF grant & haptic studio) |
| `4` | `ada` | `Civic: ADA Fest` | `[31, 108, -68]` | `0°, -2°` | Gig Tower South face (Civic accessible stage) |
| `5` | `rider` | `Technical Rider` | `[10, 6.5, 105]` | `20°, 11°` | Technical Rider mural on right firewall |
| `6` | `audio` | `Audio Station` | `[-6.4, 3.2, 157]` | `-22°, 8°` | CSS3D interactive audio board on left sidewalk |
| `7` | `links` | `Book Nate & Live Rig`| `[7.3, 3.2, 221.5]` | `18°, 8°` | CSS3D booking & live rig board on right sidewalk |

---

## 4. How to Add a New "Page" / Camera Stop (Step-by-Step Recipe)

When Nate shoots a new DJ gig, releases music, or needs a new portfolio section, follow these 5 steps:

### Step 1: Register the Camera Stop in `src/three/world.js`

Open [`src/three/world.js`](file:///src/three/world.js) and locate `STOPS`. Add your new stop:

```javascript
export const STOPS = [
  // ... existing stops ...
  {
    id: 'my-new-gig',
    label: 'SUMMER FEST 2027',
    pageTitle: 'Gigs: Summer Fest',
    pos: [35, 112, -100],  // [X, Y, Z] world position
    yaw: 45,               // Heading angle in degrees
    pitch: -5,             // Elevation tilt in degrees (- = looking down, + = looking up)
    focusYaw: 45           // Heading for narrow/mobile viewports
  }
];
```

### Step 2: Add the Navigation Dot in `index.html`

Open [`index.html`](file:///index.html) and locate `#section-dots`. Add a matching button:

```html
<nav id="section-dots" aria-label="Street sections">
  <!-- existing buttons with data-stop="0", "1", etc. -->
  <button class="section-dot" data-stop="8"><span>GIGS: SUMMER FEST</span></button>
</nav>
```
*Note: Make sure `data-stop` matches the 0-based index of your entry in `STOPS`.*

### Step 3: Wire Page Content in `src/ui/navigation-controller.js`

Open [`src/ui/navigation-controller.js`](file:///src/ui/navigation-controller.js) and locate `GIG_STOPS`:

```javascript
const GIG_STOPS = {
  1: 'codafest',
  2: 'wdt',
  3: 'confluence',
  4: 'ada',
  8: 'summerfest' // Your new page index -> gig ID
};
```

### Step 4: Add the Gig Data in `src/data/gigs.js`

Open [`src/data/gigs.js`](file:///src/data/gigs.js) and append your event to `GIGS_DATA`:

```javascript
{
  id: "summerfest",
  pageIndex: 8,
  name: "Summer Fest 2027",
  subtitle: "Outdoor Sub-Bass Celebration",
  dates: "July 18–20, 2027",
  venue: "Waterfront Park",
  city: "Portland, Oregon",
  role: "Main Stage DJ & Haptic Designer",
  blurb: "High-energy festival performance featuring live sub-bass acoustic transducers and synesthetic projection mapping.",
  takeaway: "High-Energy Headliner · Real-Time Visual Telemetry · Tactile Sub-Bass",
  website: "https://summerfest.example.com",
  domainBadge: "🌐 summerfest.org ↗",
  accent: "#00f0ff",
  accentGlow: "rgba(0, 240, 255, 0.4)",
  video: {
    mp4: "./assets/video/summerfest.mp4",
    poster: "./assets/video/summerfest-poster.jpg"
  },
  photos: [
    {
      full: "./assets/gigs/summerfest/photo_1.jpg",
      thumb: "./assets/gigs/summerfest/photo_1_thumb.jpg",
      caption: "Main stage crowd and sub-bass arrays"
    }
  ]
}
```

### Step 5: Smooth Camera Transition Arc in `src/three/camera-director.js`

Open [`src/three/camera-director.js`](file:///src/three/camera-director.js) and locate `streetPose(outPos, outTgt)`.
The director calculates smooth monotonic cubic-Bezier paths and polar tower orbits between stop `i` and stop `i + 1`.
If your stop travels between two locations where building geometries might intersect the direct line of sight, add a smooth Bezier branch:

```javascript
} else if (i === 7) {
  posX = cubicBezier(a.pos[0], a.pos[0] * 0.5, b.pos[0] * 0.5, b.pos[0], k);
  posY = lerp(a.pos[1], b.pos[1], k);
  posZ = lerp(a.pos[2], b.pos[2], k);
}
```

---

## 5. Adding Murals and CSS3D Sidewalk Hoardings

### To Add a 2D Spray-Paint Street Wall Mural:
1. Define building footprint in `RESERVED` and placement in `MURALS` in `src/three/world.js`.
2. Paint the mural texture onto a 2D offscreen canvas in `src/three/murals.js`. Murals use canvas text, spray splatters, neon glow strokes, and noise stippling.

### To Add an Interactive CSS3D Sidewalk Hoarding:
1. Define the hoarding in `HOARDINGS` in `src/three/world.js`:
   ```javascript
   myHoarding: { elementId: 'panel-myid', stop: 8, x: -12, z: 180, rotY: 0.35, width: 6.0, pxWidth: 600, pxHeight: 600, bottom: 0.5, title: 'TITLE', color: '#00f0ff' }
   ```
2. In `index.html`, add `<div id="panel-myid" class="sidewalk-hoarding">...</div>` inside `#stage-viewport`.
3. In `src/three/css3d-panels.js`, panels are automatically converted into 3D objects with physical plywood backings and frame posts!

---

## 6. Live Stage Rig Visualizer & Visual Themes

Pressing **SPACE** or clicking **LIVE RIG [SPACE]** switches from street exploration mode to the real-time concert projection rig (with GPU-reactive buildings across the street & skyline flashing to the highest detected frequency and dynamic loudness bloom compression):
- **Audio Engine** (`src/audio/audio-engine.js`, `src/audio/demo-synth.js`): Analyzes microphone, audio file, or 3 distinct synth presets into 7 frequency bands, peak frequency hue (`uPeakFreqHue`), and live BPM.
- **Visual Scenes (`1` - `9`, `0` = 10, `-` = 11, `=` = 12, or `[` / `]`)**:
  - `1`: **SKY SPECTRUM** (48 spectrum laser pillars wired to the pyramid apex).
  - `2`: **SKY SCOPE** (Real-time triggered oscilloscope ribbon).
  - `3`: **HYPER TUNNEL** (Concentric laser squares pulsing down the avenue).
  - `4`: **STREET VU** (Streetlights act as a massive VU meter).
  - `5`: **SEARCHLIGHTS** (Sweeping searchlights from pyramid capstone).
  - `6`: **CYMATIC RINGS** (High `y = 685` north-facing pyramid & city overview with concentric cymatic standing waves).
  - `7`: **CITY EQUALIZER** (Elevated avenue shot maximizing kinetic city building reactivity).
  - `8`: **LASER RICOCHET** (3-packet frequency-tiered volleys bouncing off street windows: low=red ripples, mid=yellow-green plucked strings, high=purple piezo shimmer).
  - `9`: **DRONE PILOT** (Fast sky-climbing & alley-diving FPV pilot guarded by shared `CameraShield`).
  - `10`: **STARFALL RAIN** (`0` — GPU-instanced shooting stars + slow black-hole spacetime lensing deformation across ground & buildings; toggle via **`R`** anywhere).
  - `11`: **VOID ENCROACH** (`-` — Overhead pyramid capstone shot looking down on the lit city as dark void waves, rising obsidian monoliths, and containment shockwaves collide at the black perimeter).
  - `12`: **OASIS CYMATICS** (`=` — Weaves through the city into the relocated Neon Oasis park, framing real-time planar Pyramid reflections across Chladni & Faraday water patterns).
- **Global Visual Themes (`T`)** (`src/three/visual-modes.js`): `noir` (Cyber Noir), `synthwave` (Synthwave Grid), `thermal` (Sub-Bass Thermal), `uv_acid` (Ultraviolet Acid), `monochrome` (Monochrome Strobe), `solar` (Solar Temple), `void` (Abyssal Void). Each transforms sky zenith, horizon/sun corona, pyramid stone/mortar/capstone, building facades & windows, street/park lights, East Oasis pool/trees, and ground grid.
- **Stage Auto-Pilot (`A`) & Speed Controller**: Cycles Stage Scenes at configurable speed (`slow` 24s / `normal` 12s / `fast` 6s / `hyper` 3s) and rotates Global Visual Themes automatically (`autoCycleThemes`).
- **Projection Mapping [C]** (`src/stage/projection-mapper.js`): 4-point corner pinning for venue projection alignment.
- **MIDI Controller [M]** (`src/stage/midi-controller.js`): Connects USB MIDI DJ controllers to trigger scenes, strobe, and master gain.

---

## 7. How to Test Changes Locally

1. Open a terminal in this directory:
   ```bash
   # Using npx (Node.js)
   npx serve .
   # OR using Python
   python -m http.server 8000
   ```
2. Open your browser to `http://localhost:3000/?dev` or `http://localhost:8000/?dev`.
3. Test with URL params:
   - `?dev` or `?redirect=no`: Disables the production redirect to `natehergert.com/djdeafwish` (also automatically skipped on `localhost`).
   - `?fps`: Displays real-time FPS, DPR, and bloom telemetry.
   - `?quality=low` or `?quality=high`: Forces specific graphic presets.
   - `#agency`, `#codafest`, etc.: Boots directly to that camera stop.
4. Verify navigation & features:
   - Test clicking `PREV` / `NEXT` pills, wheel/swipe, and clicking dots in `#section-dots`.
   - Test pressing `SPACE` to toggle the Live Stage Rig, `1`–`9` / `0` / `-` / `=` (or `[` / `]`) for scenes, `R` for Starfall Rain overlay, `T` for global visual themes, `A` + speed selector for Auto-Pilot, and `S` for the vinyl Settings Disc spotlight.

---

## 8. Architecture Map & Deployment Checklist

### Modular Source Tree
- `src/styles/` (`base.css`, `hud.css`, `panels.css`, `stage.css`, `settings-disc.css`, `cards-modals.css`, `mobile.css`)
- `src/three/` (`world.js`, `visual-modes.js`, `scene-manager.js`, `quality.js`, `camera-director.js`, `camera-drone.js`, `camera-shield.js`, `city.js`, `city-buildings.js`, `city-ground.js`, `city-oasis.js`, `city-props.js`, `gig-tower.js`, `murals.js`, `pyramid.js`, `lasers.js`, `laser-ricochet.js`, `logo-mesh.js`, `sky-show.js`, `starfield.js`, `star-rain.js`, `void-tide.js`, `glow.js`, `css3d-panels.js`)
- `src/audio/` (`audio-engine.js`, `demo-synth.js`, `haptic-engine.js`)
- `src/settings/` (`settings-store.js`, `settings-disc.js`, `settings-binder.js`)
- `src/ui/` (`navigation-controller.js`, `stage-hud.js`, `gig-card.js`, `hero.js`, `video-modal.js`)
- `src/stage/` (`projection-mapper.js`, `midi-controller.js`)

When deploying to Nate's custom domain (e.g. `djdeafwish.com` or `natehergert.com`):
1. Ensure all files are uploaded preserving relative paths (`index.html`, `src/`, `assets/`). Use [`export.html`](export.html) to package a clean `.zip` bundle with optional redirect stripping.
2. Deploy directly to **GitHub Pages**, **Netlify**, **Vercel**, or **Cloudflare Pages** (no build command needed, publish directory is root `.`).
3. Video MIME types: Ensure host supports `.mp4` (`video/mp4`) and `.webm` (`video/webm`) with byte-range requests for video seeking.
