# DJ Deaf Wish // AI Agent & Developer Architecture Guide

This guide is designed for AI coding agents (Gemini, Claude, Cursor, Copilot, ChatGPT) and human developers maintaining and extending the **DJ Deaf Wish** website for Nate Hergert.

---

## 1. Project Philosophy & Identity

- **Artist**: Nate Hergert (DJ Deaf Wish) — Deaf advocate, acoustic researcher, and electronic musician based in Portland, Oregon.
- **Mission**: Universal Music Design & Deaf Sonic Agency — centering tactile sub-bass vibration (40–80 Hz), real-time synesthetic visual telemetry, and physical acoustic accessibility.
- **Experience**: One continuous 3D Three.js cyberpunk boulevard. The visitor travels backward down a rain-slicked neon street with an imposing 460 m gold pyramid at the northern terminus (`z = -1500`). Pages on this site are **not separate HTML documents**; they are **3D camera waypoints and stops** in world space.
- **Tech Stack**:
  - Pure vanilla ES Modules (no build steps, no webpack/vite bundling required to run or deploy).
  - Native browser `importmap` loading Three.js `0.160.0`.
  - Web Audio API (real-time FFT spectrum analyzer, sub-bass band tracking, microphone line-in).
  - Web Haptics API (`navigator.vibrate` sub-bass haptic feedback).
  - CSS3D + WebGL hybrid renderer (freestanding physical hoardings and settings disc).

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
  - `+X` (East / Right): Gig Tower skyscraper (`x = 31`), Technical Rider firewall (`x = 38`), Live Rig hoarding (`x = 12`).
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

### Step 3: Wire Page Content in `src/app.js`

Open [`src/app.js`](file:///src/app.js) and locate `updateGigCard()`:

```javascript
updateGigCard() {
  if (!this.gigCard) return;
  if (this.currentPage === 1) {
    this.gigCard.showGig('codafest');
  } else if (this.currentPage === 2) {
    this.gigCard.showGig('wdt');
  } else if (this.currentPage === 3) {
    this.gigCard.showGig('confluence');
  } else if (this.currentPage === 4) {
    this.gigCard.showGig('ada');
  } else if (this.currentPage === 8) { // Your new page index
    this.gigCard.showGig('summerfest');
  } else {
    this.gigCard.hide();
  }
}
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
The director calculates camera motion between stop `i` and stop `i + 1`.
If your stop travels between two locations where building geometries might intersect the direct line of sight, add an arch:

```javascript
} else if (i === 7) {
  // Arcing curve around obstacles
  const midArch = Math.sin(k * Math.PI);
  posX += midArch * 15;
  posY = lerp(a.pos[1], b.pos[1], k);
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

## 6. Live Stage Rig Visualizer

Pressing **SPACE** or clicking **LIVE RIG [SPACE]** switches from street exploration mode to the real-time concert projection rig:
- **Audio Engine** (`src/audio/audio-engine.js`): Analyzes microphone or synthesized audio into 7 frequency bands + sub-bass dominant frequency.
- **Visual Scenes (`1` - `5`)**:
  - `1`: **SKY SPECTRUM** (48 spectrum laser pillars wired to the pyramid apex).
  - `2`: **SKY SCOPE** (Real-time triggered oscilloscope ribbon).
  - `3`: **HYPER TUNNEL** (Concentric laser squares pulsing down the avenue).
  - `4`: **STREET VU** (Streetlights act as a massive VU meter).
  - `5`: **SEARCHLIGHTS** (Sweeping searchlights from pyramid capstone).
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
2. Open your browser to `http://localhost:3000` or `http://localhost:8000`.
3. Test with URL params:
   - `?fps`: Displays real-time FPS and WebGL draw call telemetry.
   - `?quality=low` or `?quality=high`: Forces specific graphic presets.
   - `#agency`, `#codafest`, etc.: Boots directly to that camera stop.
4. Verify navigation:
   - Test clicking `PREV` / `NEXT` pills.
   - Test clicking dots in `#section-dots`.
   - Test pressing `SPACE` to toggle the Live Stage Rig.

---

## 8. Deployment Checklist

When deploying to Nate's custom domain (e.g. `djdeafwish.com` or `natehergert.com`):
1. Ensure all files are uploaded preserving relative paths (`index.html`, `djwish.css`, `src/`, `assets/`).
2. Deploy directly to **GitHub Pages**, **Netlify**, **Vercel**, or **Cloudflare Pages** (no build command needed, publish directory is root `.`).
3. Video MIME types: Ensure host supports `.mp4` (`video/mp4`) and `.webm` (`video/webm`) with byte-range requests for video seeking.
