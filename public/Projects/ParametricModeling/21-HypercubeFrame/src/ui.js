// UI management and 3D scene assembly for 21-HypercubeFrame (v3.0 Dual-Mode)
import * as THREE from 'three';
import { context, params, updateParam } from './state.js';
import {
    manifoldToThreeGeometry,
    buildHypercubeFrame,
    buildModularSlotTile,
    buildCornerClip90,
    buildFlatClip180,
    buildClipFitTestArray,
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

// Helper: Place rigid OpenLOCK Cross-Ring tiles on the 6 faces of a 69mm cube
function addModularCubeTiles(items, tileGeom, pcbGeom, matTile, matPcb, p, centerOffset, explode, skipFaces = []) {
    const tileHalf = 34.5; // 69.0mm outer span
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
            // PCB sits inside the front slot at Z_local = 2.6 + pcbThickness/2
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

    // Materials
    const matFrame = new THREE.MeshStandardMaterial({
        color: 0x00d8f0, // Neon Cyan PETG
        roughness: 0.35,
        metalness: 0.08,
        wireframe: params.wireframe
    });

    const matTileAlt = new THREE.MeshStandardMaterial({
        color: 0xff2a7a, // Neon Coral Accent for adjacent Lego-cluster cubes
        roughness: 0.38,
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

    // -----------------------------------------------------------------
    // MODE B ('slots'): Rigid Open-Corner Cross-Ring Tile + OpenLOCK Clips
    // -----------------------------------------------------------------
    if (preset === 'tile_single') {
        const mTile = buildModularSlotTile(M, params);
        items.push({
            geometry: manifoldToThreeGeometry(mTile),
            material: matFrame,
            edgeColor: 0x002633,
            position: new THREE.Vector3(0, 0, 0)
        });
        mTile.delete();

        // Show 1x 90° Clip and 1x 180° Clip next to the tile on the bed
        const mClip90 = buildCornerClip90(M, params);
        items.push({
            geometry: manifoldToThreeGeometry(mClip90),
            material: matTileAlt,
            edgeColor: 0x380018,
            position: new THREE.Vector3(48, 12, 0)
        });
        mClip90.delete();

        const mClip180 = buildFlatClip180(M, params);
        items.push({
            geometry: manifoldToThreeGeometry(mClip180),
            material: matStand,
            edgeColor: 0x1a0938,
            position: new THREE.Vector3(48, -14, 0)
        });
        mClip180.delete();

        if (params.showGhostPcbs) {
            const mPcb = buildGhostMatrixPcb(M, params);
            items.push({
                geometry: manifoldToThreeGeometry(mPcb),
                material: matGhostPcb,
                edgeColor: 0x00ffaa,
                edgeOpacity: 0.5,
                position: new THREE.Vector3(0, explode * 1.4, 2.6 + params.pcbThickness / 2)
            });
            mPcb.delete();
        }
    } else if (preset === 'tile_cube') {
        const mTile = buildModularSlotTile(M, params);
        const tileGeom = manifoldToThreeGeometry(mTile);
        mTile.delete();
        let pcbGeom = null;
        if (params.showGhostPcbs) {
            const mPcb = buildGhostMatrixPcb(M, params);
            pcbGeom = manifoldToThreeGeometry(mPcb);
            mPcb.delete();
        }
        addModularCubeTiles(items, tileGeom, pcbGeom, matFrame, matGhostPcb, params, new THREE.Vector3(0, 0, 34.5), explode);
    } else if (preset === 'tile_cluster') {
        const mTile = buildModularSlotTile(M, params);
        const tileGeom = manifoldToThreeGeometry(mTile);
        mTile.delete();
        let pcbGeom = null;
        if (params.showGhostPcbs) {
            const mPcb = buildGhostMatrixPcb(M, params);
            pcbGeom = manifoldToThreeGeometry(mPcb);
            mPcb.delete();
        }
        const pitch = 69.0; // 2 * 34.5mm cube center-to-center
        addModularCubeTiles(items, tileGeom, pcbGeom, matFrame, matGhostPcb, params, new THREE.Vector3(0, 0, 34.5), explode, ['+X', '+Z']);
        addModularCubeTiles(items, tileGeom, pcbGeom, matTileAlt, matGhostPcb, params, new THREE.Vector3(pitch, 0, 34.5), explode, ['-X']);
        addModularCubeTiles(items, tileGeom, pcbGeom, matTileAlt, matGhostPcb, params, new THREE.Vector3(0, 0, 34.5 + pitch), explode, ['-Z']);
    } else if (preset === 'clip_test') {
        const mTest = buildClipFitTestArray(M, params);
        items.push({
            geometry: manifoldToThreeGeometry(mTest),
            material: matTileAlt,
            edgeColor: 0x380018,
            position: new THREE.Vector3(0, 0, 0)
        });
        mTest.delete();
    } else if (preset === 'tile_plate') {
        const mTile = buildModularSlotTile(M, params);
        const tileGeom = manifoldToThreeGeometry(mTile);
        mTile.delete();
        const step = 76.0;
        for (let row = 0; row < 2; row++) {
            for (let col = -1; col <= 1; col++) {
                items.push({
                    geometry: tileGeom.clone(),
                    material: matFrame,
                    edgeColor: 0x002633,
                    position: new THREE.Vector3(col * step - 28, (row - 0.5) * step, 0)
                });
            }
        }
        const mClip90 = buildCornerClip90(M, params);
        const clip90Geom = manifoldToThreeGeometry(mClip90);
        mClip90.delete();
        for (let i = 0; i < 12; i++) {
            items.push({
                geometry: clip90Geom.clone(),
                material: matTileAlt,
                edgeColor: 0x380018,
                position: new THREE.Vector3(98 + (i % 2) * 22, -62 + Math.floor(i / 2) * 22, 0)
            });
        }
        const mClip180 = buildFlatClip180(M, params);
        const clip180Geom = manifoldToThreeGeometry(mClip180);
        mClip180.delete();
        for (let j = 0; j < 4; j++) {
            items.push({
                geometry: clip180Geom.clone(),
                material: matStand,
                edgeColor: 0x1a0938,
                position: new THREE.Vector3(-96 + j * 24, -96, 0)
            });
        }
    } else if (preset === 'cube_only') {
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

function syncModeUI() {
    const isSlots = params.mountMode === 'slots';
    document.querySelectorAll('[data-mode="screws"]').forEach(el => {
        el.style.display = isSlots ? 'none' : '';
    });
    document.querySelectorAll('[data-mode="slots"]').forEach(el => {
        el.style.display = isSlots ? '' : 'none';
    });
}

export function initUI() {
    // Mode Toggle Buttons
    const modeBtns = document.querySelectorAll('.mode-btn');
    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const newMode = btn.dataset.mountMode;
            updateParam('mountMode', newMode);
            syncModeUI();

            // Auto-select default preset for the selected mode
            const defaultPreset = newMode === 'slots' ? 'tile_cube' : 'cube_only';
            context.activePreset = defaultPreset;
            document.querySelectorAll('.preset-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.preset === defaultPreset);
            });
            rebuildActiveGeometry();
        });
    });

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
    bindSlider('input-holeSpacingX', 'holeSpacingX', 'val-holeSpacingX');
    bindSlider('input-holeSpacingY', 'holeSpacingY', 'val-holeSpacingY');
    bindSlider('input-m2HoleDia', 'm2HoleDia', 'val-m2HoleDia');
    bindSlider('input-wireHoleDia', 'wireHoleDia', 'val-wireHoleDia');
    bindSlider('input-tileThickness', 'tileThickness', 'val-tileThickness');
    bindSlider('input-crossBeamWidth', 'crossBeamWidth', 'val-crossBeamWidth');
    bindSlider('input-slotClearance', 'slotClearance', 'val-slotClearance');
    bindSlider('input-clipWidthOffset', 'clipWidthOffset', 'val-clipWidthOffset');
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

    syncModeUI();
}
