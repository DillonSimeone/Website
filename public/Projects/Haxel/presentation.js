import { initAudioOnGesture } from './presentation-audio.js';
import {
    startVizLoop,
    onSlideEnter,
    onSlideLeave,
    setActiveSlideIndex
} from './presentation-viz.js';
import {
    initFleet,
    refreshFleet,
    fleetEstop,
    fleetClaimAll,
    fleetReleaseAll,
    sendFleetState,
    fleetPlay,
    fleetStop,
    renderFleetCards,
    onFleetStatusChange,
    formatFleetSummary,
    isDemoMode,
    getDemoPatterns,
    setFleetPollInterval,
    disconnectFleet,
    getHubIp
} from './presentation-fleet.js';

let currentSlideIndex = 0;
let slides = [];
let speakerNotes = {};
let notesPanelOpen = false;

const slideCounter = () => document.getElementById('slideCounter');
const progressBar = () => document.getElementById('progressBar');
const menuPanel = () => document.getElementById('menuPanel');
const menuList = () => document.getElementById('menuList');
const fleetStatusEl = () => document.getElementById('fleetFooterStatus');
const fleetMeterFill = () => document.getElementById('fleetMeterFill');

const FLEET_SLIDE_INDEX = 15;

export function goToSlide(idx) {
    if (idx < 0 || idx >= slides.length) return;
    onSlideLeave(currentSlideIndex);
    currentSlideIndex = idx;
    setActiveSlideIndex(idx);
    updatePresentation();
    onSlideEnter(idx);

    if (idx === FLEET_SLIDE_INDEX) setFleetPollInterval(2000);
    else setFleetPollInterval(10000);

    if (notesPanelOpen) updateNotesPanel();
}

export function nextSlide() {
    if (currentSlideIndex < slides.length - 1) goToSlide(currentSlideIndex + 1);
}

export function prevSlide() {
    if (currentSlideIndex > 0) goToSlide(currentSlideIndex - 1);
}

function toggleMenu(forceState) {
    const panel = menuPanel();
    if (!panel) return;
    if (typeof forceState === 'boolean') {
        panel.classList.toggle('open', forceState);
    } else {
        panel.classList.toggle('open');
    }
}

function toggleNotes() {
    const panel = document.getElementById('notesPanel');
    if (!panel) return;
    notesPanelOpen = !notesPanelOpen;
    panel.classList.toggle('open', notesPanelOpen);
    if (notesPanelOpen) updateNotesPanel();
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
    } else {
        document.exitFullscreen().catch(() => {});
    }
}

function updateNotesPanel() {
    const body = document.getElementById('notesBody');
    if (!body) return;
    const key = currentSlideIndex + 1;
    body.textContent = speakerNotes[key] || 'No speaker notes for this slide.';
}

async function loadSpeakerNotes() {
    try {
        const r = await fetch('./presentation.md');
        if (!r.ok) return;
        const text = await r.text();
        const blocks = text.split(/^Slide (\d+):/m);
        for (let i = 1; i < blocks.length; i += 2) {
            const num = parseInt(blocks[i], 10);
            speakerNotes[num] = blocks[i + 1].trim();
        }
    } catch (_) { /* offline ok */ }
}

function updatePresentation() {
    slides.forEach((slide, idx) => {
        slide.classList.remove('active', 'prev');
        if (idx === currentSlideIndex) slide.classList.add('active');
        else if (idx < currentSlideIndex) slide.classList.add('prev');
    });

    const counter = slideCounter();
    if (counter) counter.textContent = `${currentSlideIndex + 1} / ${slides.length}`;

    const bar = progressBar();
    if (bar && slides.length > 1) {
        bar.style.width = `${(currentSlideIndex / (slides.length - 1)) * 100}%`;
    }

    document.querySelectorAll('.menu-item').forEach((item, idx) => {
        item.classList.toggle('active', idx === currentSlideIndex);
    });
}

function populateMenu() {
    const list = menuList();
    if (!list) return;
    list.innerHTML = '';
    slides.forEach((slide, idx) => {
        const title = slide.getAttribute('data-title') || `Slide ${idx + 1}`;
        const item = document.createElement('li');
        item.className = `menu-item ${idx === 0 ? 'active' : ''}`;
        item.textContent = `${String(idx + 1).padStart(2, '0')}, ${title}`;
        item.onclick = () => {
            goToSlide(idx);
            toggleMenu(false);
        };
        list.appendChild(item);
    });
}

function updateFleetFooter({ summary, telemetryAmp }) {
    const el = fleetStatusEl();
    if (el) {
        const mode = isDemoMode() ? 'DEMO' : 'LIVE';
        el.textContent = `FLEET [${mode}]: ${summary}`;
    }
    const meter = fleetMeterFill();
    if (meter) {
        const amp = telemetryAmp || 0;
        meter.style.width = `${Math.min(100, amp * 100)}%`;
    }
}

function wireFleetSlide() {
    const patternSelect = document.getElementById('fleetPattern');
    if (patternSelect && !patternSelect.options.length) {
        getDemoPatterns().forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.label;
            patternSelect.appendChild(opt);
        });
    }

    const intensity = document.getElementById('fleetIntensity');
    const intensityVal = document.getElementById('fleetIntensityVal');
    if (intensity && intensityVal) {
        intensity.addEventListener('input', () => {
            intensityVal.textContent = Math.round((intensity.value / 255) * 100) + '%';
        });
    }

    document.getElementById('fleetClaimBtn')?.addEventListener('click', () => fleetClaimAll().then(refreshFleetUI));
    document.getElementById('fleetReleaseBtn')?.addEventListener('click', () => fleetReleaseAll().then(refreshFleetUI));
    document.getElementById('fleetPlayBtn')?.addEventListener('click', () => fleetPlay());
    document.getElementById('fleetStopBtn')?.addEventListener('click', () => fleetStop());
    document.getElementById('fleetApplyBtn')?.addEventListener('click', () => sendFleetState().then(refreshFleetUI));
    document.getElementById('footerEstop')?.addEventListener('click', () => fleetEstop());
    document.getElementById('fleetEstopBtn')?.addEventListener('click', () => fleetEstop());
    document.getElementById('fleetDisconnectBtn')?.addEventListener('click', () => disconnectFleet());

    onFleetStatusChange((status) => {
        updateFleetFooter(status);
        if (currentSlideIndex === FLEET_SLIDE_INDEX) refreshFleetUI();
    });
}

async function refreshFleetUI() {
    const data = await refreshFleet();
    const summary = document.getElementById('fleetSlideSummary');
    if (summary) summary.textContent = formatFleetSummary();
    renderFleetCards(document.getElementById('fleetCards'), data);
    const hubLabel = document.getElementById('fleetHubLabel');
    if (hubLabel) hubLabel.textContent = `Hub: ${getHubIp()} (SoftAP)`;
}

async function ensureAudio() {
    await initAudioOnGesture();
}

function parseDeepLink() {
    const p = new URLSearchParams(window.location.search);
    const slide = parseInt(p.get('slide'), 10);
    if (!isNaN(slide) && slide >= 1 && slide <= 99) {
        goToSlide(slide - 1);
    }
}

function initKeyboard() {
    document.addEventListener('keydown', async (e) => {
        if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            await ensureAudio();
            nextSlide();
        } else if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
            e.preventDefault();
            prevSlide();
        } else if (e.key === 'Escape') {
            toggleMenu(false);
            if (notesPanelOpen) toggleNotes();
        } else if (e.key === 'f' || e.key === 'F') {
            toggleFullscreen();
        } else if (e.key === 'n' || e.key === 'N') {
            toggleNotes();
        }
    });
}

function exposeGlobals() {
    window.nextSlide = nextSlide;
    window.prevSlide = prevSlide;
    window.goToSlide = goToSlide;
    window.toggleMenu = toggleMenu;
}

async function init() {
    slides = [...document.querySelectorAll('.slide')];
    exposeGlobals();
    populateMenu();
    initKeyboard();
    wireFleetSlide();

    await loadSpeakerNotes();
    initFleet();
    startVizLoop();

    document.body.addEventListener('click', ensureAudio, { once: true });

    updatePresentation();
    onSlideEnter(0);
    parseDeepLink();
    refreshFleetUI();

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        if (slides[currentSlideIndex]?.getAttribute('data-slide-id') !== 'hardware') return;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => fitHardwareCaptions(), 100);
    }, { passive: true });
}

document.addEventListener('DOMContentLoaded', init);
