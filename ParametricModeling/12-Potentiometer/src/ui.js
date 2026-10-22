// UI logic for Parametric Potentiometer Box Configurator
import { params, visibilities } from './state.js';
import { exportBaseSTL, exportLidSTL } from './exporter.js';

export function setupUIListeners(rebuildCallback) {
    const bindSlider = (id, paramKey, isFloat = true) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', (e) => {
            const val = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value);
            params[paramKey] = val;
            const displayVal = document.getElementById('val-' + paramKey);
            if (displayVal) {
                displayVal.innerText = isFloat ? val.toFixed(1) : val;
            }
            rebuildCallback();
        });
    };

    const bindSelect = (id, paramKey) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', (e) => {
            params[paramKey] = e.target.value;
            rebuildCallback();
        });
    };

    const bindToggle = (id, paramKey, visibilityKey) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', (e) => {
            params[paramKey] = e.target.checked;
            visibilities[visibilityKey] = e.target.checked;
            rebuildCallback();
        });
    };

    // Bind all inputs
    bindSlider('input-pitch', 'pitch');
    bindSlider('input-rows', 'rows', false);
    bindSlider('input-cols', 'cols', false);
    bindSlider('input-shaftLength', 'shaftLength');
    bindSlider('input-wallThick', 'wallThick');
    bindSlider('input-clearance', 'clearance');
    bindSlider('input-padding', 'padding');
    bindSlider('input-exploded', 'exploded');
    bindSlider('input-oledWidth', 'oledWidth');
    bindSlider('input-oledHeight', 'oledHeight');
    bindSlider('input-oledHolePitchX', 'oledHolePitchX');
    bindSlider('input-oledHolePitchY', 'oledHolePitchY');

    bindSelect('select-shaftStyle', 'shaftStyle');

    bindToggle('show-base', 'showBase', 'base');
    bindToggle('show-lid', 'showLid', 'lid');
    bindToggle('show-pots', 'showPots', 'pots');
    bindToggle('show-knobs', 'showKnobs', 'knobs');
    bindToggle('show-electronics', 'showElectronics', 'electronics');

    // Setup spin buttons
    document.querySelectorAll('.spin-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const step = parseFloat(btn.getAttribute('data-step'));
            const input = document.getElementById(targetId);
            if (input) {
                let val = parseFloat(input.value) + step;
                const min = parseFloat(input.min);
                const max = parseFloat(input.max);
                if (!isNaN(min)) val = Math.max(min, val);
                if (!isNaN(max)) val = Math.min(max, val);

                input.value = val;
                input.dispatchEvent(new Event('input'));
            }
        });
    });

    // Wire Export buttons
    const exportBaseBtn = document.getElementById('btn-export-base');
    if (exportBaseBtn) exportBaseBtn.addEventListener('click', () => {
        exportBaseSTL();
    });

    const exportLidBtn = document.getElementById('btn-export-lid');
    if (exportLidBtn) exportLidBtn.addEventListener('click', () => {
        // Back up current exploded state
        window.paramsExplodedBackup = params.exploded;
        // Temporarily reset exploded state for export
        params.exploded = 0.0;
        rebuildCallback();
        exportLidSTL();
        // Restore exploded state
        params.exploded = window.paramsExplodedBackup;
        rebuildCallback();
    });
}
