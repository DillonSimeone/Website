// Manifold WASM initialization module for 21-HypercubeFrame
import Module from 'https://unpkg.com/manifold-3d/manifold.js';
import { context } from './state.js';

export async function initManifold(rebuildCallback) {
    try {
        const wasmInstance = await Module();
        wasmInstance.setup();
        context.wasm = wasmInstance;
        context.Manifold = wasmInstance.Manifold;
        console.log("Manifold WASM geometry kernel initialized for 21-HypercubeFrame");

        const status = document.getElementById('kernel-status');
        const badge = document.getElementById('kernel-status-badge');
        if (status) status.textContent = "ACTIVE (MANIFOLD WASM)";
        if (badge) badge.classList.add('active');

        if (rebuildCallback) rebuildCallback();
    } catch (e) {
        console.error("Failed to load Manifold WASM kernel:", e);
        const status = document.getElementById('kernel-status');
        if (status) {
            status.textContent = "KERNEL ERROR";
            status.style.color = "#ff0055";
        }
    }
}
