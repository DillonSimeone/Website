import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Module from 'https://unpkg.com/manifold-3d/manifold.js';

let wasm, Manifold;
let scene, camera, renderer, controls;
let mainGroup;
let overlaySvg = document.getElementById('dimensions-overlay');

// ─── Parametric State ────────────────────────────────────────────────────
const params = {
    // Rod
    rodOD: 21.5,
    rodWall: 3.0,
    rodLength: 533.4,   // 21 inches in mm

    // Guard / Sled Housing
    guardWall: 3.0,
    guardLength: 170.0,

    // Electronics Sled (solid block)
    sledWidth: 20.0,
    sledLength: 160.0,
    sledDepth: 22.0,

    // Transparent Cylinders
    cylOD: 38.0,
    cylWall: 2.0,
    ledSectionLen: 304.8, // 1 foot in mm

    // Connector Rings
    ringHeight: 17.0,
    ringCenterOD: 42.0,
    ringEndOD: 34.0,

    // Decorative Ridges
    ridgeWidth: 6.0,
    ridgeHeight: 1.5,
    ridgeRamp: 2.0,

    // LED strips
    ledWidth: 12.0,
    ledHeight: 4.0,

    // Screws
    m3Diam: 3.2,
    screwDepth: 5.0,

    // Endcap
    capThick: 3.0,
    capOD: 25.0,

    // Display
    explode: 0,
    opacity: 80,
    mode: 'blueprint'
};

const visibilities = {
    rod: true,
    guard: true,
    sled: true,
    cylinders: true,
    rings: true,
    ridges: true,
    leds: true,
    endcap: true,
    screwholes: false
};

// ─── Mesh References ─────────────────────────────────────────────────────
let rodMesh = null;
let guardMesh = null;
let sledMesh = null;
let cylinderMeshes = [];
let ringMeshes = [];
let ridgeMeshes = [];
let ledMeshes = [];
let endcapMesh = null;
let screwHoleGroup = new THREE.Group();

// Neon Violet + Cyan Color Palette
const colors = {
    rod: 0x888899,
    guard: 0xbf00ff,
    sled: 0xffaa00,
    cylinder: 0x00f2ff,
    ring: 0xbf00ff,
    ridge: 0x9933ff,
    led: 0x39ff14,
    endcap: 0x888899,
    screwHoles: 0xff8800,
    blueprintLine: 0xbf00ff,
    blueprintLineCyan: 0x00f2ff
};

// ─── Scene Setup ─────────────────────────────────────────────────────────
function init() {
    const container = document.getElementById('canvas3d');
    if (!container) return;

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x061224, 0.0008);

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 3000);
    camera.position.set(400, 200, 300);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 150, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.update();

    // Grid floor
    const grid = new THREE.GridHelper(600, 60, 0xbf00ff, 0x330066);
    grid.position.y = -20;
    scene.add(grid);

    // Lights
    const ambient = new THREE.AmbientLight(0x0f2b48, 2.0);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(150, 300, 250);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.PointLight(0xbf00ff, 2.0, 600);
    fillLight.position.set(-200, 200, 100);
    scene.add(fillLight);

    const neonGlow = new THREE.PointLight(0x39ff14, 1.5, 400);
    neonGlow.position.set(0, 300, 0);
    scene.add(neonGlow);

    mainGroup = new THREE.Group();
    // Baton stands vertically: Z-up CAD → Y-up Three.js
    mainGroup.rotation.x = -Math.PI / 2;
    scene.add(mainGroup);
    mainGroup.add(screwHoleGroup);

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

// ─── Manifold WASM Init ──────────────────────────────────────────────────
async function initManifold() {
    try {
        wasm = await Module();
        wasm.setup();
        Manifold = wasm.Manifold;
        console.log("Manifold geometry kernel active");
        rebuild();
        animate();
    } catch(e) {
        console.error("Failed to load Manifold WASM.", e);
        const status = document.querySelector('footer .status-left span:last-child');
        if (status) status.textContent = "KERNEL FAILED TO LOAD";
    }
}

// ─── CSG Helpers ─────────────────────────────────────────────────────────
function manifoldToThree(manifoldMesh) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(manifoldMesh.vertProperties, 3));
    geometry.setIndex(new THREE.Uint32BufferAttribute(manifoldMesh.triVerts, 1));
    geometry.computeVertexNormals();
    return geometry;
}

// ─── Layout Calculations ─────────────────────────────────────────────────
// The baton is laid out along the Z-axis (CAD space):
//   Z=0: bottom of rod
//   Bottom endcap sits at Z = 0 to Z = capThick
//   Handle: bare rod from capThick to guardStart
//   Guard: guardStart to guardStart + guardLength
//   LED section: guardStart + guardLength to guardStart + guardLength + ledSectionLen
//   Rod ends at Z = rodLength

function getLayoutZones() {
    const capTop = params.capThick;
    const guardStart = params.rodLength - params.guardLength - params.ledSectionLen;
    const guardEnd = guardStart + params.guardLength;
    const ledStart = guardEnd;
    const ledEnd = guardEnd + params.ledSectionLen;
    const cylLen = params.ledSectionLen / 3;

    // Handle is the exposed rod between endcap top and guard start
    const handleLength = guardStart - capTop;

    return {
        capTop,
        guardStart,
        guardEnd,
        ledStart,
        ledEnd,
        cylLen,
        handleLength,
        rodCenter: params.rodLength / 2
    };
}

// ─── Component Generators ────────────────────────────────────────────────

function generateRod() {
    if (!Manifold) return null;
    const outerR = params.rodOD / 2;
    const innerR = outerR - params.rodWall;
    const h = params.rodLength;

    let outer = Manifold.cylinder(h, outerR, outerR, 32, false);
    let inner = Manifold.cylinder(h + 2, innerR, innerR, 32, false);
    let moved = inner.translate([0, 0, -1]);
    inner.delete();

    let rod = outer.subtract(moved);
    outer.delete();
    moved.delete();

    return rod;
}

function generateGuard() {
    if (!Manifold) return null;

    const z = getLayoutZones();
    const rodR = params.rodOD / 2;
    const boreR = rodR + params.ledHeight + 0.3; // clear LEDs
    const cylInnerR = Math.max(params.cylOD / 2 - params.cylWall, boreR + 1.5);
    const guardR = Math.max(rodR + params.guardWall, cylInnerR + 1.5);
    const h = params.guardLength;

    // Outer cylinder
    let outer = Manifold.cylinder(h, guardR, guardR, 32, false);
    // Inner bore for rod
    let bore = Manifold.cylinder(h + 2, rodR + 0.3, rodR + 0.3, 32, false);
    let boreMoved = bore.translate([0, 0, -1]);
    bore.delete();

    let guard = outer.subtract(boreMoved);
    outer.delete();
    boreMoved.delete();

    // Counterbore at the top of the guard to receive Ring 0 bottom flange
    const flangeH = params.ringHeight * 0.25;
    const cbR = cylInnerR;
    let cb = Manifold.cylinder(flangeH + 1, cbR, cbR, 32, false);
    let cbMoved = cb.translate([0, 0, h - flangeH]);
    cb.delete();
    let tempGuard = guard.subtract(cbMoved);
    guard.delete();
    cbMoved.delete();
    guard = tempGuard;

    // Subtract 4 radial screw holes at the top of the guard
    const screwR = params.m3Diam / 2;
    const holeLen = guardR * 2 + 10; // long enough to punch through
    const guardScrewZ = h - 6.0; // 6mm from the top edge, aligning with Ring 0 bottom flange

    for (let s = 0; s < 4; s++) {
        const angle = (Math.PI / 4) + s * (Math.PI / 2);
        const angleDeg = angle * (180 / Math.PI);

        let hole = Manifold.cylinder(holeLen, screwR, screwR, 16, true);
        let rotY = hole.rotate([0, 90, 0]);
        hole.delete();
        let rotZ = rotY.rotate([0, 0, angleDeg]);
        rotY.delete();
        let positioned = rotZ.translate([0, 0, guardScrewZ]);
        rotZ.delete();
        let temp = guard.subtract(positioned);
        guard.delete();
        positioned.delete();
        guard = temp;
    }

    // Sled cavity — carved from one side
    // The sled is a rectangular channel, offset to one side of the guard
    // Positioned so it can slide in from the bottom
    const sledW = params.sledWidth;
    const sledD = params.sledDepth;
    const sledL = params.sledLength;

    let sledCavity = Manifold.cube([sledW + 0.5, sledD + 0.5, sledL + 2], false);
    // Center the sled on X, offset on Y so it's accessible from one side
    let sledMoved = sledCavity.translate([
        -sledW / 2 - 0.25,
        rodR - sledD * 0.3,
        -1
    ]);
    sledCavity.delete();

    guard = guard.subtract(sledMoved);
    sledMoved.delete();

    // Position guard at its Z location
    let positioned = guard.translate([0, 0, z.guardStart]);
    guard.delete();

    return positioned;
}

// ─── SLED GENERATOR ──────────────────────────────────────────────────────
// TODO: This is a placeholder solid block representing the electronics sled.
// Future work: Add internal compartments for:
//   - Battery holder
//   - Microcontroller mount (ESP32/similar)
//   - IMU/accelerometer mount (motion detection)
//   - Haptic motor mount
//   - Wiring channels
// The sled slides into the guard housing from the bottom.
// Ensure the sled does not protrude past the guard OD so fingers
// can still wrap around the handle area.
function generateSled() {
    if (!Manifold) return null;

    const z = getLayoutZones();
    const rodR = params.rodOD / 2;
    const sledW = params.sledWidth;
    const sledD = params.sledDepth;
    const sledL = params.sledLength;

    // Simple solid block representing the electronics sled
    let sled = Manifold.cube([sledW, sledD, sledL], false);
    let positioned = sled.translate([
        -sledW / 2,
        rodR - sledD * 0.3,
        z.guardStart
    ]);
    sled.delete();

    return positioned;
}

function generateTransparentCylinder(index) {
    if (!Manifold) return null;

    const z = getLayoutZones();
    const rodR = params.rodOD / 2;
    const boreR = rodR + params.ledHeight + 0.3; // clear LEDs
    const cylInnerR = Math.max(params.cylOD / 2 - params.cylWall, boreR + 1.5);
    const cylOuterR = cylInnerR + params.cylWall;
    const h = z.cylLen;

    let outer = Manifold.cylinder(h, cylOuterR, cylOuterR, 32, false);
    let inner = Manifold.cylinder(h + 2, cylInnerR, cylInnerR, 32, false);
    let innerMoved = inner.translate([0, 0, -1]);
    inner.delete();

    let cyl = outer.subtract(innerMoved);
    outer.delete();
    innerMoved.delete();

    // Subtract 4 RADIAL screw holes at bottom and top
    // Screws go through the cylinder wall toward the rod (radially, not axially)
    // Positioned at 45°, 135°, 225°, 315° to avoid LED strip positions at 0/90/180/270
    const screwR = params.m3Diam / 2;
    const holeLen = cylOuterR * 2 + 10; // long enough to punch clean through the wall and ridges
    // Z positions for bottom and top screw rings (inset from edges)
    const botScrewZ = 6.0;
    const topScrewZ = h - 6.0;

    for (let s = 0; s < 4; s++) {
        const angle = (Math.PI / 4) + s * (Math.PI / 2); // 45°, 135°, 225°, 315°
        const angleDeg = angle * (180 / Math.PI);

        // Bottom radial screw hole — cylinder along Z, rotate to radial
        let hole = Manifold.cylinder(holeLen, screwR, screwR, 16, true);
        let rotY = hole.rotate([0, 90, 0]); // Z-axis → X-axis (radial at angle 0)
        hole.delete();
        let rotZ = rotY.rotate([0, 0, angleDeg]); // rotate to correct angular position
        rotY.delete();
        let positioned = rotZ.translate([0, 0, botScrewZ]);
        rotZ.delete();
        let temp = cyl.subtract(positioned);
        cyl.delete();
        positioned.delete();
        cyl = temp;

        // Top radial screw hole
        let hole2 = Manifold.cylinder(holeLen, screwR, screwR, 16, true);
        let rot2Y = hole2.rotate([0, 90, 0]);
        hole2.delete();
        let rot2Z = rot2Y.rotate([0, 0, angleDeg]);
        rot2Y.delete();
        let pos2 = rot2Z.translate([0, 0, topScrewZ]);
        rot2Z.delete();
        temp = cyl.subtract(pos2);
        cyl.delete();
        pos2.delete();
        cyl = temp;
    }

    // Position the cylinder in the LED section
    const cylZ = z.ledStart + index * z.cylLen;
    let positioned = cyl.translate([0, 0, cylZ]);
    cyl.delete();

    return positioned;
}

function generateConnectorRing(index) {
    if (!Manifold) return null;

    const z = getLayoutZones();
    const rodR = params.rodOD / 2;
    const h = params.ringHeight;
    const boreR = rodR + params.ledHeight + 0.3; // clear LEDs
    const cylInnerR = Math.max(params.cylOD / 2 - params.cylWall, boreR + 1.5);
    const cylOuterR = cylInnerR + params.cylWall;

    const endR = cylInnerR;
    const centerR = Math.max(params.ringCenterOD / 2, cylOuterR + 1.0);

    // The ring is built as a stack of 3 short cylinders:
    // bottom flange (endR), center body (centerR), top flange (endR)
    const flangeH = h * 0.25;
    const centerH = h * 0.5;
    const boreR2 = boreR; // keep clearance bore

    // Bottom flange
    let botOuter = Manifold.cylinder(flangeH, endR, endR, 32, false);
    let botBore = Manifold.cylinder(flangeH + 2, boreR2, boreR2, 32, false).translate([0, 0, -1]);
    let bot = botOuter.subtract(botBore);
    botOuter.delete();
    botBore.delete();

    // Center body (wider)
    let cenOuter = Manifold.cylinder(centerH, centerR, centerR, 32, false).translate([0, 0, flangeH]);
    let cenBore = Manifold.cylinder(centerH + 2, boreR2, boreR2, 32, false).translate([0, 0, flangeH - 1]);
    let cen = cenOuter.subtract(cenBore);
    cenOuter.delete();
    cenBore.delete();

    // Top flange
    let topOuter = Manifold.cylinder(flangeH, endR, endR, 32, false).translate([0, 0, flangeH + centerH]);
    let topBore = Manifold.cylinder(flangeH + 2, boreR2, boreR2, 32, false).translate([0, 0, flangeH + centerH - 1]);
    let top = topOuter.subtract(topBore);
    topOuter.delete();
    topBore.delete();

    let ring = bot.add(cen).add(top);
    bot.delete();
    cen.delete();
    top.delete();

    // RADIAL through-holes for M3 screws in bottom flange (Z = h/2 - 6.0) and top flange (Z = h/2 + 6.0)
    const screwR = params.m3Diam / 2;
    const holeLen = centerR * 2 + 10; // long enough to punch through all components

    const botHoleZ = h / 2 - 6.0;
    const topHoleZ = h / 2 + 6.0;

    for (let s = 0; s < 4; s++) {
        const angle = (Math.PI / 4) + s * (Math.PI / 2);
        const angleDeg = angle * (180 / Math.PI);

        // Bottom flange hole
        let hole1 = Manifold.cylinder(holeLen, screwR, screwR, 16, true);
        let rot1Y = hole1.rotate([0, 90, 0]); // Z → X (radial)
        hole1.delete();
        let rot1Z = rot1Y.rotate([0, 0, angleDeg]);
        rot1Y.delete();
        let pos1 = rot1Z.translate([0, 0, botHoleZ]);
        rot1Z.delete();
        let temp = ring.subtract(pos1);
        ring.delete();
        pos1.delete();
        ring = temp;

        // Top flange hole
        let hole2 = Manifold.cylinder(holeLen, screwR, screwR, 16, true);
        let rot2Y = hole2.rotate([0, 90, 0]); // Z → X (radial)
        hole2.delete();
        let rot2Z = rot2Y.rotate([0, 0, angleDeg]);
        rot2Y.delete();
        let pos2 = rot2Z.translate([0, 0, topHoleZ]);
        rot2Z.delete();
        temp = ring.subtract(pos2);
        ring.delete();
        pos2.delete();
        ring = temp;
    }

    // Position: ring sits between cylinders
    // Ring 0 (first connector): between guard top and cylinder #0 bottom
    // Ring 1: between cylinder #0 top and cylinder #1 bottom
    // Ring 2: between cylinder #1 top and cylinder #2 bottom
    let ringZ;
    if (index === 0) {
        ringZ = z.ledStart - h / 2; // straddles the guard/LED boundary
    } else {
        ringZ = z.ledStart + index * z.cylLen - h / 2;
    }

    let positioned = ring.translate([0, 0, ringZ]);
    ring.delete();

    return positioned;
}

// Decorative ridges that run along each transparent cylinder between the LED strips.
// LEDs are at 0°, 90°, 180°, 270°, so ridges sit between them at 45°, 135°, 225°, 315°.
// Each ridge assembly includes:
//   - A bottom mounting ring (with M3 radial screw holes)
//   - 4 straight ridge spines running along the cylinder
//   - A top mounting ring (with M3 radial screw holes)
// The rings allow the ridges to be screwed in place to the connector rings.
function generateDecorativeRidges(cylinderIndex) {
    if (!Manifold) return null;

    const z = getLayoutZones();
    const rodR = params.rodOD / 2;
    const boreR = rodR + params.ledHeight + 0.3;
    const cylInnerR = Math.max(params.cylOD / 2 - params.cylWall, boreR + 1.5);
    const cylOuterR = cylInnerR + params.cylWall;

    const rw = params.ridgeWidth;
    const rh = params.ridgeHeight;
    const ramp = params.ridgeRamp;
    const cylLen = z.cylLen;

    // Ridge spine extends the full length of the cylinder
    const ridgeLen = cylLen;

    // Mounting ring dimensions
    const ringThick = 12.0; // axial thickness of the mounting ring - thicker for durability
    const botRingOuterR = cylOuterR + rh + ramp;
    const topRingOuterR = cylOuterR + rh;
    const ringInnerR = cylOuterR - 0.5; // slight overlap onto cylinder surface

    const parts = [];

    // ─── 4 Ridge Spines ──────────────────────────────────────────────
    for (let s = 0; s < 4; s++) {
        const angle = (Math.PI / 4) + s * (Math.PI / 2); // 45°, 135°, 225°, 315°

        // Create a ridge as a box positioned on the surface and cut to form a ramp
        // Base box reaches up to rh + ramp protrusion
        let baseBox = Manifold.cube([rw, rh + ramp, ridgeLen], false);
        let baseMoved = baseBox.translate([-rw / 2, 0, 0]);
        baseBox.delete();

        // Create cutting wedge (shaves off the top of the box)
        let cutter = Manifold.cube([rw + 2, (rh + ramp) * 2, ridgeLen * 2], false);
        let cutterXCentered = cutter.translate([-(rw + 2) / 2, 0, 0]);
        cutter.delete();

        const theta = Math.atan2(ramp, ridgeLen) * (180 / Math.PI);
        let cutterRot = cutterXCentered.rotate([-theta, 0, 0]);
        cutterXCentered.delete();

        let cutterPos = cutterRot.translate([0, rh + ramp, 0]);
        cutterRot.delete();

        let ridge = baseMoved.subtract(cutterPos);
        baseMoved.delete();
        cutterPos.delete();

        // Translate outward to sit on cylinder surface (inner surface at cylOuterR)
        let translated = ridge.translate([0, cylOuterR, 0]);
        ridge.delete();

        // Rotate to correct angle around Z axis
        const degZ = angle * (180 / Math.PI);
        let rotated = translated.rotate([0, 0, degZ]);
        translated.delete();

        // Position along Z (starts at cylZ)
        const cylZ = z.ledStart + cylinderIndex * cylLen;
        let positioned = rotated.translate([0, 0, cylZ]);
        rotated.delete();

        parts.push(positioned);
    }

    // ─── Bottom Mounting Ring (Solid) ─────────────────────────────────
    let botRingOuter = Manifold.cylinder(ringThick, botRingOuterR, botRingOuterR, 32, true);
    let botRingInner = Manifold.cylinder(ringThick + 2, ringInnerR, ringInnerR, 32, true);
    let botRing = botRingOuter.subtract(botRingInner);
    botRingOuter.delete();
    botRingInner.delete();

    const cylZ = z.ledStart + cylinderIndex * cylLen;
    let botPos = botRing.translate([0, 0, cylZ + ringThick / 2]);
    botRing.delete();
    parts.push(botPos);

    // ─── Top Mounting Ring (Solid) ────────────────────────────────────
    let topRingOuter = Manifold.cylinder(ringThick, topRingOuterR, topRingOuterR, 32, true);
    let topRingInner = Manifold.cylinder(ringThick + 2, ringInnerR, ringInnerR, 32, true);
    let topRing = topRingOuter.subtract(topRingInner);
    topRingOuter.delete();
    topRingInner.delete();

    let topPos = topRing.translate([0, 0, cylZ + cylLen - ringThick / 2]);
    topRing.delete();
    parts.push(topPos);

    // ─── Merge all parts ─────────────────────────────────────────────
    let merged = parts[0];
    for (let i = 1; i < parts.length; i++) {
        let temp = merged.add(parts[i]);
        merged.delete();
        parts[i].delete();
        merged = temp;
    }

    // ─── Subtract Screw Holes from the Merged Ridges ──────────────────
    const screwR = params.m3Diam / 2;
    const screwHoleLen = cylOuterR * 2 + 40; // very long to punch through cleanly
    const botScrewZ = cylZ + 6.0;
    const topScrewZ = cylZ + cylLen - 6.0;

    for (let s = 0; s < 4; s++) {
        const angle = (Math.PI / 4) + s * (Math.PI / 2);
        const angleDeg = angle * (180 / Math.PI);

        // Bottom radial hole
        let hole1 = Manifold.cylinder(screwHoleLen, screwR, screwR, 16, true);
        let rot1Y = hole1.rotate([0, 90, 0]);
        hole1.delete();
        let rot1Z = rot1Y.rotate([0, 0, angleDeg]);
        rot1Y.delete();
        let pos1 = rot1Z.translate([0, 0, botScrewZ]);
        rot1Z.delete();
        let temp1 = merged.subtract(pos1);
        merged.delete();
        pos1.delete();
        merged = temp1;

        // Top radial hole
        let hole2 = Manifold.cylinder(screwHoleLen, screwR, screwR, 16, true);
        let rot2Y = hole2.rotate([0, 90, 0]);
        hole2.delete();
        let rot2Z = rot2Y.rotate([0, 0, angleDeg]);
        rot2Y.delete();
        let pos2 = rot2Z.translate([0, 0, topScrewZ]);
        rot2Z.delete();
        let temp2 = merged.subtract(pos2);
        merged.delete();
        pos2.delete();
        merged = temp2;
    }

    return merged;
}

function generateBottomEndcap() {
    if (!Manifold) return null;

    const capR = params.capOD / 2;
    const h = params.capThick;

    // Solid disc (no bore — caps the bottom)
    let cap = Manifold.cylinder(h, capR, capR, 32, false);

    return cap;
}

// ─── UI Binding ──────────────────────────────────────────────────────────
function setupUIListeners() {
    const bindSlider = (id, paramKey, isFloat = true) => {
        const slider = document.getElementById(id);
        const numInput = document.getElementById('val-' + paramKey);
        if (!slider) return;

        slider.addEventListener('input', (e) => {
            const val = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value);
            params[paramKey] = val;
            if (numInput) numInput.value = isFloat ? val.toFixed(1) : val;
            rebuild();
        });

        if (numInput) {
            numInput.addEventListener('input', (e) => {
                let val = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value);
                if (isNaN(val)) return;
                const minVal = parseFloat(slider.min) || 0;
                const maxVal = parseFloat(slider.max) || 1000;
                if (val < minVal) val = minVal;
                if (val > maxVal) val = maxVal;
                params[paramKey] = val;
                slider.value = val;
                rebuild();
            });

            numInput.addEventListener('blur', () => {
                const val = params[paramKey];
                numInput.value = isFloat ? val.toFixed(1) : val;
            });
        }
    };

    // Rod
    bindSlider('input-rodOD', 'rodOD');
    bindSlider('input-rodWall', 'rodWall');
    bindSlider('input-rodLength', 'rodLength');

    // Guard
    bindSlider('input-guardWall', 'guardWall');
    bindSlider('input-guardLength', 'guardLength');

    // Sled
    bindSlider('input-sledWidth', 'sledWidth');
    bindSlider('input-sledLength', 'sledLength');
    bindSlider('input-sledDepth', 'sledDepth');

    // Cylinder
    bindSlider('input-cylOD', 'cylOD');
    bindSlider('input-cylWall', 'cylWall');
    bindSlider('input-ledSectionLen', 'ledSectionLen');

    // Rings
    bindSlider('input-ringHeight', 'ringHeight');
    bindSlider('input-ringCenterOD', 'ringCenterOD');
    bindSlider('input-ringEndOD', 'ringEndOD');

    // Ridges
    bindSlider('input-ridgeWidth', 'ridgeWidth');
    bindSlider('input-ridgeHeight', 'ridgeHeight');
    bindSlider('input-ridgeRamp', 'ridgeRamp');

    // LED
    bindSlider('input-ledWidth', 'ledWidth');
    bindSlider('input-ledHeight', 'ledHeight');

    // Screws
    bindSlider('input-m3Diam', 'm3Diam');
    bindSlider('input-screwDepth', 'screwDepth');

    // Endcap
    bindSlider('input-capThick', 'capThick');
    bindSlider('input-capOD', 'capOD');

    // Display
    bindSlider('input-explode', 'explode', false);
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
    const bindVis = (id, key) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', (e) => {
            visibilities[key] = e.target.checked;
            rebuild();
        });
    };
    bindVis('show-rod', 'rod');
    bindVis('show-guard', 'guard');
    bindVis('show-sled', 'sled');
    bindVis('show-cylinders', 'cylinders');
    bindVis('show-rings', 'rings');
    bindVis('show-ridges', 'ridges');
    bindVis('show-leds', 'leds');
    bindVis('show-endcap', 'endcap');
    bindVis('show-screwholes', 'screwholes');

    // Export STL
    document.getElementById('btn-export-guard').addEventListener('click', () => exportComponentSTL('guard'));
    document.getElementById('btn-export-cylinder').addEventListener('click', () => exportComponentSTL('cylinder'));
    document.getElementById('btn-export-ring').addEventListener('click', () => exportComponentSTL('ring'));

    setupTooltipListeners();
}

// ─── Tooltip System ──────────────────────────────────────────────────────
let hoveredParam = null;

const paramInfo = {
    rodOD: {
        text: "Rod Outer Diameter",
        desc: "Outside diameter of the central steel/PVC rod. Measured 21.5mm edge-to-edge.",
        getPos: () => new THREE.Vector3(params.rodOD / 2, 0, params.rodLength / 2),
        dir: [1, 1]
    },
    rodWall: {
        text: "Rod Wall Thickness",
        desc: "Wall thickness of the hollow rod. Controls structural rigidity.",
        getPos: () => new THREE.Vector3(params.rodOD / 2, 0, params.rodLength * 0.3),
        dir: [1, -1]
    },
    rodLength: {
        text: "Rod Total Length",
        desc: "Full length of the central rod. Default 533.4mm (21 inches).",
        getPos: () => new THREE.Vector3(0, 0, params.rodLength),
        dir: [1, 1]
    },
    guardWall: {
        text: "Guard Wall Thickness",
        desc: "Thickness of the guard housing around the rod. Slightly thicker than the handle for grip transition.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(params.rodOD / 2 + params.guardWall, 0, z.guardStart + params.guardLength / 2); },
        dir: [1, 1]
    },
    guardLength: {
        text: "Guard Length",
        desc: "Total length of the guard/sled housing along the rod axis.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(0, 0, z.guardEnd); },
        dir: [1, 1]
    },
    sledWidth: {
        text: "Sled Width",
        desc: "Width of the electronics sled block that slides into the guard.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(0, params.rodOD / 2, z.guardStart + params.sledLength / 2); },
        dir: [-1, 1]
    },
    sledLength: {
        text: "Sled Length",
        desc: "Length of the electronics sled. Houses battery, MCU, IMU and haptic motor.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(0, params.rodOD / 2, z.guardStart + params.sledLength); },
        dir: [1, 1]
    },
    sledDepth: {
        text: "Sled Depth",
        desc: "Depth/height of the sled block. Must fit within guard OD.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(0, params.rodOD / 2 + params.sledDepth, z.guardStart + params.sledLength / 2); },
        dir: [-1, 1]
    },
    cylOD: {
        text: "Cylinder Outer Diameter",
        desc: "Outside diameter of the transparent cylinders covering the LED strips. Measured 34mm.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(params.cylOD / 2, 0, z.ledStart + z.cylLen / 2); },
        dir: [1, 1]
    },
    cylWall: {
        text: "Cylinder Wall Thickness",
        desc: "Wall thickness of the transparent cylinders. Single wall for light diffusion.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(params.cylOD / 2, 0, z.ledStart + z.cylLen * 1.5); },
        dir: [1, -1]
    },
    ledSectionLen: {
        text: "LED Section Length",
        desc: "Total length of the LED section covered by the 3 transparent cylinders. Default 1 foot (304.8mm).",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(0, 0, z.ledEnd); },
        dir: [1, 1]
    },
    ringHeight: {
        text: "Ring Height",
        desc: "Height of connector rings between transparent cylinder sections.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(params.ringCenterOD / 2, 0, z.ledStart + z.cylLen); },
        dir: [1, 1]
    },
    ringCenterOD: {
        text: "Ring Center Flange OD",
        desc: "Outer diameter of the ring's center section. Wider for structural strength.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(params.ringCenterOD / 2, 0, z.ledStart + z.cylLen); },
        dir: [1, -1]
    },
    ringEndOD: {
        text: "Ring End Flange OD",
        desc: "Outer diameter of the ring's top/bottom flanges. Matches or is slightly smaller than cylinder OD.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(params.ringEndOD / 2, 0, z.ledStart + z.cylLen * 2); },
        dir: [1, 1]
    },
    ridgeWidth: {
        text: "Ridge Width",
        desc: "Width of the decorative ridges running between LED strips.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(params.cylOD / 2 + params.ridgeHeight, params.cylOD / 2 + params.ridgeHeight, z.ledStart + z.cylLen / 2); },
        dir: [1, -1]
    },
    ridgeHeight: {
        text: "Ridge Protrusion",
        desc: "Height the ridges protrude above the cylinder surface. Hides screw heads underneath.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(params.cylOD / 2 + params.ridgeHeight, 0, z.ledStart + z.cylLen * 1.5); },
        dir: [1, 1]
    },
    ridgeRamp: {
        text: "Ridge Ramp",
        desc: "Additional height protrusion at the bottom of the ridges to create a ramped profile.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(params.cylOD / 2 + params.ridgeHeight + params.ridgeRamp, 0, z.ledStart + z.cylLen * 0.5); },
        dir: [1, 1]
    },
    ledWidth: {
        text: "LED Strip Width",
        desc: "Width of each LED strip (12mm default). 4 strips at 0°, 90°, 180°, 270°.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(params.rodOD / 2 + params.ledHeight, 0, z.ledStart + z.cylLen * 1.5); },
        dir: [1, -1]
    },
    ledHeight: {
        text: "LED Strip Height",
        desc: "Thickness of each LED strip (4mm default). Glued directly onto the rod surface.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(params.rodOD / 2 + params.ledHeight / 2, 0, z.ledStart + z.cylLen); },
        dir: [1, 1]
    },
    m3Diam: {
        text: "M3 Hole Diameter",
        desc: "Clearance hole diameter for M3 screws connecting cylinder sections.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(params.cylOD / 2, params.cylOD / 2, z.ledStart + z.cylLen); },
        dir: [1, -1]
    },
    screwDepth: {
        text: "Screw Thread Depth",
        desc: "Depth of screw engagement into the cylinder wall. 5mm default.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(params.cylOD / 2, 0, z.ledStart + 2); },
        dir: [1, -1]
    },
    capThick: {
        text: "Endcap Thickness",
        desc: "Thickness of the flat bottom endcap.",
        getPos: () => new THREE.Vector3(params.capOD / 2, 0, params.capThick / 2),
        dir: [1, -1]
    },
    capOD: {
        text: "Endcap Diameter",
        desc: "Outer diameter of the bottom endcap disc.",
        getPos: () => new THREE.Vector3(params.capOD / 2, 0, 0),
        dir: [1, -1]
    },
    explode: {
        text: "Explode Assembly",
        desc: "Separate assembly components along the Z-axis for inspection.",
        getPos: () => new THREE.Vector3(0, 0, params.rodLength / 2),
        dir: [1, 1]
    },
    opacity: {
        text: "Shell Opacity",
        desc: "Visual transparency of the transparent cylinders and guard.",
        getPos: () => new THREE.Vector3(0, 0, params.rodLength / 2),
        dir: [1, 1]
    }
};

function setupTooltipListeners() {
    let tooltipEl = document.getElementById('slider-tooltip');
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'slider-tooltip';
        tooltipEl.className = 'slider-tooltip';
        document.body.appendChild(tooltipEl);
    }

    const paramRows = document.querySelectorAll('.param-row[data-param]');
    paramRows.forEach(row => {
        const paramKey = row.getAttribute('data-param');
        if (!paramKey) return;

        row.addEventListener('mouseenter', (e) => {
            hoveredParam = paramKey;
            const info = paramInfo[paramKey];
            if (info) {
                tooltipEl.innerHTML = `<div class="tooltip-title">${info.text}</div><div class="tooltip-desc">${info.desc}</div>`;
                tooltipEl.style.opacity = '1';
                
                const rect = row.getBoundingClientRect();
                if (rect.right + 250 > window.innerWidth) {
                    tooltipEl.style.left = `${rect.left - 250}px`;
                } else {
                    tooltipEl.style.left = `${rect.right + 15}px`;
                }
                tooltipEl.style.top = `${rect.top}px`;
                tooltipEl.style.display = 'block';
            }
            updateLeaderLines();
        });

        row.addEventListener('mouseleave', () => {
            hoveredParam = null;
            tooltipEl.style.opacity = '0';
            tooltipEl.style.display = 'none';
            updateLeaderLines();
        });
    });
}

// ─── Rebuild the 3D Representation ───────────────────────────────────────
function rebuild() {
    if (!Manifold) return;

    const explodeDist = params.explode * 1.5;
    const z = getLayoutZones();

    // Clear all meshes
    const clearMesh = (mesh) => {
        if (mesh) {
            mainGroup.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
        }
        return null;
    };

    rodMesh = clearMesh(rodMesh);
    guardMesh = clearMesh(guardMesh);
    sledMesh = clearMesh(sledMesh);
    endcapMesh = clearMesh(endcapMesh);
    cylinderMeshes.forEach(m => clearMesh(m));
    cylinderMeshes = [];
    ringMeshes.forEach(m => clearMesh(m));
    ringMeshes = [];
    ridgeMeshes.forEach(m => clearMesh(m));
    ridgeMeshes = [];
    ledMeshes.forEach(m => clearMesh(m));
    ledMeshes = [];
    while(screwHoleGroup.children.length > 0) {
        const child = screwHoleGroup.children[0];
        if(child.geometry) child.geometry.dispose();
        screwHoleGroup.remove(child);
    }

    // ─── Materials ───────────────────────────────────────────────────────
    const makeMat = (color, opacityVal = 1.0, emissive = false) => {
        if (params.mode === 'rendered') {
            return new THREE.MeshPhysicalMaterial({
                color: color,
                roughness: 0.2,
                metalness: 0.6,
                transparent: opacityVal < 1.0,
                opacity: opacityVal,
                side: THREE.DoubleSide,
                ...(emissive ? { emissive: color, emissiveIntensity: 0.8 } : {})
            });
        } else {
            return new THREE.MeshBasicMaterial({
                color: 0x071830,
                transparent: true,
                opacity: 0.4,
                side: THREE.DoubleSide
            });
        }
    };

    const addBlueprintEdges = (mesh, geometry, color) => {
        if (params.mode === 'blueprint') {
            const edges = new THREE.EdgesGeometry(geometry);
            const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: color, linewidth: 2 }));
            mesh.add(line);
        }
    };

    // ─── 1. Central Rod ──────────────────────────────────────────────────
    if (visibilities.rod) {
        const rodSolid = generateRod();
        if (rodSolid) {
            const rMesh = rodSolid.getMesh();
            const rodGeom = manifoldToThree(rMesh);
            rodSolid.delete();

            rodMesh = new THREE.Mesh(rodGeom, makeMat(colors.rod, 0.9));
            addBlueprintEdges(rodMesh, rodGeom, colors.blueprintLineCyan);
            mainGroup.add(rodMesh);
        }
    }

    // ─── 2. Guard / Housing ──────────────────────────────────────────────
    if (visibilities.guard) {
        const guardSolid = generateGuard();
        if (guardSolid) {
            const gMesh = guardSolid.getMesh();
            const guardGeom = manifoldToThree(gMesh);
            guardSolid.delete();

            guardMesh = new THREE.Mesh(guardGeom, makeMat(colors.guard, params.opacity / 100));
            addBlueprintEdges(guardMesh, guardGeom, colors.blueprintLine);
            guardMesh.position.z -= explodeDist * 0.3;
            mainGroup.add(guardMesh);
        }
    }

    // ─── 3. Electronics Sled (Commented placeholder) ─────────────────────
    if (visibilities.sled) {
        const sledSolid = generateSled();
        if (sledSolid) {
            const sMesh = sledSolid.getMesh();
            const sledGeom = manifoldToThree(sMesh);
            sledSolid.delete();

            sledMesh = new THREE.Mesh(sledGeom, makeMat(colors.sled, 0.7));
            addBlueprintEdges(sledMesh, sledGeom, 0xffaa00);
            sledMesh.position.z -= explodeDist * 0.5;
            mainGroup.add(sledMesh);
        }
    }

    // ─── 4. Transparent Cylinders (×3) ───────────────────────────────────
    if (visibilities.cylinders) {
        for (let i = 0; i < 3; i++) {
            const cylSolid = generateTransparentCylinder(i);
            if (cylSolid) {
                const cMesh = cylSolid.getMesh();
                const cylGeom = manifoldToThree(cMesh);
                cylSolid.delete();

                let cylMat;
                if (params.mode === 'rendered') {
                    cylMat = new THREE.MeshPhysicalMaterial({
                        color: colors.cylinder,
                        roughness: 0.05,
                        metalness: 0.0,
                        transmission: 0.85,
                        thickness: params.cylWall,
                        transparent: true,
                        opacity: params.opacity / 100,
                        side: THREE.DoubleSide,
                        ior: 1.5
                    });
                } else {
                    cylMat = new THREE.MeshBasicMaterial({
                        color: 0x071830,
                        transparent: true,
                        opacity: 0.3,
                        side: THREE.DoubleSide
                    });
                }

                const mesh = new THREE.Mesh(cylGeom, cylMat);
                addBlueprintEdges(mesh, cylGeom, colors.blueprintLineCyan);
                mesh.position.z += explodeDist * (i + 1) * 0.5;
                mainGroup.add(mesh);
                cylinderMeshes.push(mesh);
            }
        }
    }

    // ─── 5. Connector Rings (×3) ─────────────────────────────────────────
    if (visibilities.rings) {
        for (let i = 0; i < 3; i++) {
            const ringSolid = generateConnectorRing(i);
            if (ringSolid) {
                const rMesh = ringSolid.getMesh();
                const ringGeom = manifoldToThree(rMesh);
                ringSolid.delete();

                const mesh = new THREE.Mesh(ringGeom, makeMat(colors.ring, params.opacity / 100));
                addBlueprintEdges(mesh, ringGeom, colors.blueprintLine);
                mesh.position.z += explodeDist * (i + 0.5) * 0.5;
                mainGroup.add(mesh);
                ringMeshes.push(mesh);
            }
        }
    }

    // ─── 6. Decorative Ridges ────────────────────────────────────────────
    if (visibilities.ridges) {
        for (let i = 0; i < 3; i++) {
            const ridgeSolid = generateDecorativeRidges(i);
            if (ridgeSolid) {
                const rMesh = ridgeSolid.getMesh();
                const ridgeGeom = manifoldToThree(rMesh);
                ridgeSolid.delete();

                const mesh = new THREE.Mesh(ridgeGeom, makeMat(colors.ridge, 0.9));
                addBlueprintEdges(mesh, ridgeGeom, 0x9933ff);
                mesh.position.z += explodeDist * (i + 1) * 0.5;
                mainGroup.add(mesh);
                ridgeMeshes.push(mesh);
            }
        }
    }

    // ─── 7. LED Strips (Visual-only, 4 strips at 0°/90°/180°/270°) ──────
    if (visibilities.leds) {
        const rodR = params.rodOD / 2;
        const ledLen = params.ledSectionLen;

        for (let s = 0; s < 4; s++) {
            const angle = s * (Math.PI / 2); // 0°, 90°, 180°, 270°
            // LED strip: height (thickness) is radial, width lies along the circumference
            // BoxGeometry(X=radial height, Y=tangential width, Z=length along rod)
            const stripGeom = new THREE.BoxGeometry(params.ledHeight, params.ledWidth, ledLen);

            let ledMat;
            if (params.mode === 'rendered') {
                ledMat = new THREE.MeshPhysicalMaterial({
                    color: colors.led,
                    emissive: colors.led,
                    emissiveIntensity: 1.2,
                    roughness: 0.1,
                    metalness: 0.0,
                    transparent: true,
                    opacity: 0.9
                });
            } else {
                ledMat = new THREE.MeshBasicMaterial({
                    color: colors.led,
                    transparent: true,
                    opacity: 0.6
                });
            }

            const mesh = new THREE.Mesh(stripGeom, ledMat);

            // Position on the rod surface: radial offset = rodR + half the strip thickness
            const ox = Math.cos(angle) * (rodR + params.ledHeight / 2);
            const oy = Math.sin(angle) * (rodR + params.ledHeight / 2);
            mesh.position.set(ox, oy, z.ledStart + ledLen / 2);
            mesh.rotation.z = angle; // rotates the X/Y axes so X (height) stays radial

            mesh.position.z += explodeDist * 0.3;
            mainGroup.add(mesh);
            ledMeshes.push(mesh);
        }
    }

    // ─── 8. Bottom Endcap ────────────────────────────────────────────────
    if (visibilities.endcap) {
        const capSolid = generateBottomEndcap();
        if (capSolid) {
            const cMesh = capSolid.getMesh();
            const capGeom = manifoldToThree(cMesh);
            capSolid.delete();

            endcapMesh = new THREE.Mesh(capGeom, makeMat(colors.endcap, 0.9));
            addBlueprintEdges(endcapMesh, capGeom, colors.blueprintLineCyan);
            endcapMesh.position.z -= explodeDist;
            mainGroup.add(endcapMesh);
        }
    }

    // ─── 9. Screw Hole Indicators ────────────────────────────────────────
    if (visibilities.screwholes) {
        const screwMat = new THREE.MeshBasicMaterial({
            color: colors.screwHoles,
            wireframe: true,
            transparent: true,
            opacity: 0.6
        });

        const rodR = params.rodOD / 2;
        const boreR = rodR + params.ledHeight + 0.3;
        const cylInnerR = Math.max(params.cylOD / 2 - params.cylWall, boreR + 1.5);
        const cylOuterR = cylInnerR + params.cylWall;
        const guardR = Math.max(rodR + params.guardWall, cylInnerR + 1.5);

        const screwR = params.m3Diam / 2;

        // Cylinders screw indicators
        for (let ci = 0; ci < 3; ci++) {
            const cylZ = z.ledStart + ci * z.cylLen;

            for (let s = 0; s < 4; s++) {
                const angle = (Math.PI / 4) + s * (Math.PI / 2);

                // Bottom radial screw indicator (points toward rod center)
                const botGeom = new THREE.CylinderGeometry(screwR, screwR, cylOuterR * 2, 8);
                const botMesh = new THREE.Mesh(botGeom, screwMat);
                botMesh.position.set(0, 0, cylZ + 6.0); // 6mm from bottom edge
                botMesh.rotation.z = angle + Math.PI / 2; // orient radially
                screwHoleGroup.add(botMesh);

                // Top radial screw indicator
                const topGeom = new THREE.CylinderGeometry(screwR, screwR, cylOuterR * 2, 8);
                const topMesh = new THREE.Mesh(topGeom, screwMat);
                topMesh.position.set(0, 0, cylZ + z.cylLen - 6.0); // 6mm from top edge
                topMesh.rotation.z = angle + Math.PI / 2;
                screwHoleGroup.add(topMesh);
            }
        }

        // Guard screw indicators
        const guardScrewZ = z.guardEnd - 6.0; // 6mm below top of guard
        for (let s = 0; s < 4; s++) {
            const angle = (Math.PI / 4) + s * (Math.PI / 2);
            const geom = new THREE.CylinderGeometry(screwR, screwR, guardR * 2, 8);
            const mesh = new THREE.Mesh(geom, screwMat);
            mesh.position.set(0, 0, guardScrewZ);
            mesh.rotation.z = angle + Math.PI / 2;
            screwHoleGroup.add(mesh);
        }
    }

    // ─── Update Spec Sheet ───────────────────────────────────────────────
    const elTotal = document.getElementById('spec-total-length');
    if (elTotal) elTotal.innerText = `${params.rodLength.toFixed(1)} mm`;

    const elLed = document.getElementById('spec-led-section');
    if (elLed) elLed.innerText = `${params.ledSectionLen.toFixed(1)} mm (3× ${z.cylLen.toFixed(1)})`;

    const elHandle = document.getElementById('spec-handle-length');
    if (elHandle) elHandle.innerText = `${z.handleLength.toFixed(1)} mm`;

    const elGuardOD = document.getElementById('spec-guard-od');
    if (elGuardOD) {
        const rodR = params.rodOD / 2;
        const boreR = rodR + params.ledHeight + 0.3;
        const cylInnerR = Math.max(params.cylOD / 2 - params.cylWall, boreR + 1.5);
        const guardR = Math.max(rodR + params.guardWall, cylInnerR + 1.5);
        elGuardOD.innerText = `${(guardR * 2).toFixed(1)} mm`;
    }

    const elCylSection = document.getElementById('spec-cyl-section');
    if (elCylSection) elCylSection.innerText = `${z.cylLen.toFixed(1)} mm each`;

    updateLeaderLines();
}

// ─── Leader Lines (SVG Overlay) ──────────────────────────────────────────
function updateLeaderLines() {
    if (!overlaySvg) return;
    overlaySvg.innerHTML = '';

    const container = document.getElementById('canvas3d');
    if (!container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const drawDimension = (point3d, textLabel, dirX = 1, dirY = -1, isHighlighted = false, descTextVal = null) => {
        const vector = new THREE.Vector3(point3d.x, point3d.y, point3d.z);
        mainGroup.updateMatrixWorld();
        vector.applyMatrix4(mainGroup.matrixWorld);
        vector.project(camera);

        const x = (vector.x * .5 + .5) * width;
        const y = (-(vector.y * .5) + .5) * height;

        if (vector.z <= 1) {
            const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');

            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dot.setAttribute('cx', x);
            dot.setAttribute('cy', y);
            if (isHighlighted) {
                dot.setAttribute('r', '6');
                dot.setAttribute('fill', '#39ff14');
                dot.style.filter = 'drop-shadow(0px 0px 4px #39ff14)';
            } else {
                dot.setAttribute('r', '3');
                dot.setAttribute('fill', '#bf00ff');
            }
            group.appendChild(dot);

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            const targetX = x + 35 * dirX;
            const targetY = y + 25 * dirY;
            const endX = targetX + 30 * dirX;
            line.setAttribute('points', `${x},${y} ${targetX},${targetY} ${endX},${targetY}`);
            if (isHighlighted) {
                line.setAttribute('stroke', '#39ff14');
                line.setAttribute('stroke-width', '2');
            } else {
                line.setAttribute('stroke', '#bf00ff');
                line.setAttribute('stroke-width', '1');
            }
            line.setAttribute('fill', 'none');
            group.appendChild(line);

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', targetX);
            text.setAttribute('y', targetY - 5);
            if (isHighlighted) {
                text.setAttribute('fill', '#39ff14');
                text.setAttribute('font-size', '12px');
                text.setAttribute('font-weight', 'bold');
            } else {
                text.setAttribute('fill', '#ffffff');
                text.setAttribute('font-size', '10px');
            }
            text.setAttribute('font-family', 'Space Mono');
            if (dirX < 0) text.setAttribute('text-anchor', 'end');
            text.textContent = textLabel;
            group.appendChild(text);

            if (isHighlighted && descTextVal) {
                const descText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                descText.setAttribute('x', targetX);
                descText.setAttribute('y', targetY + 12);
                descText.setAttribute('fill', 'rgba(255, 255, 255, 0.9)');
                descText.setAttribute('font-size', '9px');
                descText.setAttribute('font-family', 'Space Mono');
                if (dirX < 0) descText.setAttribute('text-anchor', 'end');
                descText.textContent = descTextVal;
                group.appendChild(descText);
            }

            overlaySvg.appendChild(group);
        }
    };

    // Static labels for key components
    const zz = getLayoutZones();

    if (visibilities.guard) {
        drawDimension(
            new THREE.Vector3(params.rodOD / 2 + params.guardWall + 2, 0, zz.guardStart + params.guardLength / 2),
            "Guard Housing", 1, -1
        );
    }

    if (visibilities.cylinders) {
        for (let i = 0; i < 3; i++) {
            drawDimension(
                new THREE.Vector3(params.cylOD / 2 + 3, 0, zz.ledStart + zz.cylLen * (i + 0.5)),
                `Cylinder #${i + 1}`, 1, (i % 2 === 0 ? -1 : 1)
            );
        }
    }

    if (visibilities.endcap) {
        drawDimension(
            new THREE.Vector3(params.capOD / 2 + 2, 0, params.capThick / 2),
            "Bottom Endcap", 1, 1
        );
    }

    // Hovered parameter highlight
    if (hoveredParam && paramInfo[hoveredParam]) {
        const info = paramInfo[hoveredParam];
        const val = params[hoveredParam];
        let labelText = `${info.text}: `;
        if (hoveredParam === 'opacity' || hoveredParam === 'explode') {
            labelText += `${val.toFixed(0)}%`;
        } else if (typeof val === 'number') {
            labelText += `${val.toFixed(1)} mm`;
        } else {
            labelText += `${val}`;
        }
        drawDimension(info.getPos(), labelText, info.dir[0], info.dir[1], true, info.desc);
    }
}

// ─── STL Export ──────────────────────────────────────────────────────────
function exportComponentSTL(componentType) {
    if (!Manifold) return;

    let solid = null;
    let filename = '';

    switch (componentType) {
        case 'guard':
            solid = generateGuard();
            filename = `lightbaton_guard_wall${params.guardWall}mm.stl`;
            break;
        case 'cylinder':
            solid = generateTransparentCylinder(0);
            filename = `lightbaton_cylinder_OD${params.cylOD}mm_wall${params.cylWall}mm.stl`;
            break;
        case 'ring':
            solid = generateConnectorRing(1);
            filename = `lightbaton_ring_center${params.ringCenterOD}mm.stl`;
            break;
        default:
            return;
    }

    if (!solid) return;
    const mesh = solid.getMesh();
    solid.delete();

    const totalTriangles = mesh.triVerts.length / 3;
    const buffer = new ArrayBuffer(84 + totalTriangles * 50);
    const view = new DataView(buffer);

    const headerStr = `Light Baton ${componentType} - Generated via Antigravity CAD (2026)`;
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

        // Normal placeholder (0,0,0)
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

// ─── Animation Loop ──────────────────────────────────────────────────────
function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // Slow auto-rotation when idle
    if (controls.state === -1) {
        mainGroup.rotation.z += 0.0005;
    }

    renderer.render(scene, camera);
    updateLeaderLines();
}

// ─── Bootstrap ───────────────────────────────────────────────────────────
init();
