# Project: AR Book — "The Peeling Prototype" (MindAR)
**Goal:** A WebXR-based AR experience where 2D book illustrations come to life in 3D using MindAR.

## Versions
- **V0 (Basic)**: Uses internal smoothing and ghosting logic. Fast and reliable.
- **V1 (Upgraded)**: Uses standalone `PoseSmoothing` (Deadzone/Slerp) and `GhostingSystem` (GSAP fades) for premium feel.
- **V2 (ESM)**: **Current Production.** Uses MindAR 1.2.5 (ESM) and Three.js r147. Includes real-time `filterMinCF` tuning and a 10-target anchor-padding stability buffer to prevent worker crashes.

## Architecture
The system is data-driven via `pages.json`.

### File Structure
```
MindAR/
├── gemini.md                  ← This file
└── app/                       ← THE WEB APP
    ├── indexV0.html           ← Basic implementation entry
    ├── indexV1.html           ← Upgraded implementation entry
    ├── indexV2.html           ← ESM implementation (MindAR 1.2.5)
    ├── pages.json             ← Registry
    ├── minify.js              ← (New) Minification script for production
    ├── package.json           ← Minifier dependencies
    ├── css/

    └── js/
        ├── v2/                ← MODERN ESM CORE
        │   ├── appV2.js
        │   ├── smoothing.js
        │   ├── ghosting.js
        │   ├── three.module.js
        │   └── loaders/       ← Three.js JSM Loaders
        ├── appV0.js           ← Basic logic
        ├── appV1.js           ← Upgraded logic
        ├── smoothing.js       ← Legacy smoothing
        └── ghosting.js        ← Legacy ghosting

Assets (at project root):
├── trainingImages/            ← 2D images to track
└── 3dModel/                   ← 3D models (.glb)
```

## Running Locally
Requires HTTPS.
```bash
npx serve app/ --ssl
```

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

## Post-Processing: Minification
Minifies all HTML, CSS, and JS files recursively.
1. `npm install` (first time)
2. `npm run minify`
- Builds a minified project structure in a `/dist` folder.
- Copy `/dist/*` back to root for production/deployment.