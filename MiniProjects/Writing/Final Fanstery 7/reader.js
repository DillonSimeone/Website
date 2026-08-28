/* ==========================================================================
   MARKDOWN LOADER, PARSER & HUD METRICS
   ========================================================================== */

import { state } from './state.js';
import { handleResize } from './visualizer.js';

const chaptersCache = {};
let hudInterval = null;

export async function loadChapterContent(chapterIndex) {
    const readerContent = document.getElementById('reader-content');
    
    // Smooth transition: fade out first
    readerContent.classList.add('fade-out');
    
    // If cache is empty, fetch the file
    if (!chaptersCache[chapterIndex]) {
        try {
            const response = await fetch(`${chapterIndex}.md`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            let markdownText = await response.text();
            
            // Standardize log headers: Prepend primary title to Chapter 0, ensure others are H1
            if (chapterIndex === 0) {
                markdownText = `# The Genesis of Overunity\n\n${markdownText}`;
            } else {
                const lines = markdownText.split('\n');
                if (lines[0].trim() && !lines[0].trim().startsWith('#')) {
                    lines[0] = `# ${lines[0].trim()}`;
                    markdownText = lines.join('\n');
                }
            }
            
            // Parse Markdown to HTML via Marked.js
            let htmlContent = marked.parse(markdownText);
            
            // Post-process to style Roman numeral sections nicely
            htmlContent = htmlContent.replace(
                /<h2>([IVXLCDM]+)\.\s*(.*?)<\/h2>/gi, 
                '<h2><span class="roman-num font-mono">$1.</span> $2</h2>'
            );
            
            // Post-process to wrap isolated thermodynamic formulas in nice layout blocks
            htmlContent = htmlContent.replace(
                /<p>Pout\u200B&gt;Pin\u200B<\/p>/gi,
                '<div class="formula-block font-mono text-accent-green">P<sub>out</sub> &gt; P<sub>in</sub></div>'
            );
            htmlContent = htmlContent.replace(
                /<p>W=ΔE<\/p>/gi,
                '<div class="formula-block font-mono text-accent-blue">W = &Delta;E</div>'
            );
            
            chaptersCache[chapterIndex] = htmlContent;
        } catch (error) {
            console.error('Error loading markdown chapter:', error);
            readerContent.innerHTML = `
                <div class="error-block font-mono">
                    <span class="text-accent-red">LOG EXHAUSTION ERROR [0x442]</span>
                    <p class="text-sm mt-2">Failed to retrieve research files for Chapter ${chapterIndex}. Ensure database is active.</p>
                </div>
            `;
            readerContent.classList.remove('fade-out');
            return;
        }
    }

    // Delay content replacement slightly to match opacity transition
    setTimeout(() => {
        readerContent.innerHTML = chaptersCache[chapterIndex];
        
        // Setup accessibility attributes
        readerContent.setAttribute('aria-labelledby', `tab-${chapterIndex}`);
        
        // Scroll viewport back to top
        document.querySelector('.reader-viewport').scrollTop = 0;
        
        // Fade in
        readerContent.classList.remove('fade-out');
    }, 150);
}

export function updateHUDMetrics(chapterIndex) {
    const metrics = state.baseMetrics[chapterIndex];
    const inputEl = document.getElementById('hud-input');
    const outputEl = document.getElementById('hud-output');
    const coeffEl = document.getElementById('hud-coeff');
    const firstLawEl = document.querySelector('.metrics-grid .metric-box:nth-child(1) .metric-status');
    const secondLawEl = document.querySelector('.metrics-grid .metric-box:nth-child(2) .metric-status');
    const lifestreamEl = document.querySelector('.metrics-grid .metric-box:nth-child(3) .metric-status');
    const readerViewport = document.querySelector('.reader-viewport');

    // Update texts
    inputEl.textContent = metrics.input;
    outputEl.textContent = metrics.output;
    coeffEl.textContent = metrics.coeff;
    firstLawEl.textContent = metrics.status1;
    secondLawEl.textContent = metrics.status2;
    lifestreamEl.textContent = metrics.status3;

    // Reset indicator classes
    inputEl.className = 'hud-value';
    outputEl.className = 'hud-value';
    coeffEl.className = 'hud-value';
    readerViewport.className = 'reader-viewport';

    // Apply colors depending on active chapter theme
    if (chapterIndex === 0) {
        inputEl.classList.add('text-accent-green');
        outputEl.classList.add('text-accent-green');
        coeffEl.classList.add('text-accent-green');
        readerViewport.classList.add('theme-green');
    } else if (chapterIndex === 1) {
        inputEl.classList.add('text-accent-blue');
        outputEl.classList.add('text-accent-blue');
        coeffEl.classList.add('text-accent-blue');
        readerViewport.classList.add('theme-blue');
    } else if (chapterIndex === 2) {
        inputEl.classList.add('text-accent-red');
        outputEl.classList.add('text-accent-red');
        coeffEl.classList.add('text-accent-red');
        readerViewport.classList.add('theme-red');
    } else if (chapterIndex === 3) {
        inputEl.classList.add('text-accent-yellow');
        outputEl.classList.add('text-accent-yellow');
        coeffEl.classList.add('text-accent-yellow');
        readerViewport.classList.add('theme-yellow');
    }

    // Add high-tech flickering variance to output statistics when loop is active
    if (hudInterval) clearInterval(hudInterval);
    hudInterval = setInterval(() => {
        // Only jitter numeric, non-infinite outputs
        if (metrics.output !== "∞" && !state.focusMode) {
            const baseVal = parseFloat(metrics.output);
            const unit = metrics.output.replace(/[0-9.]/g, '');
            // Let's add a small random fluctuation (+/- 1.5%)
            const jitter = baseVal * (1 + (Math.random() - 0.5) * 0.03);
            
            // Jitter coefficient proportionally
            const baseCoeff = parseFloat(metrics.coeff);
            const coeffJitter = baseCoeff * (1 + (Math.random() - 0.5) * 0.015);

            outputEl.textContent = jitter.toFixed(1) + unit;
            coeffEl.textContent = coeffJitter.toFixed(1) + "%";
            
            // If user is hovering a node, boost metrics to simulate active resonance stimulation
            if (state.hoveredMateria) {
                const boost = 1.25;
                outputEl.textContent = (jitter * boost).toFixed(1) + unit;
                coeffEl.textContent = (coeffJitter * boost).toFixed(1) + "%";
            }
        }
    }, 250);
}

export function adjustFontSize(dir) {
    if (dir === 'inc' && state.fontSizeScale < 1.5) {
        state.fontSizeScale += 0.1;
    } else if (dir === 'dec' && state.fontSizeScale > 0.8) {
        state.fontSizeScale -= 0.1;
    }
    
    document.documentElement.style.setProperty('--font-scale', state.fontSizeScale);
    document.querySelector('.font-size-indicator').textContent = `${Math.round(state.fontSizeScale * 100)}%`;
}

export function toggleFocusMode() {
    state.focusMode = !state.focusMode;
    const body = document.body;
    
    if (state.focusMode) {
        body.classList.add('focus-mode');
        
        // Add a floating close button specifically for focus mode
        const closeBtn = document.createElement('button');
        closeBtn.className = 'focus-close-btn font-mono';
        closeBtn.innerHTML = '✕';
        closeBtn.title = 'Exit Focus Mode';
        closeBtn.setAttribute('aria-label', 'Exit Focus Mode');
        closeBtn.addEventListener('click', toggleFocusMode);
        document.body.appendChild(closeBtn);
    } else {
        body.classList.remove('focus-mode');
        const closeBtn = document.querySelector('.focus-close-btn');
        if (closeBtn) closeBtn.remove();
    }

    // Force layout resizing of WebGL canvas
    handleResize();
}
