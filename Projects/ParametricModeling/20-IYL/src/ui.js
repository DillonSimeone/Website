// User Interface Event Handling & Parametric Binding for 20-IYL
import { params, applyPreset } from './state.js';
import { rebuildScene } from './viewport.js';
import {
    exportBaseSTL,
    exportLidSTL,
    exportPedestalSTL,
    exportSledSTL,
    exportAssemblySTL
} from './exporter.js';

export function initUI() {
    bindPresets();
    bindSliders();
    bindToggles();
    bindExportButtons();
    updateUIValues();
}

function bindPresets() {
    const presetButtons = document.querySelectorAll('.preset-btn');
    presetButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            presetButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const presetKey = btn.dataset.preset;
            applyPreset(presetKey);
            updateUIValues();
            rebuildScene();
        });
    });
}

function bindSliders() {
    const sliderMap = [
        { id: 'baseDiameter', key: 'baseDiameter', valId: 'val-baseDiameter', unit: 'mm' },
        { id: 'topDiameter', key: 'topDiameter', valId: 'val-topDiameter', unit: 'mm' },
        { id: 'height', key: 'height', valId: 'val-height', unit: 'mm' },
        { id: 'wallThickness', key: 'wallThickness', valId: 'val-wallThickness', unit: 'mm' },
        { id: 'cableHoleDia', key: 'cableHoleDia', valId: 'val-cableHoleDia', unit: 'mm' },
        { id: 'printClearance', key: 'printClearance', valId: 'val-printClearance', unit: 'mm' },
        { id: 'explodedOffset', key: 'explodedOffset', valId: 'val-explodedOffset', unit: 'mm' }
    ];

    sliderMap.forEach(item => {
        const input = document.getElementById(item.id);
        const label = document.getElementById(item.valId);
        if (!input) return;

        input.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            params[item.key] = val;
            if (label) label.textContent = `${val.toFixed(val < 1 ? 2 : 1)} ${item.unit}`;
            rebuildScene();
        });
    });
}

function bindToggles() {
    // Checkboxes
    const toggleMap = [
        { id: 'toggle-hand', key: 'showHand' },
        { id: 'toggle-xray', key: 'xrayMode' }
    ];

    toggleMap.forEach(item => {
        const input = document.getElementById(item.id);
        if (!input) return;
        input.addEventListener('change', (e) => {
            params[item.key] = e.target.checked;
            rebuildScene();
        });
    });

    // View Mode Buttons
    const viewButtons = document.querySelectorAll('.view-mode-btn');
    viewButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            viewButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            params.displayMode = btn.dataset.mode;
            rebuildScene();
        });
    });
}

function bindExportButtons() {
    const btnBase = document.getElementById('btn-export-base');
    const btnLid = document.getElementById('btn-export-lid');
    const btnSled = document.getElementById('btn-export-sled');
    const btnAssy = document.getElementById('btn-export-assembly');

    if (btnBase) btnBase.addEventListener('click', () => exportBaseSTL());
    if (btnLid) btnLid.addEventListener('click', () => exportLidSTL());
    if (btnSled) btnSled.addEventListener('click', () => exportSledSTL());
    if (btnAssy) btnAssy.addEventListener('click', () => exportAssemblySTL());
}

export function updateUIValues() {
    const sliderIds = ['baseDiameter', 'topDiameter', 'height', 'wallThickness', 'cableHoleDia', 'printClearance', 'explodedOffset'];
    sliderIds.forEach(id => {
        const input = document.getElementById(id);
        const label = document.getElementById(`val-${id}`);
        if (input && params[id] !== undefined) {
            input.value = params[id];
            if (label) {
                const val = params[id];
                label.textContent = `${val.toFixed(val < 1 ? 2 : 1)} mm`;
            }
        }
    });

    const toggleIds = [
        { id: 'toggle-hand', key: 'showHand' },
        { id: 'toggle-xray', key: 'xrayMode' }
    ];
    toggleIds.forEach(item => {
        const input = document.getElementById(item.id);
        if (input) input.checked = params[item.key];
    });
}
