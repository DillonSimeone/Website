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
    engravingText: "MCAFEE\nSECURE",
    textSize: 8.0,
    textDepth: 1.5,
    engraveMode: 'emboss', // 'emboss' or 'cutout'
    mirrorText: true,
    textKerning: 1.0,
    fontName: 'helvetiker_regular',
    spikeHeight: 0.0,
    usbSlot: false,
    sdSlot: false,
    hexStuds: false,
    batteryHolder: false,
    batterySide: 'right',
    hapticSystem: false,
    opacity: 90,
    mode: 'blueprint' // 'rendered' or 'blueprint'
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
    
    let url;
    if (params.fontName.startsWith('google_')) {
        const fontNameClean = params.fontName.replace('google_', '');
        url = `https://cdn.jsdelivr.net/npm/@compai/font-${fontNameClean}/data/typefaces/normal-400.json`;
    } else {
        url = `https://cdn.jsdelivr.net/npm/three@0.147.0/examples/fonts/${params.fontName}.typeface.json`;
    }
    
    loader.load(url, (font) => {
        loadedFont = font;
        console.log(`Typography ${params.fontName} loaded successfully`);
        if (engravingInput) {
            engravingInput.disabled = false;
            engravingInput.placeholder = "ENTER ENGRAVING";
        }
        if (!Manifold) {
            initManifold();
        } else {
            rebuild();
        }
    }, undefined, (err) => {
        console.error(`Failed to load font ${params.fontName} from ${url}. Falling back to helvetiker_regular.`, err);
        // Fallback to helvetiker_regular
        if (params.fontName !== 'helvetiker_regular') {
            params.fontName = 'helvetiker_regular';
            const selectFont = document.getElementById('select-font');
            if (selectFont) selectFont.value = 'helvetiker_regular';
            const customFontInput = document.getElementById('input-custom-font');
            if (customFontInput) customFontInput.value = ""; // clear failed custom input
            loadFontAndInit();
        } else {
            if (engravingInput) engravingInput.disabled = false;
            if (!Manifold) {
                initManifold();
            } else {
                rebuild();
            }
        }
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
    bindSlider('input-textKerning', 'textKerning');

    // Font Selection Preset Dropdown
    document.getElementById('select-font').addEventListener('change', (e) => {
        if (e.target.value) {
            params.fontName = e.target.value;
            const customFontInput = document.getElementById('input-custom-font');
            if (customFontInput) customFontInput.value = ""; // clear custom input
            loadFontAndInit();
        }
    });

    // Custom Google Font Text Input
    const customFontInput = document.getElementById('input-custom-font');
    if (customFontInput) {
        customFontInput.addEventListener('change', (e) => {
            const fontName = e.target.value.trim();
            if (fontName.length > 0) {
                // Convert to kebab-case: lowercase, remove characters except letters/numbers/spaces/dashes, replace spaces with single dash
                const kebab = fontName.toLowerCase()
                                      .replace(/[^a-z0-9\s-]/g, '')
                                      .replace(/[\s_]+/g, '-');
                params.fontName = 'google_' + kebab;
                loadFontAndInit();
            }
        });
    }

    // Mirror Text
    document.getElementById('show-mirrorText').addEventListener('change', (e) => {
        params.mirrorText = e.target.checked;
        rebuild();
    });

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

    document.getElementById('show-haptic-system').addEventListener('change', (e) => {
        params.hapticSystem = e.target.checked;
        params.batteryHolder = e.target.checked; // Toggled automatically by Haptic System
        const hapticRow = document.getElementById('haptic-options-row');
        if (hapticRow) {
            hapticRow.style.display = e.target.checked ? 'block' : 'none';
        }
        rebuild();
    });

    const sideBtn = document.getElementById('btn-battery-side');
    if (sideBtn) {
        sideBtn.addEventListener('click', () => {
            if (params.batterySide === 'right') {
                params.batterySide = 'left';
                sideBtn.textContent = 'LEFT SIDE';
            } else {
                params.batterySide = 'right';
                sideBtn.textContent = 'RIGHT SIDE';
            }
            rebuild();
        });
    }

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

function threeToManifold(geom, reverseWinding = false) {
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
        for (let i = 0; i < indexAttr.count; i += 3) {
            if (reverseWinding) {
                // Swap the 2nd and 3rd vertices of each triangle to flip the winding direction
                triVerts[i] = oldToNewIndex[indexAttr.array[i]];
                triVerts[i+1] = oldToNewIndex[indexAttr.array[i+2]];
                triVerts[i+2] = oldToNewIndex[indexAttr.array[i+1]];
            } else {
                triVerts[i] = oldToNewIndex[indexAttr.array[i]];
                triVerts[i+1] = oldToNewIndex[indexAttr.array[i+1]];
                triVerts[i+2] = oldToNewIndex[indexAttr.array[i+2]];
            }
        }
    } else {
        triVerts = new Uint32Array(numVerts);
        for (let i = 0; i < numVerts; i += 3) {
            if (reverseWinding) {
                triVerts[i] = oldToNewIndex[i];
                triVerts[i+1] = oldToNewIndex[i+2];
                triVerts[i+2] = oldToNewIndex[i+1];
            } else {
                triVerts[i] = oldToNewIndex[i];
                triVerts[i+1] = oldToNewIndex[i+1];
                triVerts[i+2] = oldToNewIndex[i+2];
            }
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

function makeCSGDoubleTaperedBox(wStart, wEnd, tStart, tEnd, length, x, y, z, rx=0, ry=0, rz=0) {
    const L = length;
    const vertices = new Float32Array([
        // Front face (Y = 0)
        -wStart/2, 0, -tStart/2, // 0
         wStart/2, 0, -tStart/2, // 1
         wStart/2, 0,  tStart/2, // 2
        -wStart/2, 0,  tStart/2, // 3
        // Back face (Y = -L)
        -wEnd/2, -L, -tEnd/2,  // 4
         wEnd/2, -L, -tEnd/2,  // 5
         wEnd/2, -L,  tEnd/2,  // 6
         wEnd/2, -L,  tEnd/2   // 7
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
    
    let box = Manifold.ofMesh({
        numProp: 3,
        triVerts: indices,
        vertProperties: vertices
    });
    
    if (rx !== 0 || ry !== 0 || rz !== 0) {
        const degX = rx * (180 / Math.PI);
        const degY = ry * (180 / Math.PI);
        const degZ = rz * (180 / Math.PI);
        let rotated = box.rotate([degX, degY, degZ]);
        box.delete();
        box = rotated;
    }
    
    if (x !== 0 || y !== 0 || z !== 0) {
        let translated = box.translate([x, y, z]);
        box.delete();
        box = translated;
    }
    
    return box;
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
    const r_ring = r_finger + 4;
    const r_guard = r_finger + t_guard;

    // Parse engraving text for dynamic guard sizing
    const linesOfText = params.engravingText.split('\n');
    const M = linesOfText.length;
    
    let maxLineWidth = x_coords[3] - x_coords[0];
    for (let l = 0; l < M; l++) {
        const textStr = linesOfText[l].trim();
        const N_l = textStr.length;
        if (N_l > 0) {
            const baseSpacing = params.textSize * 0.85 * params.textKerning;
            const textWidth_l = (N_l - 1) * baseSpacing;
            if (textWidth_l > maxLineWidth) {
                maxLineWidth = textWidth_l;
            }
        }
    }
    
    // Front face width (extend outwardly if text is big)
    const W_front = Math.max(x_coords[3] - x_coords[0], maxLineWidth + params.textSize + 12.0);
    const W_back = x_coords[3] - x_coords[0] + r_ring * 2;
    
    // Front face thickness (extend downward/upward to fit multiline text)
    const lineSpacing = params.textSize * 0.4;
    const totalTextHeight = M * params.textSize + (M - 1) * lineSpacing;
    const h_guard_face = Math.max(h_core, totalTextHeight + 10.0); // 5mm top/bottom padding
    
    // Height for clearance cuts (must cut through taller guard)
    const h_cut = Math.max(h_core, h_guard_face) + 10.0;

    // 2. Build the basic finger rings (solid) and connect them
    const rings = [];
    
    
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

    // Flatten the front of the guard body with a 3D double-tapered ramp block
    const flatBlock = makeCSGDoubleTaperedBox(W_front, W_back, h_guard_face, h_core, r_guard + 4.0, 0, 4.0 + r_guard, 0);
    let flattenedGuard = guardBody.add(flatBlock);
    guardBody.delete();
    flatBlock.delete();
    guardBody = flattenedGuard;

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
        fingerHoles.push(makeCSGCylinder(r_finger, h_cut, x_coords[i], y_coords[i], 0));
    }
    for (let i = 0; i < 4; i++) {
        let temp = knucklesBody.subtract(fingerHoles[i]);
        knucklesBody.delete();
        fingerHoles[i].delete();
        knucklesBody = temp;
    }

    // 9. SUBTRACT Palm Cutout (The inner loop handle)
    const cutoutWidth = x_coords[3] - x_coords[0] - r_ring * 2 + 10;
    const palmCutout = makeCSGBox(cutoutWidth, 20, h_cut, 0, -25, 0);
    const lCutEnd = makeCSGCylinder(10, h_cut, -cutoutWidth/2, -25, 0);
    const rCutEnd = makeCSGCylinder(10, h_cut, cutoutWidth/2, -25, 0);
    
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
        for (let i = 0; i < 4; i++) {
            const r_offset = r_guard - 1.0;
            const px = x_coords[i];
            const py = 4.0 + r_offset;
            const cone = makeCSGCone(r_spike, h_spike + 1.0, px, py, 0, -Math.PI / 2, 0, 0);
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

    // 9.6 ADD 18650 Battery Holder and Haptic System components
    let batX, batY, batZ, outerW, outerL, outerH, batD, batL, wall;
    if (params.batteryHolder) {
        const sideS = params.batterySide === 'left' ? -1 : 1;
        batX = sideS * (x_coords[3] + r_ring + 14.0 - 2.0);
        batY = -20;
        batZ = 0;

        // Build battery holder outer shape (TableKnocker measurements: 15.0 depth battery)
        const batW = 23.0;
        const batDepthVal = 15.0;
        batL = 76.0;
        wall = 3.0;
        outerW = batDepthVal + 2 * wall; // 21.0
        outerH = batW + 2 * wall; // 29.0
        outerL = batL + 2 * wall; // 82.0

        let outer = makeCSGBox(outerW, outerL, outerH, batX, batY, batZ);
        let temp = knucklesBody.add(outer);
        knucklesBody.delete();
        outer.delete();
        knucklesBody = temp;

        // If Haptic System is enabled, build ESP32 holder on top of 18650 holder
        if (params.hapticSystem) {
            const espX = batX;
            const espY = batY;
            const espZ = batZ + outerH / 2 + 1.25; // 2.5/2 = 1.25 is half baseH

            const boardW = 28.5;
            const boardL = 52.5;
            const wallH = 7.5;
            const espWall = 3.0;
            const baseH = 2.5;
            const grip = 1.2;
            const outerW_esp = boardW + 2 * espWall;
            const outerL_esp = boardL + 2 * espWall;

            let base = makeCSGBox(outerW_esp, outerL_esp, baseH, espX, espY, espZ);
            let wallLeft = makeCSGBox(espWall, outerL_esp, wallH, espX - (boardW/2 + espWall/2), espY, espZ + wallH/2 - baseH/2);
            let wallRight = makeCSGBox(espWall, outerL_esp, wallH, espX + (boardW/2 + espWall/2), espY, espZ + wallH/2 - baseH/2);
            let wallBack = makeCSGBox(outerW_esp, espWall, wallH, espX, espY - (boardL/2 + espWall/2), espZ + wallH/2 - baseH/2);

            let gripLeft = makeCSGBox(grip, outerL_esp, 1.2, espX - (boardW/2 - grip/2), espY, espZ + wallH - baseH/2 - 0.6);
            let gripRight = makeCSGBox(grip, outerL_esp, 1.2, espX + (boardW/2 - grip/2), espY, espZ + wallH - baseH/2 - 0.6);

            let espModel = base.add(wallLeft).add(wallRight).add(wallBack).add(gripLeft).add(gripRight);

            let tempH = knucklesBody.add(espModel);
            knucklesBody.delete();
            espModel.delete();
            knucklesBody = tempH;

            [base, wallLeft, wallRight, wallBack, gripLeft, gripRight].forEach(m => {
                try { m.delete(); } catch(e) {}
            });
        }
    }

    // Calculate haptic positioning offsets early
    const sideS = params.batterySide === 'left' ? -1 : 1;
    batX = sideS * (x_coords[3] + r_ring + 14.0 - 2.0);
    batY = -20;
    batZ = 0;

    const oppX = -sideS * (x_coords[3] + r_ring + 14.0 - 2.0);
    const oppY = -20;
    const oppZ = 0;

    const outerH_m = 20.5;
    const Z_top = Math.max(h_core, h_guard_face) / 2;

    // A. PERFORM HAPTIC INSERTS AND CHANNEL CUTS FIRST (so they only cut through the knuckles)
    if (params.hapticSystem) {
        const y_vib1 = y_coords[1] + r_finger + t_guard / 2;
        const y_vib2 = y_coords[2] + r_finger + t_guard / 2;
        
        const holeH = 50.0;
        const z_center = Z_top - 4.0 + holeH / 2;

        let vibInsert1 = makeCSGCylinder(5.0, holeH, x_coords[1], y_vib1, z_center);
        let vibInsert2 = makeCSGCylinder(5.0, holeH, x_coords[2], y_vib2, z_center);

        let tempV1 = knucklesBody.subtract(vibInsert1);
        knucklesBody.delete();
        vibInsert1.delete();
        knucklesBody = tempV1;

        let tempV2 = knucklesBody.subtract(vibInsert2);
        knucklesBody.delete();
        vibInsert2.delete();
        knucklesBody = tempV2;

        // Haptic wire channels: depth and width doubled (5.0mm x 5.0mm)
        const channelY = (y_vib1 + y_vib2) / 2;
        const channelZ = h_core / 2 - 5.0 + 30.0; // center of a 60mm tall box starting at knuckle surface - 5.0

        let transChannel = makeCSGBox(Math.abs(batX - oppX) + 4.0, 5.0, 60.0, 0, channelY, channelZ);

        let tempCh1 = knucklesBody.subtract(transChannel);
        knucklesBody.delete();
        transChannel.delete();
        knucklesBody = tempCh1;

        // Sloped haptic side ramps (from back pockets/cradle at Y = -20 to front knuckles haptic groove at Y = 12)
        const hRampLenL = Math.sqrt(32.0*32.0 + (h_core/2 - (-4.45))*(h_core/2 - (-4.45)));
        const hRampAngleL = Math.atan2(h_core/2 - (-4.45), 32.0);
        let leftHapticRamp = makeCSGBox(5.0, hRampLenL, 5.0, oppX, -4.0, (-4.45 + h_core/2)/2, hRampAngleL, 0, 0);

        const hRampLenR = Math.sqrt(32.0*32.0 + (h_core/2 - 0.0)*(h_core/2 - 0.0));
        const hRampAngleR = Math.atan2(h_core/2 - 0.0, 32.0);
        let rightHapticRamp = makeCSGBox(5.0, hRampLenR, 5.0, batX, -4.0, (0.0 + h_core/2)/2, hRampAngleR, 0, 0);

        let tempHCh1 = knucklesBody.subtract(leftHapticRamp);
        knucklesBody.delete();
        leftHapticRamp.delete();
        knucklesBody = tempHCh1;

        let tempHCh2 = knucklesBody.subtract(rightHapticRamp);
        knucklesBody.delete();
        rightHapticRamp.delete();
        knucklesBody = tempHCh2;
    }

    // B. ADD 18650 Battery Holder and ESP32 Cradle outer blocks (reuse variables)
    if (params.batteryHolder) {
        // Build battery holder outer shape (TableKnocker measurements: 15.0 depth battery)
        const batW = 23.0;
        const batDepthVal = 15.0;
        batL = 76.0;
        wall = 3.0;
        outerW = batDepthVal + 2 * wall; // 21.0
        outerH = batW + 2 * wall; // 29.0
        outerL = batL + 2 * wall; // 82.0

        let outer = makeCSGBox(outerW, outerL, outerH, batX, batY, batZ);
        let temp = knucklesBody.add(outer);
        knucklesBody.delete();
        outer.delete();
        knucklesBody = temp;

        // If Haptic System is enabled, build ESP32 holder on top of 18650 holder
        if (params.hapticSystem) {
            const espX = batX;
            const espY = batY;
            const espZ = batZ + outerH / 2 + 1.25; // 2.5/2 = 1.25 is half baseH

            const boardW = 28.5;
            const boardL = 52.5;
            const wallH = 7.5;
            const espWall = 3.0;
            const baseH = 2.5;
            const grip = 1.2;
            const outerW_esp = boardW + 2 * espWall;
            const outerL_esp = boardL + 2 * espWall;

            let base = makeCSGBox(outerW_esp, outerL_esp, baseH, espX, espY, espZ);
            let wallLeft = makeCSGBox(espWall, outerL_esp, wallH, espX - (boardW/2 + espWall/2), espY, espZ + wallH/2 - baseH/2);
            let wallRight = makeCSGBox(espWall, outerL_esp, wallH, espX + (boardW/2 + espWall/2), espY, espZ + wallH/2 - baseH/2);
            let wallBack = makeCSGBox(outerW_esp, espWall, wallH, espX, espY - (boardL/2 + espWall/2), espZ + wallH/2 - baseH/2);

            let gripLeft = makeCSGBox(grip, outerL_esp, 1.2, espX - (boardW/2 - grip/2), espY, espZ + wallH - baseH/2 - 0.6);
            let gripRight = makeCSGBox(grip, outerL_esp, 1.2, espX + (boardW/2 - grip/2), espY, espZ + wallH - baseH/2 - 0.6);

            let espModel = base.add(wallLeft).add(wallRight).add(wallBack).add(gripLeft).add(gripRight);

            let tempH = knucklesBody.add(espModel);
            knucklesBody.delete();
            espModel.delete();
            knucklesBody = tempH;

            [base, wallLeft, wallRight, wallBack, gripLeft, gripRight].forEach(m => {
                try { m.delete(); } catch(e) {}
            });
        }
    }

    // C. ADD Motor + Switch housing block on the opposite side
    if (params.hapticSystem) {
        const outerW_m = 22.0;
        const outerL_m = 54.0;

        let block = makeCSGBox(outerW_m, outerL_m, outerH_m, oppX, oppY, oppZ);
        let tempM = knucklesBody.add(block);
        knucklesBody.delete();
        block.delete();
        knucklesBody = tempM;
    }

    // D. PERFORM ALL SUBTRACTIONS (CUTS) AT THE END
    if (params.batteryHolder) {
        // Battery cuts carved out of the entire merged assembly (ensures open ends and no overlapping solid material)
        // Using TableKnocker's exact square pocket clearance cuts (+0.6mm)
        const innerCutW = 15.0 + 0.6; // X
        const innerCutH = 23.0 + 0.6; // Z
        const innerCutL = 76.0 + 2.0; // Y (open-ended)
        
        let batCut = makeCSGBox(innerCutW, innerCutL, innerCutH, batX, batY, batZ);
        // Top slot opening cut to make it a snap-in U-groove
        let topCut = makeCSGBox(innerCutW - 1.0, innerCutL, innerCutH + wall*2 + 2.0, batX, batY, batZ + innerCutH/2 + wall);

        let tempC1 = knucklesBody.subtract(batCut);
        knucklesBody.delete();
        batCut.delete();
        knucklesBody = tempC1;

        let tempC2 = knucklesBody.subtract(topCut);
        knucklesBody.delete();
        topCut.delete();
        knucklesBody = tempC2;
    }

    if (params.hapticSystem) {
        // Cut pockets and wiring holes out of opposite side housing
        const motorPocketY = oppY + 7.75; // Close to haptics (positive Y)
        const motorPocketZ = oppZ + outerH_m/2 - 14.5/2 + 0.1;
        let motorPocket = makeCSGBox(17.0, 33.5, 14.7, oppX, motorPocketY, motorPocketZ);

        const switchPocketY = oppY - 18.0; // Near grip (negative Y)
        const switchPocketZ = oppZ + outerH_m/2 - 14.7/2 + 0.1;
        // Rotated switch pocket: long side (18.7) along X axis (lengthwise along with knuckles), short side (13.0) along Y axis, depth (14.7) along Z axis to match motor depth
        let switchPocket = makeCSGBox(18.7, 13.0, 14.7, oppX, switchPocketY, switchPocketZ);

        let tempS1 = knucklesBody.subtract(motorPocket);
        knucklesBody.delete();
        motorPocket.delete();
        knucklesBody = tempS1;

        let tempS2 = knucklesBody.subtract(switchPocket);
        knucklesBody.delete();
        switchPocket.delete();
        knucklesBody = tempS2;

        // E. 4mm Power channels: sloped Y-ramps for optimized 3D printing
        // 1. Motor pocket to Switch pocket channel (flat/horizontal bottom at Z = -4.45)
        let motorToSwitch = makeCSGBox(4.0, 25.75, 4.0, oppX, (motorPocketY + switchPocketY)/2, -4.45 + 2.0);

        // 2. Switch pocket to Back grip surface ramp (slopes from -4.45 to h_core/2 = 8.0 along Y)
        const s2bLen = Math.sqrt(7.0*7.0 + (h_core/2 - (-4.45))*(h_core/2 - (-4.45)));
        const s2bAngle = Math.atan2(h_core/2 - (-4.45), -7.0);
        let switchToBack = makeCSGBox(4.0, s2bLen, 4.0, oppX, (-45 + switchPocketY)/2, (-4.45 + h_core/2)/2, s2bAngle, 0, 0);

        // 3. Back Transverse Groove (flat 4mm groove along palm grip surface at Z = h_core/2)
        const pChannelZ = h_core / 2 - 4.0 + 30.0;
        let backTrans = makeCSGBox(Math.abs(batX - oppX) + 4.0, 4.0, 60.0, 0, -45, pChannelZ);

        // 4. Battery pocket to Back grip surface ramp (slopes from 0.0 to h_core/2 = 8.0 along Y)
        const b2bLen = Math.sqrt(25.0*25.0 + (h_core/2)*(h_core/2));
        const b2bAngleCorrected = Math.atan2(-h_core/2, 25.0);
        let backToBat = makeCSGBox(4.0, b2bLen, 4.0, batX, (-45 + batY)/2, (0 + h_core/2)/2, b2bAngleCorrected, 0, 0);

        let tempP1 = knucklesBody.subtract(motorToSwitch);
        knucklesBody.delete();
        motorToSwitch.delete();
        knucklesBody = tempP1;

        let tempP2 = knucklesBody.subtract(switchToBack);
        knucklesBody.delete();
        switchToBack.delete();
        knucklesBody = tempP2;

        let tempP3 = knucklesBody.subtract(backTrans);
        knucklesBody.delete();
        backTrans.delete();
        knucklesBody = tempP3;

        let tempP4 = knucklesBody.subtract(backToBat);
        knucklesBody.delete();
        backToBat.delete();
        knucklesBody = tempP4;

    }

    // 10. APPLY Tactical Typography (Engraving or Embossing)
    if (loadedFont && params.engravingText.trim().length > 0) {
        try {
            const linesOfText = params.engravingText.split('\n');
            const M = linesOfText.length;
            
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
                geomHeight = 55.0; // cut completely through
                r_offset = r_guard + 5.0; // start 5mm outside the front face
                z1_factor = -1.0;
            }
            
            const charManifolds = [];
            
            // Calculate vertical bounds
            const lineSpacing = params.textSize * 0.4;
            const totalTextHeight = M * params.textSize + (M - 1) * lineSpacing;
            const startZ = totalTextHeight / 2 - params.textSize / 2;
            
            for (let l = 0; l < M; l++) {
                let textStr = linesOfText[l].trim();
                if (params.mirrorText) {
                    textStr = [...textStr].reverse().join('');
                }
                const N_l = textStr.length;
                if (N_l === 0) continue;
                
                // Vertical position for this line
                const z_line = startZ - l * (params.textSize + lineSpacing);
                
                // Character spacing for this line (aligned within W_front minus padding)
                const maxTextWidth = W_front - params.textSize - 12.0;
                const baseSpacing = params.textSize * 0.85 * params.textKerning;
                const charSpacing = Math.min(maxTextWidth / (N_l - 1 || 1), baseSpacing);
                const textWidth = (N_l - 1) * charSpacing;
                const startX = -textWidth / 2;
                
                for (let j = 0; j < N_l; j++) {
                    const c = textStr[j];
                    if (c === " ") continue;
                    
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
                    
                    const x_j = startX + j * charSpacing;
                    const phi = 0;
                    const posX = x_j;
                    const posY = 4.0 + r_offset;
                    
                    const posAttr = charGeom.getAttribute('position');
                    for (let i = 0; i < posAttr.count; i++) {
                        const x = posAttr.getX(i);
                        const y = posAttr.getY(i);
                        const z = posAttr.getZ(i);
                        
                        let x1 = x - charGeom.boundingBox.min.x - charWidth / 2;
                        const y1 = y - charGeom.boundingBox.min.y - charHeight / 2 + z_line;
                        const z1 = z * z1_factor;
                        
                        if (params.mirrorText) {
                            x1 = -x1;
                        }
                        
                        const posX_cad = posX + x1;
                        const posY_cad = posY + z1;
                        const posZ_cad = y1;
                        
                        posAttr.setXYZ(i, posX_cad, posY_cad, posZ_cad);
                    }
                    posAttr.needsUpdate = true;
                    
                    const reverseWinding = params.mirrorText !== (z1_factor < 0);
                    const charManifold = threeToManifold(charGeom, reverseWinding);
                    charGeom.dispose();
                    
                    if (charManifold) {
                        charManifolds.push(charManifold);
                    }
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

        // Parse engraving text for dynamic visualizer height
        const linesOfText = params.engravingText.split('\n');
        const M = linesOfText.length;
        const lineSpacing = params.textSize * 0.4;
        const totalTextHeight = M * params.textSize + (M - 1) * lineSpacing;
        const h_guard_face = Math.max(params.dusterHeight, totalTextHeight + 10.0);
        const h_cut = h_guard_face + 10.0;

        // Finger cutout boxes
        for (let i = 0; i < 4; i++) {
            const geom = new THREE.CylinderGeometry(r_finger, r_finger, h_cut, 24);
            geom.rotateX(Math.PI / 2);
            const m = new THREE.Mesh(geom, cutoutMat);
            m.position.set(x_coords[i], y_coords[i], 0);
            cutoutsGroup.add(m);
        }

        // Palm cutout box
        const cutoutWidth = x_coords[3] - x_coords[0] - (r_finger + 4) * 2 + 10;
        const pCutGeom = new THREE.BoxGeometry(cutoutWidth, 20, h_cut);
        const pCut = new THREE.Mesh(pCutGeom, cutoutMat);
        pCut.position.set(0, -25, 0);
        cutoutsGroup.add(pCut);

        // Cylindrical caps for palm cutout
        const capL = new THREE.CylinderGeometry(10, 10, h_cut, 24);
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

        // Amber cutout volume visualization for haptic battery slot, motor/switch pockets, inserts, and wire channels
        if (params.batteryHolder) {
            const sideS = params.batterySide === 'left' ? -1 : 1;
            const batX = sideS * (spacing * 1.5 + r_ring + 14.0 - 2.0);
            const batY = -20;
            const batZ = 0;
            const innerCutW = 15.0 + 0.6;
            const innerCutH = 23.0 + 0.6;
            const innerCutL = 76.0 + 2.0;

            const batCutGeom = new THREE.BoxGeometry(innerCutW, innerCutL, innerCutH);
            const batCutMesh = new THREE.Mesh(batCutGeom, cutoutMat);
            batCutMesh.position.set(batX, batY, batZ);
            cutoutsGroup.add(batCutMesh);

            const topCutGeom = new THREE.BoxGeometry(innerCutW - 1.0, innerCutL, innerCutH + 6.0);
            const topCutMesh = new THREE.Mesh(topCutGeom, cutoutMat);
            topCutMesh.position.set(batX, batY, batZ + innerCutH/2 + 3.0);
            cutoutsGroup.add(topCutMesh);
        }

        if (params.hapticSystem) {
            const sideS = params.batterySide === 'left' ? -1 : 1;
            const oppX = -sideS * (spacing * 1.5 + r_ring + 14.0 - 2.0);
            const oppY = -20;
            const oppZ = 0;
            const outerH_m = 20.5;

            // Motor pocket closest to haptics (Y lengthwise)
            const motorPocketY = oppY + 7.75;
            const motorPocketZ = oppZ + outerH_m/2 - 14.5/2 + 0.1;
            const motorGeom = new THREE.BoxGeometry(17.0, 33.5, 14.7);
            const motorMesh = new THREE.Mesh(motorGeom, cutoutMat);
            motorMesh.position.set(oppX, motorPocketY, motorPocketZ);
            cutoutsGroup.add(motorMesh);

            // Switch pocket (vertical bezel top surface)
            const switchPocketY = oppY - 18.0;
            const switchPocketZ = oppZ + outerH_m/2 - 14.7/2 + 0.1;
            const switchGeom = new THREE.BoxGeometry(18.7, 13.0, 14.7);
            const switchMesh = new THREE.Mesh(switchGeom, cutoutMat);
            switchMesh.position.set(oppX, switchPocketY, switchPocketZ);
            cutoutsGroup.add(switchMesh);

            // Haptic cylinder inserts
            const t_guard = params.guardThick;
            const y_vib1 = y_coords[1] + r_finger + t_guard / 2;
            const y_vib2 = y_coords[2] + r_finger + t_guard / 2;
            const Z_top = params.dusterHeight / 2;
            const z_center = Z_top - 4.0 + 25.0; // center of a 50mm tall cylinder starting at Z_top - 4.0
            
            const insertGeom = new THREE.CylinderGeometry(5.0, 5.0, 50.0, 16);
            insertGeom.rotateX(Math.PI/2);
            
            const ins1Mesh = new THREE.Mesh(insertGeom, cutoutMat);
            ins1Mesh.position.set(x_coords[1], y_vib1, z_center);
            cutoutsGroup.add(ins1Mesh);

            const ins2Mesh = new THREE.Mesh(insertGeom, cutoutMat);
            ins2Mesh.position.set(x_coords[2], y_vib2, z_center);
            cutoutsGroup.add(ins2Mesh);

            // Wire channels (depth 5.0mm, width 5.0mm)
            const channelY = (y_vib1 + y_vib2) / 2;
            const channelZ = Z_top - 5.0 + 15.0;
            const batX = sideS * (spacing * 1.5 + r_ring + 14.0 - 2.0);

            const transGeom = new THREE.BoxGeometry(Math.abs(batX - oppX) + 4.0, 5.0, 30.0);
            const transMesh = new THREE.Mesh(transGeom, cutoutMat);
            transMesh.position.set(0, channelY, channelZ);
            cutoutsGroup.add(transMesh);

            // Left and Right Haptic Side Ramps
            const hRampLenL = Math.sqrt(32.0*32.0 + (Z_top - (-4.45))*(Z_top - (-4.45)));
            const hRampAngleL = Math.atan2(Z_top - (-4.45), 32.0);
            const lHapticGeom = new THREE.BoxGeometry(5.0, hRampLenL, 5.0);
            lHapticGeom.rotateX(hRampAngleL);
            const lHapticMesh = new THREE.Mesh(lHapticGeom, cutoutMat);
            lHapticMesh.position.set(oppX, -4.0, (-4.45 + Z_top)/2);
            cutoutsGroup.add(lHapticMesh);

            const hRampLenR = Math.sqrt(32.0*32.0 + Z_top*Z_top);
            const hRampAngleR = Math.atan2(Z_top, 32.0);
            const rHapticGeom = new THREE.BoxGeometry(5.0, hRampLenR, 5.0);
            rHapticGeom.rotateX(hRampAngleR);
            const rHapticMesh = new THREE.Mesh(rHapticGeom, cutoutMat);
            rHapticMesh.position.set(batX, -4.0, Z_top/2);
            cutoutsGroup.add(rHapticMesh);

            // 4mm Power wire grooves (cutouts) Y-ramps
            const pChannelZ = Z_top - 4.0 + 15.0;
            
            const m2sGeom = new THREE.BoxGeometry(4.0, 25.75, 4.0);
            const m2sMesh = new THREE.Mesh(m2sGeom, cutoutMat);
            m2sMesh.position.set(oppX, (motorPocketY + switchPocketY)/2, -4.45 + 2.0);
            cutoutsGroup.add(m2sMesh);

            const s2bLen = Math.sqrt(7.0*7.0 + (Z_top - (-4.45))*(Z_top - (-4.45)));
            const s2bAngle = Math.atan2(Z_top - (-4.45), -7.0);
            const s2bGeom = new THREE.BoxGeometry(4.0, s2bLen, 4.0);
            s2bGeom.rotateX(s2bAngle);
            const s2bMesh = new THREE.Mesh(s2bGeom, cutoutMat);
            s2bMesh.position.set(oppX, (-45 + switchPocketY)/2, (-4.45 + Z_top)/2);
            cutoutsGroup.add(s2bMesh);

            const backTransGeom = new THREE.BoxGeometry(Math.abs(batX - oppX) + 4.0, 4.0, 30.0);
            const btMesh = new THREE.Mesh(backTransGeom, cutoutMat);
            btMesh.position.set(0, -45, pChannelZ);
            cutoutsGroup.add(btMesh);

            const b2bLen = Math.sqrt(25.0*25.0 + Z_top*Z_top);
            const b2bAngleCorrected = Math.atan2(-Z_top, 25.0);
            const b2bGeom = new THREE.BoxGeometry(4.0, b2bLen, 4.0);
            b2bGeom.rotateX(b2bAngleCorrected);
            const b2bMesh = new THREE.Mesh(b2bGeom, cutoutMat);
            b2bMesh.position.set(batX, (-45 + batY)/2, Z_top/2);
            cutoutsGroup.add(b2bMesh);
        }
    }

    // 7. Update Spec Sheet Statistics
    let totalVolCc = "0.0";
    let estimatedWeightG = "0";
    if (!isNaN(knucklesVol) && knucklesVol > 0) {
        totalVolCc = (knucklesVol / 1000).toFixed(1);
        estimatedWeightG = (totalVolCc * 1.24).toFixed(0);
    }
    
    document.getElementById('spec-volume').innerText = `${totalVolCc} cm³`;
    document.getElementById('spec-weight').innerText = `${estimatedWeightG} g`;
    
    // Bounds: calculate actual dynamic bounds
    const r_ring_bounds = params.fingerDiam / 2 + 4;
    const spacing_bounds = Math.max(params.fingerDiam + 4, (params.handWidth - params.fingerDiam - 12) / 3);
    const width_base = spacing_bounds * 3;
    
    const linesOfText_bounds = params.engravingText.split('\n');
    const M_bounds = linesOfText_bounds.length;
    let maxLineWidth_bounds = width_base;
    for (let l = 0; l < M_bounds; l++) {
        const textStr = linesOfText_bounds[l].trim();
        const N_l = textStr.length;
        if (N_l > 0) {
            const baseSpacing = params.textSize * 0.85 * params.textKerning;
            const textWidth_l = (N_l - 1) * baseSpacing;
            if (textWidth_l > maxLineWidth_bounds) {
                maxLineWidth_bounds = textWidth_l;
            }
        }
    }
    const W_front_bounds = Math.max(width_base, maxLineWidth_bounds + params.textSize + 12.0);
    const W_back_bounds = width_base + r_ring_bounds * 2;
    
    let maxX = W_back_bounds / 2;
    let minX = -W_back_bounds / 2;
    if (params.batteryHolder) {
        const sideS = params.batterySide === 'left' ? -1 : 1;
        const batX = sideS * (spacing_bounds * 1.5 + r_ring_bounds + 14.0 - 2.0);
        const w_bat = 28.0;
        if (sideS > 0) maxX = Math.max(maxX, batX + w_bat/2);
        else minX = Math.min(minX, batX - w_bat/2);
        
        if (params.hapticSystem) {
            const espW = 34.5;
            if (sideS > 0) maxX = Math.max(maxX, batX + espW/2);
            else minX = Math.min(minX, batX - espW/2);
        }
    }
    if (params.hapticSystem) {
        const sideS = params.batterySide === 'left' ? -1 : 1;
        const oppX = -sideS * (spacing_bounds * 1.5 + r_ring_bounds + 14.0 - 2.0);
        const w_mot = 22.0;
        if (-sideS > 0) maxX = Math.max(maxX, oppX + w_mot/2);
        else minX = Math.min(minX, oppX - w_mot/2);
    }
    const boundsWidth = (maxX - minX).toFixed(0);
    
    const lineSpacing_bounds = params.textSize * 0.4;
    const totalTextHeight_bounds = M_bounds * params.textSize + (M_bounds - 1) * lineSpacing_bounds;
    const h_guard_face_bounds = Math.max(params.dusterHeight, totalTextHeight_bounds + 10.0);
    const baseBoundsHeight = Math.max(params.dusterHeight, h_guard_face_bounds);
 
    let maxZ = baseBoundsHeight / 2;
    let minZ = -baseBoundsHeight / 2;
    if (params.batteryHolder) {
        maxZ = Math.max(maxZ, 14.5);
        minZ = Math.min(minZ, -14.5);
        if (params.hapticSystem) {
            maxZ = Math.max(maxZ, 14.5 + 2.5/2 + 7.5);
        }
    }
    if (params.hapticSystem) {
        maxZ = Math.max(maxZ, 20.5/2);
        minZ = Math.min(minZ, -20.5/2);
    }
    const finalBoundsHeight = (maxZ - minZ).toFixed(0);
    
    let maxY = 15;
    let minY = -52.5;
    if (params.batteryHolder) {
        minY = Math.min(minY, -20 - 82.0/2);
        maxY = Math.max(maxY, -20 + 72.0/2);
    }
    const finalBoundsLength = (maxY - minY + params.spikeHeight).toFixed(0);
    
    document.getElementById('spec-bounds').innerText = `${boundsWidth} x ${finalBoundsLength} x ${finalBoundsHeight} mm`;

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

        // Guard thickness line (Index finger front flat face)
        const r_guard = params.fingerDiam / 2 + params.guardThick;
        drawDimension(
            new THREE.Vector3(-1.5 * spacing, 4.0 + r_guard, 0),
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
            drawDimension(
                new THREE.Vector3(1.5 * spacing, 4.0 + r_guard + params.spikeHeight, 0),
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

        // 18650 Battery Holder leader line
        if (params.batteryHolder) {
            const sideS = params.batterySide === 'left' ? -1 : 1;
            const batX = sideS * (1.5 * spacing + r_finger + 4 + 14.0 - 2.0);
            drawDimension(
                new THREE.Vector3(batX, -20, 0),
                `18650 Cell Slot`,
                sideS, -1, '#00ffaa'
            );
        }

        // ESP32 cradle leader line
        if (params.batteryHolder && params.hapticSystem) {
            const sideS = params.batterySide === 'left' ? -1 : 1;
            const batX = sideS * (1.5 * spacing + r_finger + 4 + 14.0 - 2.0);
            drawDimension(
                new THREE.Vector3(batX, -20, 16.5),
                `ESP32 Cradle`,
                sideS, 1, '#00f3ff'
            );
        }

        // Haptic system opposite components (Motor & Switch)
        if (params.hapticSystem) {
            const sideS = params.batterySide === 'left' ? -1 : 1;
            const oppX = -sideS * (1.5 * spacing + r_finger + 4 + 14.0 - 2.0);
            drawDimension(
                new THREE.Vector3(oppX, -20, 0),
                `Motor & Switch`,
                -sideS, -1, '#f97316'
            );
            
            // Vibrators inserts
            drawDimension(
                new THREE.Vector3(spacing * 0.5, 20.5, params.dusterHeight/2),
                `Haptic Insert: Ø10x4mm`,
                1, -1, '#ff00b3'
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
