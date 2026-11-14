// UI module for 14-Hook Configurator
import * as THREE from 'three';
import { context, params, visibilities, colors } from './state.js';
import { exportHookSTL, exportBarSTL } from './exporter.js';

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

    // Sliders
    bindSlider('input-barWidth', 'barWidth');
    bindSlider('input-barThickness', 'barThickness');
    bindSlider('input-slotTolerance', 'slotTolerance');
    bindSlider('input-slotLipHeight', 'slotLipHeight');
    bindSlider('input-hookWallThickness', 'hookWallThickness');
    bindSlider('input-backplateWidth', 'backplateWidth');
    bindSlider('input-backplateThickness', 'backplateThickness');
    bindSlider('input-rampHeight', 'rampHeight');
    bindSlider('input-screwSpacing', 'screwSpacing');
    bindSlider('input-screwHoleDiameter', 'screwHoleDiameter');
    bindSlider('input-screwHeadDiameter', 'screwHeadDiameter');
    bindSlider('input-opacity', 'opacity', false);

    // Spinner buttons support
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
    bindVisibility('show-hook', 'hook');
    bindVisibility('show-bar', 'bar');

    // Export Buttons
    const expHook = document.getElementById('btn-export-hook');
    if (expHook) expHook.addEventListener('click', exportHookSTL);
    
    const expBar = document.getElementById('btn-export-bar');
    if (expBar) expBar.addEventListener('click', exportBarSTL);
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

    // Draw some key dimensions of the Hook and Bar
    const bt = params.backplateThickness;
    const wt = params.hookWallThickness;
    const sw = params.barThickness + params.slotTolerance;
    const sd = params.barWidth + params.slotTolerance;
    const xf = bt + 2 * wt + sw;

    if (visibilities.hook) {
        // Draw screw spacing height line at top screw
        drawDimension(
            new THREE.Vector3(0, 0, params.screwSpacing / 2),
            `Screw spacing: ${params.screwSpacing.toFixed(1)}mm`,
            -1, -1, colors.blueprintLine
        );

        // Draw hook slot depth (bar width tolerance)
        drawDimension(
            new THREE.Vector3(bt + wt + sw/2, 0, sd),
            `Slot Depth: ${sd.toFixed(1)}mm`,
            1, -1, colors.cyanIce
        );
        
        // Draw total hook projection from wall
        drawDimension(
            new THREE.Vector3(xf, 0, -wt),
            `Total Extension: ${xf.toFixed(1)}mm`,
            1, 1, colors.cyanIce
        );
    }

    if (visibilities.bar) {
        // Draw bar dimensions
        drawDimension(
            new THREE.Vector3(bt + wt + params.slotTolerance / 2 + params.barThickness / 2, 60.0, params.barWidth / 2),
            `Metal Bar: ${params.barWidth.toFixed(1)}x${params.barThickness.toFixed(1)}mm`,
            1, 1, colors.limeAccent
        );
    }
}
