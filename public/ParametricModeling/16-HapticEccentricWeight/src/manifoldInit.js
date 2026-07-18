// Manifold WASM bootstrap
import Module from 'https://unpkg.com/manifold-3d/manifold.js';
import { context } from './state.js';

export async function initManifold(onReady, onAnimate) {
  try {
    const wasm = await Module();
    wasm.setup();
    context.wasm = wasm;
    context.Manifold = wasm.Manifold;
    console.log('⬡ HAPTIC WEIGHT LAB — Manifold WASM online');
    if (onReady) await onReady();
    if (onAnimate) onAnimate();
  } catch (e) {
    console.error('Failed to load Manifold WASM', e);
    const badge = document.getElementById('perf-badge');
    if (badge) badge.textContent = '⚠ KERNEL FAILED';
  }
}
