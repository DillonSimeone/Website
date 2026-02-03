# Project: Gravity Falls AR Book (The "Peeling" Prototype)
**Goal:** A WebXR-based AR experience where 2D book illustrations peel off the page and become interactive 3D characters.

## Technical Stack
- **Framework:** Three.js (Vanilla JS/TS)
- **AR Bedrock:** WebXR Device API (Native Image Tracking)
- **Animation:** GSAP (for Lerping and UI fades)
- **Asset Format:** .GLB (Compressed via gltf-pipeline / Draco)
- **Lighting:** XREstimatedLight (WebXR Light Estimation API)

## Core Logic Requirements
1. **Image Anchoring:** Define physical width (meters) for each target. Anchor 3D models to the center of the detected quadrilateral.
2. **Smoothing (The Jitter-Killer):** - Apply a **Deadzone** (Threshold: 0.005 units).
   - Apply **Lerp** (Alpha: 0.1) for position and rotation.
3. **The "Ghosting" System:**
   - On `trackingloss`: Don't destroy the model immediately. Start a 2-second GSAP fade-out.
   - If `trackingfound` during fade: Cancel fade-out and Lerp back to the new position.
4. **The "Peel" Event:**
   - `isPeeled` boolean per page.
   - If `trackingfound` and `!isPeeled`: Trigger the Cylindrical Page-Curl shader + 3D scale-up animation.
   - Mark `isPeeled = true`.

## Visual Requirements
- **Shadow Floor:** Invisible `ShadowMaterial` plane parented to each image target.
- **Environment Map:** Use the `XREstimatedLight` probe to match real-world room lighting.
- **Deformation:** Custom Vertex Shader for the 2D illustration curl.

## Files to Generate
- [ ] `xr-manager.js`: Handles WebXR session and image tracking events.
- [ ] `peel-shader.glsl`: Vertex shader for the cylindrical page curl.
- [ ] `app.js`: Main loop with Lerp, Deadzone, and State Machine logic.