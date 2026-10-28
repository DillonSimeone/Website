// Application entry point for 19-DeafDoorbellEnclosures
import { initViewport } from './viewport.js';
import { initUI, rebuildActiveGeometry } from './ui.js';
import { initManifold } from './manifoldInit.js';

window.addEventListener('DOMContentLoaded', async () => {
    console.log("Bootstrapping 19-DeafDoorbellEnclosures Studio...");
    initViewport('viewport-container');
    initUI();
    await initManifold(rebuildActiveGeometry);
});
