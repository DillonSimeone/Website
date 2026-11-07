// Manifold WASM initialization module for 20-IYL
import Module from 'https://unpkg.com/manifold-3d/manifold.js';
import { context } from './state.js';

export async function initManifold(rebuildCallback, animateCallback) {
    const status = document.getElementById('kernel-status');
    try {
        const wasmInstance = await Module();
        wasmInstance.setup();
        context.wasm = wasmInstance;
        context.Manifold = wasmInstance.Manifold;
        console.log("Manifold WASM geometry kernel initialized for 20-IYL");

        if (status) {
            status.textContent = "ACTIVE (MANIFOLD WASM)";
            status.classList.add('active');
        }

        if (rebuildCallback) rebuildCallback();
        if (animateCallback) animateCallback();
    } catch (e) {
        console.error("Failed to load Manifold WASM kernel:", e);
        if (status) {
            status.textContent = "KERNEL ERROR";
            status.style.color = "#ff0055";
        }
    }
}
