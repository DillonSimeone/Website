import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Module from 'https://unpkg.com/manifold-3d/manifold.js';

let wasm, Manifold;
let scene, camera, renderer, controls;
let mainGroup; // holds all mesh representations
let overlaySvg = document.getElementById('dimensions-overlay');

// Dimensions of items
const SCREEN_W = 76;
const SCREEN_L = 120;
const SCREEN_H = 16;

const STACK_W = 53.5;
const STACK_L = 80;
const STACK_H = 33;

// Current parameters state (includes coordinates, sizes, shell options, visual settings)
const params = {
    wallThick: 1.5,
    batteryHeight: 0.0,
    cornerRad: 3.0,
    
    // DB9 Cutout
    db9X: 0.0,
    db9Y: 0.0,
    db9Z: 0.0,
    db9W: 35.0,
    db9H: 15.0,
    db9D: 50.0,

    // BNC Cutout
    bncX: 0.0,
    bncY: 0.0,
    bncZ: 0.0,
    bncW: 14.0,
    bncH: 14.0,
    bncD: 50.0,

    // RJ45 Cutout
    rj45X: 0.0,
    rj45Y: 0.0,
    rj45Z: 0.0,
    rj45W: 16.0,
    rj45H: 17.0,
    rj45D: 40.0,

    // USB Cutout
    usbX: 0.0,
    usbY: 0.0,
    usbZ: 0.0,
    usbW: 15.0,
    usbH: 3.0,
    usbD: 40.0,

    explode: 0.0,
    opacity: 80,
    mode: 'rendered' // 'rendered' or 'blueprint'
};

const visibilities = {
    case: true,
    screen: true,
    stack: true,
    cutouts: false
};

// Meshes references
let caseMesh = null;
let designGroup = new THREE.Group(); // Holds screen, stack, cutouts for visuals

// Colors (Neon Blueprint Style)
const colors = {
    screen: 0x00ffaa,
    stack: 0x4f46e5,
    cutouts: 0xff8800,
    caseSolid: 0x00f2ff,
    caseLine: 0xffffff,
    blueprintLine: 0x00f2ff
};

// Setup the Scene
function init() {
    const container = document.getElementById('canvas3d');
    
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x061224, 0.0015);

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 2000);
    camera.position.set(220, 15, 0); // Looking directly from the side profile

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, -15, 0); // Target the center of the connector stack in Y-up space
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.update();
    controls.maxPolarAngle = Math.PI / 2 + 0.1;

    // Grid & Blueprint Floor (Lies flat on XZ plane, horizontal)
    const polarGrid = new THREE.GridHelper(400, 40, 0x00f2ff, 0x004466);
    polarGrid.position.y = -55; // below the assembly
    scene.add(polarGrid);

    // Lights
    const ambient = new THREE.AmbientLight(0x0f2b48, 1.5);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(100, 150, 200);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene.add(keyLight);

    const fillLight = new THREE.PointLight(0x00f2ff, 1.0, 300);
    fillLight.position.set(-100, 100, 50);
    scene.add(fillLight);

    mainGroup = new THREE.Group();
    mainGroup.rotation.x = -Math.PI / 2; // Map CAD Z-up to Three.js Y-up so assembly lies flat
    scene.add(mainGroup);
    mainGroup.add(designGroup);

    window.addEventListener('resize', onWindowResize);
    setupUIListeners();
    rebuild();
    animate();
}

function onWindowResize() {
    const container = document.getElementById('canvas3d');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

// Setup sliders and toggle behaviors
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

    // Shell
    bindSlider('input-wallThick', 'wallThick');
    bindSlider('input-batteryHeight', 'batteryHeight');
    bindSlider('input-cornerRad', 'cornerRad');

    // DB9
    bindSlider('input-db9X', 'db9X');
    bindSlider('input-db9Y', 'db9Y');
    bindSlider('input-db9Z', 'db9Z');
    bindSlider('input-db9W', 'db9W');
    bindSlider('input-db9H', 'db9H');
    bindSlider('input-db9D', 'db9D');

    // BNC
    bindSlider('input-bncX', 'bncX');
    bindSlider('input-bncY', 'bncY');
    bindSlider('input-bncZ', 'bncZ');
    bindSlider('input-bncW', 'bncW');
    bindSlider('input-bncH', 'bncH');
    bindSlider('input-bncD', 'bncD');

    // RJ45
    bindSlider('input-rj45X', 'rj45X');
    bindSlider('input-rj45Y', 'rj45Y');
    bindSlider('input-rj45Z', 'rj45Z');
    bindSlider('input-rj45W', 'rj45W');
    bindSlider('input-rj45H', 'rj45H');
    bindSlider('input-rj45D', 'rj45D');

    // USB
    bindSlider('input-usbX', 'usbX');
    bindSlider('input-usbY', 'usbY');
    bindSlider('input-usbZ', 'usbZ');
    bindSlider('input-usbW', 'usbW');
    bindSlider('input-usbH', 'usbH');
    bindSlider('input-usbD', 'usbD');

    // Display
    bindSlider('input-explode', 'explode');
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
    bindVisibility('show-case', 'case');
    bindVisibility('show-screen', 'screen');
    bindVisibility('show-stack', 'stack');
    bindVisibility('show-cutouts', 'cutouts');

    // Export STL
    document.getElementById('btn-export-stl').addEventListener('click', exportSTL);
}

// Initialize Manifold WASM
async function initManifold() {
    try {
        wasm = await Module();
        wasm.setup();
        Manifold = wasm.Manifold;
        console.log("Manifold geometry kernel successfully initialized");
        rebuild();
    } catch(e) {
        console.error("Failed to load Manifold WASM. Enclosure geometry calculation unavailable.", e);
        const footerStatus = document.querySelector('footer div.status-left span:last-child');
        if (footerStatus) footerStatus.textContent = "MANIFOLD LOAD FAILED (PLACEHOLDERS ACTIVE)";
    }
}

// --- Core Geometric Modeling Logic ---
function generateCaseShell() {
    if (!Manifold) return null;

    // Clearance gaps
    const clearance = 0.4;
    const w = params.wallThick;

    // Helper for rounded box:
    const makeRoundedBox = (dx, dy, dz, r) => {
        r = Math.min(r, dx/2 - 1, dy/2 - 1);
        if (r < 0.1) return Manifold.cube([dx, dy, dz], true);
        
        const c = Manifold.cylinder(dz, r, r, 32, true);
        const xOff = dx/2 - r;
        const yOff = dy/2 - r;

        const c1 = c.translate([xOff, yOff, 0]);
        const c2 = c.translate([-xOff, yOff, 0]);
        const c3 = c.translate([-xOff, -yOff, 0]);
        const c4 = c.translate([xOff, -yOff, 0]);

        const hull2d = Manifold.union([c1, c2]).add(c3).add(c4);
        const b1 = Manifold.cube([dx, dy - 2*r, dz], true);
        const b2 = Manifold.cube([dx - 2*r, dy, dz], true);
        
        return hull2d.add(b1).add(b2);
    };

    // Helper for transition frustum:
    const makeFrustum = (w1, l1, w2, l2, h) => {
        const pts = new Float32Array([
            -w2/2, -l2/2, 0,
             w2/2, -l2/2, 0,
             w2/2,  l2/2, 0,
            -w2/2,  l2/2, 0,
            -w1/2, -l1/2, h,
             w1/2, -l1/2, h,
             w1/2,  l1/2, h,
            -w1/2,  l1/2, h
        ]);
        const tris = new Uint32Array([
            0, 2, 1,  0, 3, 2,
            4, 5, 6,  4, 6, 7,
            0, 1, 5,  0, 5, 4,
            1, 2, 6,  1, 6, 5,
            2, 3, 7,  2, 7, 6,
            3, 0, 4,  3, 4, 7
        ]);
        return Manifold.ofMesh({
            numProp: 3,
            triVerts: tris,
            vertProperties: pts
        });
    };

    const r_out = params.cornerRad;

    // Outer screen body: Z goes from -w to SCREEN_H + w
    const screenOuterW = SCREEN_W + 2*clearance + 2*w;
    const screenOuterL = SCREEN_L + 2*clearance + 2*w;
    const screenOuter = makeRoundedBox(
        screenOuterW, 
        screenOuterL, 
        SCREEN_H + clearance + 2*w, 
        r_out
    ).translate([0, 0, (SCREEN_H + clearance + 2*w)/2 - w]);

    // Outer stack body: Z goes from -(STACK_H + batteryHeight + w) to -15
    const stackOuterL = STACK_L + 2*clearance + 2*w;
    const stackOuterW = STACK_W + 2*clearance + 2*w;
    const stackOuterHeight = STACK_H + params.batteryHeight + w - 15;
    const stackOuter = makeRoundedBox(
        stackOuterW, 
        stackOuterL, 
        stackOuterHeight, 
        r_out
    ).translate([
        0, 
        0, // Centered
        -15 - stackOuterHeight/2
    ]);

    // Bottom Transition Frustum connecting screenOuter and stackOuter
    const transitionHeight = 15 - w;
    const transition = makeFrustum(
        screenOuterW, 
        screenOuterL, 
        stackOuterW, 
        stackOuterL, 
        transitionHeight
    ).translate([0, 0, -15]);

    // Combine outer shells
    let shellSolid = screenOuter.add(transition).add(stackOuter);

    // Inside Cavities to carve out
    const screenInner = Manifold.cube([SCREEN_W + 2*clearance + 0.8, SCREEN_L + 2*clearance + 0.8, SCREEN_H + 10], true)
        .translate([0, 0, (SCREEN_H + 10)/2]);
    
    // Stack Cavity
    const stackInner = Manifold.cube([
        STACK_W + 2*clearance, 
        STACK_L + 2*clearance, 
        STACK_H + params.batteryHeight + 2
    ], true).translate([
        0, 
        0, 
        -(STACK_H + params.batteryHeight)/2
    ]);

    // Subtract screen and stack cavities
    shellSolid = shellSolid.subtract(screenInner).subtract(stackInner);

    // 1. SD Card Slot (On the 53.5mm side Y = -40, Z = -7)
    // Extend the cutouts all the way through the outer shell and transition ramp down to the top of stack (Z = -15)
    const sdSlot = Manifold.cube([16, 60, 2], true).translate([0, -60, -7]);
    const sdChannel = Manifold.cube([20, 60, 9], true).translate([0, -60, -10.5]);
    shellSolid = shellSolid.subtract(sdSlot).subtract(sdChannel);

    // 2. DB9 Port Cutout (On the +X edge, corner Y = -22 baseline)
    // Parametric width, height, depth. Cutout translated outwards to clear the shell wall.
    const db9Cutout = Manifold.cube([params.db9D, params.db9W, params.db9H], true).translate([
        26.75 + params.db9D/2 - 10 + params.db9X, 
        -22 + params.db9Y, 
        -33 + params.db9H/2 + params.db9Z
    ]);
    shellSolid = shellSolid.subtract(db9Cutout);

    // 3. BNC Port Cutout (On the +X edge, corner Y = 30 baseline)
    const bncCutout = Manifold.cube([params.bncD, params.bncW, params.bncH], true).translate([
        26.75 + params.bncD/2 - 10 + params.bncX, 
        30 + params.bncY, 
        -33 + params.bncH/2 + params.bncZ
    ]);
    shellSolid = shellSolid.subtract(bncCutout);

    // 4. RJ45 Slot (On the -Y narrow side, Y = -40, under the SD slot)
    const rj45Cutout = Manifold.cube([params.rj45W, params.rj45D, params.rj45H], true).translate([
        params.rj45X, 
        -40 - params.rj45D/2 + 10 + params.rj45Y, 
        -33 + params.rj45H/2 + params.rj45Z
    ]);
    shellSolid = shellSolid.subtract(rj45Cutout);

    // 5. USB Charging Slot (On the +Y narrow side, Y = 40, X = -12)
    const usbCutout = Manifold.cube([params.usbW, params.usbD, params.usbH], true).translate([
        -12 + params.usbX, 
        40 + params.usbD/2 - 10 + params.usbY, 
        -33 + params.usbH/2 + params.usbZ
    ]);
    shellSolid = shellSolid.subtract(usbCutout);

    return shellSolid;
}

// Convert Manifold geometry to Three.js BufferGeometry
function manifoldToThree(manifoldMesh) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(manifoldMesh.vertProperties, 3));
    geometry.setIndex(new THREE.Uint32BufferAttribute(manifoldMesh.triVerts, 1));
    geometry.computeVertexNormals();
    return geometry;
}

// Rebuild the 3D representation
function rebuild() {
    // Clear previous representations
    if (caseMesh) {
        mainGroup.remove(caseMesh);
        caseMesh.geometry.dispose();
        caseMesh = null;
    }
    while(designGroup.children.length > 0) {
        const child = designGroup.children[0];
        if(child.geometry) child.geometry.dispose();
        designGroup.remove(child);
    }

    // --- 1. Draw Internal Assemblies if visible ---
    const materials = {
        screen: new THREE.MeshStandardMaterial({
            color: colors.screen,
            roughness: 0.2,
            metalness: 0.1,
            transparent: true,
            opacity: 0.6
        }),
        stack: new THREE.MeshStandardMaterial({
            color: colors.stack,
            roughness: 0.5,
            metalness: 0.8,
            transparent: true,
            opacity: 0.7
        }),
        cutoutTool: new THREE.MeshBasicMaterial({
            color: colors.cutouts,
            wireframe: true,
            transparent: true,
            opacity: 0.45
        })
    };

    // Draw STM32 Screen Box
    if (visibilities.screen) {
        const screenGeom = new THREE.BoxGeometry(SCREEN_W, SCREEN_L, SCREEN_H);
        const screenMesh = new THREE.Mesh(screenGeom, materials.screen);
        screenMesh.position.set(0, 0, SCREEN_H / 2);
        screenMesh.castShadow = true;
        screenMesh.receiveShadow = true;
        designGroup.add(screenMesh);
    }

    // Draw STM32 + Daughterboard Stack Box
    if (visibilities.stack) {
        const stackGeom = new THREE.BoxGeometry(STACK_W, STACK_L, STACK_H);
        const stackMesh = new THREE.Mesh(stackGeom, materials.stack);
        stackMesh.position.set(0, 0, -STACK_H / 2);
        stackMesh.castShadow = true;
        stackMesh.receiveShadow = true;
        designGroup.add(stackMesh);
    }

    // Draw Port Cutouts as Solid Visual Aids
    if (visibilities.cutouts) {
        // DB9
        const db9Geom = new THREE.BoxGeometry(params.db9D, params.db9W, params.db9H);
        const db9Mesh = new THREE.Mesh(db9Geom, materials.cutoutTool);
        db9Mesh.position.set(26.75 + params.db9D/2 - 10 + params.db9X, -22 + params.db9Y, -33 + params.db9H/2 + params.db9Z);
        designGroup.add(db9Mesh);

        // BNC
        const bncGeom = new THREE.BoxGeometry(params.bncD, params.bncW, params.bncH);
        const bncMesh = new THREE.Mesh(bncGeom, materials.cutoutTool);
        bncMesh.position.set(26.75 + params.bncD/2 - 10 + params.bncX, 30 + params.bncY, -33 + params.bncH/2 + params.bncZ);
        designGroup.add(bncMesh);

        // RJ45
        const rj45Geom = new THREE.BoxGeometry(params.rj45W, params.rj45D, params.rj45H);
        const rj45Mesh = new THREE.Mesh(rj45Geom, materials.cutoutTool);
        rj45Mesh.position.set(params.rj45X, -40 - params.rj45D/2 + 10 + params.rj45Y, -33 + params.rj45H/2 + params.rj45Z);
        designGroup.add(rj45Mesh);

        // USB Charger
        const usbGeom = new THREE.BoxGeometry(params.usbW, params.usbD, params.usbH);
        const usbMesh = new THREE.Mesh(usbGeom, materials.cutoutTool);
        usbMesh.position.set(-12 + params.usbX, 40 + params.usbD/2 - 10 + params.usbY, -33 + params.usbH/2 + params.usbZ);
        designGroup.add(usbMesh);

        // SD slot & channel cutouts
        const sdSlotGeom = new THREE.BoxGeometry(16, 60, 2);
        const sdSlotMesh = new THREE.Mesh(sdSlotGeom, materials.cutoutTool);
        sdSlotMesh.position.set(0, -60, -7);
        designGroup.add(sdSlotMesh);

        const sdChannelGeom = new THREE.BoxGeometry(20, 60, 9);
        const sdChannelMesh = new THREE.Mesh(sdChannelGeom, materials.cutoutTool);
        sdChannelMesh.position.set(0, -60, -10.5);
        designGroup.add(sdChannelMesh);
    }

    // --- 2. Generate Shell Enclosure ---
    if (visibilities.case) {
        const caseSolid = generateCaseShell();
        if (caseSolid) {
            const cMesh = caseSolid.getMesh();
            const caseGeom = manifoldToThree(cMesh);
            caseSolid.delete();

            let caseMat;
            if (params.mode === 'rendered') {
                caseMat = new THREE.MeshPhysicalMaterial({
                    color: colors.caseSolid,
                    roughness: 0.15,
                    metalness: 0.1,
                    transmission: 0.5,
                    thickness: params.wallThick,
                    transparent: true,
                    opacity: params.opacity / 100,
                    side: THREE.DoubleSide
                });
            } else {
                caseMat = new THREE.MeshBasicMaterial({
                    color: 0x07294d,
                    transparent: true,
                    opacity: 0.6,
                    side: THREE.DoubleSide
                });
            }

            caseMesh = new THREE.Mesh(caseGeom, caseMat);
            caseMesh.castShadow = true;
            caseMesh.receiveShadow = true;

            if (params.mode === 'blueprint') {
                const edges = new THREE.EdgesGeometry(caseGeom);
                const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: colors.blueprintLine, linewidth: 2 }));
                caseMesh.add(line);
            }

            caseMesh.position.z -= params.explode;
            mainGroup.add(caseMesh);
        }
    }

    // Update bounds spec sheet
    const boundsWidth = (SCREEN_W + 2*params.wallThick).toFixed(0);
    const boundsLength = (SCREEN_L + 2*params.wallThick).toFixed(0);
    const boundsHeight = (SCREEN_H + STACK_H + params.batteryHeight + params.wallThick*2).toFixed(0);
    document.getElementById('spec-bounds').innerText = `${boundsWidth} x ${boundsLength} x ${boundsHeight} mm`;

    updateLeaderLines();
}

// --- STL EXPORT ---
function exportSTL() {
    if (!Manifold) return;
    const caseSolid = generateCaseShell();
    if (!caseSolid) return;

    const mesh = caseSolid.getMesh();
    caseSolid.delete();

    const totalTriangles = mesh.triVerts.length / 3;
    const buffer = new ArrayBuffer(84 + totalTriangles * 50);
    const view = new DataView(buffer);

    const headerStr = "STM32 Parametric Case Export - Generated via Antigravity CAD (2026)";
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
    link.download = `stm32_enclosure_wall_${params.wallThick}mm_batt_${params.batteryHeight}mm.stl`;
    link.click();
}

// --- Technical Dimensioning Leader Lines (SVG Overlay) ---
function updateLeaderLines() {
    overlaySvg.innerHTML = '';

    const container = document.getElementById('canvas3d');
    const width = container.clientWidth;
    const height = container.clientHeight;

    const drawDimension = (point3d, textLabel, dirX = 1, dirY = -1) => {
        const vector = new THREE.Vector3(point3d.x, point3d.y, point3d.z);
        
        designGroup.updateMatrixWorld();
        vector.applyMatrix4(designGroup.matrixWorld);
        
        vector.project(camera);

        const x = (vector.x * .5 + .5) * width;
        const y = (-(vector.y * .5) + .5) * height;

        if (vector.z <= 1) {
            const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');

            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dot.setAttribute('cx', x);
            dot.setAttribute('cy', y);
            dot.setAttribute('r', '3');
            dot.setAttribute('fill', '#ffaa00');
            group.appendChild(dot);

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            const targetX = x + 35 * dirX;
            const targetY = y + 25 * dirY;
            const endX = targetX + 30 * dirX;
            line.setAttribute('points', `${x},${y} ${targetX},${targetY} ${endX},${targetY}`);
            line.setAttribute('stroke', '#00f2ff');
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

    if (visibilities.cutouts || visibilities.case) {
        // DB9 Anchor (Same side +X, bottom corner)
        drawDimension(
            new THREE.Vector3(26.75 + params.db9X, -22 + params.db9Y, -33 + params.db9H/2 + params.db9Z),
            "DB9 Port",
            1, -1
        );

        // BNC Anchor (Same side +X, top corner)
        drawDimension(
            new THREE.Vector3(26.75 + params.bncX, 30 + params.bncY, -33 + params.bncH/2 + params.bncZ),
            "BNC Port",
            1, -1
        );

        // RJ45 Anchor (Same side Y=-40, under SD slot)
        drawDimension(
            new THREE.Vector3(params.rj45X, -40 + params.rj45Y, -33 + params.rj45H/2 + params.rj45Z),
            "RJ45 Port",
            1, 1
        );

        // USB Charging Slot (Opposite Y=40, left side X=-12)
        drawDimension(
            new THREE.Vector3(-12 + params.usbX, 40 + params.usbY, -33 + params.usbH/2 + params.usbZ),
            "USB Port",
            1, -1
        );

        // SD Card Slot Anchor (Bottom narrow Y=-40, Z=-7)
        drawDimension(
            new THREE.Vector3(0, -40, -7),
            "SD Card Slot",
            -1, -1
        );
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();

    if (controls.state === -1) {
        mainGroup.rotation.z += 0.001;
    }

    renderer.render(scene, camera);
    updateLeaderLines();
}

// Setup
init();
initManifold();
