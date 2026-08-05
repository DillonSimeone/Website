// UI module for HAXEL Dense Electronics Enclosure
// Binds DOM events, syncs slider values, manages exports
import { params, visibilities } from './state.js';
import { modelToSTL } from '../../00-CommonParts/Exporter/stl.js';

let rebuildFn = null;
let currentModels = null;

export function setRebuildCallback(fn) {
    rebuildFn = fn;
}

export function setCurrentModels(models) {
    currentModels = models;
}

/** Bind all slider/input events and initialize value labels */
export function setupUIListeners() {
    // ─── Slider Bindings ─────────────────────────────────────────────────────
    const sliderMap = {
        'input-wallThick':       { param: 'wallThick',       label: 'val-wallThick' },
        'input-tolerance':       { param: 'tolerance',       label: 'val-tolerance' },
        'input-motorW':          { param: 'motorW',          label: 'val-motorW' },
        'input-motorH':          { param: 'motorH',          label: 'val-motorH' },
        'input-motorL':          { param: 'motorL',          label: 'val-motorL' },
        'input-clampThick':      { param: 'clampThick',      label: 'val-clampThick' },
        'input-clampScrewDiam':  { param: 'clampScrewDiam',  label: 'val-clampScrewDiam' },
        'input-clampScrewCount': { param: 'clampScrewCount', label: 'val-clampScrewCount' },
        'input-espW':            { param: 'espW',            label: 'val-espW' },
        'input-espD':            { param: 'espD',            label: 'val-espD' },
        'input-espH':            { param: 'espH',            label: 'val-espH' },
        'input-l298W':           { param: 'l298W',           label: 'val-l298W' },
        'input-l298D':           { param: 'l298D',           label: 'val-l298D' },
        'input-l298H':           { param: 'l298H',           label: 'val-l298H' },
        'input-tpW':             { param: 'tpW',             label: 'val-tpW' },
        'input-tpD':             { param: 'tpD',             label: 'val-tpD' },
        'input-tpH':             { param: 'tpH',             label: 'val-tpH' },
        'input-batW':            { param: 'batW',            label: 'val-batW' },
        'input-batD':            { param: 'batD',            label: 'val-batD' },
        'input-batH':            { param: 'batH',            label: 'val-batH' },
        'input-explode':         { param: 'explode',         label: 'val-explode' },
        'input-cornerScrewDiam': { param: 'cornerScrewDiam', label: 'val-cornerScrewDiam' },
        'input-pocketTolerance': { param: 'pocketTolerance', label: 'val-pocketTolerance' },
        'input-opacity':         { param: 'opacity',         label: 'val-opacity' }
    };

    for (const [inputId, config] of Object.entries(sliderMap)) {
        const input = document.getElementById(inputId);
        const label = document.getElementById(config.label);
        if (!input) continue;

        // Initialize label
        if (label) label.textContent = input.value;

        input.addEventListener('input', () => {
            params[config.param] = parseFloat(input.value);
            if (label) label.textContent = input.value;
            if (rebuildFn) rebuildFn();
        });
    }

    // ─── Visibility Toggles ──────────────────────────────────────────────────
    const toggleMap = {
        'show-shell':      'shell',
        'show-lid':        'lid',
        'show-sled':       'sled',
        'show-motorClamp': 'motorClamp',
        'show-components': 'components'
    };

    for (const [checkId, key] of Object.entries(toggleMap)) {
        const checkbox = document.getElementById(checkId);
        if (!checkbox) continue;
        checkbox.addEventListener('change', () => {
            visibilities[key] = checkbox.checked;
            if (rebuildFn) rebuildFn();
        });
    }

    // ─── Render Mode Toggle ──────────────────────────────────────────────────
    const btnRendered = document.getElementById('btn-rendered');
    const btnXray = document.getElementById('btn-xray');
    if (btnRendered && btnXray) {
        btnRendered.addEventListener('click', () => {
            params.mode = 'rendered';
            btnRendered.classList.add('active');
            btnXray.classList.remove('active');
            if (rebuildFn) rebuildFn();
        });
        btnXray.addEventListener('click', () => {
            params.mode = 'xray';
            btnXray.classList.add('active');
            btnRendered.classList.remove('active');
            if (rebuildFn) rebuildFn();
        });
    }

    // ─── Export Buttons ──────────────────────────────────────────────────────
    setupExportButton('btn-export-all', () => {
        if (!currentModels) return;
        downloadSTL(currentModels.shell, 'HAXEL_Shell');
        downloadSTL(currentModels.lid, 'HAXEL_Lid');
        downloadSTL(currentModels.sled, 'HAXEL_Sled');
        if (currentModels.motorClamp) downloadSTL(currentModels.motorClamp, 'HAXEL_MotorClamp');
    });

    setupExportButton('btn-export-shell', () => {
        if (currentModels?.shell) downloadSTL(currentModels.shell, 'HAXEL_Shell');
    });

    setupExportButton('btn-export-lid', () => {
        if (currentModels?.lid) downloadSTL(currentModels.lid, 'HAXEL_Lid');
    });

    setupExportButton('btn-export-sled', () => {
        if (currentModels?.sled) downloadSTL(currentModels.sled, 'HAXEL_Sled');
    });

    setupExportButton('btn-export-clamp', () => {
        if (currentModels?.motorClamp) downloadSTL(currentModels.motorClamp, 'HAXEL_MotorClamp');
    });
}

function setupExportButton(id, handler) {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', handler);
}

function downloadSTL(model, filename) {
    const stlString = modelToSTL(model, filename);
    const blob = new Blob([stlString], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.stl`;
    a.click();
    URL.revokeObjectURL(url);
}

/** Update the computed specs panel */
export function updateSpecs(layout) {
    setText('spec-shellW', `${layout.shellW.toFixed(1)} mm`);
    setText('spec-shellD', `${layout.shellD.toFixed(1)} mm`);
    setText('spec-shellH', `${layout.shellH.toFixed(1)} mm`);
    setText('spec-sledW', `${layout.sledW.toFixed(1)} mm`);
    setText('spec-sledD', `${layout.sledD.toFixed(1)} mm`);
    setText('spec-sledH', `${layout.sledH.toFixed(1)} mm`);

    // Volume efficiency
    const componentVolume =
        params.motorW * params.motorL * params.motorH +
        params.espW * params.espD * params.espH +
        params.l298W * params.l298D * params.l298H +
        params.tpW * params.tpD * params.tpH +
        params.batW * params.batD * params.batH;
    const shellVolume = layout.shellW * layout.shellD * layout.shellH;
    const efficiency = ((componentVolume / shellVolume) * 100).toFixed(0);
    setText('spec-efficiency', `${efficiency}%`);
    setText('spec-volume', `${(shellVolume / 1000).toFixed(1)} cm³`);
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}
