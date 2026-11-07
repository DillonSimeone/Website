// Main Application Orchestrator for 20-IYL (Parametric Pedestal & Sled Studio)
import { initViewport, rebuildScene } from './viewport.js';
import { initUI } from './ui.js';
import { initManifold } from './manifoldInit.js';

window.addEventListener('DOMContentLoaded', async () => {
    console.log("Initializing 20-IYL Pedestal Studio...");
    
    // 1. Setup Three.js Viewport
    initViewport('viewport-container');

    // 2. Setup UI controls and listeners
    initUI();

    // 3. Initialize Manifold WASM geometry kernel and generate initial meshes
    await initManifold(rebuildScene);
});
