// UI management and 3D scene assembly for 21-HypercubeFrame (v4.0 Tri-Mode)
import * as THREE from 'three';
import { context, params, updateParam, getScrewPilotDia, getScrewClearanceDia } from './state.js';
import {
    manifoldToThreeGeometry,
    buildHypercubeFrame,
    buildOctaTile,
    buildOctaHub,
    buildMiterTile,
    buildCotterPin,
    buildCornerStand,
    buildGhostMatrixPcb
} from './geometry.js';
import { updateSceneMesh } from './viewport.js';
import { triggerExport } from './exporter.js';

function addSixGhostPanels(items, pcbGeom, matPcb, p, explodeDist, parentQuat, parentPos) {
    const half = p.pcbSize / 2;
    const d = half + p.pcbThickness / 2 + explodeDist;
    const faces = [
        { pos: [0, 0, d], rot: [0, 0, 0] },
        { pos: [0, 0, -d], rot: [Math.PI, 0, 0] },
        { pos: [d, 0, 0], rot: [0, Math.PI / 2, 0] },
        { pos: [-d, 0, 0], rot: [0, -Math.PI / 2, 0] },
        { pos: [0, d, 0], rot: [-Math.PI / 2, 0, 0] },
        { pos: [0, -d, 0], rot: [Math.PI / 2, 0, 0] },
    ];
    faces.forEach(f => {
        const localPos = new THREE.Vector3(...f.pos);
        const localQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...f.rot, 'XYZ'));
        if (parentQuat) {
            localPos.applyQuaternion(parentQuat);
            localQuat.premultiply(parentQuat);
        }
        if (parentPos) localPos.add(parentPos);
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

function addModularCubeTiles(items, tileGeom, pcbGeom, matTile, matPcb, p, centerOffset, explode, skipFaces = []) {
    const tileHalf = 34.5;
    const faceDist = tileHalf + explode;
    const faces = [
        { name: '+Z', pos: [0, 0, faceDist], rot: [0, 0, 0] },
        { name: '-Z', pos: [0, 0, -faceDist], rot: [Math.PI, 0, 0] },
        { name: '+X', pos: [faceDist, 0, 0], rot: [0, Math.PI / 2, 0] },
        { name: '-X', pos: [-faceDist, 0, 0], rot: [0, -Math.PI / 2, 0] },
        { name: '+Y', pos: [0, faceDist, 0], rot: [-Math.PI / 2, 0, 0] },
        { name: '-Y', pos: [0, -faceDist, 0], rot: [Math.PI / 2, 0, 0] },
    ];
    faces.forEach(f => {
        if (skipFaces.includes(f.name)) return;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...f.rot, 'XYZ'));
        const pos = new THREE.Vector3(...f.pos).add(centerOffset);
        items.push({
            geometry: tileGeom.clone(),
            material: matTile,
            edgeColor: 0x002633,
            position: pos,
            quaternion: q
        });
        if (p.showGhostPcbs && pcbGeom) {
            const pcbLocal = new THREE.Vector3(0, 0, 2.6 + p.pcbThickness / 2 + explode * 0.4).applyQuaternion(q);
            items.push({
                geometry: pcbGeom.clone(),
                material: matPcb,
                edgeColor: 0x00ffaa,
                edgeOpacity: 0.45,
                position: pos.clone().add(pcbLocal),
                quaternion: q
            });
        }
    });
}

export function rebuildActiveGeometry() {
    const M = context.Manifold;
    if (!M) return;

    const items = [];
    const half = params.pcbSize / 2;
    const outerSpan = params.pcbSize + params.pcbThickness * 2;
    const explode = params.explodedView * 28.0;

    const matFrame = new THREE.MeshStandardMaterial({ color: 0x00d8f0, roughness: 0.35, metalness: 0.08, wireframe: params.wireframe });
    const matAccent = new THREE.MeshStandardMaterial({ color: 0xff2a7a, roughness: 0.38, metalness: 0.08, wireframe: params.wireframe });
    const matStand = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, roughness: 0.42, metalness: 0.12, wireframe: params.wireframe });
    const matGhostPcb = new THREE.MeshStandardMaterial({
        color: 0x10b981, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.48, wireframe: params.wireframe
    });

    const preset = context.activePreset;

    // -----------------------------------------------------------------
    // MODE 2 ('octa'): Octa-Node Internal Screw Hubs
    // -----------------------------------------------------------------
    if (preset === 'octa_single') {
        const mTile = buildOctaTile(M, params);
        items.push({ geometry: manifoldToThreeGeometry(mTile), material: matFrame, edgeColor: 0x002633, position: new THREE.Vector3(0, 0, 0) });
        mTile.delete();

        const mHub3 = buildOctaHub(M, params, 3);
        items.push({ geometry: manifoldToThreeGeometry(mHub3), material: matAccent, edgeColor: 0x380018, position: new THREE.Vector3(48, 20, 0) });
        mHub3.delete();

        const mHub4 = buildOctaHub(M, params, 4);
        items.push({ geometry: manifoldToThreeGeometry(mHub4), material: matStand, edgeColor: 0x1a0938, position: new THREE.Vector3(48, 0, 0) });
        mHub4.delete();

        const mHub5 = buildOctaHub(M, params, 5);
        items.push({ geometry: manifoldToThreeGeometry(mHub5), material: matAccent, edgeColor: 0x380018, position: new THREE.Vector3(48, -26, 0) });
        mHub5.delete();

        if (params.showGhostPcbs) {
            const mPcb = buildGhostMatrixPcb(M, params);
            items.push({
                geometry: manifoldToThreeGeometry(mPcb), material: matGhostPcb, edgeColor: 0x00ffaa, edgeOpacity: 0.5,
                position: new THREE.Vector3(0, explode * 1.4, 2.6 + params.pcbThickness / 2)
            });
            mPcb.delete();
        }
    } else if (preset === 'octa_cube' || preset === 'octa_cluster') {
        const mTile = buildOctaTile(M, params);
        const tileGeom = manifoldToThreeGeometry(mTile);
        mTile.delete();
        let pcbGeom = null;
        if (params.showGhostPcbs) {
            const mPcb = buildGhostMatrixPcb(M, params);
            pcbGeom = manifoldToThreeGeometry(mPcb);
            mPcb.delete();
        }
        if (preset === 'octa_cube') {
            addModularCubeTiles(items, tileGeom, pcbGeom, matFrame, matGhostPcb, params, new THREE.Vector3(0, 0, 34.5), explode);
        } else {
            const pitch = 69.0;
            addModularCubeTiles(items, tileGeom, pcbGeom, matFrame, matGhostPcb, params, new THREE.Vector3(0, 0, 34.5), explode, ['+X', '+Z']);
            addModularCubeTiles(items, tileGeom, pcbGeom, matAccent, matGhostPcb, params, new THREE.Vector3(pitch, 0, 34.5), explode, ['-X']);
            addModularCubeTiles(items, tileGeom, pcbGeom, matAccent, matGhostPcb, params, new THREE.Vector3(0, 0, 34.5 + pitch), explode, ['-Z']);
        }
    } else if (preset === 'octa_plate') {
        const mTile = buildOctaTile(M, params);
        const tileGeom = manifoldToThreeGeometry(mTile);
        mTile.delete();
        for (let row = 0; row < 2; row++) {
            for (let col = -1; col <= 1; col++) {
                items.push({ geometry: tileGeom.clone(), material: matFrame, edgeColor: 0x002633, position: new THREE.Vector3(col * 76 - 26, (row - 0.5) * 76, 0) });
            }
        }
        const mHub3 = buildOctaHub(M, params, 3);
        const h3g = manifoldToThreeGeometry(mHub3);
        mHub3.delete();
        for (let i = 0; i < 8; i++) {
            items.push({ geometry: h3g.clone(), material: matAccent, edgeColor: 0x380018, position: new THREE.Vector3(96 + (i % 2) * 20, -60 + Math.floor(i / 2) * 20, 0) });
        }
        const mHub4 = buildOctaHub(M, params, 4);
        const h4g = manifoldToThreeGeometry(mHub4);
        mHub4.delete();
        items.push({ geometry: h4g.clone(), material: matStand, edgeColor: 0x1a0938, position: new THREE.Vector3(106, 36, 0) });
        items.push({ geometry: h4g.clone(), material: matStand, edgeColor: 0x1a0938, position: new THREE.Vector3(106, 56, 0) });

    // -----------------------------------------------------------------
    // MODE 3 ('miter'): 45° Miter-Rail & Tapered Wedge Cotter-Pin
    // -----------------------------------------------------------------
    } else if (preset === 'miter_single') {
        const mTile = buildMiterTile(M, params);
        items.push({ geometry: manifoldToThreeGeometry(mTile), material: matFrame, edgeColor: 0x002633, position: new THREE.Vector3(0, 0, 0) });
        mTile.delete();

        const mPin = buildCotterPin(M, params);
        items.push({ geometry: manifoldToThreeGeometry(mPin), material: matAccent, edgeColor: 0x380018, position: new THREE.Vector3(48, -18, 0) });
        mPin.delete();

        if (params.showGhostPcbs) {
            const mPcb = buildGhostMatrixPcb(M, params);
            items.push({
                geometry: manifoldToThreeGeometry(mPcb), material: matGhostPcb, edgeColor: 0x00ffaa, edgeOpacity: 0.5,
                position: new THREE.Vector3(0, explode * 1.4, 2.6 + params.pcbThickness / 2)
            });
            mPcb.delete();
        }
    } else if (preset === 'miter_cube' || preset === 'miter_cluster') {
        const mTile = buildMiterTile(M, params);
        const tileGeom = manifoldToThreeGeometry(mTile);
        mTile.delete();
        let pcbGeom = null;
        if (params.showGhostPcbs) {
            const mPcb = buildGhostMatrixPcb(M, params);
            pcbGeom = manifoldToThreeGeometry(mPcb);
            mPcb.delete();
        }
        if (preset === 'miter_cube') {
            addModularCubeTiles(items, tileGeom, pcbGeom, matFrame, matGhostPcb, params, new THREE.Vector3(0, 0, 34.5), explode);
        } else {
            const pitch = 69.0;
            addModularCubeTiles(items, tileGeom, pcbGeom, matFrame, matGhostPcb, params, new THREE.Vector3(0, 0, 34.5), explode, ['+X', '+Z']);
            addModularCubeTiles(items, tileGeom, pcbGeom, matAccent, matGhostPcb, params, new THREE.Vector3(pitch, 0, 34.5), explode, ['-X']);
            addModularCubeTiles(items, tileGeom, pcbGeom, matAccent, matGhostPcb, params, new THREE.Vector3(0, 0, 34.5 + pitch), explode, ['-Z']);
        }
    } else if (preset === 'miter_plate') {
        const mTile = buildMiterTile(M, params);
        const tileGeom = manifoldToThreeGeometry(mTile);
        mTile.delete();
        for (let row = 0; row < 2; row++) {
            for (let col = -1; col <= 1; col++) {
                items.push({ geometry: tileGeom.clone(), material: matFrame, edgeColor: 0x002633, position: new THREE.Vector3(col * 76 - 28, (row - 0.5) * 76, 0) });
            }
        }
        const mPin = buildCotterPin(M, params);
        const pinGeom = manifoldToThreeGeometry(mPin);
        mPin.delete();
        for (let i = 0; i < 12; i++) {
            items.push({ geometry: pinGeom.clone(), material: matAccent, edgeColor: 0x380018, position: new THREE.Vector3(92 + (i % 3) * 15, -90 + Math.floor(i / 3) * 54, 0) });
        }

    // -----------------------------------------------------------------
    // MODE 1 ('screws'): Monocoque Zero-Overhang Screw Cube
    // -----------------------------------------------------------------
    } else if (preset === 'cube_only') {
        const mCube = buildHypercubeFrame(M, params);
        items.push({ geometry: manifoldToThreeGeometry(mCube), material: matFrame, edgeColor: 0x002633, position: new THREE.Vector3(0, 0, 0) });
        mCube.delete();
    } else if (preset === 'stand_only') {
        const mStand = buildCornerStand(M, params);
        items.push({ geometry: manifoldToThreeGeometry(mStand), material: matStand, edgeColor: 0x1a0938, position: new THREE.Vector3(0, 0, 0) });
        mStand.delete();
    } else if (preset === 'print_plate') {
        const mCube = buildHypercubeFrame(M, params);
        items.push({ geometry: manifoldToThreeGeometry(mCube), material: matFrame, edgeColor: 0x002633, position: new THREE.Vector3(-42, 0, 0) });
        mCube.delete();
        const mStand = buildCornerStand(M, params);
        items.push({ geometry: manifoldToThreeGeometry(mStand), material: matStand, edgeColor: 0x1a0938, position: new THREE.Vector3(48, 0, 0) });
        mStand.delete();
    } else if (preset === 'assembly_flat') {
        const liftZ = explode * 0.4;
        const mCube = buildHypercubeFrame(M, params);
        items.push({ geometry: manifoldToThreeGeometry(mCube), material: matFrame, edgeColor: 0x002633, position: new THREE.Vector3(0, 0, liftZ) });
        mCube.delete();
        if (params.showGhostPcbs) {
            const mPcb = buildGhostMatrixPcb(M, params);
            addSixGhostPanels(items, manifoldToThreeGeometry(mPcb), matGhostPcb, params, explode, new THREE.Quaternion(), new THREE.Vector3(0, 0, half + liftZ));
            mPcb.delete();
        }
    } else {
        const mStand = buildCornerStand(M, params);
        items.push({ geometry: manifoldToThreeGeometry(mStand), material: matStand, edgeColor: 0x1a0938, position: new THREE.Vector3(0, 0, 0) });
        mStand.delete();
        const vCorner = new THREE.Vector3(1, 1, -1).normalize();
        const qTilt = new THREE.Quaternion().setFromUnitVectors(vCorner, new THREE.Vector3(0, 0, -1));
        const cornerTipDist = (outerSpan / 2) * Math.sqrt(3);
        const socketApexZ = Math.max(8.0, params.standHeight - 12.0);
        const cubeCenterPos = new THREE.Vector3(0, 0, socketApexZ + cornerTipDist + explode * 0.65);
        const mCube = buildHypercubeFrame(M, params).translate([0, 0, -half]);
        items.push({ geometry: manifoldToThreeGeometry(mCube), material: matFrame, edgeColor: 0x002633, position: cubeCenterPos, quaternion: qTilt });
        mCube.delete();
        if (params.showGhostPcbs) {
            const mPcb = buildGhostMatrixPcb(M, params);
            addSixGhostPanels(items, manifoldToThreeGeometry(mPcb), matGhostPcb, params, explode, qTilt, cubeCenterPos);
            mPcb.delete();
        }
    }

    updateSceneMesh(items);
}

function syncModeUI() {
    document.querySelectorAll('[data-mode]').forEach(el => {
        const allowed = el.dataset.mode.split(' ');
        el.style.display = allowed.includes(params.mountMode) ? '' : 'none';
    });
}

function updateScrewReadout() {
    const el = document.getElementById('val-screwSpec');
    if (el) {
        el.textContent = `M${params.screwNominalDia.toFixed(1)} (Ø${getScrewPilotDia(params)}mm pilot / Ø${getScrewClearanceDia(params)}mm clear)`;
    }
}

export function initUI() {
    const modeBtns = document.querySelectorAll('.mode-btn');
    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const newMode = btn.dataset.mountMode;
            updateParam('mountMode', newMode);
            syncModeUI();

            const defaultMap = { screws: 'cube_only', octa: 'octa_cube', miter: 'miter_cube' };
            const defaultPreset = defaultMap[newMode] || 'cube_only';
            context.activePreset = defaultPreset;
            document.querySelectorAll('.preset-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.preset === defaultPreset);
            });
            rebuildActiveGeometry();
        });
    });

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            context.activePreset = btn.dataset.preset;
            rebuildActiveGeometry();
        });
    });

    const bindSlider = (id, paramKey, displayId, onChangeExtra) => {
        const input = document.getElementById(id);
        const display = document.getElementById(displayId);
        if (!input) return;
        input.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            updateParam(paramKey, val);
            if (display) display.textContent = val.toFixed(2);
            if (onChangeExtra) onChangeExtra();
            rebuildActiveGeometry();
        });
    };

    bindSlider('input-screwNominalDia', 'screwNominalDia', null, updateScrewReadout);
    bindSlider('input-pcbSize', 'pcbSize', 'val-pcbSize');
    bindSlider('input-wallThickness', 'wallThickness', 'val-wallThickness');
    bindSlider('input-diamondHalfSpan', 'diamondHalfSpan', 'val-diamondHalfSpan');
    bindSlider('input-bottomHoleDia', 'bottomHoleDia', 'val-bottomHoleDia');
    bindSlider('input-holeSpacingX', 'holeSpacingX', 'val-holeSpacingX');
    bindSlider('input-holeSpacingY', 'holeSpacingY', 'val-holeSpacingY');
    bindSlider('input-wireHoleDia', 'wireHoleDia', 'val-wireHoleDia');
    bindSlider('input-tileThickness', 'tileThickness', 'val-tileThickness');
    bindSlider('input-crossBeamWidth', 'crossBeamWidth', 'val-crossBeamWidth');
    bindSlider('input-pinClearance', 'pinClearance', 'val-pinClearance');
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

    document.querySelectorAll('[data-export]').forEach(btn => {
        btn.addEventListener('click', () => triggerExport(btn.dataset.export));
    });

    updateScrewReadout();
    syncModeUI();
}
