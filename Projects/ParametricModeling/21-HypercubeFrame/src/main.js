// Application entry point for 21-HypercubeFrame
import { initViewport } from './viewport.js';
import { initUI, rebuildActiveGeometry } from './ui.js';
import { initManifold } from './manifoldInit.js';

window.addEventListener('DOMContentLoaded', async () => {
    console.log("Bootstrapping 21-HypercubeFrame Studio...");
    initViewport('viewport-container');
    initUI();
    await initManifold(rebuildActiveGeometry);
});
