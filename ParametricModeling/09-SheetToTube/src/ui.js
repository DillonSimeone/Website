// UI module for Sheet-to-Tube Cylinder Cap Configurator
import * as THREE from 'three';
import { context, params, visibilities, colors } from './state.js';
import {
    exportSTL,
    exportBracketSTL,
    exportMotorHolderSTL,
    exportRingGearSTL,
    exportPinionGearSTL,
    exportConnectorSTL,
    exportAllSTL
} from './exporter.js';

// Bind sliders, inputs and buttons to parameters
export function setupUIListeners(rebuildCallback) {
    const bindSlider = (id, paramKey, isFloat = true) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', (e) => {
            const val = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value);
            params[paramKey] = val;
            const displayVal = document.getElementById('val-' + paramKey);
            if (displayVal) displayVal.innerText = isFloat ? val.toFixed(paramKey === 'tolerance' ? 2 : 1) : val;
            rebuildCallback();
        });
    };

    const bindNumberInput = (id, paramKey) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', (e) => {
            let val = parseFloat(e.target.value);
            if (isNaN(val) || val <= 0) val = 1.0;
            params[paramKey] = val;
            rebuildCallback();
        });
    };

    // Sliders
    bindSlider('input-holeDiam', 'holeDiam');
    bindSlider('input-lipDepth', 'lipDepth');
    bindSlider('input-wallThick', 'wallThick');
    bindSlider('input-tolerance', 'tolerance');
    bindSlider('input-opacity', 'opacity', false);

    // Number fields
    bindNumberInput('input-sheetWidthInches', 'sheetWidthInches');
    bindNumberInput('input-sheetHeightInches', 'sheetHeightInches');
    bindNumberInput('input-sheetThickness', 'sheetThickness');

    // LED channel sliders
    bindSlider('input-ledCount', 'ledCount', false);
    bindSlider('input-ledWidth', 'ledWidth');
    bindSlider('input-ledDepth', 'ledDepth');

    // Slip ring select
    const slipRingSelect = document.getElementById('select-slipRing');
    if (slipRingSelect) {
        slipRingSelect.addEventListener('change', (e) => {
            params.slipRing = e.target.value;
            rebuildCallback();
        });
    }

    // Bracket count slider
    bindSlider('input-bracketCount', 'bracketCount', false);

    // Motor wheel diameter slider
    bindSlider('input-motorWheelDiam', 'motorWheelDiam');

    // Bind custom spinner buttons
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
                
                // Format decimal output to step resolution
                input.value = val.toFixed(2);
                input.dispatchEvent(new Event('change'));
            }
        });
    });

    // Roll Direction Radios
    const radios = document.getElementsByName('rollDirection');
    radios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            params.rollDirection = e.target.value;
            rebuildCallback();
        });
    });

    // Render Mode Buttons
    document.getElementById('btn-render-mode').addEventListener('click', () => {
        document.getElementById('btn-render-mode').classList.add('active');
        document.getElementById('btn-blueprint-mode').classList.remove('active');
        params.mode = 'rendered';
        rebuildCallback();
    });
    document.getElementById('btn-blueprint-mode').addEventListener('click', () => {
        document.getElementById('btn-blueprint-mode').classList.add('active');
        document.getElementById('btn-render-mode').classList.remove('active');
        params.mode = 'blueprint';
        rebuildCallback();
    });

    // Visibility toggles
    const bindVisibility = (id, key) => {
        document.getElementById(id).addEventListener('change', (e) => {
            visibilities[key] = e.target.checked;
            rebuildCallback();
        });
    };
    bindVisibility('show-topCap', 'topCap');
    bindVisibility('show-bottomCap', 'bottomCap');
    bindVisibility('show-sheet', 'sheet');
    bindVisibility('show-brackets', 'brackets');
    const motorToggle = document.getElementById('show-motorHolder');
    if (motorToggle) bindVisibility('show-motorHolder', 'motorHolder');

    // Export STL
    const exportAllBtn = document.getElementById('btn-export-all');
    if (exportAllBtn) exportAllBtn.addEventListener('click', exportAllSTL);
    document.getElementById('btn-export-stl').addEventListener('click', exportSTL);
    document.getElementById('btn-export-bracket').addEventListener('click', exportBracketSTL);
    const motorExportBtn = document.getElementById('btn-export-motor-holder');
    if (motorExportBtn) motorExportBtn.addEventListener('click', exportMotorHolderSTL);
    const ringExportBtn = document.getElementById('btn-export-ring');
    if (ringExportBtn) ringExportBtn.addEventListener('click', exportRingGearSTL);
    const pinionExportBtn = document.getElementById('btn-export-pinion');
    if (pinionExportBtn) pinionExportBtn.addEventListener('click', exportPinionGearSTL);
    const connectorExportBtn = document.getElementById('btn-export-connector');
    if (connectorExportBtn) connectorExportBtn.addEventListener('click', exportConnectorSTL);
}

// Technical Dimensioning SVG Overlay
export function updateLeaderLines() {
    if (!context.overlaySvg) return;
    context.overlaySvg.innerHTML = '';

    const container = document.getElementById('canvas3d');
    if (!container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const drawDimension = (point3d, textLabel, dirX = 1, dirY = -1, color = '#00f3ff') => {
        const vector = new THREE.Vector3(point3d.x, point3d.y, point3d.z);
        
        context.mainGroup.updateMatrixWorld();
        vector.applyMatrix4(context.mainGroup.matrixWorld);
        vector.project(context.camera);

        const x = (vector.x * .5 + .5) * width;
        const y = (-(vector.y * .5) + .5) * height;

        if (vector.z <= 1 && x >= 0 && x <= width && y >= 0 && y <= height) {
            const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');

            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dot.setAttribute('cx', x);
            dot.setAttribute('cy', y);
            dot.setAttribute('r', '3');
            dot.setAttribute('fill', '#ffffff');
            group.appendChild(dot);

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            const targetX = x + 35 * dirX;
            const targetY = y + 25 * dirY;
            const endX = targetX + 35 * dirX;
            line.setAttribute('points', `${x},${y} ${targetX},${targetY} ${endX},${targetY}`);
            line.setAttribute('stroke', color);
            line.setAttribute('stroke-width', '1');
            line.setAttribute('fill', 'none');
            group.appendChild(line);

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', targetX);
            text.setAttribute('y', targetY - 5);
            text.setAttribute('fill', '#ffffff');
            text.setAttribute('font-size', '10px');
            text.setAttribute('font-family', 'Space Mono');
            if (dirX < 0) {
                text.setAttribute('text-anchor', 'end');
            }
            text.textContent = textLabel;
            group.appendChild(text);

            context.overlaySvg.appendChild(group);
        }
    };

    // Calculate dimensions variables
    const w_in = params.sheetWidthInches;
    const h_in = params.sheetHeightInches;
    const t_mm = params.sheetThickness;
    const L_mm = params.rollDirection === 'width' ? w_in * 25.4 : h_in * 25.4;
    const tubeHeight_mm = params.rollDirection === 'width' ? h_in * 25.4 : w_in * 25.4;
    const D_mid = L_mm / Math.PI;
    const D_out = D_mid + t_mm;
    const D_in = D_mid - t_mm;
    const c = params.tolerance;
    const R_g_out = (D_out / 2) + c;
    const T_cap = params.wallThick;
    const R_cap_out = R_g_out + T_cap;

    // Leader lines pointing to cap outer edge, sheet edge, and overall height
    if (visibilities.bottomCap) {
        const hasSlipRingBottom = params.slipRing === 'bottom' || params.slipRing === 'both';
        const holeText = hasSlipRingBottom ? "Slip Ring Hole: 13.0mm" : `Hole: ${params.holeDiam.toFixed(1)}mm`;
        drawDimension(
            new THREE.Vector3(R_cap_out, 0, T_cap / 2),
            `Cap OD: ${(R_cap_out * 2).toFixed(1)}mm`,
            1, -1, colors.blueprintLine
        );
        drawDimension(
            new THREE.Vector3(0, 0, 0),
            holeText,
            -1, 1, colors.limeAccent
        );
        if (params.bracketCount > 0) {
            const offsetAngle = params.ledCount > 0 ? (Math.PI / params.ledCount) : 0;
            drawDimension(
                new THREE.Vector3((R_cap_out - 8.0) * Math.cos(offsetAngle), (R_cap_out - 8.0) * Math.sin(offsetAngle), T_cap + params.lipDepth),
                `M3 Screw Hole: 3.0mm`,
                1, 1, colors.limeAccent
            );
        }
    }
    if (visibilities.sheet) {
        drawDimension(
            new THREE.Vector3(0, D_out / 2, T_cap + tubeHeight_mm / 2),
            `Tube Height: ${tubeHeight_mm.toFixed(1)}mm`,
            1, 1, colors.limeAccent
        );
        drawDimension(
            new THREE.Vector3(-D_out / 2, 0, T_cap + tubeHeight_mm / 2),
            `Sheet Thickness: ${t_mm.toFixed(2)}mm`,
            -1, -1, colors.blueprintLine
        );
    }
}
