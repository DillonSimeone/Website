// UI management and event bindings for 19-DeafDoorbellEnclosures (v2.3)
import * as THREE from 'three';
import { context, params, updateParam } from './state.js';
import {
    manifoldToThreeGeometry,
    buildMasterBase,
    buildMasterLid,
    buildFollowerBase,
    buildFollowerLid,
    buildFollowerGrid,
    buildFollowerStand
} from './geometry.js';
import { updateSceneMesh } from './viewport.js';
import { triggerExport } from './exporter.js';

export function rebuildActiveGeometry() {
    const M = context.Manifold;
    if (!M) return;

    const items = [];

    // Technical CAD Materials with High Contrast & Sharp Silhouette
    const matBase = new THREE.MeshStandardMaterial({
        color: 0x00d4e6, // Technical Cyan
        roughness: 0.4,
        metalness: 0.05,
        wireframe: params.wireframe
    });

    const matLid = new THREE.MeshStandardMaterial({
        color: 0xff2a6d, // Technical Coral/Magenta
        roughness: 0.4,
        metalness: 0.05,
        wireframe: params.wireframe
    });

    const matStand = new THREE.MeshStandardMaterial({
        color: 0x8b5cf6, // Technical Purple/Violet
        roughness: 0.45,
        metalness: 0.1,
        wireframe: params.wireframe
    });

    const matGrid = new THREE.MeshStandardMaterial({
        color: 0xf59e0b, // Technical Amber
        roughness: 0.35,
        metalness: 0.1,
        wireframe: params.wireframe
    });

    const explodeZ = params.explodedView * 35.0;

    if (context.activePreset.startsWith('master')) {
        // Master Node Rendering (4 Corner Pillars, Extended Strain Relief Neck)
        if (context.activePreset === 'master_all' || context.activePreset === 'master_base') {
            const mBase = buildMasterBase(M, params);
            const geom = manifoldToThreeGeometry(mBase);
            items.push({
                geometry: geom,
                material: matBase,
                edgeColor: 0x002233,
                position: new THREE.Vector3(0, 0, 0)
            });
            mBase.delete();
        }

        if (context.activePreset === 'master_all' || context.activePreset === 'master_lid') {
            const mLid = buildMasterLid(M, params);
            const geom = manifoldToThreeGeometry(mLid);
            const zPos = 22.0 / 2 + 4.5 / 2 + explodeZ;
            items.push({
                geometry: geom,
                material: matLid,
                edgeColor: 0x330011,
                position: new THREE.Vector3(0, 0, zPos)
            });
            mLid.delete();
        }
    } else if (context.activePreset === 'follower_stand') {
        // Standalone Outrigger Stand with Ship Cleat View
        const fStand = buildFollowerStand(M, params);
        const geom = manifoldToThreeGeometry(fStand);
        items.push({
            geometry: geom,
            material: matStand,
            edgeColor: 0x1e0a3d,
            position: new THREE.Vector3(0, 0, 0)
        });
        fStand.delete();
    } else if (context.activePreset === 'follower_grid') {
        // Standalone 8x8 Grid View
        const fGrid = buildFollowerGrid(M, params);
        const geom = manifoldToThreeGeometry(fGrid);
        items.push({
            geometry: geom,
            material: matGrid,
            edgeColor: 0x3d2000,
            position: new THREE.Vector3(0, 0, 0)
        });
    } else if (context.activePreset === 'all_plate') {
        // Complete 3D Print Plate: all 6 parts laid out flat on the print bed
        const stand = buildFollowerStand(M, params);
        items.push({
            geometry: manifoldToThreeGeometry(stand),
            material: matStand,
            edgeColor: 0x1e0a3d,
            position: new THREE.Vector3(-54.0, 0, 0)
        });
        stand.delete();

        const fBase = buildFollowerBase(M, params);
        items.push({
            geometry: manifoldToThreeGeometry(fBase),
            material: matBase,
            edgeColor: 0x002233,
            position: new THREE.Vector3(48.0, 5.0, 9.0)
        });
        fBase.delete();

        const fLid = buildFollowerLid(M, params);
        items.push({
            geometry: manifoldToThreeGeometry(fLid),
            material: matLid,
            edgeColor: 0x330011,
            position: new THREE.Vector3(48.0, -80.0, 2.1)
        });
        fLid.delete();

        const fGrid = buildFollowerGrid(M, params);
        items.push({
            geometry: manifoldToThreeGeometry(fGrid),
            material: matGrid,
            edgeColor: 0x3d2000,
            position: new THREE.Vector3(-54.0, -96.0, 2.25)
        });
        fGrid.delete();

        const mBase = buildMasterBase(M, params);
        items.push({
            geometry: manifoldToThreeGeometry(mBase),
            material: matBase,
            edgeColor: 0x002233,
            position: new THREE.Vector3(48.0, 105.0, 11.0)
        });
        mBase.delete();

        const mLid = buildMasterLid(M, params);
        items.push({
            geometry: manifoldToThreeGeometry(mLid),
            material: matLid,
            edgeColor: 0x330011,
            position: new THREE.Vector3(-54.0, 88.0, 2.25)
        });
        mLid.delete();
    } else {
        // Follower Node Rendering
        if (context.activePreset === 'follower_all') {
            // Outrigger stand rests on ground plane (Z=0)
            const fStand = buildFollowerStand(M, params);
            const standGeom = manifoldToThreeGeometry(fStand);
            items.push({
                geometry: standGeom,
                material: matStand,
                edgeColor: 0x1e0a3d,
                position: new THREE.Vector3(0, 0, 0)
            });
            fStand.delete();

            // Follower Base slides vertically into cradle pocket (zero clipping)
            // Shelf sits at Z = 16.0mm, base half-height is 52.0mm -> center is Z = 68.0mm
            const fBase = buildFollowerBase(M, params);
            const baseGeom = manifoldToThreeGeometry(fBase);
            const liftZ = 68.0 + explodeZ * 2.0;
            items.push({
                geometry: baseGeom,
                material: matBase,
                edgeColor: 0x002233,
                position: new THREE.Vector3(0, 0, liftZ),
                rotation: new THREE.Euler(Math.PI / 2, 0, 0)
            });
            fBase.delete();

            // Follower Lid clamps over bottom ESP32 bay
            const fLid = buildFollowerLid(M, params);
            const lidGeom = manifoldToThreeGeometry(fLid);
            const lidY = -18.0 / 2 - 4.2 / 2 - explodeZ;
            const lidZ = liftZ - 32.0; // Aligned with espY = -32.0
            items.push({
                geometry: lidGeom,
                material: matLid,
                edgeColor: 0x330011,
                position: new THREE.Vector3(0, lidY, lidZ),
                rotation: new THREE.Euler(Math.PI / 2, 0, 0)
            });
            fLid.delete();
        } else {
            // Flat Base view for Wall Mounting inspection
            if (context.activePreset === 'follower_base') {
                const fBase = buildFollowerBase(M, params);
                const geom = manifoldToThreeGeometry(fBase);
                items.push({
                    geometry: geom,
                    material: matBase,
                    edgeColor: 0x002233,
                    position: new THREE.Vector3(0, 0, 0)
                });
                fBase.delete();
            }

            if (context.activePreset === 'follower_lid') {
                const fLid = buildFollowerLid(M, params);
                const geom = manifoldToThreeGeometry(fLid);
                items.push({
                    geometry: geom,
                    material: matLid,
                    edgeColor: 0x330011,
                    position: new THREE.Vector3(0, -32.0, 18.0 / 2 + 4.2 / 2 + explodeZ)
                });
                fLid.delete();
            }
        }
    }

    updateSceneMesh(items);
}

export function initUI() {
    const presetBtns = document.querySelectorAll('.preset-btn');
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            presetBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            context.activePreset = btn.dataset.preset;
            rebuildActiveGeometry();
        });
    });

    const bindSlider = (id, paramKey, displayId) => {
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
    bindSlider('input-explodedView', 'explodedView', 'val-explodedView');

    const wireframeCheck = document.getElementById('check-wireframe');
    if (wireframeCheck) {
        wireframeCheck.addEventListener('change', (e) => {
            params.wireframe = e.target.checked;
            rebuildActiveGeometry();
        });
    }

    const exportBtns = document.querySelectorAll('[data-export]');
    exportBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            triggerExport(btn.dataset.export);
        });
    });
}
