// UI module for 18-PowerSupplyWallMount
// U-Bracket with solid flat bottom floor, front bridge, 6 side screw slots, and honeycomb speed lattice.
import * as THREE from 'three';
import { context, params, visibilities, colors } from './state.js';
import { exportBracketSTL, exportPSUPhantomSTL } from './exporter.js';

export function setupUIListeners(rebuildCallback) {
    const bindSlider = (id, paramKey, isFloat = true, formatDigits = 1) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', (e) => {
            const val = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value);
            params[paramKey] = val;
            const displayVal = document.getElementById('val-' + paramKey);
            if (displayVal) displayVal.innerText = isFloat ? val.toFixed(formatDigits) : val;
            updateStatsReadout();
            rebuildCallback();
        });
    };

    // PSU Sliders
    bindSlider('input-psuWidth', 'psuWidth');
    bindSlider('input-psuDepth', 'psuDepth');
    bindSlider('input-clearance', 'clearance');

    // U-Bracket & Bridge Sliders
    bindSlider('input-bracketHeight', 'bracketHeight');
    bindSlider('input-bridgeHeight', 'bridgeHeight');
    bindSlider('input-bridgeElevation', 'bridgeElevation');
    bindSlider('input-floorThickness', 'floorThickness');
    bindSlider('input-flangeWidth', 'flangeWidth');

    // Honeycomb Sliders
    bindSlider('input-honeycombRadius', 'honeycombRadius');
    bindSlider('input-honeycombRib', 'honeycombRib');

    // Screw Mounting Sliders
    bindSlider('input-screwSlotWidth', 'screwSlotWidth');
    bindSlider('input-screwSlotLength', 'screwSlotLength');

    // Visual Sliders
    bindSlider('input-opacity', 'opacity', false, 0);

    // Honeycomb Checkbox Toggle
    const checkHoneycomb = document.getElementById('check-honeycomb');
    if (checkHoneycomb) {
        checkHoneycomb.addEventListener('change', (e) => {
            params.enableHoneycomb = e.target.checked;
            updateStatsReadout();
            rebuildCallback();
        });
    }

    // Presets
    const applyPreset = (preset) => {
        Object.assign(params, preset);
        for (const key of Object.keys(preset)) {
            const input = document.getElementById('input-' + key);
            const valDisplay = document.getElementById('val-' + key);
            if (input) input.value = preset[key];
            if (valDisplay) {
                valDisplay.innerText = typeof preset[key] === 'number' && !Number.isInteger(preset[key])
                    ? preset[key].toFixed(1)
                    : preset[key];
            }
        }
        if (checkHoneycomb && typeof preset.enableHoneycomb === 'boolean') {
            checkHoneycomb.checked = preset.enableHoneycomb;
        }
        updateStatsReadout();
        rebuildCallback();
    };

    const btnPresetAlitove = document.getElementById('btn-preset-alitove');
    if (btnPresetAlitove) {
        btnPresetAlitove.addEventListener('click', () => {
            applyPreset({
                psuWidth: 113.0,
                psuDepth: 52.0,
                clearance: 1.2,
                bracketHeight: 110.0,
                bridgeHeight: 35.0,
                bridgeElevation: 25.0,
                floorThickness: 5.0,
                flangeWidth: 18.0,
                enableHoneycomb: true,
                honeycombRadius: 7.5,
                honeycombRib: 3.8
            });
        });
    }

    const btnPresetMeanwell = document.getElementById('btn-preset-meanwell');
    if (btnPresetMeanwell) {
        btnPresetMeanwell.addEventListener('click', () => {
            applyPreset({
                psuWidth: 115.0,
                psuDepth: 50.0,
                clearance: 1.2,
                bracketHeight: 110.0,
                bridgeHeight: 35.0,
                bridgeElevation: 25.0,
                floorThickness: 5.0,
                flangeWidth: 18.0,
                enableHoneycomb: true,
                honeycombRadius: 7.5,
                honeycombRib: 3.8
            });
        });
    }

    const btnPresetSpeed = document.getElementById('btn-preset-speed');
    if (btnPresetSpeed) {
        btnPresetSpeed.addEventListener('click', () => {
            applyPreset({
                psuWidth: 113.0,
                psuDepth: 52.0,
                clearance: 1.2,
                bracketHeight: 95.0,
                bridgeHeight: 30.0,
                bridgeElevation: 22.0,
                floorThickness: 4.5,
                flangeWidth: 16.0,
                enableHoneycomb: true,
                honeycombRadius: 8.5,
                honeycombRib: 3.2
            });
        });
    }

    const btnPresetSolid = document.getElementById('btn-preset-solid');
    if (btnPresetSolid) {
        btnPresetSolid.addEventListener('click', () => {
            applyPreset({
                psuWidth: 113.0,
                psuDepth: 52.0,
                clearance: 1.2,
                bracketHeight: 110.0,
                bridgeHeight: 35.0,
                bridgeElevation: 25.0,
                floorThickness: 5.0,
                flangeWidth: 18.0,
                enableHoneycomb: false
            });
        });
    }

    // Render Mode Buttons
    const btnRenderMode = document.getElementById('btn-render-mode');
    const btnBlueprintMode = document.getElementById('btn-blueprint-mode');
    if (btnRenderMode && btnBlueprintMode) {
        btnRenderMode.addEventListener('click', () => {
            btnRenderMode.classList.add('active');
            btnBlueprintMode.classList.remove('active');
            params.renderMode = 'neon';
            rebuildCallback();
        });
        btnBlueprintMode.addEventListener('click', () => {
            btnBlueprintMode.classList.add('active');
            btnRenderMode.classList.remove('active');
            params.renderMode = 'blueprint';
            rebuildCallback();
        });
    }

    // Toggles
    const checkPSU = document.getElementById('check-showPSU');
    if (checkPSU) {
        checkPSU.addEventListener('change', (e) => {
            visibilities.psu = e.target.checked;
            rebuildCallback();
        });
    }

    const checkDims = document.getElementById('check-showDimensions');
    if (checkDims) {
        checkDims.addEventListener('change', (e) => {
            params.showDimensions = e.target.checked;
            if (context.overlaySvg) {
                context.overlaySvg.style.display = params.showDimensions ? 'block' : 'none';
            }
        });
    }

    // Export Buttons
    const btnExportBracket = document.getElementById('btn-export-bracket');
    if (btnExportBracket) btnExportBracket.addEventListener('click', exportBracketSTL);

    const btnExportPSU = document.getElementById('btn-export-psu');
    if (btnExportPSU) btnExportPSU.addEventListener('click', exportPSUPhantomSTL);

    updateStatsReadout();
}

export function updateStatsReadout() {
    const pw = params.psuWidth + params.clearance;
    const pd = params.psuDepth + params.clearance;
    const totalW = pw + 2 * params.wallThickness + 2 * params.flangeWidth;
    const outerD = params.backplateThickness + pd + params.wallThickness;
    const totalH = params.bracketHeight + params.floorThickness;

    const statInternal = document.getElementById('stat-internal');
    if (statInternal) statInternal.innerText = `${pw.toFixed(1)} × ${pd.toFixed(1)} mm`;

    const statEnvelope = document.getElementById('stat-envelope');
    if (statEnvelope) statEnvelope.innerText = `${totalW.toFixed(1)} × ${outerD.toFixed(1)} × ${totalH.toFixed(1)} mm`;

    const statScrewPitch = document.getElementById('stat-screw-pitch');
    if (statScrewPitch) {
        const slotPitchX = totalW - params.flangeWidth;
        statScrewPitch.innerText = `6 Slots (3/side, ${slotPitchX.toFixed(1)}mm span)`;
    }

    const statWeight = document.getElementById('stat-weight');
    if (statWeight) {
        const baseGrams = Math.round((totalW * outerD * 0.10 + totalH * 6.5) * 0.22);
        if (params.enableHoneycomb) {
            const hGrams = Math.round(baseGrams * 0.58);
            statWeight.innerText = `~${hGrams}g PETG (-42% time & plastic)`;
        } else {
            statWeight.innerText = `~${baseGrams}g PETG / PLA (Solid)`;
        }
    }
}

export function updateLeaderLines() {
    if (!context.overlaySvg || !params.showDimensions) {
        if (context.overlaySvg) context.overlaySvg.innerHTML = '';
        return;
    }
    context.overlaySvg.innerHTML = '';

    const container = document.getElementById('canvas3d');
    if (!container || !context.camera) return;
    const w = container.clientWidth;
    const h = container.clientHeight;

    const toScreen = (v3) => {
        const p = v3.clone().project(context.camera);
        return {
            x: (p.x * 0.5 + 0.5) * w,
            y: (-(p.y * 0.5) + 0.5) * h,
            visible: p.z < 1.0
        };
    };

    const pw = params.psuWidth + params.clearance;
    const totalW = pw + 2 * params.wallThickness + 2 * params.flangeWidth;

    const ptLeft = new THREE.Vector3(-totalW / 2, 40, 0);
    const ptRight = new THREE.Vector3(totalW / 2, 40, 0);

    const sL = toScreen(ptLeft);
    const sR = toScreen(ptRight);

    if (sL.visible && sR.visible && Math.abs(sL.x - sR.x) > 40) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = `M ${sL.x} ${sL.y} L ${sR.x} ${sR.y}`;
        path.setAttribute('d', d);
        path.setAttribute('stroke', '#00f3ff');
        path.setAttribute('stroke-width', '1.2');
        path.setAttribute('stroke-dasharray', '3,3');
        context.overlaySvg.appendChild(path);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', (sL.x + sR.x) / 2);
        text.setAttribute('y', (sL.y + sR.y) / 2 - 8);
        text.setAttribute('fill', '#00f3ff');
        text.setAttribute('font-size', '11');
        text.setAttribute('font-family', 'Space Mono, monospace');
        text.setAttribute('text-anchor', 'middle');
        text.textContent = `WIDTH: ${totalW.toFixed(1)}mm`;
        context.overlaySvg.appendChild(text);
    }
}
