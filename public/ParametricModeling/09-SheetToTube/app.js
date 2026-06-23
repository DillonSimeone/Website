import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Module from 'https://unpkg.com/manifold-3d/manifold.js';

let wasm, Manifold;
let scene, camera, renderer, controls;
let mainGroup; // Holds caps and sheet representation
let overlaySvg = document.getElementById('dimensions-overlay');

// Current parameters state
const params = {
    sheetWidth: 9.75,       // inches
    sheetHeight: 6.75,      // inches
    sheetThickness: 0.5,    // mm
    rollDirection: 'width', // 'width' or 'height'
    holeDiam: 25.0,         // mm
    lipDepth: 8.0,          // mm
    wallThick: 2.0,         // mm
    tolerance: 0.20,        // mm
    ledCount: 8,            // vertical channels
    ledWidth: 10.0,         // mm
    ledDepth: 5.0,          // mm
    slipRing: 'none',       // 'none', 'bottom', 'top', 'both'
    bracketCount: 2,        // number of M3 side brackets
    motorWheelDiam: 16.0,   // mm - pinion pitch diameter (default smaller for high torque)
    opacity: 90,
    mode: 'blueprint'       // 'rendered' or 'blueprint'
};

const visibilities = {
    topCap: true,
    bottomCap: true,
    sheet: true,
    brackets: true,
    motorHolder: true
};

// Meshes references
let bottomCapMesh = null;
let topCapMesh = null;
let sheetMesh = null;
let bracketMeshes = [];
let motorHolderMesh = null;
let pinionGearMesh = null;
let pinionGearMesh2 = null;
let ringGearMesh = null;
let connectorMesh = null;

// Colors (Neon Cyan Theme)
const colors = {
    cyanIce: 0x00f3ff,
    glowCyan: 0x00aaff,
    limeAccent: 0xc8ff00,
    sheetBlue: 0x00bfff,
    blueprintLine: 0x00f3ff,
    blueprintFace: 0x011218
};

// Setup the Scene
function init() {
    const container = document.getElementById('canvas3d');
    if (!container) return;

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x02090b, 0.0015);

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 2000);
    camera.position.set(180, 150, 220);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 50, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.15;
    controls.update();

    // Technical Blueprint Grid Helper
    const grid = new THREE.GridHelper(400, 40, 0x00f3ff, 0x002c33);
    grid.position.y = 0;
    scene.add(grid);

    // Lights
    const ambient = new THREE.AmbientLight(0x00222a, 2.0);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(100, 250, 150);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene.add(keyLight);

    const fillLight = new THREE.PointLight(0x00f3ff, 2.0, 300);
    fillLight.position.set(-100, 100, 50);
    scene.add(fillLight);

    const glowLight = new THREE.PointLight(0xc8ff00, 2.0, 150);
    glowLight.position.set(0, 0, 0);
    scene.add(glowLight);

    mainGroup = new THREE.Group();
    // Rotate the CAD coordinates to match Three.js (Z is up in CAD, Y is up in ThreeJS)
    mainGroup.rotation.x = -Math.PI / 2;
    scene.add(mainGroup);

    window.addEventListener('resize', onWindowResize);
    setupUIListeners();
    initManifold();
}

function onWindowResize() {
    const container = document.getElementById('canvas3d');
    if (!container) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

// Initialize Manifold WASM
async function initManifold() {
    try {
        wasm = await Module();
        wasm.setup();
        Manifold = wasm.Manifold;
        console.log("Manifold geometry engine active");
        rebuild();
        animate();
    } catch(e) {
        console.error("Failed to load Manifold WASM.", e);
        const status = document.querySelector('footer div.status-left span:last-child');
        if (status) status.textContent = "KERNEL FAILED TO LOAD";
    }
}

// Bind sliders, inputs and buttons to parameters
function setupUIListeners() {
    const bindSlider = (id, paramKey, isFloat = true) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', (e) => {
            const val = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value);
            params[paramKey] = val;
            const displayVal = document.getElementById('val-' + paramKey);
            if (displayVal) displayVal.innerText = isFloat ? val.toFixed(paramKey === 'tolerance' ? 2 : 1) : val;
            rebuild();
        });
    };

    const bindNumberInput = (id, paramKey) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', (e) => {
            let val = parseFloat(e.target.value);
            if (isNaN(val) || val <= 0) val = 1.0;
            params[paramKey] = val;
            rebuild();
        });
    };

    // Sliders
    bindSlider('input-holeDiam', 'holeDiam');
    bindSlider('input-lipDepth', 'lipDepth');
    bindSlider('input-wallThick', 'wallThick');
    bindSlider('input-tolerance', 'tolerance');
    bindSlider('input-opacity', 'opacity', false);

    // Number fields
    bindNumberInput('input-sheetWidth', 'sheetWidth');
    bindNumberInput('input-sheetHeight', 'sheetHeight');
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
            rebuild();
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
            rebuild();
        });
    });

    // Render Mode Buttons
    document.getElementById('btn-render-mode').addEventListener('click', () => {
        document.getElementById('btn-render-mode').classList.add('active');
        document.getElementById('btn-blueprint-mode').classList.remove('active');
        params.mode = 'rendered';
        rebuild();
    });
    document.getElementById('btn-blueprint-mode').addEventListener('click', () => {
        document.getElementById('btn-blueprint-mode').classList.add('active');
        document.getElementById('btn-render-mode').classList.remove('active');
        params.mode = 'blueprint';
        rebuild();
    });

    // Visibility toggles
    const bindVisibility = (id, key) => {
        document.getElementById(id).addEventListener('change', (e) => {
            visibilities[key] = e.target.checked;
            rebuild();
        });
    };
    bindVisibility('show-topCap', 'topCap');
    bindVisibility('show-bottomCap', 'bottomCap');
    bindVisibility('show-sheet', 'sheet');
    bindVisibility('show-brackets', 'brackets');
    const motorToggle = document.getElementById('show-motorHolder');
    if (motorToggle) bindVisibility('show-motorHolder', 'motorHolder');

    // Export STL
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

// Math/Geometry creation helpers
function makeCSGCylinder(r, h, x, y, z) {
    let cyl = Manifold.cylinder(h, r, r, 64, true);
    if (x !== 0 || y !== 0 || z !== 0) {
        let translated = cyl.translate([x, y, z]);
        cyl.delete();
        cyl = translated;
    }
    return cyl;
}

function manifoldToThree(manifoldMesh) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(manifoldMesh.vertProperties, 3));
    geometry.setIndex(new THREE.Uint32BufferAttribute(manifoldMesh.triVerts, 1));
    geometry.computeVertexNormals();
    return geometry;
}

// Generate the cap using Manifold WASM
function generateCapGeometry(D_in, D_out, hasSlipRing, isTopCap = false) {
    if (!Manifold) return null;

    const c = params.tolerance;
    const T_cap = params.wallThick;
    const H_lip = params.lipDepth;
    const H_cap = H_lip + T_cap;

    // Groove boundaries
    const R_g_out = (D_out / 2) + c;
    const R_g_in = (D_in / 2) - c;

    // Cap boundaries
    const R_cap_out = R_g_out + T_cap;
    const R_cap_in = Math.max(0.1, R_g_in - T_cap);

    // Center Hole Radius (Slip ring overrides to 13mm diameter / 6.5mm radius)
    const R_hole = hasSlipRing ? 6.5 : (params.holeDiam / 2);

    // 1. Create outer body solid
    let capBody = makeCSGCylinder(R_cap_out, H_cap, 0, 0, H_cap / 2);

    // 2. Subtract LED strip channels on the inner lip
    if (params.ledCount > 0) {
        const count = params.ledCount;
        const w = params.ledWidth;
        const d = params.ledDepth;
        for (let i = 0; i < count; i++) {
            const theta = (i * 2 * Math.PI) / count;
            // Create channel box centered at origin
            let box = Manifold.cube([w, d, H_cap + 2.0], true);
            // Translate it radially to the outer edge of inner lip (R_g_in)
            let translated = box.translate([0, R_g_in - d / 2, H_cap / 2]);
            // Rotate around center axis
            let rotated = translated.rotate([0, 0, (theta * 180) / Math.PI]);
            box.delete();
            translated.delete();

            // Subtract from main body
            let tempBody = capBody.subtract(rotated);
            capBody.delete();
            rotated.delete();
            capBody = tempBody;
        }
    }

    // 2.5 Add Side Bracket Tabs and subtract vertical M3 screw holes (radius 1.5mm)
    // Positioned halfway between the LED channels to prevent intersection
    if (params.bracketCount > 0) {
        const count = params.bracketCount;
        const offsetAngle = params.ledCount > 0 ? (Math.PI / params.ledCount) : 0;
        const holeRad = 1.5; // M3 screw pilot radius (3.0mm diameter)
        const tabRad = 4.5;  // Tab radius (9.0mm diameter for solid bracket mount)

        // Union the solid tabs to the cap body first
        for (let j = 0; j < count; j++) {
            const theta = (j * 2 * Math.PI) / count + offsetAngle;
            const actualTheta = isTopCap ? -theta : theta;
            // Create tab cylinder shifted 8mm inward (further inland to avoid damaging lips)
            let tab = makeCSGCylinder(tabRad, H_cap, R_cap_out - 8.0, 0, H_cap / 2);
            let rotatedTab = tab.rotate([0, 0, (actualTheta * 180) / Math.PI]);
            tab.delete();

            let tempBody = capBody.add(rotatedTab);
            capBody.delete();
            rotatedTab.delete();
            capBody = tempBody;
        }

        // Subtract the vertical screw pilot holes through the tabs (cutting completely through caps)
        for (let j = 0; j < count; j++) {
            const theta = (j * 2 * Math.PI) / count + offsetAngle;
            const actualTheta = isTopCap ? -theta : theta;
            let hole = makeCSGCylinder(holeRad, H_cap + 2.0, R_cap_out - 8.0, 0, H_cap / 2);
            let rotatedHole = hole.rotate([0, 0, (actualTheta * 180) / Math.PI]);
            hole.delete();

            let tempBody = capBody.subtract(rotatedHole);
            capBody.delete();
            rotatedHole.delete();
            capBody = tempBody;
        }
    }

    // 3. Create groove cut solid (groove outer cylinder - groove inner cylinder)
    let grOuter = makeCSGCylinder(R_g_out, H_lip + 1.0, 0, 0, T_cap + (H_lip + 1.0) / 2);
    let grInner = makeCSGCylinder(R_g_in, H_lip + 2.0, 0, 0, T_cap + (H_lip + 1.0) / 2);
    let groove = grOuter.subtract(grInner);
    grOuter.delete();
    grInner.delete();

    // 4. Create central cavity cutout (hollow out the inside of the inner lip)
    // Starts at Z = T_cap (bottom plate thickness) and goes out of the top
    let cavity = makeCSGCylinder(R_cap_in, H_lip + 1.0, 0, 0, T_cap + (H_lip + 1.0) / 2);

    // 5. Create center hole cut solid
    let hole = makeCSGCylinder(R_hole, H_cap + 2.0, 0, 0, H_cap / 2);

    // 6. Subtract groove, cavity, and hole from body
    let temp1 = capBody.subtract(groove);
    capBody.delete();
    groove.delete();

    let temp2 = temp1.subtract(cavity);
    temp1.delete();
    cavity.delete();

    let finalizedCap = temp2.subtract(hole);
    temp2.delete();
    hole.delete();

    return finalizedCap;
}

// Generate a C-shaped seam-securing bracket using Manifold WASM
function generateBracketGeometry(D_out, tubeHeight_mm) {
    if (!Manifold) return null;

    const T_cap = params.wallThick;
    const R_g_out = (D_out / 2) + params.tolerance;
    const R_cap_out = R_g_out + T_cap;
    const H_bracket = tubeHeight_mm + 2 * T_cap;

    // 1. Vertical bar on the side of the caps (extended by 6mm to prevent top/bottom notches)
    // Thicken the bar so it extends inwards from the outer edge (R_cap_out + 3.0) to touch the cylinder outer surface (D_out / 2)
    const W_vert = (R_cap_out + 3.0) - (D_out / 2);
    let vertBar = Manifold.cube([W_vert, 8.0, H_bracket + 6.0], true);
    let vertBarTrans = vertBar.translate([(D_out / 2) + W_vert / 2, 0, H_bracket / 2]);
    vertBar.delete();

    // 2. Top arm extending inwards over the top cap (extended to 12.0mm length radially to cover the inland hole)
    let topArm = Manifold.cube([12.0, 8.0, 3.0], true);
    let topArmTrans = topArm.translate([R_cap_out - 4.5, 0, H_bracket + 1.5]);
    topArm.delete();

    // 3. Bottom arm extending inwards under the bottom cap (extended)
    let bottomArm = Manifold.cube([12.0, 8.0, 3.0], true);
    let bottomArmTrans = bottomArm.translate([R_cap_out - 4.5, 0, -1.5]);
    bottomArm.delete();

    // Union vertical bar and arms
    let temp1 = vertBarTrans.add(topArmTrans);
    vertBarTrans.delete();
    topArmTrans.delete();

    let bracketBody = temp1.add(bottomArmTrans);
    temp1.delete();
    bottomArmTrans.delete();

    // Subtract vertical screw holes (radius 1.5mm) shifted 8mm inward to avoid damaging lips
    let topHole = makeCSGCylinder(1.5, 10.0, R_cap_out - 8.0, 0, H_bracket + 1.5);
    let bottomHole = makeCSGCylinder(1.5, 10.0, R_cap_out - 8.0, 0, -1.5);

    let temp2 = bracketBody.subtract(topHole);
    bracketBody.delete();
    topHole.delete();

    let temp3 = temp2.subtract(bottomHole);
    temp2.delete();
    bottomHole.delete();

    // 4. Subtract Cap and Cylinder geometries to prevent clipping
    const L_mm = params.rollDirection === 'width' ? params.sheetWidth * 25.4 : params.sheetHeight * 25.4;
    const D_mid = L_mm / Math.PI;
    const D_in = D_mid - params.sheetThickness;

    // Generate cap volumes for subtraction (top cap must be generated with isTopCap=true so its slots align with the viewport top cap)
    let capB = generateCapGeometry(D_in, D_out, false, false);
    let capT = generateCapGeometry(D_in, D_out, false, true);
    
    // Position Top Cap volume (flipped and translated)
    let capTRot = capT.rotate([180, 0, 0]);
    let capTTrans = capTRot.translate([0, 0, tubeHeight_mm + 2 * T_cap]);
    capT.delete();
    capTRot.delete();

    // Subtract caps
    let temp4 = temp3.subtract(capB);
    temp3.delete();
    capB.delete();

    let temp5 = temp4.subtract(capTTrans);
    temp4.delete();
    capTTrans.delete();

    // Subtract Sheet Cylinder (slightly larger radius for fit/clearance subtraction)
    let sheetCutout = makeCSGCylinder(D_out / 2, tubeHeight_mm, 0, 0, T_cap + tubeHeight_mm / 2);
    let finalizedBracket = temp5.subtract(sheetCutout);
    temp5.delete();
    sheetCutout.delete();

    return finalizedBracket;
}

// Type 130 DC Motor dimensions (mm)
const MOTOR_130 = {
    bodyLength: 27.5,   // along shaft axis
    bodyWidth: 20.0,    // perpendicular to shaft (wider side)
    bodyHeight: 15.0,   // perpendicular to shaft (flat side)
    shaftDiam: 2.0,
    shaftLength: 9.0,
    mountTolerance: 0.3 // clearance around motor body
};

// 隨鞘ぎ隨鞘ぎ隨鞘ぎ Generic Spur Gear Generator (chamfered/involute-like teeth for smooth engagement) 隨鞘ぎ隨鞘ぎ隨鞘ぎ
// Returns a Manifold gear disc with `numTeeth` tapered teeth, centered at origin
function createSpurGear(mod, numTeeth, thickness, boreRadius) {
    if (!Manifold) return null;

    const pitchR = (numTeeth * mod) / 2;
    const addendum = mod;                       // tooth height above pitch circle
    const dedendum = mod * 0.6;                 // cut depth below pitch circle (shallow for strength)
    const outerR = pitchR + addendum;           // tooth tip radius
    const rootR = pitchR - dedendum;            // tooth root radius
    const toothArcWidth = mod * 0.45 * Math.PI; // tooth width at pitch circle

    // 1. Base cylinder at root diameter
    let gear = makeCSGCylinder(rootR, thickness, 0, 0, thickness / 2);

    // 2. Add each tooth as a tapered block
    for (let i = 0; i < numTeeth; i++) {
        const angle = (i * 2 * Math.PI) / numTeeth;
        const toothH = outerR - rootR;

        let tooth = Manifold.cube([toothH, toothArcWidth, thickness], true);
        
        // Chamfer/taper the outer corners of the tooth tip for smooth engagement
        const chamferSize = mod * 0.3; // chamfer for smooth meshing
        let cut1 = Manifold.cube([chamferSize * 2, chamferSize * 2, thickness + 2], true);
        let cut1Rot = cut1.rotate([0, 0, 45]);
        cut1.delete();
        let cut1Trans = cut1Rot.translate([toothH / 2, toothArcWidth / 2, 0]);
        cut1Rot.delete();
        
        let cut2 = Manifold.cube([chamferSize * 2, chamferSize * 2, thickness + 2], true);
        let cut2Rot = cut2.rotate([0, 0, 45]);
        cut2.delete();
        let cut2Trans = cut2Rot.translate([toothH / 2, -toothArcWidth / 2, 0]);
        cut2Rot.delete();
        
        let temp1 = tooth.subtract(cut1Trans);
        tooth.delete();
        cut1Trans.delete();
        
        let temp2 = temp1.subtract(cut2Trans);
        temp1.delete();
        cut2Trans.delete();
        tooth = temp2;

        let toothTrans = tooth.translate([rootR + toothH / 2, 0, thickness / 2]);
        tooth.delete();
        let toothRot = toothTrans.rotate([0, 0, (angle * 180) / Math.PI]);
        toothTrans.delete();

        let temp = gear.add(toothRot);
        gear.delete();
        toothRot.delete();
        gear = temp;
    }

    // 3. Subtract center bore
    if (boreRadius > 0) {
        let bore = makeCSGCylinder(boreRadius, thickness + 2, 0, 0, thickness / 2);
        let temp = gear.subtract(bore);
        gear.delete();
        bore.delete();
        gear = temp;
    }

    return gear;
}

function generateRingGearGeometry(D_out) {
    if (!Manifold) return null;

    const mod = 2.0;          // gear module
    const ringThick = 6.0;    // radial wall thickness of the ring body
    const gearHeight = 10.0;  // axial height of the ring body
    const toothHeight = 4.0;  // height of teeth at the bottom

    const T_cap = params.wallThick;
    const c = params.tolerance;
    const R_g_out = (D_out / 2) + c;
    const R_cap_out = R_g_out + T_cap;

    // Ring dimensions (innerR has 1.0mm radial clearance to clear bottom cap and motor housing)
    const innerR = R_cap_out + 1.0;
    const bodyOuterR = innerR + ringThick;
    const ringCenterR = innerR + ringThick / 2;

    // Calculate number of teeth based on circumference at ringCenterR
    const pitchCircum = 2 * Math.PI * ringCenterR;
    const numTeeth = Math.round(pitchCircum / (mod * Math.PI));

    // 1. Create the solid ring body
    let outerCyl = makeCSGCylinder(bodyOuterR, gearHeight, 0, 0, gearHeight / 2);
    let innerCyl = makeCSGCylinder(innerR, gearHeight + 2, 0, 0, gearHeight / 2);
    let ring = outerCyl.subtract(innerCyl);
    outerCyl.delete();
    innerCyl.delete();

    // 2. Add each tooth as a tapered block pointing downwards
    const pitchAngle = (2 * Math.PI) / numTeeth;
    const toothArcWidth = mod * 0.45 * Math.PI;

    for (let j = 0; j < numTeeth; j++) {
        const theta = j * pitchAngle;
        
        // Tooth block centered at origin
        let tooth = Manifold.cube([ringThick, toothArcWidth, toothHeight], true);

        // Chamfer the corners at the bottom tip (Z = toothHeight / 2 in local cube coordinates)
        const chamferSize = mod * 0.3; // 0.6mm chamfer
        let cut1 = Manifold.cube([ringThick + 2.0, chamferSize * 2, chamferSize * 2], true);
        let cut1Rot = cut1.rotate([45, 0, 0]); // rotate around X-axis by 45 deg
        cut1.delete();
        let cut1Trans = cut1Rot.translate([0, toothArcWidth / 2, -toothHeight / 2]);
        cut1Rot.delete();

        let cut2 = Manifold.cube([ringThick + 2.0, chamferSize * 2, chamferSize * 2], true);
        let cut2Rot = cut2.rotate([45, 0, 0]);
        cut2.delete();
        let cut2Trans = cut2Rot.translate([0, -toothArcWidth / 2, -toothHeight / 2]);
        cut2Rot.delete();

        let temp1 = tooth.subtract(cut1Trans);
        tooth.delete();
        cut1Trans.delete();

        let temp2 = temp1.subtract(cut2Trans);
        temp1.delete();
        cut2Trans.delete();
        tooth = temp2;

        // Translate the tooth to ringCenterR and pointing downwards (from Z = 0 to Z = -4.0)
        let toothTrans = tooth.translate([ringCenterR, 0, -toothHeight / 2]);
        tooth.delete();
        
        let toothRot = toothTrans.rotate([0, 0, (theta * 180) / Math.PI]);
        toothTrans.delete();

        let temp = ring.add(toothRot);
        ring.delete();
        toothRot.delete();
        ring = temp;
    }

    // 3. Cut notches for the bracket vertical bars to pass through (must cut through both the gear body and the teeth)
    const count = params.bracketCount;
    const offsetAngle = params.ledCount > 0 ? (Math.PI / params.ledCount) : 0;
    const notchHeight = gearHeight + toothHeight + 2.0;

    for (let j = 0; j < count; j++) {
        const theta = (j * 2 * Math.PI) / count + offsetAngle;
        // Bracket bar notch - tangential width 8.4mm, radial depth 4.3mm
        let notch = Manifold.cube([4.3, 8.4, notchHeight], true);
        let notchTrans = notch.translate([R_cap_out - 1.0 + 2.15, 0, (gearHeight - toothHeight) / 2]);
        let notchRot = notchTrans.rotate([0, 0, (theta * 180) / Math.PI]);
        notch.delete();
        notchTrans.delete();

        let temp = ring.subtract(notchRot);
        ring.delete();
        notchRot.delete();
        ring = temp;
    }

    return ring;
}

function generateMotorHolderGeometry(D_in, D_out) {
    if (!Manifold) return null;

    const T_cap = params.wallThick;
    const c = params.tolerance;
    const R_g_out = (D_out / 2) + c;
    const R_cap_out = R_g_out + T_cap;

    const wallT = 3.0;

    // Motor dimensions - motor is HORIZONTAL (shaft along X-axis)
    const mBodyL = MOTOR_130.bodyLength + MOTOR_130.mountTolerance * 2; // X size of pocket
    const mBodyW = MOTOR_130.bodyWidth + MOTOR_130.mountTolerance * 2;  // Y size of pocket (tangential)
    const mBodyH = MOTOR_130.bodyHeight + MOTOR_130.mountTolerance * 2; // Z size of pocket (axial)

    // Holder height parameters
    const holderHeight = 16.0;

    // Calculate gear mesh distance
    const mod = 2.0;
    const ringThick = 6.0;
    const ringInnerR = R_cap_out;
    const ringBodyOuterR = ringInnerR + ringThick;
    const ringCenterR = ringBodyOuterR - ringThick / 2;
    
    // Motor shaft sits at global Z = -13.0 (under the Z = -3.0 ring gear bottom face)
    const shaftZ_l = 4.0;
    const motorPocketCenterX = (ringCenterR - 5.0) - mBodyL / 2;

    // 1. Outer cylinder body (radius R_cap_out, local Z range 0.0 to 16.0)
    let body = makeCSGCylinder(R_cap_out, holderHeight, 0, 0, holderHeight / 2);

    // 2. Hollow out the entire inside (radius 0 to R_cap_out - wallT, local Z = -6.2 to 16.2)
    // This makes the motor holder a completely hollow cylinder shell before adding U-holder blocks
    let hollowCyl = makeCSGCylinder(R_cap_out - wallT, 22.4, 0, 0, 5.0);
    let temp = body.subtract(hollowCyl);
    body.delete();
    hollowCyl.delete();
    body = temp;

    // 3. Add localized motor U-holder blocks with thick side walls (local Z range -4.0 to 16.0)
    let uHolder = Manifold.cube([mBodyL + 2.0, mBodyW + 10.0, 20.0], true);
    let uTrans1 = uHolder.translate([motorPocketCenterX, 0, 6.0]);
    let uTrans2 = uHolder.translate([-motorPocketCenterX, 0, 6.0]);
    uHolder.delete();

    let tempBody = body.add(uTrans1);
    body.delete();
    uTrans1.delete();

    let tempBody2 = tempBody.add(uTrans2);
    tempBody.delete();
    uTrans2.delete();
    body = tempBody2;

    // 4. Add the hollow central shaft tube extending from local Z = -6.0 to 16.0 (cutting off at the bottom)
    // (Total height 22.0, centered at Z = 5.0, radius 7.0 to 13.0)
    let shaftOuter = makeCSGCylinder(13.0, 22.0, 0, 0, 5.0);
    let shaftInner = makeCSGCylinder(7.0, 24.0, 0, 0, 5.0);
    let shaftTube = shaftOuter.subtract(shaftInner);
    shaftOuter.delete();
    shaftInner.delete();

    let tempBodyS = body.add(shaftTube);
    body.delete();
    shaftTube.delete();
    body = tempBodyS;

    // 5. Add connecting bridges (webs) at the bottom (local Z = 12.0 to 16.0) to join shaft with motor boxes
    let bridge = Manifold.cube([11.0, mBodyW, 4.0], true);
    let bridgeTrans1 = bridge.translate([18.5, 0, 14.0]); // joins shaft (R=13) to pocket
    let bridgeTrans2 = bridge.translate([-18.5, 0, 14.0]);
    bridge.delete();

    let tempBodyB1 = body.add(bridgeTrans1);
    body.delete();
    bridgeTrans1.delete();

    let tempBodyB2 = tempBodyB1.add(bridgeTrans2);
    tempBodyB1.delete();
    bridgeTrans2.delete();
    body = tempBodyB2;

    // 6. Subtract horizontal motor pockets from the body (Z = -18.2 to 11.8)
    // Leaving a solid bottom floor (from 11.8 to 16.0) and thick side walls on the Y sides
    let motorPocket = Manifold.cube([mBodyL, mBodyW, 30.0], true);
    let motorPocketTrans1 = motorPocket.translate([motorPocketCenterX, 0, shaftZ_l - 15.0 + mBodyH / 2]);
    let motorPocketTrans2 = motorPocket.translate([-motorPocketCenterX, 0, shaftZ_l - 15.0 + mBodyH / 2]);
    motorPocket.delete();

    temp = body.subtract(motorPocketTrans1);
    body.delete();
    motorPocketTrans1.delete();
    body = temp;

    temp = body.subtract(motorPocketTrans2);
    body.delete();
    motorPocketTrans2.delete();
    body = temp;

    // 4.5. Subtract U-shaped horizontal shaft slots through the outer wall (open to the top)
    const shaftHoleR = MOTOR_130.shaftDiam / 2 + 0.5;
    let cyl = Manifold.cylinder(30.0, shaftHoleR, shaftHoleR, 16, true);
    let cylRot = cyl.rotate([0, 90, 0]);
    cyl.delete();

    let box = Manifold.cube([30.0, shaftHoleR * 2, 14.0], true);
    let boxTrans = box.translate([0, 0, -3.0]); // Z goes from -10.0 to 4.0
    box.delete();

    let shaftSlot = cylRot.add(boxTrans);
    cylRot.delete();
    boxTrans.delete();

    let shaftSlotTrans1 = shaftSlot.translate([ringCenterR - 5.0, 0, shaftZ_l]);
    let shaftSlotTrans2 = shaftSlot.translate([-(ringCenterR - 5.0), 0, shaftZ_l]);
    shaftSlot.delete();

    temp = body.subtract(shaftSlotTrans1);
    body.delete();
    shaftSlotTrans1.delete();
    body = temp;

    temp = body.subtract(shaftSlotTrans2);
    body.delete();
    shaftSlotTrans2.delete();
    body = temp;

    // 5. Subtract horizontal M3 retaining screw holes through the side walls (along Y-axis, at Z = 0.0)
    let screwHole = Manifold.cylinder(mBodyW + 15.0, 1.5, 1.5, 16, true);
    let screwHoleRot = screwHole.rotate([90, 0, 0]);
    screwHole.delete();

    let sh1 = screwHoleRot.translate([motorPocketCenterX - 8.0, 0, 0.0]);
    let sh2 = screwHoleRot.translate([motorPocketCenterX + 8.0, 0, 0.0]);
    let sh3 = screwHoleRot.translate([-(motorPocketCenterX - 8.0), 0, 0.0]);
    let sh4 = screwHoleRot.translate([-(motorPocketCenterX + 8.0), 0, 0.0]);
    screwHoleRot.delete();

    temp = body.subtract(sh1); body.delete(); sh1.delete(); body = temp;
    temp = body.subtract(sh2); body.delete(); sh2.delete(); body = temp;
    temp = body.subtract(sh3); body.delete(); sh3.delete(); body = temp;
    temp = body.subtract(sh4); body.delete(); sh4.delete(); body = temp;



    // 8. Subtract a diamond-shaped tunnel horizontally through the central shaft and outer wall at local Z = 16.0
    // (runs along Y-axis, side length 10.0, rotated 45 degrees around Y)
    let tunnel = Manifold.cube([10.0, R_cap_out * 2 + 10.0, 10.0], true);
    let tunnelRot = tunnel.rotate([0, 45, 0]);
    tunnel.delete();
    let tunnelTrans = tunnelRot.translate([0, 0, 16.0]);
    tunnelRot.delete();

    temp = body.subtract(tunnelTrans);
    body.delete();
    tunnelTrans.delete();
    body = temp;

    // 9. Subtract three M3 screw holes for the slip ring flange (Z = -6.0 to 0.2)
    for (let i = 0; i < 3; i++) {
        const theta = (i * 2 * Math.PI) / 3;
        const hx = 9.0 * Math.cos(theta);
        const hy = 9.0 * Math.sin(theta);
        let screwHole = makeCSGCylinder(1.5, 6.2, hx, hy, -2.9);
        let tempBodyH = body.subtract(screwHole);
        body.delete();
        screwHole.delete();
        body = tempBodyH;
    }

    return body;
}

function generateConnectorGeometry(D_in, D_out) {
    if (!Manifold) return null;

    const c = params.tolerance;
    
    // Upward guide sleeve: outer radius 6.5 - c, inner radius 5.0, Z = 0.0 to 15.0
    const sleeveR_out = 6.5 - c;
    const sleeveR_in = 5.0;
    let upSleeve = makeCSGCylinder(sleeveR_out, 15.0, 0, 0, 7.5);
    let upHole = makeCSGCylinder(sleeveR_in, 17.0, 0, 0, 7.5);
    let sleeve = upSleeve.subtract(upHole);
    upSleeve.delete();
    upHole.delete();

    // Middle/bottom flange: outer radius 13.0, inner radius 5.0, Z = -3.0 to 0.0
    let flangeCyl = makeCSGCylinder(13.0, 3.0, 0, 0, -1.5);
    let flangeHole = makeCSGCylinder(sleeveR_in, 5.0, 0, 0, -1.5);
    let flange = flangeCyl.subtract(flangeHole);
    flangeCyl.delete();
    flangeHole.delete();

    // Downward plug: outer radius 7.0 - c, inner radius 5.0, Z = -6.0 to -3.0
    const plugR_out = 7.0 - c;
    let plugCyl = makeCSGCylinder(plugR_out, 3.0, 0, 0, -4.5);
    let plugHole = makeCSGCylinder(sleeveR_in, 5.0, 0, 0, -4.5);
    let plug = plugCyl.subtract(plugHole);
    plugCyl.delete();
    plugHole.delete();

    // Union sleeve, flange, and plug
    let temp1 = sleeve.add(flange);
    sleeve.delete();
    flange.delete();

    let connector = temp1.add(plug);
    temp1.delete();
    plug.delete();

    // Subtract three M3 screw holes in the flange (radius 1.5 at radius 9.0)
    for (let i = 0; i < 3; i++) {
        const theta = (i * 2 * Math.PI) / 3;
        const hx = 9.0 * Math.cos(theta);
        const hy = 9.0 * Math.sin(theta);
        let screwHole = makeCSGCylinder(1.5, 8.0, hx, hy, -3.0);
        let tempConnector = connector.subtract(screwHole);
        connector.delete();
        screwHole.delete();
        connector = tempConnector;
    }

    return connector;
}

// 隨鞘ぎ隨鞘ぎ隨鞘ぎ Pinion Gear (on motor shaft) 隨鞘ぎ隨鞘ぎ隨鞘ぎ
function generatePinionGearGeometry() {
    if (!Manifold) return null;

    const mod = 2.0;       // same module as ring gear
    const numTeeth = Math.max(6, Math.round(params.motorWheelDiam / mod));
    const thickness = 8.0; // mm
    const boreR = MOTOR_130.shaftDiam / 2 + 0.1;

    return createSpurGear(mod, numTeeth, thickness, boreR);
}


// Rebuild the 3D Viewport representation
function rebuild() {
    // Clear old meshes
    if (bottomCapMesh) {
        mainGroup.remove(bottomCapMesh);
        bottomCapMesh.geometry.dispose();
        bottomCapMesh = null;
    }
    if (topCapMesh) {
        mainGroup.remove(topCapMesh);
        topCapMesh.geometry.dispose();
        topCapMesh = null;
    }
    if (sheetMesh) {
        mainGroup.remove(sheetMesh);
        sheetMesh.geometry.dispose();
        sheetMesh = null;
    }
    if (motorHolderMesh) {
        mainGroup.remove(motorHolderMesh);
        motorHolderMesh.geometry.dispose();
        motorHolderMesh = null;
    }
    if (pinionGearMesh) {
        mainGroup.remove(pinionGearMesh);
        pinionGearMesh.geometry.dispose();
        pinionGearMesh = null;
    }
    if (pinionGearMesh2) {
        mainGroup.remove(pinionGearMesh2);
        pinionGearMesh2.geometry.dispose();
        pinionGearMesh2 = null;
    }
    if (ringGearMesh) {
        mainGroup.remove(ringGearMesh);
        ringGearMesh.geometry.dispose();
        ringGearMesh = null;
    }
    if (connectorMesh) {
        mainGroup.remove(connectorMesh);
        connectorMesh.geometry.dispose();
        connectorMesh = null;
    }

    if (!Manifold) return;

    const hasSlipRingBottom = params.slipRing === 'bottom' || params.slipRing === 'both';
    const hasSlipRingTop = params.slipRing === 'top' || params.slipRing === 'both';

    // 1. Perform Math calculations
    const w_in = params.sheetWidth;
    const h_in = params.sheetHeight;
    const t_mm = params.sheetThickness;
    const t_in = t_mm / 25.4;

    // Wrapping dimension L in mm
    let L_mm, tubeHeight_mm, rollLabel;
    if (params.rollDirection === 'width') {
        L_mm = w_in * 25.4;
        tubeHeight_mm = h_in * 25.4;
        rollLabel = `Width (${w_in.toFixed(2)}")`;
    } else {
        L_mm = h_in * 25.4;
        tubeHeight_mm = w_in * 25.4;
        rollLabel = `Height (${h_in.toFixed(2)}")`;
    }

    // Dynamic roll button label updates
    const lblWidth = document.getElementById('label-rollWidth');
    if (lblWidth) lblWidth.innerText = `ROLL WIDTH (${w_in.toFixed(2)}")`;
    const lblHeight = document.getElementById('label-rollHeight');
    if (lblHeight) lblHeight.innerText = `ROLL HEIGHT (${h_in.toFixed(2)}")`;

    // Midline (neutral axis), Outer, Inner Diameters
    const D_mid = L_mm / Math.PI;
    const D_out = D_mid + t_mm;
    const D_in = D_mid - t_mm;

    // Cap design dimensions
    const c = params.tolerance;
    const T_cap = params.wallThick;
    const R_g_out = (D_out / 2) + c;
    const R_g_in = (D_in / 2) - c;
    const R_cap_out = R_g_out + T_cap;
    const R_cap_in = Math.max(0.1, R_g_in - T_cap);

    // Limit maximum center hole size to prevent self-intersection of cap
    const maxHoleDiam = Math.max(0, R_cap_in * 2 - 1.0);
    const holeSlider = document.getElementById('input-holeDiam');
    if (holeSlider) {
        holeSlider.max = Math.ceil(maxHoleDiam);
        if (params.holeDiam > maxHoleDiam) {
            params.holeDiam = Math.min(params.holeDiam, maxHoleDiam);
            document.getElementById('val-holeDiam').innerText = params.holeDiam.toFixed(1);
            holeSlider.value = params.holeDiam;
        }
    }

    // 2. Update Spec sheets in UI
    document.getElementById('spec-circumference').innerText = `${L_mm.toFixed(2)} mm (${(L_mm / 25.4).toFixed(3)}")`;
    document.getElementById('spec-dmid').innerText = `${D_mid.toFixed(2)} mm (${(D_mid / 25.4).toFixed(3)}")`;
    document.getElementById('spec-dout').innerText = `${D_out.toFixed(2)} mm (${(D_out / 25.4).toFixed(3)}")`;
    document.getElementById('spec-din').innerText = `${D_in.toFixed(2)} mm (${(D_in / 25.4).toFixed(3)}")`;
    document.getElementById('spec-height').innerText = `${tubeHeight_mm.toFixed(2)} mm (${(tubeHeight_mm / 25.4).toFixed(3)}")`;
    document.getElementById('spec-cap-od').innerText = `${(R_cap_out * 2).toFixed(2)} mm`;

    // 3. Materials
    let bodyMat, lineColor;
    if (params.mode === 'rendered') {
        bodyMat = new THREE.MeshPhysicalMaterial({
            color: colors.cyanIce,
            emissive: 0x001a22,
            roughness: 0.1,
            metalness: 0.1,
            transmission: 0.75,
            thickness: T_cap,
            clearcoat: 1.0,
            clearcoatRoughness: 0.1,
            transparent: true,
            opacity: params.opacity / 100,
            side: THREE.DoubleSide
        });
        lineColor = 0xffffff;
    } else {
        bodyMat = new THREE.MeshBasicMaterial({
            color: colors.blueprintFace,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
        });
        lineColor = colors.blueprintLine;
    }

    // 4. Generate & Render Bottom Cap
    if (visibilities.bottomCap) {
        const bottomCapGeom = generateCapGeometry(D_in, D_out, hasSlipRingBottom, false);
        if (bottomCapGeom) {
            const bCapMesh = bottomCapGeom.getMesh();
            const bCapThreeGeom = manifoldToThree(bCapMesh);
            bottomCapGeom.delete();

            bottomCapMesh = new THREE.Mesh(bCapThreeGeom, bodyMat);
            bottomCapMesh.castShadow = true;
            bottomCapMesh.receiveShadow = true;

            if (params.mode === 'blueprint') {
                const edges = new THREE.EdgesGeometry(bCapThreeGeom);
                const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: lineColor, linewidth: 1.5 }));
                bottomCapMesh.add(lines);
            }
            mainGroup.add(bottomCapMesh);
        }
    }

    // 5. Generate & Render Top Cap (translated to the top of the cylinder and flipped)
    if (visibilities.topCap) {
        const topCapGeom = generateCapGeometry(D_in, D_out, hasSlipRingTop, true);
        if (topCapGeom) {
            const tCapMesh = topCapGeom.getMesh();
            const tCapThreeGeom = manifoldToThree(tCapMesh);
            topCapGeom.delete();

            topCapMesh = new THREE.Mesh(tCapThreeGeom, bodyMat);
            topCapMesh.castShadow = true;
            topCapMesh.receiveShadow = true;

            // Rotate 180 degrees around X-axis so it faces down
            topCapMesh.rotation.x = Math.PI;
            // Translate Z to top position (Z-up in CAD coords)
            const H_cap = params.lipDepth + T_cap;
            topCapMesh.position.z = tubeHeight_mm + 2 * T_cap;

            if (params.mode === 'blueprint') {
                const edges = new THREE.EdgesGeometry(tCapThreeGeom);
                const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: lineColor, linewidth: 1.5 }));
                topCapMesh.add(lines);
            }
            mainGroup.add(topCapMesh);
        }
    }

    // 6. Generate & Render Rolled Sheet (Semi-transparent cyan Cylinder)
    if (visibilities.sheet) {
        // Tube geometry: outer cylinder + inner cylinder.
        // It starts at Z = T_cap and ends at Z = T_cap + tubeHeight_mm.
        const sheetGeom = new THREE.CylinderGeometry(D_out/2, D_out/2, tubeHeight_mm, 64, 1, true);
        sheetGeom.rotateX(Math.PI/2); // Align with Z-axis
        
        const sheetMaterial = new THREE.MeshPhysicalMaterial({
            color: colors.sheetBlue,
            roughness: 0.2,
            metalness: 0.1,
            transmission: 0.8,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });

        sheetMesh = new THREE.Mesh(sheetGeom, sheetMaterial);
        // Translate along Z so it sits perfectly in the bottom cap groove
        sheetMesh.position.z = T_cap + tubeHeight_mm / 2;

        if (params.mode === 'blueprint') {
            const edges = new THREE.EdgesGeometry(sheetGeom);
            const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: colors.limeAccent, linewidth: 1.0 }));
            sheetMesh.add(lines);
        }

        mainGroup.add(sheetMesh);
    }

    // Clear old brackets meshes from 3D scene
    for (let m of bracketMeshes) {
        mainGroup.remove(m);
        m.geometry.dispose();
    }
    bracketMeshes = [];

    // 7. Generate & Render Brackets (C-shaped side fasteners)
    if (visibilities.brackets && params.bracketCount > 0) {
        const bracketGeom = generateBracketGeometry(D_out, tubeHeight_mm);
        if (bracketGeom) {
            const bMesh = bracketGeom.getMesh();
            const bThreeGeom = manifoldToThree(bMesh);
            bracketGeom.delete();

            let bracketMat, bLineColor;
            if (params.mode === 'rendered') {
                bracketMat = new THREE.MeshPhysicalMaterial({
                    color: colors.limeAccent,
                    emissive: 0x1a2200,
                    roughness: 0.2,
                    metalness: 0.3,
                    transmission: 0.4,
                    thickness: 3.0,
                    transparent: true,
                    opacity: params.opacity / 100,
                    side: THREE.DoubleSide
                });
                bLineColor = 0xffffff;
            } else {
                bracketMat = new THREE.MeshBasicMaterial({
                    color: 0x121c01,
                    transparent: true,
                    opacity: 0.7,
                    side: THREE.DoubleSide
                });
                bLineColor = colors.limeAccent;
            }

            const count = params.bracketCount;
            const offsetAngle = params.ledCount > 0 ? (Math.PI / params.ledCount) : 0;

            for (let j = 0; j < count; j++) {
                const theta = (j * 2 * Math.PI) / count + offsetAngle;
                const mesh = new THREE.Mesh(bThreeGeom, bracketMat);
                mesh.castShadow = true;
                mesh.receiveShadow = true;

                // Rotate around Z axis to match cap tabs position
                mesh.rotation.z = theta;

                if (params.mode === 'blueprint') {
                    const edges = new THREE.EdgesGeometry(bThreeGeom);
                    const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: bLineColor, linewidth: 1.5 }));
                    mesh.add(lines);
                }

                mainGroup.add(mesh);
                bracketMeshes.push(mesh);
            }
        }
    }

    // 8. Generate & Render Gear Drive System (only when slip ring is active)
    const slipRingActive = params.slipRing !== 'none';
    if (slipRingActive && visibilities.motorHolder) {
        // 8a. Motor Holder (below bottom cap, flipped)
        const holderGeom = generateMotorHolderGeometry(D_in, D_out);
        if (holderGeom) {
            const hMesh = holderGeom.getMesh();
            const hThreeGeom = manifoldToThree(hMesh);
            holderGeom.delete();

            let holderMat;
            if (params.mode === 'rendered') {
                holderMat = new THREE.MeshPhysicalMaterial({
                    color: 0xff6600,
                    emissive: 0x220800,
                    roughness: 0.3,
                    metalness: 0.4,
                    transmission: 0.2,
                    thickness: 3.0,
                    transparent: true,
                    opacity: params.opacity / 100,
                    side: THREE.DoubleSide
                });
            } else {
                holderMat = new THREE.MeshBasicMaterial({
                    color: 0x1c0c01,
                    transparent: true,
                    opacity: 0.7,
                    side: THREE.DoubleSide
                });
            }

            motorHolderMesh = new THREE.Mesh(hThreeGeom, holderMat);
            motorHolderMesh.castShadow = true;
            motorHolderMesh.receiveShadow = true;
            motorHolderMesh.rotation.x = Math.PI;
            motorHolderMesh.position.z = -9.0;

            if (params.mode === 'blueprint') {
                const edges = new THREE.EdgesGeometry(hThreeGeom);
                const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xff6600, linewidth: 1.5 }));
                motorHolderMesh.add(lines);
            }
            mainGroup.add(motorHolderMesh);
        }

        // 8b. Ring Gear (friction-fit around bottom cap, below cap lip)
        const ringGeom = generateRingGearGeometry(D_out);
        if (ringGeom) {
            const rMesh = ringGeom.getMesh();
            const rThreeGeom = manifoldToThree(rMesh);
            ringGeom.delete();

            let ringMat;
            if (params.mode === 'rendered') {
                ringMat = new THREE.MeshPhysicalMaterial({
                    color: 0xffcc00,
                    emissive: 0x221a00,
                    roughness: 0.25,
                    metalness: 0.5,
                    transparent: true,
                    opacity: params.opacity / 100,
                    side: THREE.DoubleSide
                });
            } else {
                ringMat = new THREE.MeshBasicMaterial({
                    color: 0x1c1800,
                    transparent: true,
                    opacity: 0.7,
                    side: THREE.DoubleSide
                });
            }

            ringGearMesh = new THREE.Mesh(rThreeGeom, ringMat);
            ringGearMesh.castShadow = true;
            ringGearMesh.receiveShadow = true;
            // Position at the bottom of the cylinder
            // Ring gear sits right at Z=-3.0 (bottom of bottom cap), allowing teeth to project downwards
            ringGearMesh.position.z = -3.0;

            if (params.mode === 'blueprint') {
                const edges = new THREE.EdgesGeometry(rThreeGeom);
                const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffcc00, linewidth: 1.5 }));
                ringGearMesh.add(lines);
            }
            mainGroup.add(ringGearMesh);
        }

        // 8c. Pinion Gear (on motor shaft, meshes with ring gear)
        const pinionGeom = generatePinionGearGeometry();
        if (pinionGeom) {
            const pMesh = pinionGeom.getMesh();
            const pThreeGeom = manifoldToThree(pMesh);
            pinionGeom.delete();

            let pinionMat;
            if (params.mode === 'rendered') {
                pinionMat = new THREE.MeshPhysicalMaterial({
                    color: 0xff00ff,
                    emissive: 0x220022,
                    roughness: 0.15,
                    metalness: 0.5,
                    transparent: true,
                    opacity: params.opacity / 100,
                    side: THREE.DoubleSide
                });
            } else {
                pinionMat = new THREE.MeshBasicMaterial({
                    color: 0x1c001c,
                    transparent: true,
                    opacity: 0.7,
                    side: THREE.DoubleSide
                });
            }

            pinionGearMesh = new THREE.Mesh(pThreeGeom, pinionMat);
            pinionGearMesh.castShadow = true;
            pinionGearMesh.receiveShadow = true;

            pinionGearMesh2 = new THREE.Mesh(pThreeGeom, pinionMat);
            pinionGearMesh2.castShadow = true;
            pinionGearMesh2.receiveShadow = true;

            // Calculate precise positioning based on gear parameters
            const ringInnerR = R_cap_out + 1.0;
            const ringBodyOuterR = ringInnerR + 6.0;
            const ringCenterR = ringBodyOuterR - 3.0;

            // Rotate pinions so their shafts align horizontally with the radial direction (X-axis)
            // Pinion 2 is rotated in reverse to mirror its axial extension outwards
            pinionGearMesh.rotation.y = Math.PI / 2;
            pinionGearMesh2.rotation.y = -Math.PI / 2;

            // Place pinions so they mesh with the bottom of the crown gear at ringCenterR and global Z = -13.0
            pinionGearMesh.position.set(ringCenterR, 0, -13.0);
            pinionGearMesh2.position.set(-ringCenterR, 0, -13.0);

            if (params.mode === 'blueprint') {
                const edges = new THREE.EdgesGeometry(pThreeGeom);
                const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xff00ff, linewidth: 1.5 }));
                pinionGearMesh.add(lines);

                const lines2 = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xff00ff, linewidth: 1.5 }));
                pinionGearMesh2.add(lines2);
            }
            mainGroup.add(pinionGearMesh);
            mainGroup.add(pinionGearMesh2);
        }

        // 8d. Standalone Connector Sleeve (Neon Green)
        if (hasSlipRingBottom) {
            const connectorGeom = generateConnectorGeometry(D_in, D_out);
            if (connectorGeom) {
                const cMesh = connectorGeom.getMesh();
                const cThreeGeom = manifoldToThree(cMesh);
                connectorGeom.delete();

                let connectorMat;
                if (params.mode === 'rendered') {
                    connectorMat = new THREE.MeshPhysicalMaterial({
                        color: colors.limeAccent,
                        emissive: 0x1a2200,
                        roughness: 0.2,
                        metalness: 0.3,
                        transmission: 0.4,
                        thickness: 3.0,
                        transparent: true,
                        opacity: params.opacity / 100,
                        side: THREE.DoubleSide
                    });
                } else {
                    connectorMat = new THREE.MeshBasicMaterial({
                        color: 0x121c01,
                        transparent: true,
                        opacity: 0.7,
                        side: THREE.DoubleSide
                    });
                }

                connectorMesh = new THREE.Mesh(cThreeGeom, connectorMat);
                connectorMesh.castShadow = true;
                connectorMesh.receiveShadow = true;
                connectorMesh.position.z = 0.0;

                if (params.mode === 'blueprint') {
                    const edges = new THREE.EdgesGeometry(cThreeGeom);
                    const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: colors.limeAccent, linewidth: 1.5 }));
                    connectorMesh.add(lines);
                }
                mainGroup.add(connectorMesh);
            }
        }
    }
}

// STL Export: Compile watertight binary STL
function exportSTL() {
    if (!Manifold) return;

    const w_in = params.sheetWidth;
    const h_in = params.sheetHeight;
    const t_mm = params.sheetThickness;

    let L_mm;
    if (params.rollDirection === 'width') {
        L_mm = w_in * 25.4;
    } else {
        L_mm = h_in * 25.4;
    }

    const D_mid = L_mm / Math.PI;
    const D_out = D_mid + t_mm;
    const D_in = D_mid - t_mm;

    // Helper to download single STL
    const downloadCap = (hasSlipRing, nameSuffix, isTop) => {
        const cap = generateCapGeometry(D_in, D_out, hasSlipRing, isTop);
        if (!cap) return;

        const mesh = cap.getMesh();
        cap.delete();

        const totalTriangles = mesh.triVerts.length / 3;
        const buffer = new ArrayBuffer(84 + totalTriangles * 50);
        const view = new DataView(buffer);

        const headerStr = `Cylinder Cap (${nameSuffix}) - Generated via Antigravity CAD (2026)`;
        for (let i = 0; i < Math.min(80, headerStr.length); i++) {
            view.setUint8(i, headerStr.charCodeAt(i));
        }

        view.setUint32(80, totalTriangles, true);

        let offset = 84;
        const getVert = (idx) => {
            return [
                mesh.vertProperties[idx * 3],
                mesh.vertProperties[idx * 3 + 1],
                mesh.vertProperties[idx * 3 + 2]
            ];
        };

        for (let i = 0; i < totalTriangles; i++) {
            const i0 = mesh.triVerts[i * 3];
            const i1 = mesh.triVerts[i * 3 + 1];
            const i2 = mesh.triVerts[i * 3 + 2];

            const v0 = getVert(i0);
            const v1 = getVert(i1);
            const v2 = getVert(i2);

            view.setFloat32(offset, 0, true);
            view.setFloat32(offset + 4, 0, true);
            view.setFloat32(offset + 8, 0, true);

            view.setFloat32(offset + 12, v0[0], true);
            view.setFloat32(offset + 16, v0[1], true);
            view.setFloat32(offset + 20, v0[2], true);

            view.setFloat32(offset + 24, v1[0], true);
            view.setFloat32(offset + 28, v1[1], true);
            view.setFloat32(offset + 32, v1[2], true);

            view.setFloat32(offset + 36, v2[0], true);
            view.setFloat32(offset + 40, v2[1], true);
            view.setFloat32(offset + 44, v2[2], true);

            view.setUint16(offset + 48, 0, true);
            offset += 50;
        }

        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `cylinder_cap_${nameSuffix}_roll_${params.rollDirection}_w_${w_in.toFixed(2)}_h_${h_in.toFixed(2)}.stl`;
        link.click();
    };

    const hasSlipRingBottom = params.slipRing === 'bottom' || params.slipRing === 'both';
    const hasSlipRingTop = params.slipRing === 'top' || params.slipRing === 'both';

    if (params.slipRing === 'bottom' || params.slipRing === 'top' || params.bracketCount > 0) {
        // Caps are asymmetric, download both
        downloadCap(hasSlipRingBottom, "bottom_cap", false);
        setTimeout(() => {
            downloadCap(hasSlipRingTop, "top_cap", true);
        }, 300);
    } else {
        // Caps are symmetric (either both have slip ring or neither, and no brackets)
        downloadCap(hasSlipRingBottom, params.slipRing === 'both' ? "with_slipring" : "standard", false);
    }
}

// STL Export: Compile single C-shaped bracket
function exportBracketSTL() {
    if (!Manifold) return;

    const w_in = params.sheetWidth;
    const h_in = params.sheetHeight;
    const t_mm = params.sheetThickness;
    const L_mm = params.rollDirection === 'width' ? w_in * 25.4 : h_in * 25.4;
    const tubeHeight_mm = params.rollDirection === 'width' ? h_in * 25.4 : w_in * 25.4;
    const D_mid = L_mm / Math.PI;
    const D_out = D_mid + t_mm;

    const bracket = generateBracketGeometry(D_out, tubeHeight_mm);
    if (!bracket) return;

    const mesh = bracket.getMesh();
    bracket.delete();

    const totalTriangles = mesh.triVerts.length / 3;
    const buffer = new ArrayBuffer(84 + totalTriangles * 50);
    const view = new DataView(buffer);

    const headerStr = "Cylinder Seam Bracket - Generated via Antigravity CAD (2026)";
    for (let i = 0; i < Math.min(80, headerStr.length); i++) {
        view.setUint8(i, headerStr.charCodeAt(i));
    }

    view.setUint32(80, totalTriangles, true);

    let offset = 84;
    const getVert = (idx) => {
        return [
            mesh.vertProperties[idx * 3],
            mesh.vertProperties[idx * 3 + 1],
            mesh.vertProperties[idx * 3 + 2]
        ];
    };

    for (let i = 0; i < totalTriangles; i++) {
        const i0 = mesh.triVerts[i * 3];
        const i1 = mesh.triVerts[i * 3 + 1];
        const i2 = mesh.triVerts[i * 3 + 2];

        const v0 = getVert(i0);
        const v1 = getVert(i1);
        const v2 = getVert(i2);

        view.setFloat32(offset, 0, true);
        view.setFloat32(offset + 4, 0, true);
        view.setFloat32(offset + 8, 0, true);

        view.setFloat32(offset + 12, v0[0], true);
        view.setFloat32(offset + 16, v0[1], true);
        view.setFloat32(offset + 20, v0[2], true);

        view.setFloat32(offset + 24, v1[0], true);
        view.setFloat32(offset + 28, v1[1], true);
        view.setFloat32(offset + 32, v1[2], true);

        view.setFloat32(offset + 36, v2[0], true);
        view.setFloat32(offset + 40, v2[1], true);
        view.setFloat32(offset + 44, v2[2], true);

        view.setUint16(offset + 48, 0, true);
        offset += 50;
    }

    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cylinder_seam_bracket_roll_${params.rollDirection}_w_${w_in.toFixed(2)}_h_${h_in.toFixed(2)}.stl`;
    link.click();
}

// Generic helper to export a Manifold geometry as binary STL
function exportManifoldSTL(manifoldGeom, filename) {
    const mesh = manifoldGeom.getMesh();
    manifoldGeom.delete();

    const totalTriangles = mesh.triVerts.length / 3;
    const buffer = new ArrayBuffer(84 + totalTriangles * 50);
    const view = new DataView(buffer);

    const headerStr = `${filename} - Generated via Antigravity CAD (2026)`;
    for (let i = 0; i < Math.min(80, headerStr.length); i++) {
        view.setUint8(i, headerStr.charCodeAt(i));
    }

    view.setUint32(80, totalTriangles, true);

    let offset = 84;
    const getVert = (idx) => [
        mesh.vertProperties[idx * 3],
        mesh.vertProperties[idx * 3 + 1],
        mesh.vertProperties[idx * 3 + 2]
    ];

    for (let i = 0; i < totalTriangles; i++) {
        const v0 = getVert(mesh.triVerts[i * 3]);
        const v1 = getVert(mesh.triVerts[i * 3 + 1]);
        const v2 = getVert(mesh.triVerts[i * 3 + 2]);

        // Normal placeholder
        view.setFloat32(offset, 0, true);
        view.setFloat32(offset + 4, 0, true);
        view.setFloat32(offset + 8, 0, true);

        view.setFloat32(offset + 12, v0[0], true);
        view.setFloat32(offset + 16, v0[1], true);
        view.setFloat32(offset + 20, v0[2], true);

        view.setFloat32(offset + 24, v1[0], true);
        view.setFloat32(offset + 28, v1[1], true);
        view.setFloat32(offset + 32, v1[2], true);

        view.setFloat32(offset + 36, v2[0], true);
        view.setFloat32(offset + 40, v2[1], true);
        view.setFloat32(offset + 44, v2[2], true);

        view.setUint16(offset + 48, 0, true);
        offset += 50;
    }

    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

// STL Export: Motor Holder
function exportMotorHolderSTL() {
    if (!Manifold) return;

    const L_mm = params.rollDirection === 'width' ? params.sheetWidth * 25.4 : params.sheetHeight * 25.4;
    const D_mid = L_mm / Math.PI;
    const D_out = D_mid + params.sheetThickness;
    const D_in = D_mid - params.sheetThickness;

    const holder = generateMotorHolderGeometry(D_in, D_out);
    if (!holder) return;

    exportManifoldSTL(holder, `motor_holder_type130.stl`);
}

// STL Export: Ring Gear
function exportRingGearSTL() {
    if (!Manifold) return;

    const L_mm = params.rollDirection === 'width' ? params.sheetWidth * 25.4 : params.sheetHeight * 25.4;
    const D_mid = L_mm / Math.PI;
    const D_out = D_mid + params.sheetThickness;

    const ring = generateRingGearGeometry(D_out);
    if (!ring) return;

    exportManifoldSTL(ring, `ring_gear_d_${D_out.toFixed(0)}mm.stl`);
}

// STL Export: Pinion Gear
function exportPinionGearSTL() {
    if (!Manifold) return;

    const pinion = generatePinionGearGeometry();
    if (!pinion) return;

    exportManifoldSTL(pinion, `pinion_gear_${params.motorWheelDiam.toFixed(0)}mm.stl`);
}

// STL Export: Connector Sleeve
function exportConnectorSTL() {
    if (!Manifold) return;

    const L_mm = params.rollDirection === 'width' ? params.sheetWidth * 25.4 : params.sheetHeight * 25.4;
    const D_mid = L_mm / Math.PI;
    const D_out = D_mid + params.sheetThickness;
    const D_in = D_mid - params.sheetThickness;

    const connector = generateConnectorGeometry(D_in, D_out);
    if (!connector) return;

    exportManifoldSTL(connector, `connector_sleeve_13mm.stl`);
}

// Technical Dimensioning SVG Overlay
function updateLeaderLines() {
    overlaySvg.innerHTML = '';

    const container = document.getElementById('canvas3d');
    if (!container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const drawDimension = (point3d, textLabel, dirX = 1, dirY = -1, color = '#00f3ff') => {
        const vector = new THREE.Vector3(point3d.x, point3d.y, point3d.z);
        
        mainGroup.updateMatrixWorld();
        vector.applyMatrix4(mainGroup.matrixWorld);
        vector.project(camera);

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

            overlaySvg.appendChild(group);
        }
    };

    // Calculate dimensions variables
    const w_in = params.sheetWidth;
    const h_in = params.sheetHeight;
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
        const holeText = hasSlipRingBottom ? "Slip Ring Hole: ・・・3.0mm" : `Hole: ・・・{params.holeDiam.toFixed(1)}mm`;
        drawDimension(
            new THREE.Vector3(R_cap_out, 0, T_cap / 2),
            `Cap OD: ・・・{(R_cap_out * 2).toFixed(1)}mm`,
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
                `M3 Screw Hole: ・・・.0mm`,
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

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // Auto rotate very slowly if user is idle
    if (controls.state === -1) {
        mainGroup.rotation.z += 0.001;
    }

    renderer.render(scene, camera);
    updateLeaderLines();
}

// Setup and start
init();
