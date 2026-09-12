import { initAudioOnGesture } from './presentation-audio.js';
import {
    startVizLoop,
    onSlideEnter,
    onSlideLeave,
    setActiveSlideIndex,
    setSlideTelemetryMode,
    initSlideSpectrumInteractions
} from './presentation-viz.js';

let currentSlideIndex = 0;
let slides = [];
let speakerNotes = {};
let notesPanelOpen = false;

const slideCounter = () => document.getElementById('slideCounter');
const progressBar = () => document.getElementById('progressBar');
const menuPanel = () => document.getElementById('menuPanel');
const menuList = () => document.getElementById('menuList');

export function goToSlide(idx) {
    if (idx < 0 || idx >= slides.length) return;
    onSlideLeave(currentSlideIndex);
    currentSlideIndex = idx;
    setActiveSlideIndex(idx);
    updatePresentation();
    onSlideEnter(idx);

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

function wireTelemetrySlide() {
    document.querySelectorAll('#slideTelemetryToggles .telemetry-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#slideTelemetryToggles .telemetry-toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const mode = btn.dataset.mode;
            setSlideTelemetryMode(mode);
            const label = document.getElementById('telemetrySlideModeLabel');
            if (label) label.textContent = mode.toUpperCase();
        });
    });
}

async function init() {
    slides = [...document.querySelectorAll('.slide')];
    exposeGlobals();
    populateMenu();
    initKeyboard();
    wireTelemetrySlide();
    initSlideSpectrumInteractions();

    await loadSpeakerNotes();
    startVizLoop();

    document.body.addEventListener('click', ensureAudio, { once: true });

    updatePresentation();
    onSlideEnter(0);
    parseDeepLink();

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        if (slides[currentSlideIndex]?.getAttribute('data-slide-id') !== 'hardware') return;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => fitHardwareCaptions(), 100);
    }, { passive: true });
}

document.addEventListener('DOMContentLoaded', init);
