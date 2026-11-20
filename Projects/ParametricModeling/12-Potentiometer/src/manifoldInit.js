// Manifold WASM initialization module
import Module from 'https://unpkg.com/manifold-3d/manifold.js';
import { context } from './state.js';

export async function initManifold(rebuildCallback, animateCallback) {
    try {
        const wasmInstance = await Module();
        wasmInstance.setup();
        context.wasm = wasmInstance;
        context.Manifold = wasmInstance.Manifold;
        console.log("Manifold geometry engine active");
        
        // Rebuild and start loop
        rebuildCallback();
        animateCallback();
    } catch(e) {
        console.error("Failed to load Manifold WASM.", e);
        const status = document.getElementById('engine-status');
        if (status) {
            status.textContent = "KERNEL FAILED TO LOAD";
            status.style.color = "#ff007f";
        }
    }
}
