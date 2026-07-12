// Manifold WASM initialization module for HAXEL
import Module from 'https://unpkg.com/manifold-3d/manifold.js';
import { context } from './state.js';

export async function initManifold(rebuildCallback, animateCallback) {
    try {
        const wasmInstance = await Module();
        wasmInstance.setup();
        context.wasm = wasmInstance;
        context.Manifold = wasmInstance.Manifold;
        console.log("⬡ HAXEL — Manifold WASM engine online");
        
        rebuildCallback();
        animateCallback();
    } catch(e) {
        console.error("Failed to load Manifold WASM.", e);
        const badge = document.getElementById('perf-badge');
        if (badge) badge.textContent = "⚠ KERNEL FAILED";
    }
}
