/* ==========================================================================
   FINAL FANSTERY X: MARKDOWN LOADER & HUD CONTROLLER
   ========================================================================== */

import { state } from './state.js';

const chaptersCache = {};

export async function loadChapter(chapterIndex) {
    const readerContent = document.getElementById('reader-content');
    const viewport = document.getElementById('reader-viewport');
    
    // Smooth transition: fade out first
    readerContent.classList.add('fade-out');
    
    // Update State
    state.currentChapter = chapterIndex;
    updateHUDMetrics(chapterIndex);
    updateActiveTab(chapterIndex);
    
    // Fetch and parse markdown if not cached
    if (!chaptersCache[chapterIndex]) {
        try {
            const response = await fetch(`${chapterIndex}.md`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            let markdownText = await response.text();
            
            // Format Roman numerals in H2/H3
            markdownText = markdownText.replace(
                /###\s*([IVXLCDM]+)\.\s*(.*)/gi,
                '### <span class="roman-num">$1.</span> $2'
            );
            
            // Parse via marked.js
            let htmlContent = marked.parse(markdownText);
            
            chaptersCache[chapterIndex] = htmlContent;
        } catch (err) {
            console.error('Failed to load chapter markdown:', err);
            readerContent.innerHTML = `
                <div class="loader-skeleton font-mono">
                    <span class="text-accent-red">INQUISITION TRANSMISSION ERROR [CODE 0xFA7]</span>
                    <p class="text-sm mt-3 text-dim">Unable to retrieve telemetry logs for Chapter ${chapterIndex}. Ensure database link is persistent.</p>
                </div>
            `;
            readerContent.classList.remove('fade-out');
            return;
        }
    }
    
    // Fade in new content
    setTimeout(() => {
        readerContent.innerHTML = chaptersCache[chapterIndex];
        readerContent.classList.remove('fade-out');
        if (viewport) viewport.scrollTop = 0;
    }, 180);
}

function updateHUDMetrics(chapterIndex) {
    const data = state.chaptersData[chapterIndex];
    if (!data) return;
    
    const canvasTitle = document.getElementById('canvas-title');
    const hudClock = document.getElementById('hud-clock');
    const hudRejection = document.getElementById('hud-rejection');
    const hudCalamity = document.getElementById('hud-calamity');
    const metricSubstrate = document.getElementById('metric-substrate');
    const metricSepsis = document.getElementById('metric-sepsis');
    const metricBandwidth = document.getElementById('metric-bandwidth');
    const logTicker = document.getElementById('log-ticker');
    const footerLoc = document.getElementById('footer-loc');
    const coPhase = document.getElementById('co-phase');
    const coFlux = document.getElementById('co-flux');
    
    if (canvasTitle) canvasTitle.textContent = data.title;
    if (hudClock) hudClock.textContent = data.clock;
    if (hudRejection) hudRejection.textContent = data.rejection;
    if (hudCalamity) hudCalamity.textContent = data.calamity;
    if (metricSubstrate) metricSubstrate.textContent = data.substrate;
    if (metricSepsis) metricSepsis.textContent = data.sepsis;
    if (metricBandwidth) metricBandwidth.textContent = data.bandwidth;
    if (logTicker) logTicker.textContent = data.ticker;
    if (footerLoc) footerLoc.textContent = data.location;
    if (coPhase) coPhase.textContent = data.phase;
    if (coFlux) coFlux.textContent = data.flux;
}

function updateActiveTab(chapterIndex) {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        const tabCh = parseInt(tab.getAttribute('data-chapter'), 10);
        if (tabCh === chapterIndex) {
            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');
        } else {
            tab.classList.remove('active');
            tab.setAttribute('aria-selected', 'false');
        }
    });
}
