/* ==========================================================================
   FINAL FANSTERY X: MAIN ENTRY POINT
   ========================================================================== */

import { state } from './state.js';
import { startVisualizer } from './visualizer.js';
import { loadChapter } from './reader.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Visualizer
    startVisualizer();

    // 2. Tab Navigation
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const chIndex = parseInt(tab.getAttribute('data-chapter'), 10);
            if (!isNaN(chIndex) && chIndex !== state.currentChapter) {
                loadChapter(chIndex);
            }
        });
    });

    // 3. Reader Font Size Controls
    const btnIncFont = document.getElementById('btn-inc-font');
    const btnDecFont = document.getElementById('btn-dec-font');
    const fontSizeLabel = document.getElementById('font-size-label');
    const readerContent = document.getElementById('reader-content');

    const fontSizes = [0.85, 0.95, 1.05, 1.15, 1.25, 1.4];
    let currentFontIdx = 2; // 1.05rem is default

    if (btnIncFont && btnDecFont) {
        btnIncFont.addEventListener('click', () => {
            if (currentFontIdx < fontSizes.length - 1) {
                currentFontIdx++;
                applyFontSize();
            }
        });

        btnDecFont.addEventListener('click', () => {
            if (currentFontIdx > 0) {
                currentFontIdx--;
                applyFontSize();
            }
        });
    }

    function applyFontSize() {
        const size = fontSizes[currentFontIdx];
        if (readerContent) {
            readerContent.style.fontSize = `${size}rem`;
        }
        if (fontSizeLabel) {
            fontSizeLabel.textContent = `${Math.round(size * 100)}%`;
        }
    }

    // 4. Focus Mode Toggle
    const btnFocus = document.getElementById('btn-focus');
    if (btnFocus) {
        btnFocus.addEventListener('click', () => {
            state.isFocusMode = !state.isFocusMode;
            document.body.classList.toggle('focus-mode', state.isFocusMode);
            const lbl = btnFocus.querySelector('.lbl');
            if (lbl) {
                lbl.textContent = state.isFocusMode ? 'Normal Mode' : 'Focus Mode';
            }
        });
    }

    // 5. Keyboard Navigation (Arrow keys to switch chapters)
    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        if (e.key === 'ArrowRight') {
            if (state.currentChapter < 5) {
                loadChapter(state.currentChapter + 1);
            }
        } else if (e.key === 'ArrowLeft') {
            if (state.currentChapter > 0) {
                loadChapter(state.currentChapter - 1);
            }
        }
    });

    // 6. Initial Load: Chapter 0
    loadChapter(0);
});
