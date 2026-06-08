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

const STACK_W = 55;
const STACK_L = 75;
const STACK_H = 33;

// Current parameters state (includes coordinates, sizes, shell options, visual settings)
const params = {
    wallThick: 2.0,
    batteryHeight: 0.0,
    cornerRad: 3.0,
    
    // SD Cutout
    sdX: 0.0,
    sdY: 0.0,
    sdZ: 0.0,
    sdW: 16.0,
    sdH: 2.0,
    sdD: 60.0,

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

    // Switch Cutout
    switchX: 0.0,
    switchY: 0.0,
    switchZ: 0.0,
    switchW: 9.0,
    switchH: 13.5,
    switchD: 18.0,

    // Top Frame Config
    topThick: 3.0,
    topBezel: 4.0,
    screwDepth: 18.0,
    topOuterLipThick: 2.0,
    topOuterLipHeight: 4.0,
    topInnerLipThick: 1.5,
    topInnerLipHeight: 0.0,

    // Bottom Lid Config
    bottomThick: 1.0,
    bottomLipHeight: 1.0,
    stackExtension: 1.0,

    explode: 0.0,
    opacity: 80,
    mode: 'rendered' // 'rendered' or 'blueprint'
};

const visibilities = {
    case: true,
    top: true,
    bottom: true,
    screen: true,
    stack: true,
    cutouts: false
};

// Meshes references
let caseMesh = null;
let topMesh = null;
let bottomMesh = null;
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
    renderer.shadowMap.enabled = false;
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
        const slider = document.getElementById(id);
        const numInput = document.getElementById('val-' + paramKey);
        if (!slider) return;

        // When slider moves, update param value and text input value
        slider.addEventListener('input', (e) => {
            const val = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value);
            params[paramKey] = val;
            if (numInput) numInput.value = isFloat ? val.toFixed(1) : val;
            rebuild();
        });

        // When text input value changes, update param and slider position
        if (numInput) {
            numInput.addEventListener('input', (e) => {
                let val = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value);
                if (isNaN(val)) return;

                // Clamp value to the slider's min/max bounds
                const minVal = parseFloat(slider.min) || 0;
                const maxVal = parseFloat(slider.max) || 1000;
                if (val < minVal) val = minVal;
                if (val > maxVal) val = maxVal;

                params[paramKey] = val;
                slider.value = val;
                rebuild();
            });

            // Smooth format output on input focus lost (blur)
            numInput.addEventListener('blur', () => {
                const val = params[paramKey];
                numInput.value = isFloat ? val.toFixed(1) : val;
            });
        }
    };

    // Shell
    bindSlider('input-wallThick', 'wallThick');
    bindSlider('input-batteryHeight', 'batteryHeight');
    bindSlider('input-cornerRad', 'cornerRad');

    // SD
    bindSlider('input-sdX', 'sdX');
    bindSlider('input-sdY', 'sdY');
    bindSlider('input-sdZ', 'sdZ');
    bindSlider('input-sdW', 'sdW');
    bindSlider('input-sdH', 'sdH');
    bindSlider('input-sdD', 'sdD');

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

    // Switch
    bindSlider('input-switchX', 'switchX');
    bindSlider('input-switchY', 'switchY');
    bindSlider('input-switchZ', 'switchZ');
    bindSlider('input-switchW', 'switchW');
    bindSlider('input-switchH', 'switchH');
    bindSlider('input-switchD', 'switchD');

    // Top Frame
    bindSlider('input-topThick', 'topThick');
    bindSlider('input-topBezel', 'topBezel');
    bindSlider('input-screwDepth', 'screwDepth');
    bindSlider('input-topOuterLipThick', 'topOuterLipThick');
    bindSlider('input-topOuterLipHeight', 'topOuterLipHeight');
    bindSlider('input-topInnerLipThick', 'topInnerLipThick');
    bindSlider('input-topInnerLipHeight', 'topInnerLipHeight');

    // Bottom Lid
    bindSlider('input-bottomThick', 'bottomThick');
    bindSlider('input-bottomLipHeight', 'bottomLipHeight');
    bindSlider('input-stackExtension', 'stackExtension');

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
    bindVisibility('show-top', 'top');
    bindVisibility('show-bottom', 'bottom');
    bindVisibility('show-screen', 'screen');
    bindVisibility('show-stack', 'stack');
    bindVisibility('show-cutouts', 'cutouts');

    // Export STL
    document.getElementById('btn-export-stl').addEventListener('click', exportSTL);
    document.getElementById('btn-export-top-stl').addEventListener('click', exportTopSTL);
    document.getElementById('btn-export-bottom-stl').addEventListener('click', exportBottomSTL);
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

// Helper for rounded box (made global so both shell and top frame can use it):
const makeRoundedBox = (dx, dy, dz, r) => {
    if (!Manifold) return null;
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

// Helper for transition frustum (made global):
const makeFrustum = (w1, l1, w2, l2, h) => {
    if (!Manifold) return null;
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

function generateTopFrame() {
    if (!Manifold) return null;

    const clearance = 0.4;
    const w = params.wallThick;
    const r_out = params.cornerRad;

    // Outer boundary of the top frame matches the outer shell wall
    const outerW = SCREEN_W + 2*clearance + 2*w;
    const outerL = SCREEN_L + 2*clearance + 2*w;
    const outerH = params.topThick;

    // Lip (skirt) parameters wrapping around the top edges of the shell
    const lipThick = params.topOuterLipThick;
    const lipHeight = params.topOuterLipHeight;

    // Base frame structure (outer rounded box expanded to cover the lip width)
    let frame = makeRoundedBox(outerW + 2*lipThick, outerL + 2*lipThick, outerH, r_out + lipThick);

    // Inner window cavity (opening for the screen)
    const innerW = SCREEN_W - 2*params.topBezel;
    const innerL = SCREEN_L - 2*params.topBezel;
    const opening = makeRoundedBox(innerW, innerL, outerH + 2, Math.max(1.0, r_out - params.topBezel));

    frame = frame.subtract(opening);

    // Position of the frame: Z starts at the top of the case shell (SCREEN_H + clearance + w)
    const baseZ = SCREEN_H + clearance + w;
    frame = frame.translate([0, 0, baseZ + outerH/2]);

    // Create the outer lip (skirt) going down around the shell walls
    if (lipHeight > 0 && lipThick > 0) {
        const skirtOuter = makeRoundedBox(outerW + 2*lipThick, outerL + 2*lipThick, lipHeight, r_out + lipThick)
            .translate([0, 0, baseZ - lipHeight/2]);
        const skirtInner = makeRoundedBox(outerW, outerL, lipHeight + 2, r_out)
            .translate([0, 0, baseZ - lipHeight/2]);
        const skirt = skirtOuter.subtract(skirtInner);
        frame = frame.add(skirt);
    }

    // Create the inner locating lip/flange sliding inside the screen cavity
    const innerLipH = params.topInnerLipHeight;
    const innerLipW = params.topInnerLipThick;
    if (innerLipH > 0 && innerLipW > 0) {
        const r_in = Math.max(0.5, r_out - w);
        const innerLipOuter = makeRoundedBox(SCREEN_W + 2*clearance, SCREEN_L + 2*clearance, innerLipH, r_in)
            .translate([0, 0, baseZ - innerLipH/2]);
        const innerLipInner = makeRoundedBox(SCREEN_W + 2*clearance - 2*innerLipW, SCREEN_L + 2*clearance - 2*innerLipW, innerLipH + 2, Math.max(0.2, r_in - innerLipW))
            .translate([0, 0, baseZ - innerLipH/2]);
        const innerLip = innerLipOuter.subtract(innerLipInner);
        frame = frame.add(innerLip);
    }

    // Leg parameters: positioned along the OUTSIDE of the shell wall (as screw bosses flush with lip)
    const legWidth = 3.5;
    const legLength = 12;
    const legHeight = 22; // extends down 22mm from under the frame

    // Center of leg is offset outwards from the outer shell width
    const legX = outerW/2 + legWidth/2;
    const legY = SCREEN_L/2 - 10; // aligned with horizontal screw location (10mm from edge)

    // A single leg block that starts at the top of the frame and goes down 22mm
    const singleLeg = Manifold.cube([legWidth, legLength, legHeight + outerH], true)
        .translate([0, 0, baseZ - legHeight/2 + outerH/2]);

    // Apply bottom rounding tool to singleLegPlus (for positive X legs)
    const R = 8.0; // sweeping corner radius to smoothly match transition ramp
    let toolPlus = Manifold.cube([R, legLength + 4, R], true).translate([R/2, 0, R/2]);
    let cylPlus = Manifold.cylinder(legLength + 6, R, R, 16, true).rotate([90, 0, 0]).translate([0, 0, R]);
    let cutPlus = toolPlus.subtract(cylPlus);
    let transCutPlus = cutPlus.translate([legWidth/2 - R, 0, baseZ - legHeight]);
    let singleLegPlus = singleLeg.subtract(transCutPlus);

    // Clean up Plus tools
    toolPlus.delete();
    cylPlus.delete();
    cutPlus.delete();
    transCutPlus.delete();

    // Apply bottom rounding tool to singleLegMinus (for negative X legs)
    let toolMinus = Manifold.cube([R, legLength + 4, R], true).translate([R/2, 0, R/2]);
    let cylMinus = Manifold.cylinder(legLength + 6, R, R, 16, true).rotate([90, 0, 0]).translate([R, 0, R]);
    let cutMinus = toolMinus.subtract(cylMinus);
    let transCutMinus = cutMinus.translate([-legWidth/2, 0, baseZ - legHeight]);
    let singleLegMinus = singleLeg.subtract(transCutMinus);

    // Clean up Minus tools
    toolMinus.delete();
    cylMinus.delete();
    cutMinus.delete();
    transCutMinus.delete();

    // Translate the rounded legs to their corners
    const leg1 = singleLegPlus.translate([legX, legY, 0]);
    const leg2 = singleLegMinus.translate([-legX, legY, 0]);
    const leg3 = singleLegPlus.translate([legX, -legY, 0]);
    const leg4 = singleLegMinus.translate([-legX, -legY, 0]);

    frame = frame.add(leg1).add(leg2).add(leg3).add(leg4);

    // Clean up templates
    singleLeg.delete();
    singleLegPlus.delete();
    singleLegMinus.delete();
    leg1.delete();
    leg2.delete();
    leg3.delete();
    leg4.delete();

    // Subtract screw clearance holes from the legs
    const screwZ = baseZ - params.screwDepth;
    const screwY1 = SCREEN_L/2 - 10;
    const screwY2 = -SCREEN_L/2 + 10;
    const screwRadius = 1.6; // M3 screw clearance hole radius (3.2mm diameter)

    const sh1 = Manifold.cylinder(40, screwRadius, screwRadius, 16, true).rotate([0, 90, 0]).translate([legX, screwY1, screwZ]);
    const sh2 = Manifold.cylinder(40, screwRadius, screwRadius, 16, true).rotate([0, 90, 0]).translate([-legX, screwY1, screwZ]);
    const sh3 = Manifold.cylinder(40, screwRadius, screwRadius, 16, true).rotate([0, 90, 0]).translate([legX, screwY2, screwZ]);
    const sh4 = Manifold.cylinder(40, screwRadius, screwRadius, 16, true).rotate([0, 90, 0]).translate([-legX, screwY2, screwZ]);

    const finalFrame = frame.subtract(sh1).subtract(sh2).subtract(sh3).subtract(sh4);

    // WASM memory clean up
    sh1.delete();
    sh2.delete();
    sh3.delete();
    sh4.delete();
    frame.delete();

    return finalFrame;
}

function generateBottomLid() {
    if (!Manifold) return null;

    const clearance = 0.4;
    const w = params.wallThick;
    const r_out = params.cornerRad;

    // Stack bottom coordinates
    const bottomZ = -(STACK_H + params.batteryHeight + w + params.stackExtension);
    const stackOuterL = STACK_L + 2*clearance + 2*w;
    const stackOuterW = STACK_W + 2*clearance + 2*w;

    const lipThick = 2.0; // matching top outer lip thick
    const lipHeight = params.bottomLipHeight;
    const baseThick = params.bottomThick;

    // 1. Base plate of the bottom lid
    let lid = makeRoundedBox(stackOuterW + 2*lipThick, stackOuterL + 2*lipThick, baseThick, r_out + lipThick)
        .translate([0, 0, bottomZ - baseThick/2]);

    // 2. Add the outer lip wrapping upwards around the outside of the shell bottom edge
    if (lipHeight > 0 && lipThick > 0) {
        const skirtOuter = makeRoundedBox(stackOuterW + 2*lipThick, stackOuterL + 2*lipThick, lipHeight, r_out + lipThick)
            .translate([0, 0, bottomZ + lipHeight/2]);
        const skirtInner = makeRoundedBox(stackOuterW, stackOuterL, lipHeight + 2, r_out)
            .translate([0, 0, bottomZ + lipHeight/2]);
        const skirt = skirtOuter.subtract(skirtInner);
        
        lid = lid.add(skirt);
        
        skirtOuter.delete();
        skirtInner.delete();
        skirt.delete();
    }

    // 3. Subtract vertical screw clearance holes (3.2mm diameter / 1.6mm radius)
    const bossY = STACK_L/2 + clearance - 3.5;
    const holeRadius = 1.6;
    const holeHeight = baseThick + 4;
    const holeZ = bottomZ - baseThick/2;

    const h1 = Manifold.cylinder(holeHeight, holeRadius, holeRadius, 16, true).translate([0, bossY, holeZ]);
    const h2 = Manifold.cylinder(holeHeight, holeRadius, holeRadius, 16, true).translate([0, -bossY, holeZ]);

    let finalLid = lid.subtract(h1).subtract(h2);

    h1.delete();
    h2.delete();
    lid.delete();

    return finalLid;
}

// Helper for sloped wedge/ramp
const makeWedge = (w_x, Y_wall, Z_bot, Z_top, d_bot, d_top, isPositiveY) => {
    if (!Manifold) return null;
    const sign = isPositiveY ? -1 : 1;
    const pts = new Float32Array([
        -w_x/2, Y_wall + sign * d_bot, Z_bot,
         w_x/2, Y_wall + sign * d_bot, Z_bot,
         w_x/2, Y_wall, Z_bot,
        -w_x/2, Y_wall, Z_bot,
        -w_x/2, Y_wall + sign * d_top, Z_top,
         w_x/2, Y_wall + sign * d_top, Z_top,
         w_x/2, Y_wall, Z_top,
        -w_x/2, Y_wall, Z_top
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

function generateCaseShell() {
    if (!Manifold) return null;

    // Clearance gaps
    const clearance = 0.4;
    const w = params.wallThick;

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

    // Outer stack body: Z goes from -(STACK_H + batteryHeight + w + stackExtension) to -15
    const stackOuterL = STACK_L + 2*clearance + 2*w;
    const stackOuterW = STACK_W + 2*clearance + 2*w;
    const stackOuterHeight = STACK_H + params.batteryHeight + w - 15 + params.stackExtension;
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
    const screenInner = makeRoundedBox(
        SCREEN_W + 2*clearance + 0.8, 
        SCREEN_L + 2*clearance + 0.8, 
        SCREEN_H + 10, 
        Math.max(0.5, r_out - w)
    ).translate([0, 0, (SCREEN_H + 10)/2]);
    
    // Stack Cavity (Open at the bottom by extending it downwards)
    const stackInnerHeight = STACK_H + params.batteryHeight + params.stackExtension + 20;
    const stackInner = Manifold.cube([
        STACK_W + 2*clearance, 
        STACK_L + 2*clearance, 
        stackInnerHeight
    ], true).translate([
        0, 
        0, 
        -15 - stackInnerHeight/2
    ]);

    // Subtract screen, transition, and stack cavities to keep the enclosure hollow
    const innerTransition = makeFrustum(
        SCREEN_W + 2*clearance + 0.8,
        SCREEN_L + 2*clearance + 0.8,
        STACK_W + 2*clearance,
        STACK_L + 2*clearance,
        15
    ).translate([0, 0, -15]);

    shellSolid = shellSolid.subtract(screenInner).subtract(stackInner).subtract(innerTransition);

    innerTransition.delete();

    // Add internal vertical screw pillars (bosses) inside the narrow ends for bottom lid screws
    // They must only go up from the bottom edge to the bottom of the ports (Z = -STACK_H = -33)
    const bottomZ = -(STACK_H + params.batteryHeight + w + params.stackExtension);
    const bossHeight = -STACK_H - bottomZ; // distance between bottom edge and bottom of ports
    const bossY = STACK_L/2 + clearance - 3.5;
    const boss1 = makeWedge(8.0, STACK_L/2 + clearance, bottomZ, -STACK_H, 8.5, 4.8, true);
    const boss2 = makeWedge(8.0, -(STACK_L/2 + clearance), bottomZ, -STACK_H, 8.5, 4.8, false);
    shellSolid = shellSolid.add(boss1).add(boss2);

    boss1.delete();
    boss2.delete();

    // Subtract vertical screw pilot holes (radius 1.25mm for M3 threads) from the bosses
    // The holes go completely through the ramps
    const holeHeight = bossHeight + 10;
    const holeZ = bottomZ + bossHeight/2;
    const hole1 = Manifold.cylinder(holeHeight, 1.25, 1.25, 16, true).translate([0, bossY, holeZ]);
    const hole2 = Manifold.cylinder(holeHeight, 1.25, 1.25, 16, true).translate([0, -bossY, holeZ]);
    shellSolid = shellSolid.subtract(hole1).subtract(hole2);

    hole1.delete();
    hole2.delete();

    // 1. SD Card Slot (On the side Y = -STACK_L/2, Z = -7)
    // Extend the cutouts all the way through the outer shell and transition ramp down to the top of stack (Z = -15)
    const sdSlot = Manifold.cube([params.sdW, params.sdD, params.sdH], true).translate([
        params.sdX, 
        -STACK_L/2 - params.sdD/2 + 10 + params.sdY, 
        -7 + params.sdZ
    ]);
    const sdChannel = Manifold.cube([params.sdW + 4, params.sdD, params.sdH + 7], true).translate([
        params.sdX, 
        -STACK_L/2 - params.sdD/2 + 10 + params.sdY, 
        -10.5 + params.sdZ
    ]);
    shellSolid = shellSolid.subtract(sdSlot).subtract(sdChannel);

    // 2. DB9 Port Cutout (On the +X edge, corner Y = -22 baseline)
    // Parametric width, height, depth. Cutout translated outwards to clear the shell wall.
    const db9Cutout = Manifold.cube([params.db9D, params.db9W, params.db9H], true).translate([
        STACK_W/2 + params.db9D/2 - 10 + params.db9X, 
        -22 + params.db9Y, 
        -33 + params.db9H/2 + params.db9Z
    ]);
    shellSolid = shellSolid.subtract(db9Cutout);

    // 3. BNC Port Cutout (On the +X edge, corner Y = 30 baseline)
    const bncCutout = Manifold.cube([params.bncD, params.bncW, params.bncH], true).translate([
        STACK_W/2 + params.bncD/2 - 10 + params.bncX, 
        30 + params.bncY, 
        -33 + params.bncH/2 + params.bncZ
    ]);
    shellSolid = shellSolid.subtract(bncCutout);

    // 4. RJ45 Slot (On the -Y narrow side, Y = -STACK_L/2, under the SD slot)
    const rj45Cutout = Manifold.cube([params.rj45W, params.rj45D, params.rj45H], true).translate([
        params.rj45X, 
        -STACK_L/2 - params.rj45D/2 + 10 + params.rj45Y, 
        -33 + params.rj45H/2 + params.rj45Z
    ]);
    shellSolid = shellSolid.subtract(rj45Cutout);

    // 5. USB Charging Slot (On the +Y narrow side, Y = STACK_L/2, X = -12)
    const usbCutout = Manifold.cube([params.usbW, params.usbD, params.usbH], true).translate([
        -12 + params.usbX, 
        STACK_L/2 + params.usbD/2 - 10 + params.usbY, 
        -33 + params.usbH/2 + params.usbZ
    ]);
    shellSolid = shellSolid.subtract(usbCutout);

    // 6. Switch Cutout (On the side opposite to the ports: -X edge, centered at Y = 0 baseline)
    const switchCutout = Manifold.cube([params.switchD, params.switchW, params.switchH], true).translate([
        -STACK_W/2 - params.switchD/2 + 10 + params.switchX,
        params.switchY,
        -33 + params.switchH/2 + params.switchZ
    ]);
    shellSolid = shellSolid.subtract(switchCutout);
    switchCutout.delete();

    // 7. Horizontal screw holes for securing the top frame
    const screwZ = SCREEN_H + clearance + w - params.screwDepth;
    const screwY1 = SCREEN_L/2 - 10;
    const screwY2 = -SCREEN_L/2 + 10;
    const screwRadius = 1.25; // M3 screw pilot hole radius (2.5mm diameter) for threading directly into plastic

    const sh1 = Manifold.cylinder(40, screwRadius, screwRadius, 16, true).rotate([0, 90, 0]).translate([SCREEN_W/2 + clearance, screwY1, screwZ]);
    const sh2 = Manifold.cylinder(40, screwRadius, screwRadius, 16, true).rotate([0, 90, 0]).translate([-SCREEN_W/2 - clearance, screwY1, screwZ]);
    const sh3 = Manifold.cylinder(40, screwRadius, screwRadius, 16, true).rotate([0, 90, 0]).translate([SCREEN_W/2 + clearance, screwY2, screwZ]);
    const sh4 = Manifold.cylinder(40, screwRadius, screwRadius, 16, true).rotate([0, 90, 0]).translate([-SCREEN_W/2 - clearance, screwY2, screwZ]);

    shellSolid = shellSolid.subtract(sh1).subtract(sh2).subtract(sh3).subtract(sh4);

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
    if (topMesh) {
        mainGroup.remove(topMesh);
        topMesh.geometry.dispose();
        topMesh = null;
    }
    if (bottomMesh) {
        mainGroup.remove(bottomMesh);
        bottomMesh.geometry.dispose();
        bottomMesh = null;
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
        db9Mesh.position.set(STACK_W/2 + params.db9D/2 - 10 + params.db9X, -22 + params.db9Y, -33 + params.db9H/2 + params.db9Z);
        designGroup.add(db9Mesh);

        // BNC
        const bncGeom = new THREE.BoxGeometry(params.bncD, params.bncW, params.bncH);
        const bncMesh = new THREE.Mesh(bncGeom, materials.cutoutTool);
        bncMesh.position.set(STACK_W/2 + params.bncD/2 - 10 + params.bncX, 30 + params.bncY, -33 + params.bncH/2 + params.bncZ);
        designGroup.add(bncMesh);

        // RJ45
        const rj45Geom = new THREE.BoxGeometry(params.rj45W, params.rj45D, params.rj45H);
        const rj45Mesh = new THREE.Mesh(rj45Geom, materials.cutoutTool);
        rj45Mesh.position.set(params.rj45X, -STACK_L/2 - params.rj45D/2 + 10 + params.rj45Y, -33 + params.rj45H/2 + params.rj45Z);
        designGroup.add(rj45Mesh);

        // USB Charger
        const usbGeom = new THREE.BoxGeometry(params.usbW, params.usbD, params.usbH);
        const usbMesh = new THREE.Mesh(usbGeom, materials.cutoutTool);
        usbMesh.position.set(-12 + params.usbX, STACK_L/2 + params.usbD/2 - 10 + params.usbY, -33 + params.usbH/2 + params.usbZ);
        designGroup.add(usbMesh);

        // Switch
        const switchGeom = new THREE.BoxGeometry(params.switchD, params.switchW, params.switchH);
        const switchMesh = new THREE.Mesh(switchGeom, materials.cutoutTool);
        switchMesh.position.set(-STACK_W/2 - params.switchD/2 + 10 + params.switchX, params.switchY, -33 + params.switchH/2 + params.switchZ);
        designGroup.add(switchMesh);

        // SD slot & channel cutouts
        const sdSlotGeom = new THREE.BoxGeometry(params.sdW, params.sdD, params.sdH);
        const sdSlotMesh = new THREE.Mesh(sdSlotGeom, materials.cutoutTool);
        sdSlotMesh.position.set(params.sdX, -STACK_L/2 - params.sdD/2 + 10 + params.sdY, -7 + params.sdZ);
        designGroup.add(sdSlotMesh);

        // sdChannel
        const sdChannelGeom = new THREE.BoxGeometry(params.sdW + 4, params.sdD, params.sdH + 7);
        const sdChannelMesh = new THREE.Mesh(sdChannelGeom, materials.cutoutTool);
        sdChannelMesh.position.set(params.sdX, -STACK_L/2 - params.sdD/2 + 10 + params.sdY, -10.5 + params.sdZ);
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

    // --- 3. Generate Top Frame ---
    if (visibilities.top) {
        const topSolid = generateTopFrame();
        if (topSolid) {
            const tMesh = topSolid.getMesh();
            const topGeom = manifoldToThree(tMesh);
            topSolid.delete();

            let topMat;
            if (params.mode === 'rendered') {
                topMat = new THREE.MeshPhysicalMaterial({
                    color: 0xffaa00, // Amber/Orange contrast frame
                    roughness: 0.2,
                    metalness: 0.8,
                    transmission: 0.1,
                    transparent: true,
                    opacity: params.opacity / 100,
                    side: THREE.DoubleSide
                });
            } else {
                topMat = new THREE.MeshBasicMaterial({
                    color: 0x4d2e07,
                    transparent: true,
                    opacity: 0.6,
                    side: THREE.DoubleSide
                });
            }

            topMesh = new THREE.Mesh(topGeom, topMat);
            topMesh.castShadow = true;
            topMesh.receiveShadow = true;

            if (params.mode === 'blueprint') {
                const edges = new THREE.EdgesGeometry(topGeom);
                const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffaa00, linewidth: 2 }));
                topMesh.add(line);
            }

            // Top frame explodes upwards (positive Z)
            topMesh.position.z += params.explode;
            mainGroup.add(topMesh);
        }
    }

    // --- 4. Generate Bottom Lid ---
    if (visibilities.bottom) {
        const bottomSolid = generateBottomLid();
        if (bottomSolid) {
            const bMesh = bottomSolid.getMesh();
            const bottomGeom = manifoldToThree(bMesh);
            bottomSolid.delete();

            let bottomMat;
            if (params.mode === 'rendered') {
                bottomMat = new THREE.MeshPhysicalMaterial({
                    color: 0xffaa00, // Matching the top frame color (Amber/Orange contrast)
                    roughness: 0.2,
                    metalness: 0.8,
                    transmission: 0.1,
                    transparent: true,
                    opacity: params.opacity / 100,
                    side: THREE.DoubleSide
                });
            } else {
                bottomMat = new THREE.MeshBasicMaterial({
                    color: 0x4d2e07,
                    transparent: true,
                    opacity: 0.6,
                    side: THREE.DoubleSide
                });
            }

            bottomMesh = new THREE.Mesh(bottomGeom, bottomMat);
            bottomMesh.castShadow = true;
            bottomMesh.receiveShadow = true;

            if (params.mode === 'blueprint') {
                const edges = new THREE.EdgesGeometry(bottomGeom);
                const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffaa00, linewidth: 2 }));
                bottomMesh.add(line);
            }

            // Bottom lid explodes downwards (negative Z, double distance for spacing)
            bottomMesh.position.z -= params.explode * 1.8;
            mainGroup.add(bottomMesh);
        }
    }

    // Update bounds spec sheet
    const clearanceVal = 0.4;
    const screenCavityW = (SCREEN_W + 2 * clearanceVal + 0.8).toFixed(1);
    const screenCavityL = (SCREEN_L + 2 * clearanceVal + 0.8).toFixed(1);
    const screenCavityH = (SCREEN_H + clearanceVal).toFixed(1);
    const elScreen = document.getElementById('spec-screen-cavity');
    if (elScreen) elScreen.innerText = `${screenCavityW} x ${screenCavityL} x ${screenCavityH} mm`;

    const stackCavityW = (STACK_W + 2 * clearanceVal).toFixed(1);
    const stackCavityL = (STACK_L + 2 * clearanceVal).toFixed(1);
    const stackCavityH = (STACK_H + params.batteryHeight + params.stackExtension).toFixed(1);
    const elStack = document.getElementById('spec-stack-cavity');
    if (elStack) elStack.innerText = `${stackCavityW} x ${stackCavityL} x ${stackCavityH} mm`;

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

function exportTopSTL() {
    if (!Manifold) return;
    const topSolid = generateTopFrame();
    if (!topSolid) return;

    const mesh = topSolid.getMesh();
    topSolid.delete();

    const totalTriangles = mesh.triVerts.length / 3;
    const buffer = new ArrayBuffer(84 + totalTriangles * 50);
    const view = new DataView(buffer);

    const headerStr = "STM32 Parametric Case Top Frame Export - Generated via Antigravity CAD (2026)";
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
    link.download = `stm32_top_frame_thick_${params.topThick}mm_bezel_${params.topBezel}mm.stl`;
    link.click();
}

function exportBottomSTL() {
    if (!Manifold) return;
    const bottomSolid = generateBottomLid();
    if (!bottomSolid) return;

    const mesh = bottomSolid.getMesh();
    bottomSolid.delete();

    const totalTriangles = mesh.triVerts.length / 3;
    const buffer = new ArrayBuffer(84 + totalTriangles * 50);
    const view = new DataView(buffer);

    const headerStr = "STM32 Parametric Case Bottom Lid Export - Generated via Antigravity CAD (2026)";
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
    link.download = `stm32_bottom_lid_thick_${params.bottomThick}mm_lip_${params.bottomLipHeight}mm.stl`;
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
            new THREE.Vector3(STACK_W/2 + params.db9X, -22 + params.db9Y, -33 + params.db9H/2 + params.db9Z),
            "DB9 Port",
            1, -1
        );

        // BNC Anchor (Same side +X, top corner)
        drawDimension(
            new THREE.Vector3(STACK_W/2 + params.bncX, 30 + params.bncY, -33 + params.bncH/2 + params.bncZ),
            "BNC Port",
            1, -1
        );

        // RJ45 Anchor (Same side Y=-STACK_L/2, under SD slot)
        drawDimension(
            new THREE.Vector3(params.rj45X, -STACK_L/2 + params.rj45Y, -33 + params.rj45H/2 + params.rj45Z),
            "RJ45 Port",
            1, 1
        );

        // USB Charging Slot (Opposite Y=STACK_L/2, left side X=-12)
        drawDimension(
            new THREE.Vector3(-12 + params.usbX, STACK_L/2 + params.usbY, -33 + params.usbH/2 + params.usbZ),
            "USB Port",
            1, -1
        );

        // Switch Anchor (Opposite side -X, Y = 0)
        drawDimension(
            new THREE.Vector3(-STACK_W/2 + params.switchX, params.switchY, -33 + params.switchH/2 + params.switchZ),
            "Switch",
            -1, 1
        );

        // SD Card Slot Anchor (Bottom narrow Y=-STACK_L/2, Z=-7)
        drawDimension(
            new THREE.Vector3(params.sdX, -STACK_L/2 + params.sdY, -7 + params.sdZ),
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
