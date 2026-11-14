// UI module for 13-LightMounts Configurator
import * as THREE from 'three';
import { context, params, visibilities, colors } from './state.js';
import {
    exportLightFrameSTL,
    exportHingeConnectorSTL,
    exportWallPlateSTL,
    exportBoltSTL,
    exportNutSTL,
    exportAllSTLs
} from './exporter.js';

export function setupUIListeners(rebuildCallback) {
    const bindSlider = (id, paramKey, isFloat = true) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', (e) => {
            const val = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value);
            params[paramKey] = val;
            const displayVal = document.getElementById('val-' + paramKey);
            if (displayVal) displayVal.innerText = isFloat ? val.toFixed(1) : val;
            rebuildCallback();
        });
    };

    const bindNumberInput = (id, paramKey) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', (e) => {
            let val = parseFloat(e.target.value);
            if (isNaN(val)) val = 0.0;
            params[paramKey] = val;
            rebuildCallback();
        });
    };

    // Sliders
    bindSlider('input-hingeAngle', 'hingeAngle');
    bindSlider('input-explodedView', 'explodedView');
    bindSlider('input-hingeWidth', 'hingeWidth');
    bindSlider('input-hingePinDiameter', 'hingePinDiameter');
    bindSlider('input-hingeKnuckleRadius', 'hingeKnuckleRadius');
    bindSlider('input-wallPlateWidth', 'wallPlateWidth');
    bindSlider('input-wallPlateHeight', 'wallPlateHeight');
    bindSlider('input-wallPlateThickness', 'wallPlateThickness');
    bindSlider('input-screwSpacing', 'screwSpacing');
    bindSlider('input-screwHoleDiameter', 'screwHoleDiameter');
    bindSlider('input-screwHeadDiameter', 'screwHeadDiameter');
    bindSlider('input-wallClearance', 'wallClearance');
    bindSlider('input-lightOffset', 'lightOffset');
    bindSlider('input-opacity', 'opacity', false);
    
    // Position/offset sliders
    bindSlider('input-hingeOffsetX', 'hingeOffsetX');
    bindSlider('input-hingeOffsetY', 'hingeOffsetY');
    bindSlider('input-hingeOffsetZ', 'hingeOffsetZ');

    // Custom spinner buttons
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
                
                input.value = val.toFixed(1);
                input.dispatchEvent(new Event('input'));
            }
        });
    });

    // Render Mode Buttons
    const renderBtn = document.getElementById('btn-render-mode');
    const blueprintBtn = document.getElementById('btn-blueprint-mode');
    
    if (renderBtn && blueprintBtn) {
        renderBtn.addEventListener('click', () => {
            renderBtn.classList.add('active');
            blueprintBtn.classList.remove('active');
            params.mode = 'rendered';
            rebuildCallback();
        });
        blueprintBtn.addEventListener('click', () => {
            blueprintBtn.classList.add('active');
            renderBtn.classList.remove('active');
            params.mode = 'blueprint';
            rebuildCallback();
        });
    }

    // Visibility toggles
    const bindVisibility = (id, key) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', (e) => {
            visibilities[key] = e.target.checked;
            rebuildCallback();
        });
    };
    bindVisibility('show-lightFrame', 'lightFrame');
    bindVisibility('show-hingeConnector', 'hingeConnector');
    bindVisibility('show-wallPlate', 'wallPlate');
    bindVisibility('show-bolt', 'bolt');
    bindVisibility('show-nut', 'nut');

    // Export Buttons
    const exportAllBtn = document.getElementById('btn-export-all');
    if (exportAllBtn) exportAllBtn.addEventListener('click', exportAllSTLs);
    
    const expFrame = document.getElementById('btn-export-light-frame');
    if (expFrame) expFrame.addEventListener('click', exportLightFrameSTL);
    
    const expConn = document.getElementById('btn-export-hinge-connector');
    if (expConn) expConn.addEventListener('click', exportHingeConnectorSTL);
    
    const expPlate = document.getElementById('btn-export-wall-plate');
    if (expPlate) expPlate.addEventListener('click', exportWallPlateSTL);

    const expBolt = document.getElementById('btn-export-bolt');
    if (expBolt) expBolt.addEventListener('click', exportBoltSTL);

    const expNut = document.getElementById('btn-export-nut');
    if (expNut) expNut.addEventListener('click', exportNutSTL);
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

        const x = (vector.x * 0.5 + 0.5) * width;
        const y = (-(vector.y * 0.5) + 0.5) * height;

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

    // Knuckle/Pivot Position
    const backY = 36.0;
    const r = params.hingeKnuckleRadius;
    const pivotY = backY + r + 12.0 + params.hingeOffsetY;
    const pivotZ = -0.58 + params.hingeOffsetZ;
    const knuckleX = -0.5 + params.hingeOffsetX;
    
    // Draw Hinge pin dimension
    if (visibilities.lightFrame || visibilities.hingeConnector) {
        drawDimension(
            new THREE.Vector3(knuckleX, pivotY, pivotZ),
            `Hinge Pin ⌀: ${params.hingePinDiameter.toFixed(1)}mm`,
            1, -1, colors.blueprintLine
        );
    }
    
    // Draw drywall screw hole dimension
    if (visibilities.wallPlate) {
        const sliderY = params.lightOffset;
        const plateY = sliderY + params.wallPlateThickness;
        const zOffset = params.screwSpacing / 2;
        
        drawDimension(
            new THREE.Vector3(knuckleX, plateY, pivotZ - zOffset),
            `Drywall Anchors: ⌀${params.screwHoleDiameter.toFixed(1)}mm`,
            -1, 1, colors.limeAccent
        );
        
        drawDimension(
            new THREE.Vector3(knuckleX + params.wallPlateWidth / 2, sliderY, pivotZ),
            `Plate Width: ${params.wallPlateWidth.toFixed(1)}mm`,
            1, 1, colors.limeAccent
        );
    }
}
