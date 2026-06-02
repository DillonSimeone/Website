import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import Module from 'https://unpkg.com/manifold-3d/manifold.js';

let wasm, Manifold;
let scene, camera, renderer, controls;
let mainGroup; // holds all representations
let overlaySvg = document.getElementById('dimensions-overlay');

// Current parameters state
const params = {
    fingerDiam: 23.0,
    handWidth: 105.0,
    dusterHeight: 16.0,
    guardThick: 10.0,
    engravingText: "MCAFEE SECURE",
    textSize: 8.0,
    textDepth: 1.5,
    engraveMode: 'emboss', // 'emboss' or 'cutout'
    spikeHeight: 0.0,
    usbSlot: false,
    sdSlot: false,
    hexStuds: false,
    opacity: 90,
    mode: 'rendered' // 'rendered' or 'blueprint'
};

const visibilities = {
    knuckles: true,
    ghostHand: true,
    cutouts: false
};

// Meshes references
let knucklesMesh = null;
let ghostHandGroup = new THREE.Group();
let cutoutsGroup = new THREE.Group();

// Font loader state
let loadedFont = null;
const FONT_URL = 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/fonts/helvetiker_regular.typeface.json';

// Colors (Red Cyberpunk Style)
const colors = {
    redIce: 0xff003c,
    glowRed: 0xff2200,
    ghostHand: 0xff00b3, // Glowing neon magenta
    cutouts: 0xffaa00,    // Technical tool orange
    blueprintLine: 0xff003c,
    blueprintFace: 0x1b0206
};

// Setup the Scene
function init() {
    const container = document.getElementById('canvas3d');
    if (!container) return;

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0102, 0.0015);

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 2000);
    camera.position.set(220, 120, 200);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, -15, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.15;
    controls.update();

    // Red Blueprint Floor (horizontal, on XZ plane)
    const grid = new THREE.GridHelper(400, 40, 0xff003c, 0x440010);
    grid.position.y = -50;
    scene.add(grid);

    // Lights
    const ambient = new THREE.AmbientLight(0x1a0206, 2.0);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(100, 150, 200);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene.add(keyLight);

    // Deep red fill light
    const fillLight = new THREE.PointLight(0xff003c, 2.0, 300);
    fillLight.position.set(-100, 100, 50);
    scene.add(fillLight);

    // Floor glow light (makes the red ice glow from underneath!)
    const floorGlow = new THREE.PointLight(0xff00b3, 3.0, 150);
    floorGlow.position.set(0, -40, 0);
    scene.add(floorGlow);

    mainGroup = new THREE.Group();
    // Align Z-up CAD coordinates to Y-up Three.js coordinates
    mainGroup.rotation.x = -Math.PI / 2;
    scene.add(mainGroup);
    
    mainGroup.add(ghostHandGroup);
    mainGroup.add(cutoutsGroup);

    window.addEventListener('resize', onWindowResize);
    setupUIListeners();
    loadFontAndInit();
}

function onWindowResize() {
    const container = document.getElementById('canvas3d');
    if (!container) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

// Load typography for engraving
function loadFontAndInit() {
    const loader = new FontLoader();
    const engravingInput = document.getElementById('input-engravingText');
    if (engravingInput) engravingInput.disabled = true;
    
    loader.load(FONT_URL, (font) => {
        loadedFont = font;
        console.log("Cyberpunk Typography loaded successfully");
        if (engravingInput) {
            engravingInput.disabled = false;
            engravingInput.placeholder = "ENTER ENGRAVING";
        }
        initManifold();
    }, undefined, (err) => {
        console.error("Failed to load 3D font: ", err);
        // Continue without font (engraving fallback)
        initManifold();
    });
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

// Bind sliders, text boxes and buttons to parameters
function setupUIListeners() {
    const bindSlider = (id, paramKey, isFloat = true) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', (e) => {
            const val = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value);
            params[paramKey] = val;
            const displayVal = document.getElementById('val-' + paramKey);
            if (displayVal) displayVal.innerText = isFloat ? val.toFixed(1) : val;
            rebuild();
        });
    };

    // Ergonomics
    bindSlider('input-fingerDiam', 'fingerDiam');
    bindSlider('input-handWidth', 'handWidth');
    bindSlider('input-dusterHeight', 'dusterHeight');
    bindSlider('input-guardThick', 'guardThick');

    // Cybernetics
    bindSlider('input-textSize', 'textSize');
    bindSlider('input-textDepth', 'textDepth');

    // Text input
    const engravingInput = document.getElementById('input-engravingText');
    if (engravingInput) {
        engravingInput.addEventListener('input', (e) => {
            params.engravingText = e.target.value.toUpperCase();
            rebuild();
        });
    }

    // Engraving Modes
    document.getElementById('btn-style-emboss').addEventListener('click', () => {
        document.getElementById('btn-style-emboss').classList.add('active');
        document.getElementById('btn-style-cutout').classList.remove('active');
        params.engraveMode = 'emboss';
        rebuild();
    });
    document.getElementById('btn-style-cutout').addEventListener('click', () => {
        document.getElementById('btn-style-cutout').classList.add('active');
        document.getElementById('btn-style-emboss').classList.remove('active');
        params.engraveMode = 'cutout';
        rebuild();
    });

    // Hardware Modifications
    bindSlider('input-spikeHeight', 'spikeHeight');

    document.getElementById('show-usb-slot').addEventListener('change', (e) => {
        params.usbSlot = e.target.checked;
        rebuild();
    });
    document.getElementById('show-sd-slot').addEventListener('change', (e) => {
        params.sdSlot = e.target.checked;
        rebuild();
    });
    document.getElementById('show-hex-studs').addEventListener('change', (e) => {
        params.hexStuds = e.target.checked;
        rebuild();
    });

    // Display
    bindSlider('input-opacity', 'opacity', false);

    // Render Modes
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

    // Visibilities
    const bindVisibility = (id, key) => {
        document.getElementById(id).addEventListener('change', (e) => {
            visibilities[key] = e.target.checked;
            rebuild();
        });
    };
    bindVisibility('show-knuckles', 'knuckles');
    bindVisibility('show-ghost-hand', 'ghostHand');
    bindVisibility('show-cutouts', 'cutouts');

    // Export STL
    document.getElementById('btn-export-stl').addEventListener('click', exportSTL);
}

// --- CSG Helpers: Bridges Three.js mathematical placements into Manifold WASM ---

function threeToManifold(geom) {
    const posAttr = geom.getAttribute('position');
    if (!posAttr) return null;
    
    const indexAttr = geom.getIndex();
    const numVerts = posAttr.count;
    
    // Merge duplicate vertices to weld UV seams/splits into a manifold topological solid
    const uniqueVerts = [];
    const vertMap = new Map(); // key: "x,y,z" -> value: unique index
    const oldToNewIndex = new Uint32Array(numVerts);
    
    const precision = 6; // decimal precision for welding coordinates
    
    for (let i = 0; i < numVerts; i++) {
        const x = posAttr.getX(i);
        const y = posAttr.getY(i);
        const z = posAttr.getZ(i);
        
        const key = `${x.toFixed(precision)},${y.toFixed(precision)},${z.toFixed(precision)}`;
        
        if (vertMap.has(key)) {
            oldToNewIndex[i] = vertMap.get(key);
        } else {
            const newIdx = uniqueVerts.length / 3;
            vertMap.set(key, newIdx);
            uniqueVerts.push(x, y, z);
            oldToNewIndex[i] = newIdx;
        }
    }
    
    // Map index buffer to unique welded indices
    let triVerts;
    if (indexAttr) {
        triVerts = new Uint32Array(indexAttr.count);
        for (let i = 0; i < indexAttr.count; i++) {
            triVerts[i] = oldToNewIndex[indexAttr.array[i]];
        }
    } else {
        triVerts = new Uint32Array(numVerts);
        for (let i = 0; i < numVerts; i++) {
            triVerts[i] = oldToNewIndex[i];
        }
    }
    
    const vertProperties = new Float32Array(uniqueVerts);
    
    return Manifold.ofMesh({
        numProp: 3,
        triVerts: triVerts,
        vertProperties: vertProperties
    });
}

function makeCSGBox(w, d, h, x, y, z, rx=0, ry=0, rz=0) {
    // Create native Manifold box centered at origin
    let box = Manifold.cube([w, d, h], true);
    
    // Rotate box: rotate method takes rotation degrees around X, Y, Z
    if (rx !== 0 || ry !== 0 || rz !== 0) {
        const degX = rx * (180 / Math.PI);
        const degY = ry * (180 / Math.PI);
        const degZ = rz * (180 / Math.PI);
        let rotated = box.rotate([degX, degY, degZ]);
        box.delete();
        box = rotated;
    }
    
    // Translate box
    if (x !== 0 || y !== 0 || z !== 0) {
        let translated = box.translate([x, y, z]);
        box.delete();
        box = translated;
    }
    
    return box;
}

function makeCSGCylinder(r, h, x, y, z, rx=0, ry=0, rz=0) {
    // Create native Manifold cylinder along Z-axis centered at origin
    let cyl = Manifold.cylinder(h, r, r, 32, true);
    
    // Rotate cylinder (convert radians to degrees)
    if (rx !== 0 || ry !== 0 || rz !== 0) {
        const degX = rx * (180 / Math.PI);
        const degY = ry * (180 / Math.PI);
        const degZ = rz * (180 / Math.PI);
        let rotated = cyl.rotate([degX, degY, degZ]);
        cyl.delete();
        cyl = rotated;
    }
    
    // Translate cylinder
    if (x !== 0 || y !== 0 || z !== 0) {
        let translated = cyl.translate([x, y, z]);
        cyl.delete();
        cyl = translated;
    }
    
    return cyl;
}

function makeCSGTaperedBox(wStart, wEnd, length, thickness, x, y, z, rx=0, ry=0, rz=0) {
    const T = thickness;
    const L = length;
    const vertices = new Float32Array([
        // Front face (Y = 0)
        -wStart/2, 0, -T/2, // 0
         wStart/2, 0, -T/2, // 1
         wStart/2, 0,  T/2, // 2
        -wStart/2, 0,  T/2, // 3
        // Back face (Y = -L)
        -wEnd/2, -L, -T/2,  // 4
         wEnd/2, -L, -T/2,  // 5
         wEnd/2, -L,  T/2,  // 6
        -wEnd/2, -L,  T/2   // 7
    ]);
    const indices = new Uint32Array([
        // Front face (Y = 0) -> Normal +Y
        0, 2, 1,  0, 3, 2,
        // Back face (Y = -L) -> Normal -Y
        5, 7, 4,  5, 6, 7,
        // Left face (X = -W/2) -> Normal -X
        4, 3, 0,  4, 7, 3,
        // Right face (X = +W/2) -> Normal +X
        1, 6, 5,  1, 2, 6,
        // Top face (Z = +T/2) -> Normal +Z
        3, 6, 2,  3, 7, 6,
        // Bottom face (Z = -T/2) -> Normal -Z
        0, 5, 4,  0, 1, 5
    ]);
    
    let shield = Manifold.ofMesh({
        numProp: 3,
        triVerts: indices,
        vertProperties: vertices
    });
    
    // Rotate shield (convert radians to degrees)
    if (rx !== 0 || ry !== 0 || rz !== 0) {
        const degX = rx * (180 / Math.PI);
        const degY = ry * (180 / Math.PI);
        const degZ = rz * (180 / Math.PI);
        let rotated = shield.rotate([degX, degY, degZ]);
        shield.delete();
        shield = rotated;
    }
    
    // Translate shield
    if (x !== 0 || y !== 0 || z !== 0) {
        let translated = shield.translate([x, y, z]);
        shield.delete();
        shield = translated;
    }
    
    return shield;
}

function makeCSGCone(r, h, x, y, z, rx=0, ry=0, rz=0) {
    // Create native Manifold cylinder with top radius 0 to make a cone
    let cone = Manifold.cylinder(h, r, 0, 16, false);
    
    // Rotate cone (convert radians to degrees)
    if (rx !== 0 || ry !== 0 || rz !== 0) {
        const degX = rx * (180 / Math.PI);
        const degY = ry * (180 / Math.PI);
        const degZ = rz * (180 / Math.PI);
        let rotated = cone.rotate([degX, degY, degZ]);
        cone.delete();
        cone = rotated;
    }
    
    // Translate cone
    if (x !== 0 || y !== 0 || z !== 0) {
        let translated = cone.translate([x, y, z]);
        cone.delete();
        cone = translated;
    }
    
    return cone;
}

function makeCSGStud(r, h, x, y, z, rx=0, ry=0, rz=0) {
    // Create native Manifold cylinder with 6 segments to make a hexagonal stud
    let stud = Manifold.cylinder(h, r, r, 6, true);
    
    // Rotate stud (convert radians to degrees)
    if (rx !== 0 || ry !== 0 || rz !== 0) {
        const degX = rx * (180 / Math.PI);
        const degY = ry * (180 / Math.PI);
        const degZ = rz * (180 / Math.PI);
        let rotated = stud.rotate([degX, degY, degZ]);
        stud.delete();
        stud = rotated;
    }
    
    // Translate stud
    if (x !== 0 || y !== 0 || z !== 0) {
        let translated = stud.translate([x, y, z]);
        stud.delete();
        stud = translated;
    }
    
    return stud;
}

function manifoldToThree(manifoldMesh) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(manifoldMesh.vertProperties, 3));
    geometry.setIndex(new THREE.Uint32BufferAttribute(manifoldMesh.triVerts, 1));
    geometry.computeVertexNormals();
    return geometry;
}

// --- Geometric Math: Knuckle Duster Generator ---

// Generates the core Knuckle Duster body
function generateKnucklesCore() {
    if (!Manifold) return null;

    const r_finger = params.fingerDiam / 2;
    const h_core = params.dusterHeight;
    const t_guard = params.guardThick;
    
    // 1. Calculate spaced finger coordinates along an ergonomic arc
    // Spacing between finger centers. Safety clamp prevents overlapping.
    const spacing = Math.max(params.fingerDiam + 4, (params.handWidth - params.fingerDiam - 12) / 3);
    const x_coords = [-1.5 * spacing, -0.5 * spacing, 0.5 * spacing, 1.5 * spacing];
    const y_coords = [0, 4, 4, 0];

    // 2. Build the basic finger rings (solid) and connect them
    const rings = [];
    const r_ring = r_finger + 4; // Wall thickness of 4mm at the back/sides
    
    for (let i = 0; i < 4; i++) {
        rings.push(makeCSGCylinder(r_ring, h_core, x_coords[i], y_coords[i], 0));
    }
    
    let knucklesBody = rings[0];
    for (let i = 1; i < 4; i++) {
        let temp = knucklesBody.add(rings[i]);
        knucklesBody.delete();
        rings[i].delete();
        knucklesBody = temp;
    }

    // 3. Add connecting boxes between adjacent rings to fill gaps
    for (let i = 0; i < 3; i++) {
        const xc = (x_coords[i] + x_coords[i+1]) / 2;
        const yc = (y_coords[i] + y_coords[i+1]) / 2;
        const dist = Math.sqrt((x_coords[i+1] - x_coords[i])**2 + (y_coords[i+1] - y_coords[i])**2);
        const theta = Math.atan2(y_coords[i+1] - y_coords[i], x_coords[i+1] - x_coords[i]);
        
        const bridge = makeCSGBox(dist, r_ring * 2, h_core, xc, yc, 0, 0, 0, theta);
        let temp = knucklesBody.add(bridge);
        knucklesBody.delete();
        bridge.delete();
        knucklesBody = temp;
    }

    // 4. Add Knuckle Guard Armor (thickened front portion)
    const guards = [];
    const r_guard = r_finger + t_guard;
    for (let i = 0; i < 4; i++) {
        guards.push(makeCSGCylinder(r_guard, h_core, x_coords[i], y_coords[i], 0));
    }
    
    let guardBody = guards[0];
    for (let i = 1; i < 4; i++) {
        let temp = guardBody.add(guards[i]);
        guardBody.delete();
        guards[i].delete();
        guardBody = temp;
    }

    for (let i = 0; i < 3; i++) {
        const xc = (x_coords[i] + x_coords[i+1]) / 2;
        const yc = (y_coords[i] + y_coords[i+1]) / 2;
        const dist = Math.sqrt((x_coords[i+1] - x_coords[i])**2 + (y_coords[i+1] - y_coords[i])**2);
        const theta = Math.atan2(y_coords[i+1] - y_coords[i], x_coords[i+1] - x_coords[i]);
        
        const bridge = makeCSGBox(dist, r_guard * 2, h_core, xc, yc, 0, 0, 0, theta);
        let temp = guardBody.add(bridge);
        guardBody.delete();
        bridge.delete();
        guardBody = temp;
    }

    // Merge rings and guard armor
    let mergedTemp = knucklesBody.add(guardBody);
    knucklesBody.delete();
    guardBody.delete();
    knucklesBody = mergedTemp;

    // 5. Add Palm Grip bar at the bottom
    const gripWidth = x_coords[3] - x_coords[0] + r_ring * 2;
    const palmGrip = makeCSGBox(gripWidth - 10, 15, h_core, 0, -45, 0);
    
    // Fillet the palm grip corners by adding rounded ends
    const leftEnd = makeCSGCylinder(7.5, h_core, -(gripWidth - 10)/2, -45, 0);
    const rightEnd = makeCSGCylinder(7.5, h_core, (gripWidth - 10)/2, -45, 0);
    let gripMerged = palmGrip.add(leftEnd).add(rightEnd);
    palmGrip.delete();
    leftEnd.delete();
    rightEnd.delete();

    let mergedWithGrip = knucklesBody.add(gripMerged);
    knucklesBody.delete();
    gripMerged.delete();
    knucklesBody = mergedWithGrip;

    // 6. Add Side Pillars connecting fingers to Palm Grip
    const leftPillar = makeCSGBox(r_ring * 2, 45, h_core, x_coords[0], -22.5, 0);
    const rightPillar = makeCSGBox(r_ring * 2, 45, h_core, x_coords[3], -22.5, 0);
    
    let mergedPillars = knucklesBody.add(leftPillar).add(rightPillar);
    knucklesBody.delete();
    leftPillar.delete();
    rightPillar.delete();
    knucklesBody = mergedPillars;



    // 8. SUBTRACT Finger Holes (Clearance cylinders)
    const fingerHoles = [];
    for (let i = 0; i < 4; i++) {
        // Slightly taller to ensure clean boolean cuts
        fingerHoles.push(makeCSGCylinder(r_finger, h_core + 4, x_coords[i], y_coords[i], 0));
    }
    for (let i = 0; i < 4; i++) {
        let temp = knucklesBody.subtract(fingerHoles[i]);
        knucklesBody.delete();
        fingerHoles[i].delete();
        knucklesBody = temp;
    }

    // 9. SUBTRACT Palm Cutout (The inner loop handle)
    const cutoutWidth = x_coords[3] - x_coords[0] - r_ring * 2 + 10;
    const palmCutout = makeCSGBox(cutoutWidth, 20, h_core + 4, 0, -25, 0);
    const lCutEnd = makeCSGCylinder(10, h_core + 4, -cutoutWidth/2, -25, 0);
    const rCutEnd = makeCSGCylinder(10, h_core + 4, cutoutWidth/2, -25, 0);
    
    let mergedCutout = palmCutout.add(lCutEnd).add(rCutEnd);
    palmCutout.delete();
    lCutEnd.delete();
    rCutEnd.delete();

    let finalizedBody = knucklesBody.subtract(mergedCutout);
    knucklesBody.delete();
    mergedCutout.delete();
    knucklesBody = finalizedBody;

    // 9.5 APPLY HARDWARE MODIFICATIONS (Cyber-Spikes, Hex Studs, USB/SD Slots)
    
    // Cyber-Spikes
    if (params.spikeHeight > 0) {
        const h_spike = params.spikeHeight;
        const r_spike = h_spike * 0.4;
        const r_guard = r_finger + t_guard;
        const ang = [
            Math.PI / 2 + 0.2,
            Math.PI / 2 + 0.05,
            Math.PI / 2 - 0.05,
            Math.PI / 2 - 0.2
        ];
        for (let i = 0; i < 4; i++) {
            const r_offset = r_guard - 1.0;
            const px = x_coords[i] + r_offset * Math.cos(ang[i]);
            const py = y_coords[i] + r_offset * Math.sin(ang[i]);
            const cone = makeCSGCone(r_spike, h_spike + 1.0, px, py, 0, -Math.PI / 2, 0, ang[i] - Math.PI / 2);
            let temp = knucklesBody.add(cone);
            knucklesBody.delete();
            cone.delete();
            knucklesBody = temp;
        }
    }

    // Heavy Hex Studs
    if (params.hexStuds) {
        const r_guard = r_finger + t_guard;
        const gripWidth = x_coords[3] - x_coords[0] + r_ring * 2;
        const studParams = [
            { x: x_coords[0] - r_guard - 1.5, y: y_coords[0] }, // left knuckle side
            { x: x_coords[3] + r_guard + 1.5, y: y_coords[3] }, // right knuckle side
            { x: -gripWidth / 2 - 1.5, y: -45 },              // left grip side
            { x: gripWidth / 2 + 1.5, y: -45 }                // right grip side
        ];
        for (const p of studParams) {
            const stud = makeCSGStud(4.0, 5.0, p.x, p.y, 0, 0, Math.PI / 2, 0);
            let temp = knucklesBody.add(stud);
            knucklesBody.delete();
            stud.delete();
            knucklesBody = temp;
        }
    }

    // Hidden USB Sled Slot
    if (params.usbSlot) {
        const usbPocket = makeCSGBox(13.0, 26.0, 5.0, x_coords[3], -33.0, 0);
        let temp = knucklesBody.subtract(usbPocket);
        knucklesBody.delete();
        usbPocket.delete();
        knucklesBody = temp;
    }

    // Hidden SD Card Sled Slot
    if (params.sdSlot) {
        const sdPocket = makeCSGBox(25.0, 26.0, 3.0, x_coords[0], -33.0, 0);
        let temp = knucklesBody.subtract(sdPocket);
        knucklesBody.delete();
        sdPocket.delete();
        knucklesBody = temp;
    }

    // 10. APPLY Tactical Typography (Engraving or Embossing)
    if (loadedFont && params.engravingText.trim().length > 0) {
        try {
            const textStr = params.engravingText.trim();
            const N = textStr.length;
            
            // Calculate character spacing and total span
            const spacing = Math.max(params.fingerDiam + 4, (params.handWidth - params.fingerDiam - 12) / 3);
            const x_coords = [-1.5 * spacing, -0.5 * spacing, 0.5 * spacing, 1.5 * spacing];
            
            // Text width bounds (inset slightly from outer knuckles)
            const maxTextWidth = x_coords[3] - x_coords[0];
            const charSpacing = Math.min(maxTextWidth / (N - 1 || 1), params.textSize * 0.85);
            const textWidth = (N - 1) * charSpacing;
            const startX = -textWidth / 2;
            
            const r_guard = params.fingerDiam / 2 + params.guardThick;
            
            // Configure positioning offsets and extrusion heights depending on engraving mode
            let geomHeight, r_offset, z1_factor;
            if (params.engraveMode === 'emboss') {
                geomHeight = params.textDepth + 0.8;
                r_offset = r_guard - 0.8; // overlap by 0.8mm to secure the union mesh
                z1_factor = 1.0;
            } else if (params.engraveMode === 'engrave') {
                geomHeight = params.textDepth + 1.0;
                r_offset = r_guard + 1.0; // start 1mm outside surface for a clean boolean cut
                z1_factor = -1.0;
            } else if (params.engraveMode === 'cutout') {
                geomHeight = 55.0; // cut completely through the 16mm core and 10mm guard
                r_offset = r_guard + 5.0; // start 5mm outside the front face
                z1_factor = -1.0;
            }
            
            // We will collect each character manifold and union/subtract them
            const charManifolds = [];
            
            for (let j = 0; j < N; j++) {
                const c = textStr[j];
                if (c === " ") continue; // skip spaces
                
                const charGeom = new TextGeometry(c, {
                    font: loadedFont,
                    size: params.textSize,
                    height: geomHeight,
                    curveSegments: 3,
                    bevelEnabled: false
                });
                
                charGeom.computeBoundingBox();
                const charWidth = charGeom.boundingBox.max.x - charGeom.boundingBox.min.x;
                const charHeight = charGeom.boundingBox.max.y - charGeom.boundingBox.min.y;
                
                // Get wrapped position and segment angle at this letter's X position
                const x_j = startX + j * charSpacing;
                
                // Segment interpolation
                let seg = 0;
                if (x_j <= x_coords[0]) seg = 0;
                else if (x_j >= x_coords[3]) seg = 2;
                else {
                    for (let k = 0; k < 3; k++) {
                        if (x_j >= x_coords[k] && x_j <= x_coords[k+1]) {
                            seg = k;
                            break;
                        }
                    }
                }
                
                const x_coords_y = [0, 4, 4, 0]; // y coords of finger centers
                const xA = x_coords[seg];
                const yA = x_coords_y[seg];
                const xB = x_coords[seg+1];
                const yB = x_coords_y[seg+1];
                
                const u = Math.max(0, Math.min(1, (x_j - xA) / (xB - xA)));
                const y_center = (1 - u) * yA + u * yB;
                const phi = Math.atan2(yB - yA, xB - xA);
                
                // Surface position (using normal offset)
                const nx = -Math.sin(phi);
                const ny = Math.cos(phi);
                const posX = x_j + r_offset * nx;
                const posY = y_center + r_offset * ny;
                
                // Transform vertices directly to CAD space
                const posAttr = charGeom.getAttribute('position');
                for (let i = 0; i < posAttr.count; i++) {
                    const x = posAttr.getX(i);
                    const y = posAttr.getY(i);
                    const z = posAttr.getZ(i);
                    
                    const x1 = x - charGeom.boundingBox.min.x - charWidth / 2;
                    const y1 = y - charGeom.boundingBox.min.y - charHeight / 2;
                    
                    const z1 = z * z1_factor;
                    
                    // Direct matrix rotation around Z by phi, plus translation to posX, posY
                    const posX_cad = posX + x1 * Math.cos(phi) - z1 * Math.sin(phi);
                    const posY_cad = posY + x1 * Math.sin(phi) + z1 * Math.cos(phi);
                    const posZ_cad = y1;
                    
                    posAttr.setXYZ(i, posX_cad, posY_cad, posZ_cad);
                }
                posAttr.needsUpdate = true;
                
                const charManifold = threeToManifold(charGeom);
                charGeom.dispose();
                
                if (charManifold) {
                    charManifolds.push(charManifold);
                }
            }
            
            // Union all characters into a single text manifold
            if (charManifolds.length > 0) {
                let textCombined = charManifolds[0];
                for (let j = 1; j < charManifolds.length; j++) {
                    let temp = textCombined.add(charManifolds[j]);
                    textCombined.delete();
                    charManifolds[j].delete();
                    textCombined = temp;
                }
                
                // Apply to knuckles body
                let finalizedKnuckles;
                if (params.engraveMode === 'engrave' || params.engraveMode === 'cutout') {
                    finalizedKnuckles = knucklesBody.subtract(textCombined);
                } else {
                    finalizedKnuckles = knucklesBody.add(textCombined);
                }
                knucklesBody.delete();
                textCombined.delete();
                knucklesBody = finalizedKnuckles;
            }
        } catch(err) {
            console.error("Failed to engrave wrapped text on manifold mesh:", err);
        }
    }

    return knucklesBody;
}



// --- Rebuild Viewport representations ---

function rebuild() {
    // 1. Clear old meshes
    if (knucklesMesh) {
        mainGroup.remove(knucklesMesh);
        knucklesMesh.geometry.dispose();
        knucklesMesh = null;
    }

    
    // Clear Ghost Hand
    while (ghostHandGroup.children.length > 0) {
        const child = ghostHandGroup.children[0];
        if (child.geometry) child.geometry.dispose();
        ghostHandGroup.remove(child);
    }
    
    // Clear Cutouts
    while (cutoutsGroup.children.length > 0) {
        const child = cutoutsGroup.children[0];
        if (child.geometry) child.geometry.dispose();
        cutoutsGroup.remove(child);
    }

    if (!Manifold) return;

    // 2. Select Materials (Rendered Cyber-Red Glass vs Technical Blueprint)
    let bodyMat, lineColor;
    if (params.mode === 'rendered') {
        bodyMat = new THREE.MeshPhysicalMaterial({
            color: colors.redIce,
            emissive: 0x1f0004,
            roughness: 0.1,
            metalness: 0.15,
            transmission: 0.65,
            thickness: params.dusterHeight / 2,
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

    let knucklesVol = 0;

    // 3. Draw Knuckle Core
    if (visibilities.knuckles) {
        const knucklesCore = generateKnucklesCore();
        if (knucklesCore) {
            // Get volume: Manifold returns volume in units³ (mm³)
            knucklesVol = knucklesCore.volume();
            
            const kMesh = knucklesCore.getMesh();
            const knucklesGeom = manifoldToThree(kMesh);
            knucklesCore.delete();

            knucklesMesh = new THREE.Mesh(knucklesGeom, bodyMat);
            knucklesMesh.castShadow = true;
            knucklesMesh.receiveShadow = true;

            if (params.mode === 'blueprint') {
                const edges = new THREE.EdgesGeometry(knucklesGeom);
                const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: lineColor, linewidth: 1.5 }));
                knucklesMesh.add(lines);
            }
            mainGroup.add(knucklesMesh);
        }
    }



    // 5. Draw Glowing Ghost Hand (Biometric size visualizer)
    if (visibilities.ghostHand) {
        const ghostMat = new THREE.MeshBasicMaterial({
            color: colors.ghostHand,
            wireframe: true,
            transparent: true,
            opacity: 0.35
        });

        const r_finger = params.fingerDiam / 2;
        const spacing = Math.max(params.fingerDiam + 4, (params.handWidth - params.fingerDiam - 12) / 3);
        const x_coords = [-1.5 * spacing, -0.5 * spacing, 0.5 * spacing, 1.5 * spacing];
        const y_coords = [0, 4, 4, 0];

        // Draw 4 finger ghost cylinders
        for (let i = 0; i < 4; i++) {
            // slightly smaller than finger hole for clearance visualization
            const fingerGeom = new THREE.CylinderGeometry(r_finger - 1, r_finger - 1, params.dusterHeight + 12, 16);
            fingerGeom.rotateX(Math.PI / 2);
            const fMesh = new THREE.Mesh(fingerGeom, ghostMat);
            fMesh.position.set(x_coords[i], y_coords[i], 0);
            ghostHandGroup.add(fMesh);
        }

        // Draw ghost palm loop guide
        const palmGuideGeom = new THREE.BoxGeometry(params.handWidth - 20, 12, params.dusterHeight + 8);
        const palmGuide = new THREE.Mesh(palmGuideGeom, ghostMat);
        palmGuide.position.set(0, -25, 0);
        ghostHandGroup.add(palmGuide);
    }

    // 6. Draw Cutout tool volumes if toggled
    if (visibilities.cutouts) {
        const cutoutMat = new THREE.MeshBasicMaterial({
            color: colors.cutouts,
            wireframe: true,
            transparent: true,
            opacity: 0.45
        });

        const r_finger = params.fingerDiam / 2;
        const spacing = Math.max(params.fingerDiam + 4, (params.handWidth - params.fingerDiam - 12) / 3);
        const x_coords = [-1.5 * spacing, -0.5 * spacing, 0.5 * spacing, 1.5 * spacing];
        const y_coords = [0, 4, 4, 0];

        // Finger cutout boxes
        for (let i = 0; i < 4; i++) {
            const geom = new THREE.CylinderGeometry(r_finger, r_finger, params.dusterHeight + 4, 24);
            geom.rotateX(Math.PI / 2);
            const m = new THREE.Mesh(geom, cutoutMat);
            m.position.set(x_coords[i], y_coords[i], 0);
            cutoutsGroup.add(m);
        }

        // Palm cutout box
        const cutoutWidth = x_coords[3] - x_coords[0] - (r_finger + 4) * 2 + 10;
        const pCutGeom = new THREE.BoxGeometry(cutoutWidth, 20, params.dusterHeight + 4);
        const pCut = new THREE.Mesh(pCutGeom, cutoutMat);
        pCut.position.set(0, -25, 0);
        cutoutsGroup.add(pCut);

        // Cylindrical caps for palm cutout
        const capL = new THREE.CylinderGeometry(10, 10, params.dusterHeight + 4, 24);
        capL.rotateX(Math.PI / 2);
        const capLMesh = new THREE.Mesh(capL, cutoutMat);
        capLMesh.position.set(-cutoutWidth/2, -25, 0);
        cutoutsGroup.add(capLMesh);

        const capRMesh = new THREE.Mesh(capL, cutoutMat);
        capRMesh.position.set(cutoutWidth/2, -25, 0);
        cutoutsGroup.add(capRMesh);

        // USB slot cutout volume visualization
        if (params.usbSlot) {
            const usbSlotGeom = new THREE.BoxGeometry(13.0, 26.0, 5.0);
            const usbSlotMesh = new THREE.Mesh(usbSlotGeom, cutoutMat);
            usbSlotMesh.position.set(x_coords[3], -33.0, 0);
            cutoutsGroup.add(usbSlotMesh);
        }

        // SD slot cutout volume visualization
        if (params.sdSlot) {
            const sdSlotGeom = new THREE.BoxGeometry(25.0, 26.0, 3.0);
            const sdSlotMesh = new THREE.Mesh(sdSlotGeom, cutoutMat);
            sdSlotMesh.position.set(x_coords[0], -33.0, 0);
            cutoutsGroup.add(sdSlotMesh);
        }
    }

    // 7. Update Spec Sheet Statistics
    const totalVolCc = (knucklesVol / 1000).toFixed(1); // mm³ to cm³
    const estimatedWeightG = (totalVolCc * 1.24).toFixed(0); // Density of PLA is ~1.24 g/cm³
    
    document.getElementById('spec-volume').innerText = `${totalVolCc} cm³`;
    document.getElementById('spec-weight').innerText = `${estimatedWeightG} g`;
    
    // Bounds: width is handWidth, length is knuckles core depth (60mm), height is dusterHeight
    const boundsWidth = (params.handWidth).toFixed(0);
    const boundsLength = 60; // Knuckles depth
    const boundsHeight = (params.dusterHeight).toFixed(0);
    document.getElementById('spec-bounds').innerText = `${boundsWidth} x ${boundsLength} x ${boundsHeight} mm`;

    updateLeaderLines();
}

// --- STL EXPORT MODULE: Builds single watertight STL on request ---
function exportSTL() {
    if (!Manifold) return;

    // Generate knuckle manifolds
    const knuckles = generateKnucklesCore();

    if (!knuckles) return;

    let finalModel = knuckles;

    const mesh = finalModel.getMesh();
    finalModel.delete();

    // Build binary STL buffer
    const totalTriangles = mesh.triVerts.length / 3;
    const buffer = new ArrayBuffer(84 + totalTriangles * 50);
    const view = new DataView(buffer);

    // 80 bytes header
    const headerStr = "McAfee Secure Cyber-Puncher - Generated via Antigravity CAD (2026)";
    for (let i = 0; i < Math.min(80, headerStr.length); i++) {
        view.setUint8(i, headerStr.charCodeAt(i));
    }

    // Number of triangles (4 bytes)
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

        // Face Normal (set to zero, slicers automatically calculate this)
        view.setFloat32(offset, 0, true);
        view.setFloat32(offset + 4, 0, true);
        view.setFloat32(offset + 8, 0, true);

        // Vertices 1, 2, 3
        view.setFloat32(offset + 12, v0[0], true);
        view.setFloat32(offset + 16, v0[1], true);
        view.setFloat32(offset + 20, v0[2], true);

        view.setFloat32(offset + 24, v1[0], true);
        view.setFloat32(offset + 28, v1[1], true);
        view.setFloat32(offset + 32, v1[2], true);

        view.setFloat32(offset + 36, v2[0], true);
        view.setFloat32(offset + 40, v2[1], true);
        view.setFloat32(offset + 44, v2[2], true);

        // Attribute byte count (2 bytes, set to 0)
        view.setUint16(offset + 48, 0, true);
        offset += 50;
    }

    // Download file
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    
    const textLabel = params.engravingText.trim().replace(/\s+/g, '_').toLowerCase();
    link.download = `mcafee_knuckles_${textLabel}_fd_${params.fingerDiam.toFixed(0)}mm_hw_${params.handWidth.toFixed(0)}mm.stl`;
    link.click();
}

// --- Technical Dimensioning Leader Lines (SVG Overlay) ---
function updateLeaderLines() {
    overlaySvg.innerHTML = '';

    const container = document.getElementById('canvas3d');
    if (!container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const drawDimension = (point3d, textLabel, dirX = 1, dirY = -1, color = '#ff003c') => {
        const vector = new THREE.Vector3(point3d.x, point3d.y, point3d.z);
        
        mainGroup.updateMatrixWorld();
        vector.applyMatrix4(mainGroup.matrixWorld);
        
        vector.project(camera);

        const x = (vector.x * .5 + .5) * width;
        const y = (-(vector.y * .5) + .5) * height;

        // Render line only if it lies within the screen view frustum
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

    // Projected leader lines pointing to key features
    if (visibilities.knuckles) {
        const spacing = Math.max(params.fingerDiam + 4, (params.handWidth - params.fingerDiam - 12) / 3);
        const r_finger = params.fingerDiam / 2;

        // Finger Hole diameter line (Pinky hole center)
        drawDimension(
            new THREE.Vector3(1.5 * spacing, 0, params.dusterHeight/2),
            `Finger Hole: Ø${params.fingerDiam.toFixed(1)}mm`,
            1, -1, '#ff00b3'
        );

        // Guard thickness line (Index finger front)
        drawDimension(
            new THREE.Vector3(-1.5 * spacing, params.guardThick + r_finger, 0),
            `Guard: ${params.guardThick.toFixed(1)}mm`,
            -1, -1, '#ff003c'
        );

        // Hand width span line
        drawDimension(
            new THREE.Vector3(1.5 * spacing + r_finger + 4, -22.5, 0),
            `Span: ${params.handWidth.toFixed(0)}mm`,
            1, 1, '#ffaa00'
        );

        // Cyber-Spikes leader line
        if (params.spikeHeight > 0) {
            const r_guard = params.fingerDiam / 2 + params.guardThick;
            const ang3 = Math.PI / 2 - 0.2;
            const px = 1.5 * spacing + (r_guard + params.spikeHeight) * Math.cos(ang3);
            const py = 0 + (r_guard + params.spikeHeight) * Math.sin(ang3);
            drawDimension(
                new THREE.Vector3(px, py, 0),
                `Spikes: ${params.spikeHeight.toFixed(1)}mm`,
                1, -1, '#ff003c'
            );
        }

        // Hex Studs leader line
        if (params.hexStuds) {
            const r_guard = params.fingerDiam / 2 + params.guardThick;
            drawDimension(
                new THREE.Vector3(1.5 * spacing + r_guard + 2.5, 0, 0),
                `Hex Studs: Ø8mm`,
                1, 1, '#ffaa00'
            );
        }

        // USB Slot leader line
        if (params.usbSlot) {
            drawDimension(
                new THREE.Vector3(1.5 * spacing, -33.0, 0),
                `USB Slot: 13x5mm`,
                1, 1, '#ffaa00'
            );
        }

        // SD Slot leader line
        if (params.sdSlot) {
            drawDimension(
                new THREE.Vector3(-1.5 * spacing, -33.0, 0),
                `SD Slot: 25x3mm`,
                -1, 1, '#ffaa00'
            );
        }
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
