/* ==========================================================================
   MAIN APPLICATION COORDINATOR
   ========================================================================== */

import { state } from './state.js';
import { initThreeJS, applyMateriaLayout, handleResize } from './visualizer.js';
import { loadChapterContent, updateHUDMetrics, adjustFontSize, toggleFocusMode } from './reader.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Install Marked.js options
    if (window.marked) {
        marked.setOptions({
            gfm: true,
            breaks: true
        });
    } else {
        console.error("Marked.js is not loaded.");
    }
    
    // 2. Setup font resizer listeners
    document.getElementById('btn-inc-font').addEventListener('click', () => adjustFontSize('inc'));
    document.getElementById('btn-dec-font').addEventListener('click', () => adjustFontSize('dec'));
    
    // 3. Setup focus mode listeners
    document.getElementById('btn-focus').addEventListener('click', toggleFocusMode);
    
    // 4. Setup tab buttons click listeners
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const chapterIndex = parseInt(btn.getAttribute('data-chapter'));
            if (state.activeChapter === chapterIndex) return;
            
            // Update Tab states
            tabBtns.forEach(b => {
                b.classList.remove('active', 'theme-green', 'theme-blue', 'theme-red', 'theme-yellow');
                b.setAttribute('aria-selected', 'false');
            });
            
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            
            // Apply thematic colors to active buttons
            const themeClasses = ['theme-green', 'theme-blue', 'theme-red', 'theme-yellow'];
            btn.classList.add(themeClasses[chapterIndex]);
            
            // Update global state
            state.activeChapter = chapterIndex;
            
            // Trigger log retrieval
            loadChapterContent(chapterIndex);
            
            // Update stats
            updateHUDMetrics(chapterIndex);
            
            // Update 3D visualizer
            if (state.webGLAvailable) {
                applyMateriaLayout(chapterIndex);
            }
        });
    });

    // 5. Initialize WebGL
    try {
        initThreeJS();
        handleResize();
    } catch (e) {
        console.warn("WebGL not supported or failed to load. Falling back to background gradient.", e);
        state.webGLAvailable = false;
        const canvas3d = document.getElementById('canvas3d');
        if (canvas3d) {
            canvas3d.style.display = 'none';
        }
        // Add a generic stylesheet class to accommodate styling fallback
        document.body.classList.add('webgl-disabled');
    }

    // 6. Trigger first chapter load & initialize HUD
    if (tabBtns.length > 0) {
        tabBtns[0].classList.add('theme-green');
        loadChapterContent(0);
        updateHUDMetrics(0);
    }
});
