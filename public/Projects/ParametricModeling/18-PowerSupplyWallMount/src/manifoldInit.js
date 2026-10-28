// Manifold WASM initialization module
import Module from 'https://unpkg.com/manifold-3d/manifold.js';
import { context } from './state.js';

export async function initManifold(rebuildCallback, animateCallback) {
    try {
        const wasmInstance = await Module();
        wasmInstance.setup();
        context.wasm = wasmInstance;
        context.Manifold = wasmInstance.Manifold;
        console.log("Manifold WASM geometry kernel initialized for 18-PowerSupplyWallMount");
        
        const status = document.getElementById('kernel-status');
        if (status) {
            status.textContent = "ACTIVE";
            status.classList.add('active');
        }

        rebuildCallback();
        if (animateCallback) animateCallback();
    } catch (e) {
        console.error("Failed to load Manifold WASM kernel:", e);
        const status = document.getElementById('kernel-status');
        if (status) {
            status.textContent = "KERNEL ERROR";
            status.style.color = "#ff0055";
        }
    }
}
