// Main entry point for 25-SpoolLamp
import { initViewport } from './viewport.js';
import { initManifold } from './manifoldInit.js';
import { bindUIEvents, rebuildActiveGeometry } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    initViewport('viewport-container');
    bindUIEvents();
    initManifold(rebuildActiveGeometry);
});
