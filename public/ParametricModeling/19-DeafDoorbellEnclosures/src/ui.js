// UI management and event bindings for 19-DeafDoorbellEnclosures
import * as THREE from 'three';
import { context, params, updateParam } from './state.js';
import {
    manifoldToThreeGeometry,
    buildMasterBase,
    buildMasterLid,
    buildFollowerBase,
    buildFollowerLid,
    buildFollowerGrid
} from './geometry.js';
import { updateSceneMesh } from './viewport.js';
import { triggerExport } from './exporter.js';

export function rebuildActiveGeometry() {
    const M = context.Manifold;
    if (!M) return;

    const items = [];
    const matBase = new THREE.MeshPhysicalMaterial({
        color: 0x00f3ff,
        metalness: 0.1,
        roughness: 0.25,
        transmission: 0.2,
        thickness: 1.5,
        transparent: true,
        opacity: 0.88,
        wireframe: params.wireframe
    });

    const matLid = new THREE.MeshPhysicalMaterial({
        color: 0xff006e,
        metalness: 0.2,
        roughness: 0.3,
        transmission: 0.1,
        transparent: true,
        opacity: 0.92,
        wireframe: params.wireframe
    });

    const matGrid = new THREE.MeshStandardMaterial({
        color: 0xff9d00,
        roughness: 0.4,
        metalness: 0.1,
        wireframe: params.wireframe
    });

    const explodeZ = params.explodedView * 28.0;

    if (context.activePreset.startsWith('master')) {
        // Master Node Rendering
        if (context.activePreset === 'master_all' || context.activePreset === 'master_base') {
            const mBase = buildMasterBase(M, params);
            const geom = manifoldToThreeGeometry(mBase);
            items.push({ geometry: geom, material: matBase, position: new THREE.Vector3(0, 0, 0) });
            mBase.delete();
        }

        if (context.activePreset === 'master_all' || context.activePreset === 'master_lid') {
            const mLid = buildMasterLid(M, params);
            const geom = manifoldToThreeGeometry(mLid);
            const zPos = 13.0 / 2 + 4.5 / 2 + explodeZ;
            items.push({ geometry: geom, material: matLid, position: new THREE.Vector3(0, 0, zPos) });
            mLid.delete();
        }
    } else {
        // Follower Node Rendering
        if (context.activePreset === 'follower_all' || context.activePreset === 'follower_base') {
            const fBase = buildFollowerBase(M, params);
            const geom = manifoldToThreeGeometry(fBase);
            items.push({ geometry: geom, material: matBase, position: new THREE.Vector3(0, 0, 0) });
            fBase.delete();
        }

        if (context.activePreset === 'follower_all' || context.activePreset === 'follower_lid') {
            const fLid = buildFollowerLid(M, params);
            const geom = manifoldToThreeGeometry(fLid);
            const zPos = -18.0 / 2 - 4.2 / 2 - explodeZ;
            const yPos = (params.matrixWidth + params.wallThickness * 2 + 4.0) / 2 - params.espLength / 2 - params.wallThickness - 2.0;
            items.push({ geometry: geom, material: matLid, position: new THREE.Vector3(0, yPos, zPos) });
            fLid.delete();
        }

        if (context.activePreset === 'follower_all' || context.activePreset === 'follower_grid') {
            const fGrid = buildFollowerGrid(M, params);
            const geom = manifoldToThreeGeometry(fGrid);
            const zPos = 18.0 / 2 + 4.5 / 2 + explodeZ * 0.7;
            items.push({ geometry: geom, material: matGrid, position: new THREE.Vector3(0, 0, zPos) });
            fGrid.delete();
        }
    }

    updateSceneMesh(items);
}

export function initUI() {
    // Preset buttons
    const presetBtns = document.querySelectorAll('.preset-btn');
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            presetBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            context.activePreset = btn.dataset.preset;
            rebuildActiveGeometry();
        });
    });

    // Slider inputs
    const bindSlider = (id, paramKey, displayId, unit = 'mm') => {
        const input = document.getElementById(id);
        const display = document.getElementById(displayId);
        if (!input) return;
        input.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            updateParam(paramKey, val);
            if (display) display.textContent = val.toFixed(2);
            rebuildActiveGeometry();
        });
    };

    bindSlider('input-wallThickness', 'wallThickness', 'val-wallThickness');
    bindSlider('input-printClearance', 'printClearance', 'val-printClearance');
    bindSlider('input-screwHoleDia', 'screwHoleDia', 'val-screwHoleDia');
    bindSlider('input-cableJacketDia', 'cableJacketDia', 'val-cableJacketDia');
    bindSlider('input-explodedView', 'explodedView', 'val-explodedView', '');

    // Checkboxes
    const wireframeCheck = document.getElementById('check-wireframe');
    if (wireframeCheck) {
        wireframeCheck.addEventListener('change', (e) => {
            params.wireframe = e.target.checked;
            rebuildActiveGeometry();
        });
    }

    // Export Buttons
    const exportBtns = document.querySelectorAll('[data-export]');
    exportBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            triggerExport(btn.dataset.export);
        });
    });
}
