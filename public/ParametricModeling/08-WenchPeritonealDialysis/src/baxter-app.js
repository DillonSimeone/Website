import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';
import { modelToSTL } from '../../00-CommonParts/Exporter/stl.js';
import { initThreeViewer } from '../../00-CommonParts/viewer.js';
import Module from 'https://unpkg.com/manifold-3d/manifold.js';
import { generateBaxterCable } from './baxter/cable.js';
import { generateBaxterInserts, generateBottomInserts } from './baxter/insert.js';
import { generateSocketWrench } from './baxter/wrench.js';

let wasm, Manifold;
let viewer;

const PARAMS = {};
let currentMeshes = [];

// Geometries cache for export
let baxterTipModel = null;
let baxterMiddleModel = null;
let baxterBottomModel = null;
let socketWrenchModel = null;
let tpu2_left = null, tpu2_right = null;
let tpu2_left_solid = null, tpu2_right_solid = null;
let tpu3_left = null, tpu3_right = null;
let tpu3_left_solid = null, tpu3_right_solid = null;

// Initialize parameter system
const param = (name, defaultValue, options = {}, category = 'baxter') => {
    const id = name.replace(/\s+/g, '-').toLowerCase();
    if (!PARAMS[id]) {
        const type = options.type ?? 'range';
        const min = options.min ?? 0;
        const max = options.max ?? (defaultValue * 3);
        const step = options.step ?? 1;
        PARAMS[id] = { value: defaultValue, min, max, step, name, category, type };
        createParamUI(id, category);
    }
    return PARAMS[id].value;
};

function createParamUI(id, cat) {
    const p = PARAMS[id];
    const container = document.getElementById('params-' + cat);
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'param-row';
    
    if (p.type === 'checkbox') {
        row.innerHTML = `
            <div class="ph" style="display:flex; justify-content:space-between; align-items:center;">
                ${p.name} 
                <input type="checkbox" id="input-${id}" ${p.value ? 'checked' : ''} style="width:20px; height:20px; cursor:pointer;">
            </div>
        `;
        container.appendChild(row);
        row.querySelector('input').addEventListener('change', (e) => {
            PARAMS[id].value = e.target.checked ? 1 : 0;
            requestUpdate();
        });
    } else {
        row.innerHTML = `
            <div class="ph">${p.name} <span class="val" id="val-${id}">${p.value}</span></div>
            <input type="range" id="input-${id}" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.value}">
        `;
        container.appendChild(row);
        row.querySelector('input').addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            PARAMS[id].value = val;
            const displayEl = document.getElementById(`val-${id}`);
            if (displayEl) displayEl.innerText = val;
            requestUpdate();
        });
    }
}

function getConfig() {
    const config = {};
    for (const key in PARAMS) {
        const camelKey = key.replace(/-([a-z])/g, (g) => g[1].toUpperCase())
                            .replace(/[()]/g, '');
        config[camelKey] = PARAMS[key].value;
    }
    // Rename/normalize keys if needed
    config.explosion = (PARAMS['explosion']?.value ?? 35) / 100;
    config.showCable = PARAMS['show-cable-reference']?.value ?? 1;
    config.showInserts = PARAMS['show-socket-slots']?.value ?? 1;
    config.showSolids = PARAMS['show-solid-templates']?.value ?? 0;
    
    config.tipDiam = PARAMS['tip-cylinder-diam']?.value ?? 14;
    config.tipFlatH = PARAMS['tip-flat-height']?.value ?? 11.5;
    config.tipTotalH = PARAMS['tip-total-height']?.value ?? 16;
    
    config.midDiam = PARAMS['middle-cylinder-diam']?.value ?? 14;
    config.midLength = PARAMS['middle-length']?.value ?? 24;
    config.grooveDepth = PARAMS['groove-depth']?.value ?? 1.0;
    config.ridgeWidth = PARAMS['ridge-width']?.value ?? 6.0;
    config.numRidges = PARAMS['number-of-ridges']?.value ?? 4;
    
    config.botTopDiam = PARAMS['bottom-top-diam']?.value ?? 15;
    config.botBottomDiam = PARAMS['bottom-bottom-diam']?.value ?? 16;
    config.botLength = PARAMS['bottom-length']?.value ?? 18;
    
    config.tpuWall = PARAMS['wall-thickness']?.value ?? 3.0;
    config.tpuKeyWidth = PARAMS['key-width']?.value ?? 0.0;
    config.tpuKeyDepth = PARAMS['key-depth']?.value ?? 0.0;
    config.tpuKeyCount = PARAMS['key-count']?.value ?? 0;
    
    config.clampArmLength = PARAMS['clamp-arm-length']?.value ?? 25.0;
    config.clampArmWidth = PARAMS['clamp-arm-width']?.value ?? 16.0;
    
    config.enableNotch = PARAMS['enable-center-notch']?.value ?? 1;
    config.notchW = PARAMS['notch-width-(x-axis)']?.value ?? 6.0;
    config.notchH = PARAMS['notch-height-(z-axis)']?.value ?? 4.0;
    config.notchZOffset = PARAMS['notch-z-offset']?.value ?? 0.0;
    
    config.tolerance = PARAMS['fitting-tolerance']?.value ?? 0.25;
    config.quality = PARAMS['mesh-smoothness']?.value ?? 64;
    
    config.socketDiam = PARAMS['socket-inner-diam']?.value ?? 11.7;
    config.socketDepth = PARAMS['socket-depth']?.value ?? 12;
    config.socketWall = PARAMS['socket-wall-thickness']?.value ?? 4.0;
    config.sHandleLen = PARAMS['socket-handle-length']?.value ?? 140;
    config.sHandleThick = PARAMS['socket-wrench-handle-thickness']?.value ?? 8.0;
    config.sRingDiam = PARAMS['socket-wrench-ring-diam']?.value ?? 30;
    config.handleDiam = PARAMS['handle-diameter']?.value ?? 19.05;
    config.grooveWidth = PARAMS['groove-width']?.value ?? 8.0;
    config.grooveDepth = PARAMS['groove-depth']?.value ?? 3.0;
    config.cardGuideLip = PARAMS['card-guide-lip']?.value ?? 1.0;
    
    return config;
}

function cleanupGeometries() {
    const list = [
        baxterTipModel, baxterMiddleModel, baxterBottomModel, socketWrenchModel,
        tpu2_left, tpu2_right, tpu2_left_solid, tpu2_right_solid,
        tpu3_left, tpu3_right, tpu3_left_solid, tpu3_right_solid
    ];
    list.forEach(m => { if (m) m.delete(); });
    baxterTipModel = baxterMiddleModel = baxterBottomModel = socketWrenchModel = null;
    tpu2_left = tpu2_right = tpu2_left_solid = tpu2_right_solid = null;
    tpu3_left = tpu3_right = tpu3_left_solid = tpu3_right_solid = null;
}

function generateModels() {
    cleanupGeometries();
    const config = getConfig();
    const q = config.quality;

    // 1. Generate Cable Reference
    const cableData = generateBaxterCable(Manifold, config, q);
    baxterMiddleModel = cableData.baxterMiddleModel;
    baxterTipModel = cableData.baxterTipModel;
    baxterBottomModel = cableData.baxterBottomModel;
    const botTube = cableData.botTube;

    // 2. Generate Socket Slots (TPU inserts)
    const insertData = generateBaxterInserts(Manifold, config, q);
    tpu2_left = insertData.tpu2_left;
    tpu2_right = insertData.tpu2_right;
    tpu2_left_solid = insertData.tpu2_left_solid;
    tpu2_right_solid = insertData.tpu2_right_solid;

    // 3. Generate Bottom Inserts (last piece adapter clamp)
    const bottomInsertData = generateBottomInserts(Manifold, config, q);
    tpu3_left = bottomInsertData.tpu3_left;
    tpu3_right = bottomInsertData.tpu3_right;
    tpu3_left_solid = bottomInsertData.tpu3_left_solid;
    tpu3_right_solid = bottomInsertData.tpu3_right_solid;

    // 4. Generate Socket Wrench
    socketWrenchModel = generateSocketWrench(Manifold, config, q);

    // ==========================================
    // RENDER ASSEMBLY
    // ==========================================
    const tipCenterZ = config.midLength / 2 + config.tipTotalH / 2;
    const botCenterZ = -(config.midLength / 2 + config.botLength / 2);

    const viewMode = viewer.getViewMode();

    if (config.showCable) {
        let midRender = baxterMiddleModel.translate([0, 0, 0]);
        let tipRender = baxterTipModel.translate([0, 0, tipCenterZ]);
        let botRender = baxterBottomModel.translate([0, 0, botCenterZ]);

        const mMid = viewer.manifoldToThreeMesh(midRender, 0x06b6d4, 0.85);
        const mTip = viewer.manifoldToThreeMesh(tipRender, 0xf0f9ff, 0.9);
        const mBot = viewer.manifoldToThreeMesh(botRender, 0xe2e8f0, 0.95);

        let tubeMat = (viewMode === 'blueprint') 
            ? new THREE.MeshBasicMaterial({ color: 0x07294d, transparent: true, opacity: 0.3, side: THREE.DoubleSide }) 
            : new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, transmission: 0.85, roughness: 0.15, thickness: 1.0, side: THREE.DoubleSide });

        const mTubeMeshData = botTube.getMesh();
        const mTubeGeo = new THREE.BufferGeometry();
        mTubeGeo.setAttribute('position', new THREE.Float32BufferAttribute(mTubeMeshData.vertProperties, 3));
        mTubeGeo.setIndex(new THREE.Uint32BufferAttribute(mTubeMeshData.triVerts, 1));
        mTubeGeo.computeVertexNormals();
        const mTubeMesh = new THREE.Mesh(mTubeGeo, tubeMat);

        if (viewMode === 'blueprint') {
            const edges = new THREE.EdgesGeometry(mTubeGeo);
            mTubeMesh.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x00f2ff, linewidth: 1 })));
        }

        viewer.scene.add(mMid); viewer.scene.add(mTip); viewer.scene.add(mBot); viewer.scene.add(mTubeMesh);
        currentMeshes.push(mMid, mTip, mBot, mTubeMesh);

        midRender.delete(); tipRender.delete(); botRender.delete();
    }
    botTube.delete();

    // Render TPU/Solid Inserts
    const explodeDist = config.explosion * 25.0;
    const renderHalf = (model, yOffset, zOffset, isRight, color) => {
        if (!model) return;
        const shiftX = isRight ? explodeDist : -explodeDist;
        let visual = model.translate([shiftX, yOffset, zOffset]);
        const mesh = viewer.manifoldToThreeMesh(visual, color, 0.9);
        viewer.scene.add(mesh);
        currentMeshes.push(mesh);
        visual.delete();
    };

    if (config.showInserts) {
        // Middle Insert
        renderHalf(tpu2_left, 0.0, config.midLength / 2, false, 0x22c55e);
        renderHalf(tpu2_right, 0.0, config.midLength / 2, true, 0x22c55e);

        // Bottom Insert
        renderHalf(tpu3_left, 0.0, botCenterZ, false, 0x22c55e);
        renderHalf(tpu3_right, 0.0, botCenterZ, true, 0x22c55e);
    }
    if (config.showSolids) {
        // Middle Solid
        renderHalf(tpu2_left_solid, 0.0, config.midLength / 2, false, 0xd946ef);
        renderHalf(tpu2_right_solid, 0.0, config.midLength / 2, true, 0xd946ef);

        // Bottom Solid
        renderHalf(tpu3_left_solid, 0.0, botCenterZ, false, 0xd946ef);
        renderHalf(tpu3_right_solid, 0.0, botCenterZ, true, 0xd946ef);
    }

    // Render Wrench
    const topShift = config.explosion * 30.0;
    const twistAngle = 45.0;
    const sWrenchZ = tipCenterZ + 20.0 + topShift;
    let swVisual = socketWrenchModel.rotate([0, 0, twistAngle]).translate([0, 0, sWrenchZ]);
    const meshSw = viewer.manifoldToThreeMesh(swVisual, 0x06b6d4, 0.95);
    viewer.scene.add(meshSw);
    currentMeshes.push(meshSw);
    swVisual.delete();
}

function requestUpdate() {
    if (!Manifold) return;
    currentMeshes.forEach(m => viewer.scene.remove(m));
    currentMeshes = [];
    try {
        generateModels();
    } catch (e) {
        console.error("CAD modeling engine error:", e);
    }
}

// STL Exporter wrappers
function triggerSTLSave(model, filename) {
    if (!model) return;
    const stlContent = modelToSTL(model, filename);
    const blob = new Blob([stlContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${filename}.stl`; a.click();
    URL.revokeObjectURL(url);
}

function exportInsert(leftModel, rightModel, filename) {
    if (!leftModel || !rightModel) return;
    let leftClone = leftModel.translate([-1.5, 0, 0]);
    let rightClone = rightModel.translate([1.5, 0, 0]);
    let assembly = Manifold.union(leftClone, rightClone);
    triggerSTLSave(assembly, filename);
    leftClone.delete();
    rightClone.delete();
    assembly.delete();
}

function exportCable() {
    if (!baxterTipModel || !baxterMiddleModel || !baxterBottomModel) return;
    const config = getConfig();
    const tipCenterZ = config.midLength / 2 + config.tipTotalH / 2;
    const botCenterZ = -(config.midLength / 2 + config.botLength / 2);

    let midRender = baxterMiddleModel.translate([0, 0, 0]);
    let tipRender = baxterTipModel.translate([0, 0, tipCenterZ]);
    let botRender = baxterBottomModel.translate([0, 0, botCenterZ]);

    let temp = Manifold.union(midRender, tipRender);
    let cable = Manifold.union(temp, botRender);
    temp.delete();
    midRender.delete(); tipRender.delete(); botRender.delete();

    triggerSTLSave(cable, "Baxter_PD_Cable_Reference");
    cable.delete();
}

// Viewport buttons setup
function setViewMode(mode) {
    const elements = {
        btnRendered: document.getElementById('btn-mode-rendered'),
        btnBlueprint: document.getElementById('btn-mode-blueprint'),
        viewportContainer: document.getElementById('viewport-container')
    };
    viewer.setViewMode(mode, elements);
    requestUpdate();
}

document.getElementById('btn-mode-rendered').onclick = () => setViewMode('rendered');
document.getElementById('btn-mode-blueprint').onclick = () => setViewMode('blueprint');

// Initial setup parameters
function initParameters() {
    // Kinematics
    param("Explosion", 35, { min: 0, max: 100 }, "kinematics");
    param("Show Cable Reference", 1, { type: 'checkbox' }, "kinematics");
    param("Show Socket Slots", 1, { type: 'checkbox' }, "kinematics");
    param("Show Solid Templates", 0, { type: 'checkbox' }, "kinematics");

    // Reference
    param("Tip Cylinder Diam", 14.0, { min: 10.0, max: 20.0, step: 0.5 }, "baxter");
    param("Tip Flat Height", 11.5, { min: 8.0, max: 16.0, step: 0.5 }, "baxter");
    param("Tip Total Height", 16.0, { min: 10.0, max: 25.0, step: 0.5 }, "baxter");

    param("Middle Cylinder Diam", 14.0, { min: 10.0, max: 20.0, step: 0.5 }, "baxter");
    param("Middle Length", 24.0, { min: 15.0, max: 40.0, step: 1.0 }, "baxter");
    param("Groove Depth", 1.0, { min: 0.3, max: 2.0, step: 0.1 }, "baxter");
    param("Ridge Width", 6.0, { min: 3.0, max: 10.0, step: 0.5 }, "baxter");
    param("Number of Ridges", 4, { min: 2, max: 8, step: 1 }, "baxter");

    param("Bottom Top Diam", 15.0, { min: 12.0, max: 20.0, step: 0.5 }, "baxter");
    param("Bottom Bottom Diam", 16.0, { min: 12.0, max: 22.0, step: 0.5 }, "baxter");
    param("Bottom Length", 18.0, { min: 10.0, max: 35.0, step: 1.0 }, "baxter");

    // TPU
    param("Wall Thickness", 3.0, { min: 1.5, max: 8.0, step: 0.5 }, "tpu");
    param("Key Width", 0.0, { min: 0.0, max: 6.0, step: 0.5 }, "tpu");
    param("Key Depth", 0.0, { min: 0.0, max: 4.0, step: 0.1 }, "tpu");
    param("Key Count", 0, { min: 0, max: 8, step: 1 }, "tpu");
    param("Clamp Arm Length", 25.0, { min: 0.0, max: 60.0, step: 1.0 }, "tpu");
    param("Clamp Arm Width", 16.0, { min: 0.0, max: 40.0, step: 1.0 }, "tpu");

    // Notch
    param("Enable Center Notch", 1, { type: 'checkbox' }, "notch");
    param("Notch Width (X-axis)", 6.0, { min: 1.0, max: 20.0, step: 0.5 }, "notch");
    param("Notch Height (Z-axis)", 4.0, { min: 1.0, max: 15.0, step: 0.5 }, "notch");
    param("Notch Z Offset", 0.0, { min: -15.0, max: 15.0, step: 0.5 }, "notch");

    // Meta
    param("Fitting Tolerance", 0.25, { min: 0.1, max: 0.8, step: 0.05 }, "meta");
    param("Mesh Smoothness", 64, { min: 32, max: 128, step: 16 }, "meta");

    // Socket
    param("Socket Inner Diam", 11.7, { min: 9.0, max: 16.0, step: 0.1 }, "socket");
    param("Socket Depth", 12, { min: 6, max: 25, step: 1 }, "socket");
    param("Socket Wall Thickness", 4.0, { min: 2.0, max: 8.0, step: 0.5 }, "socket");
    param("Socket Handle Length", 140, { min: 45, max: 200 }, "socket");
    param("Socket Wrench Ring Diam", 30, { min: 10, max: 50 }, "socket");
    param("Socket Wrench Handle Thickness", 8.0, { min: 4.0, max: 20.0, step: 1.0 }, "socket");
    param("Handle Diameter", 19.05, { min: 10.0, max: 30.0, step: 0.5 }, "socket");
    param("Groove Width", 8.0, { min: 4.0, max: 15.0, step: 0.5 }, "socket");
    param("Groove Depth", 3.0, { min: 1.0, max: 8.0, step: 0.5 }, "socket");
    param("Card Guide Lip", 1.0, { min: 0.0, max: 3.0, step: 0.2 }, "socket");
}

async function init() {
    wasm = await Module();
    wasm.setup();
    Manifold = wasm.Manifold;

    viewer = initThreeViewer('viewer');
    initParameters();
    setViewMode('blueprint');
    viewer.animate();
}

// STL Export Bindings
document.getElementById('dl-mid-insert').onclick = () => exportInsert(tpu2_left, tpu2_right, "Baxter_PD_Socket_Half");
document.getElementById('dl-mid-solid').onclick = () => exportInsert(tpu2_left_solid, tpu2_right_solid, "Baxter_PD_Solid_Template");
document.getElementById('dl-bot-insert').onclick = () => exportInsert(tpu3_left, tpu3_right, "Baxter_PD_Bottom_Socket_Half");
document.getElementById('dl-bot-solid').onclick = () => exportInsert(tpu3_left_solid, tpu3_right_solid, "Baxter_PD_Bottom_Solid_Template");
document.getElementById('dl-cable').onclick = () => exportCable();
document.getElementById('dl-socket-wrench').onclick = () => triggerSTLSave(socketWrenchModel, "Baxter_PD_Socket_Wrench");

init();
