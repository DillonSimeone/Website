# Project: AR Book — "The Peeling Prototype"
**Goal:** A WebXR-based AR experience where 2D book illustrations peel off the page and become interactive 3D characters.

## Architecture (Scalable to 200+ Pages)

### The Golden Rule: One JSON Entry = One AR Page
Adding a new page to the book requires **three steps**:
1. Drop the tracking image into `/trainingImages/`
2. Drop the `.glb` model into `/3dModel/`
3. Add an entry to `app/pages.json`

**No code changes required.** The system is fully data-driven.

### File Structure
```
AugmentedReailityBook/
├── gemini.md                  ← This file (project docs)
├── trainingImages/            ← 2D images to track (one per page)
│   └── shrek.webp
├── 3dModel/                   ← 3D models (.glb preferred)
│   └── shrek_pocket_shrek_and_animations.glb
├── Imageauditor/              ← Python/OpenCV tracking quality tool
│   ├── gemini.md
│   └── notes.md
└── app/                       ← THE WEB APP
    ├── index.html             ← Entry point (import map, no npm)
    ├── pages.json             ← PAGE REGISTRY (the scalability key)
    ├── css/
    │   └── style.css          ← Premium dark glassmorphic UI
    └── js/
        ├── app.js             ← Main orchestrator (init, render loop, events)
        ├── xr-manager.js      ← WebXR session & image tracking events
        ├── page-manager.js    ← Data-driven page loader (reads pages.json)
        ├── smoothing.js       ← Deadzone + Lerp jitter-killer
        ├── ghosting.js        ← Tracking-loss fade system (GSAP)
        └── peel-shader.js     ← Cylindrical page-curl vertex shader
```

## Technical Stack
- **Framework:** Three.js (ES Modules via CDN import map — zero npm)
- **AR Bedrock:** WebXR Device API (Native Image Tracking)
- **Animation:** GSAP (for lerping, UI fades, ghosting)
- **Asset Format:** `.glb` (GLTF Binary)
- **Lighting:** Ambient + Directional + XREstimatedLight (future)

## Core Systems

### 1. Image Anchoring (xr-manager.js)
- Defines physical width (meters) per target image
- Anchors 3D models to detected image quadrilateral center
- Dispatches `trackingfound`, `trackingupdate`, `trackinglost` events

### 2. Smoothing — The Jitter-Killer (smoothing.js)
- **Deadzone:** Ignores movements below 0.005m / 0.01rad
- **Lerp/Slerp:** Alpha 0.1 for buttery-smooth position/rotation

### 3. The Ghosting System (ghosting.js)
- On `trackinglost`: 2-second GSAP fade-out (not instant destroy)
- On `trackingfound` during fade: Cancel fade, lerp back to new position

### 4. The "Peel" Event (peel-shader.js)
- `isPeeled` boolean tracked per page in PageManager
- First `trackingfound` triggers: cylindrical page-curl shader → 3D scale-up
- Marked `isPeeled = true` to prevent replay

### 5. Shadow Floor
- Invisible `ShadowMaterial` plane per anchor for grounding

## Running Locally
Requires HTTPS for WebXR. Use any static server with SSL:
```bash
npx serve app/ --ssl
# or
python -m http.server 8080  # (needs mkcert for https)
```

Test on an **Android phone with Chrome + ARCore**.
Add `?debug` to the URL for on-screen diagnostics.

## pages.json Schema
```json
{
  "id": "page_001_shrek",        // Unique identifier
  "pageNumber": 1,               // Book page number
  "label": "Shrek",              // Human-readable name
  "trackingImage": "../trainingImages/shrek.webp",
  "physicalWidthM": 0.15,        // Real-world image width in meters
  "model": {
    "src": "../3dModel/shrek_pocket_shrek_and_animations.glb",
    "scale": 0.005,
    "offsetY": 0.0,              // Fine-tune position
    "rotationY": 0               // Degrees
  },
  "animation": {
    "autoplay": true,
    "clipIndex": 0,
    "loop": true
  },
  "peel": {
    "enabled": true,
    "duration": 1.5,
    "curlRadius": 0.3
  }
}
```

## Training & Tooling (Local)
- **Image Auditor:** Python/OpenCV tool in `/Imageauditor/`
- Uses `cv2.ORB_create()` to check feature density
- Outputs heatmap for artist feedback
- Minimum 300 features = "GOOD", below 50/100px² = "POOR"