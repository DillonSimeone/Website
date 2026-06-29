import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';
import { modelToSTL } from '../../00-CommonParts/Exporter/stl.js';
import { initThreeViewer } from '../../00-CommonParts/viewer.js';
import Module from 'https://unpkg.com/manifold-3d/manifold.js';
import { generateLuerConnectors } from './luer/connectors.js';
import { generateUniversalWrench } from './luer/wrench.js';

let wasm, Manifold;
let viewer;

const PARAMS = {};
let currentMeshes = [];

// Cache models for export
let topPartModel = null;
let bottomPartModel = null;
let topWrenchModel = null;
let bottomWrenchModel = null;

// Initialize parameter system
const param = (name, defaultValue, options = {}, category = 'top') => {
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
    config.explosion = (PARAMS['explosion']?.value ?? 40) / 100;
    config.showWrenches = PARAMS['show-wrenches']?.value ?? 1;
    config.wrenchHandleLen = PARAMS['wrench-handle-length']?.value ?? 140;
    config.wrenchHandleW = PARAMS['wrench-handle-width']?.value ?? 22;
    config.wrenchThick = PARAMS['wrench-thickness']?.value ?? 6.0;
    config.entryAngle = PARAMS['entry-ramp-angle']?.value ?? 15;

    config.topSqW = PARAMS['square-width']?.value ?? 14;
    config.topSqD = PARAMS['square-depth']?.value ?? 8;
    config.topSqH = PARAMS['square-height']?.value ?? 16;
    config.topTubeD = PARAMS['top-tube-diam']?.value ?? 8;
    config.topCylW = PARAMS['collar-diam']?.value ?? 15.5;

    config.plugD = PARAMS['plug-cylinder-diam']?.value ?? 10;
    config.plugH = PARAMS['plug-cylinder-depth']?.value ?? 9;
    config.baseCylW = PARAMS['base-collar-diam']?.value ?? 20;
    config.baseCylD = PARAMS['base-collar-thick']?.value ?? 2;
    config.botCoreD = PARAMS['fins-core-diam']?.value ?? 8;
    config.finW = PARAMS['fin-width']?.value ?? 2.0;
    config.finD = PARAMS['fin-depth']?.value ?? 2.0;
    config.finH = PARAMS['fin-height']?.value ?? 10;
    config.botTubeD = PARAMS['bottom-tube-diam']?.value ?? 8;

    config.ringDiam = PARAMS['handle-ring-diameter']?.value ?? 30;
    
    config.handleDiam = PARAMS['handle-diameter']?.value ?? 19.05;
    config.grooveWidth = PARAMS['groove-width']?.value ?? 8.0;
    config.grooveDepth = PARAMS['groove-depth']?.value ?? 3.0;
    config.cardGuideLip = PARAMS['card-guide-lip']?.value ?? 1.0;

    config.tolerance = PARAMS['connector-tolerance']?.value ?? 0.25;
    config.quality = PARAMS['mesh-smoothness']?.value ?? 64;

    return config;
}

function cleanupGeometries() {
    const list = [topPartModel, bottomPartModel, topWrenchModel, bottomWrenchModel];
    list.forEach(m => { if (m) m.delete(); });
    topPartModel = bottomPartModel = topWrenchModel = bottomWrenchModel = null;
}

function generateModels() {
    cleanupGeometries();
    const config = getConfig();
    const q = config.quality;

    const data = generateLuerConnectors(Manifold, config, q);
    topPartModel = data.topPartModel;
    bottomPartModel = data.bottomPartModel;
    const topEdgeTubeMoved = data.topEdgeTubeMoved;
    const botEdgeTubeMoved = data.botEdgeTubeMoved;

    const wrenchData = generateUniversalWrench(Manifold, config, q);
    topWrenchModel = wrenchData.topWrenchModel;
    bottomWrenchModel = wrenchData.bottomWrenchModel;

    // Render assembly
    const viewMode = viewer.getViewMode();
    const explodeDist = config.explosion * 35.0;

    let visualTop = topPartModel.translate([0, 0, explodeDist]);
    let visualBot = bottomPartModel.translate([0, 0, -explodeDist]);
    let visualTopTube = topEdgeTubeMoved.translate([0, 0, explodeDist]);
    let visualBotTube = botEdgeTubeMoved.translate([0, 0, -explodeDist]);

    const mTop = viewer.manifoldToThreeMesh(visualTop, 0x06b6d4, 0.9);
    const mBot = viewer.manifoldToThreeMesh(visualBot, 0xd946ef, 0.9);

    let tubeMat = (viewMode === 'blueprint')
        ? new THREE.MeshBasicMaterial({ color: 0x07294d, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
        : new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, transmission: 0.85, roughness: 0.15, thickness: 1.0, side: THREE.DoubleSide });

    // Render top tube
    const mTopTubeMeshData = visualTopTube.getMesh();
    const mTopTubeGeo = new THREE.BufferGeometry();
    mTopTubeGeo.setAttribute('position', new THREE.Float32BufferAttribute(mTopTubeMeshData.vertProperties, 3));
    mTopTubeGeo.setIndex(new THREE.Uint32BufferAttribute(mTopTubeMeshData.triVerts, 1));
    mTopTubeGeo.computeVertexNormals();
    const mTopTubeMesh = new THREE.Mesh(mTopTubeGeo, tubeMat);

    // Render bottom tube
    const mBotTubeMeshData = visualBotTube.getMesh();
    const mBotTubeGeo = new THREE.BufferGeometry();
    mBotTubeGeo.setAttribute('position', new THREE.Float32BufferAttribute(mBotTubeMeshData.vertProperties, 3));
    mBotTubeGeo.setIndex(new THREE.Uint32BufferAttribute(mBotTubeMeshData.triVerts, 1));
    mBotTubeGeo.computeVertexNormals();
    const mBotTubeMesh = new THREE.Mesh(mBotTubeGeo, tubeMat);

    if (viewMode === 'blueprint') {
        const edgesTop = new THREE.EdgesGeometry(mTopTubeGeo);
        mTopTubeMesh.add(new THREE.LineSegments(edgesTop, new THREE.LineBasicMaterial({ color: 0x00f2ff, linewidth: 1 })));
        
        const edgesBot = new THREE.EdgesGeometry(mBotTubeGeo);
        mBotTubeMesh.add(new THREE.LineSegments(edgesBot, new THREE.LineBasicMaterial({ color: 0xffaa00, linewidth: 1 })));
    }

    viewer.scene.add(mTop); viewer.scene.add(mBot); viewer.scene.add(mTopTubeMesh); viewer.scene.add(mBotTubeMesh);
    currentMeshes.push(mTop, mBot, mTopTubeMesh, mBotTubeMesh);

    visualTop.delete(); visualBot.delete(); visualTopTube.delete(); visualBotTube.delete();
    topEdgeTubeMoved.delete(); botEdgeTubeMoved.delete();

    // Render Wrenches
    if (config.showWrenches) {
        const wrenchShiftZ = explodeDist + config.plugH + 3.0 + 8.0;
        let wTopVisual = topWrenchModel.rotate([0, 180, 0]).translate([0, 0, wrenchShiftZ]);
        let wBotVisual = bottomWrenchModel.translate([0, 0, -explodeDist - config.baseCylD - config.finH/2]);

        const mWTop = viewer.manifoldToThreeMesh(wTopVisual, 0xf97316, 0.95);
        const mWBot = viewer.manifoldToThreeMesh(wBotVisual, 0xf97316, 0.95);

        viewer.scene.add(mWTop); viewer.scene.add(mWBot);
        currentMeshes.push(mWTop, mWBot);

        wTopVisual.delete(); wBotVisual.delete();
    }
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

// STL Export Wrappers
function triggerSTLSave(model, filename) {
    if (!model) return;
    const stlContent = modelToSTL(model, filename);
    const blob = new Blob([stlContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${filename}.stl`; a.click();
    URL.revokeObjectURL(url);
}

// Viewport modes setup
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

function initParameters() {
    param("Explosion", 40, { min: 0, max: 100 }, "kinematics");
    param("Show Wrenches", 1, { type: 'checkbox' }, "kinematics");
    param("Wrench Handle Length", 140, { min: 45, max: 200 }, "kinematics");
    param("Wrench Handle Width", 22, { min: 8, max: 35 }, "kinematics");
    param("Wrench Thickness", 6.0, { min: 4.0, max: 20.0, step: 1.0 }, "kinematics");
    param("Entry Ramp Angle", 15, { min: 0, max: 45, step: 1 }, "kinematics");

    param("Square Width", 14, { min: 10, max: 25 }, "top");
    param("Square Depth", 8, { min: 4, max: 15 }, "top");
    param("Square Height", 16, { min: 10, max: 30 }, "top");
    param("Top Tube Diam", 8, { min: 5, max: 15 }, "top");
    param("Collar Diam", 15.5, { min: 10, max: 25, step: 0.5 }, "top");

    param("Plug Cylinder Diam", 10, { min: 6, max: 18 }, "bottom");
    param("Plug Cylinder Depth", 9, { min: 5, max: 15 }, "bottom");
    param("Base Collar Diam", 20, { min: 12, max: 30 }, "bottom");
    param("Base Collar Thick", 2, { min: 1, max: 8 }, "bottom");
    param("Fins Core Diam", 8, { min: 5, max: 15 }, "bottom");
    param("Fin Width", 2.0, { min: 0.8, max: 4, step: 0.1 }, "bottom");
    param("Fin Depth", 2.0, { min: 0.8, max: 4, step: 0.1 }, "bottom");
    param("Fin Height", 10, { min: 5, max: 20 }, "bottom");
    param("Bottom Tube Diam", 8, { min: 5, max: 15 }, "bottom");

    param("Handle Ring Diameter", 30, { min: 10, max: 50 }, "kinematics");
    param("Handle Diameter", 19.05, { min: 10.0, max: 30.0, step: 0.5 }, "kinematics");
    param("Groove Width", 8.0, { min: 4.0, max: 15.0, step: 0.5 }, "kinematics");
    param("Groove Depth", 3.0, { min: 1.0, max: 8.0, step: 0.5 }, "kinematics");
    param("Card Guide Lip", 1.0, { min: 0.0, max: 3.0, step: 0.2 }, "kinematics");

    param("Connector Tolerance", 0.25, { min: 0.1, max: 0.8, step: 0.05 }, "meta");
    param("Mesh Smoothness", 64, { min: 32, max: 128, step: 16 }, "meta");
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
document.getElementById('dl-top').onclick = () => triggerSTLSave(topPartModel, "Luer_PD_Top_Cable");
document.getElementById('dl-bottom').onclick = () => triggerSTLSave(bottomPartModel, "Luer_PD_Bottom_Cable");
document.getElementById('dl-wrench-universal').onclick = () => triggerSTLSave(topWrenchModel, "Luer_PD_Universal_Wrench");

init();
