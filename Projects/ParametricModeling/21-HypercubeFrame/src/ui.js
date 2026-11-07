// UI management and 3D scene assembly for 21-HypercubeFrame (v2.0 Monocoque Zero-Overhang)
import * as THREE from 'three';
import { context, params, updateParam } from './state.js';
import {
    manifoldToThreeGeometry,
    buildHypercubeFrame,
    buildCornerStand,
    buildGhostMatrixPcb
} from './geometry.js';
import { updateSceneMesh } from './viewport.js';
import { triggerExport } from './exporter.js';

// Helper: Build the 6 Ghost 8x8 LED Matrices positioned around a cube centered at (0,0,0)
function addSixGhostPanels(items, pcbGeom, matPcb, p, explodeDist, parentQuat, parentPos) {
    const half = p.pcbSize / 2;
    const d = half + p.pcbThickness / 2 + explodeDist;

    const faces = [
        { pos: [0, 0, d], rot: [0, 0, 0] },                      // +Z (Top)
        { pos: [0, 0, -d], rot: [Math.PI, 0, 0] },               // -Z (Bottom)
        { pos: [d, 0, 0], rot: [0, Math.PI / 2, 0] },            // +X (Right)
        { pos: [-d, 0, 0], rot: [0, -Math.PI / 2, 0] },          // -X (Left)
        { pos: [0, d, 0], rot: [-Math.PI / 2, 0, 0] },           // +Y (Back)
        { pos: [0, -d, 0], rot: [Math.PI / 2, 0, 0] },           // -Y (Front)
    ];

    faces.forEach(f => {
        const localPos = new THREE.Vector3(...f.pos);
        const localQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...f.rot, 'XYZ'));
        if (parentQuat) {
            localPos.applyQuaternion(parentQuat);
            localQuat.premultiply(parentQuat);
        }
        if (parentPos) {
            localPos.add(parentPos);
        }
        items.push({
            geometry: pcbGeom.clone(),
            material: matPcb,
            edgeColor: 0x00ffaa,
            edgeOpacity: 0.45,
            position: localPos,
            quaternion: localQuat
        });
    });
}

export function rebuildActiveGeometry() {
    const M = context.Manifold;
    if (!M) return;

    const items = [];
    const half = params.pcbSize / 2;
    const outerSpan = params.pcbSize + params.pcbThickness * 2;
    const explode = params.explodedView * 28.0;

    // Materials
    const matFrame = new THREE.MeshStandardMaterial({
        color: 0x00d8f0, // Neon Cyan PETG
        roughness: 0.35,
        metalness: 0.08,
        wireframe: params.wireframe
    });

    const matStand = new THREE.MeshStandardMaterial({
        color: 0x8b5cf6, // Deep Violet Pedestal
        roughness: 0.42,
        metalness: 0.12,
        wireframe: params.wireframe
    });

    const matGhostPcb = new THREE.MeshStandardMaterial({
        color: 0x10b981, // Translucent Emerald PCB/LED Preview
        roughness: 0.25,
        metalness: 0.1,
        transparent: true,
        opacity: 0.48,
        wireframe: params.wireframe
    });

    const preset = context.activePreset;

    if (preset === 'cube_only') {
        const mCube = buildHypercubeFrame(M, params);
        items.push({
            geometry: manifoldToThreeGeometry(mCube),
            material: matFrame,
            edgeColor: 0x002633,
            position: new THREE.Vector3(0, 0, 0)
        });
        mCube.delete();
    } else if (preset === 'stand_only') {
        const mStand = buildCornerStand(M, params);
        items.push({
            geometry: manifoldToThreeGeometry(mStand),
            material: matStand,
            edgeColor: 0x1a0938,
            position: new THREE.Vector3(0, 0, 0)
        });
        mStand.delete();
    } else if (preset === 'print_plate') {
        const mCube = buildHypercubeFrame(M, params);
        items.push({
            geometry: manifoldToThreeGeometry(mCube),
            material: matFrame,
            edgeColor: 0x002633,
            position: new THREE.Vector3(-42, 0, 0)
        });
        mCube.delete();

        const mStand = buildCornerStand(M, params);
        items.push({
            geometry: manifoldToThreeGeometry(mStand),
            material: matStand,
            edgeColor: 0x1a0938,
            position: new THREE.Vector3(48, 0, 0)
        });
        mStand.delete();
    } else if (preset === 'assembly_flat') {
        const liftZ = explode * 0.4;
        const mCube = buildHypercubeFrame(M, params);
        items.push({
            geometry: manifoldToThreeGeometry(mCube),
            material: matFrame,
            edgeColor: 0x002633,
            position: new THREE.Vector3(0, 0, liftZ)
        });
        mCube.delete();

        if (params.showGhostPcbs) {
            const mPcb = buildGhostMatrixPcb(M, params);
            const pcbGeom = manifoldToThreeGeometry(mPcb);
            addSixGhostPanels(
                items,
                pcbGeom,
                matGhostPcb,
                params,
                explode,
                new THREE.Quaternion(),
                new THREE.Vector3(0, 0, half + liftZ)
            );
            mPcb.delete();
        }
    } else {
        // 'assembly_stand': Hypercube balanced on its [+X, +Y, -Z] corner inside the Corner Pedestal Stand
        const mStand = buildCornerStand(M, params);
        items.push({
            geometry: manifoldToThreeGeometry(mStand),
            material: matStand,
            edgeColor: 0x1a0938,
            position: new THREE.Vector3(0, 0, 0)
        });
        mStand.delete();

        const vCorner = new THREE.Vector3(1, 1, -1).normalize();
        const qTilt = new THREE.Quaternion().setFromUnitVectors(vCorner, new THREE.Vector3(0, 0, -1));

        const cornerTipDist = (outerSpan / 2) * Math.sqrt(3);
        const socketApexZ = Math.max(8.0, params.standHeight - 12.0);
        const cubeCenterPos = new THREE.Vector3(0, 0, socketApexZ + cornerTipDist + explode * 0.65);

        const mCube = buildHypercubeFrame(M, params).translate([0, 0, -half]);
        items.push({
            geometry: manifoldToThreeGeometry(mCube),
            material: matFrame,
            edgeColor: 0x002633,
            position: cubeCenterPos,
            quaternion: qTilt
        });
        mCube.delete();

        if (params.showGhostPcbs) {
            const mPcb = buildGhostMatrixPcb(M, params);
            const pcbGeom = manifoldToThreeGeometry(mPcb);
            addSixGhostPanels(items, pcbGeom, matGhostPcb, params, explode, qTilt, cubeCenterPos);
            mPcb.delete();
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

    bindSlider('input-pcbSize', 'pcbSize', 'val-pcbSize');
    bindSlider('input-wallThickness', 'wallThickness', 'val-wallThickness');
    bindSlider('input-diamondHalfSpan', 'diamondHalfSpan', 'val-diamondHalfSpan');
    bindSlider('input-bottomHoleDia', 'bottomHoleDia', 'val-bottomHoleDia');
    bindSlider('input-holeSpacing', 'holeSpacing', 'val-holeSpacing');
    bindSlider('input-m2HoleDia', 'm2HoleDia', 'val-m2HoleDia');
    bindSlider('input-wireHoleDia', 'wireHoleDia', 'val-wireHoleDia');
    bindSlider('input-explodedView', 'explodedView', 'val-explodedView');

    const bindCheckbox = (id, paramKey) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', (e) => {
            updateParam(paramKey, e.target.checked);
            rebuildActiveGeometry();
        });
    };

    bindCheckbox('check-showGhostPcbs', 'showGhostPcbs');
    bindCheckbox('check-enableCornerWireBore', 'enableCornerWireBore');
    bindCheckbox('check-wireframe', 'wireframe');

    const exportBtns = document.querySelectorAll('[data-export]');
    exportBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            triggerExport(btn.dataset.export);
        });
    });
}
