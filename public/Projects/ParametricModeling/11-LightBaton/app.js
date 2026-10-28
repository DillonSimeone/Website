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
    rodOD: 27.0,
    rodWall: 3.0,
    rodLength: 587.8,   // Calculated dynamically as capThick + handleLength + guardLength + ledSectionLen
    handleLength: 110.0, // default grip size in mm

    // Guard / Sled Housing
    guardWall: 3.0,
    guardLength: 115.0,

    // Electronics Sled (solid block)
    sledWidth: 20.0,
    sledLength: 160.0,
    sledDepth: 22.0,

    // Transparent Cylinders
    cylOD: 38.0, // Calculated dynamically in getLayoutZones
    cylLedGap: 2.0,
    cylWall: 1.0,
    ledSectionLen: 304.8, // 1 foot in mm
    maxCylLen: 120.0,

    // Connector Rings
    ringHeight: 28.0,
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
    m3Diam: 3.0,
    screwDepth: 5.0,

    // Handle & Pommel
    capThick: 3.0,
    lanyardHoleDiam: 5.0,

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
    handle: true,
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
let handleMesh = null;
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
    handle: 0x1a1a1a,
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
    // Determine the cylinder outer diameter dynamically from gap and wall thickness
    const rodR = params.rodOD / 2;
    const boreR = rodR + params.ledHeight + 0.3; // clear LEDs
    const cylInnerR = boreR + params.cylLedGap;
    params.cylOD = (cylInnerR + params.cylWall) * 2;

    // Determine the rodLength dynamically based on other components
    params.rodLength = params.capThick + params.handleLength + params.guardLength + params.ledSectionLen;

    const capTop = params.capThick;
    const handleLength = params.handleLength;
    const guardStart = capTop + handleLength;
    const guardEnd = guardStart + params.guardLength;
    const ledStart = guardEnd;
    const ledEnd = guardEnd + params.ledSectionLen;
    const actualLedLen = params.ledSectionLen;

    // Fixed flange height for joints
    const flangeH = 10.0;
    const centerH = Math.max(2.0, params.ringHeight - 2 * flangeH);

    // Solve iteratively for N (number of cylinders) and cylLen (cylinder length)
    let N = 1;
    let cylLen = 0;
    while (true) {
        cylLen = (actualLedLen - (N - 0.5) * centerH) / N;
        if (cylLen <= params.maxCylLen) {
            break;
        }
        const nextCylLen = (actualLedLen - (N + 0.5) * centerH) / (N + 1);
        if (nextCylLen < 10.0) {
            break;
        }
        N++;
    }
    if (N < 1) N = 1;
    if (cylLen < 5.0) cylLen = 5.0;

    return {
        capTop,
        guardStart,
        guardEnd,
        ledStart,
        ledEnd,
        cylLen,
        handleLength,
        rodCenter: params.rodLength / 2,
        N,
        actualLedLen,
        flangeH,
        centerH
    };
}

// ─── Component Generators ────────────────────────────────────────────────

function generateRod() {
    if (!Manifold) return null;
    const outerR = params.rodOD / 2;
    const innerR = outerR - params.rodWall;
    const h = params.rodLength - 3.0; // Shorten rod to clear the top cap of the last cylinder

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
    const flangeH = z.flangeH; // 10.0mm
    const h_ring = params.ringHeight;
    const h_trimmed = h - (h_ring / 2 - flangeH); // Trim guard top to fit Ring 0 center body

    // ─── 1. Solid Housing with Outer Casings ──────────────────────────────
    // Main cylinder (height is h_trimmed)
    let mainCyl = Manifold.cylinder(h_trimmed, guardR, guardR, 32, false);

    // Battery side bulge (+Y): encloses the battery holder and switch (stops at Z=90.0, shifted 6mm down)
    const batBulgeW = 28.0;
    const batBulgeD = rodR + 28.0; // height from center to outer +Y face
    let batBulge = Manifold.cube([batBulgeW, batBulgeD, 90.0], false);
    let batBulgeMoved = batBulge.translate([-batBulgeW / 2, 0, 0]);
    batBulge.delete();

    // Electronics side bulge (-Y): encloses the components (stops at Z=103.0, added 5mm of material to rise the floor)
    const elBulgeW = 28.0;
    const elBulgeD = rodR + 20.0; // height from center to outer -Y face (shifted by 5mm)
    let elBulge = Manifold.cube([elBulgeW, elBulgeD, 103.0], false);
    let elBulgeMoved = elBulge.translate([-elBulgeW / 2, -elBulgeD, 0]);
    elBulge.delete();

    // Merge bulges into solid housing body
    let outer = mainCyl.add(batBulgeMoved).add(elBulgeMoved);
    mainCyl.delete();
    batBulgeMoved.delete();
    elBulgeMoved.delete();

    // ─── 2. Inner Bore & Joints ───────────────────────────────────────────
    // Inner bore for rod (height is h_trimmed)
    let bore = Manifold.cylinder(h_trimmed + 2, rodR + 0.3, rodR + 0.3, 32, false);
    let boreMoved = bore.translate([0, 0, -1]);
    bore.delete();

    let guard = outer.subtract(boreMoved);
    outer.delete();
    boreMoved.delete();

    // A. Conical Countersink at the top of the guard to receive Ring 0 bottom flange
    const cbR = cylInnerR;
    const chamferH = cbR - boreR;
    let cbCyl = Manifold.cylinder(flangeH - chamferH, cbR, cbR, 32, false).translate([0, 0, h_trimmed - flangeH + chamferH]);
    let cbCone = Manifold.cylinder(chamferH, boreR, cbR, 32, false).translate([0, 0, h_trimmed - flangeH]);
    let cbCombined = cbCyl.add(cbCone);
    cbCyl.delete();
    cbCone.delete();
    
    let tempGuardTop = guard.subtract(cbCombined);
    guard.delete();
    cbCombined.delete();
    guard = tempGuardTop;

    // B. Conical Countersink at the bottom of the guard to receive the Handle top sleeve
    const botCbR = rodR + 3.15;
    const botBoreR = rodR + 0.3;
    const botChamferH = 2.85; // (rodR + 3.15) - (rodR + 0.3)
    let botCyl = Manifold.cylinder(flangeH - botChamferH, botCbR, botCbR, 32, false);
    let botCone = Manifold.cylinder(botChamferH, botCbR, botBoreR, 32, false).translate([0, 0, flangeH - botChamferH]);
    let botCbCombined = botCyl.add(botCone);
    botCyl.delete();
    botCone.delete();

    let tempGuardBot = guard.subtract(botCbCombined);
    guard.delete();
    botCbCombined.delete();
    guard = tempGuardBot;

    // Subtract 4 radial screw holes at the top of the guard (connecting to Ring 0)
    const screwR = params.m3Diam / 2;
    const holeLen = guardR * 2 + 30; // long enough to punch through the outer casing too
    const screwDist = 3.0 + params.m3Diam / 2; // e.g. 4.5mm
    const guardScrewZ = params.guardLength - h_ring / 2 + screwDist;

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

    // Subtract 4 radial screw holes at the bottom of the guard (connecting to Handle)
    const botScrewZ = screwDist;
    const botHoleLen = guardR * 2 + 10;

    for (let s = 0; s < 4; s++) {
        const angle = (Math.PI / 4) + s * (Math.PI / 2);
        const angleDeg = angle * (180 / Math.PI);

        let hole = Manifold.cylinder(botHoleLen, screwR, screwR, 16, true);
        let rotY = hole.rotate([0, 90, 0]);
        hole.delete();
        let rotZ = rotY.rotate([0, 0, angleDeg]);
        rotY.delete();
        let positioned = rotZ.translate([0, 0, botScrewZ]);
        rotZ.delete();
        let temp = guard.subtract(positioned);
        guard.delete();
        positioned.delete();
        guard = temp;
    }

    // Subtract 4 radial rod-securing screw holes along the X-axis (Y = 0)
    // 2 at Z = 15.0 and 2 at Z = h_trimmed - 15.0
    let rodHole1 = Manifold.cylinder(guardR * 2 + 20.0, screwR, screwR, 16, true).rotate([0, 90, 0]).translate([0, 0, 15.0]);
    let tempRodG1 = guard.subtract(rodHole1);
    guard.delete();
    rodHole1.delete();
    guard = tempRodG1;

    let rodHole2 = Manifold.cylinder(guardR * 2 + 20.0, screwR, screwR, 16, true).rotate([0, 90, 0]).translate([0, 0, h_trimmed - 15.0]);
    let tempRodG2 = guard.subtract(rodHole2);
    guard.delete();
    rodHole2.delete();
    guard = tempRodG2;

    // ─── 3. Battery Bay with Sliding Cover Slot (+Y side) ─────────────────
    const batW = 22.4;
    const batL = 76.0;
    const batD = 24.4;

    // Internal pocket cavity (starts at Z = 4.0 so there is a 4mm solid bottom stop!)
    let batBox = Manifold.cube([batW, batD, batL], false);
    let batMoved = batBox.translate([-batW / 2, rodR + 0.2, 4.0]);
    batBox.delete();

    // Cutout to +Y outer face (starts at Z=4.0 so the battery sits on the solid bottom stop)
    const bayTopZ = 80.0; // 4.0 bottom stop + 76.0 length
    let batCutout = Manifold.cube([22.4, 28.0, bayTopZ - 4.0], false);
    let batCutoutMoved = batCutout.translate([-22.4 / 2, rodR + 0.2, 4.0]);
    batCutout.delete();

    // Combine all battery bay cutouts and subtract (walls are left constant thickness, uncut)
    let batCombined = batMoved.add(batCutoutMoved);
    batMoved.delete();
    batCutoutMoved.delete();

    let tempGuard1 = guard.subtract(batCombined);
    guard.delete();
    batCombined.delete();
    guard = tempGuard1;

    // ─── 4. Power Switch Pocket (Rotated: 15mm width, 9mm Z-length, shifted 6mm down)
    const swW = 15.4;
    const swL = 9.4;
    const swD = 20.4;
    // Switch pocket carved out and extending to the outer +Y face
    let swBox = Manifold.cube([swW, swD + 10.0, swL], false);
    let swMoved = swBox.translate([-swW / 2, rodR + 0.2, 80.0]);
    swBox.delete();
    let tempGuardSw = guard.subtract(swMoved);
    guard.delete();
    swMoved.delete();
    guard = tempGuardSw;

    // ─── 5. Electronics Bay with Sliding Cover Slot (-Y side) ─────────────
    const elBayW = 25.4; // width is 25.4, removing the extra side wall material
    const elBayL = 100.0;
    const elBayD = 8.4; // pocket depth is 8.4 (keeping outer wall thick)
    const elTopZ = 102.0; // 2.0 bottom stop + 100.0 length
    // Unified rectangular pocket (starts at Y = -(rodR + 9.2 + elBayD) to leave a 9.2mm thick floor)
    let elBox = Manifold.cube([elBayW, elBayD, elBayL], false);
    let elMoved = elBox.translate([-elBayW / 2, -(rodR + 9.2 + elBayD), 2.0]);
    elBox.delete();

    // Cutout to -Y outer face (extends from Z=0 to top of electronics bay, width 22.4 to leave guide shoulders)
    let elCutout = Manifold.cube([22.4, 13.0, elTopZ], false);
    let elCutoutMoved = elCutout.translate([-22.4 / 2, -(rodR + 20.0), 0]);
    elCutout.delete();

    // PCB sliding slots (stepped width vertical channels carved into the 9.2mm floor)
    // 1. LIPO Charger PCB Groove (Z = 2.0 to 30.0, width 17.0mm -> groove 17.4mm)
    let lipoPcb = Manifold.cube([17.4, 1.8, 28.0], false);
    let lipoPcbMoved = lipoPcb.translate([-17.4 / 2, -(rodR + 7.7), 2.0]);
    lipoPcb.delete();

    // 2. MPU 6500 PCB Groove (Z = 30.0 to 57.0, width 16.0mm -> groove 16.4mm)
    let mpuPcb = Manifold.cube([16.4, 1.8, 27.0], false);
    let mpuPcbMoved = mpuPcb.translate([-16.4 / 2, -(rodR + 7.7), 30.0]);
    mpuPcb.delete();

    // 3. ESP32 C3 PCB Groove (Z = 57.0 to 80.0, width 19.0mm -> groove 19.4mm)
    let espPcb = Manifold.cube([19.4, 1.8, 23.0], false);
    let espPcbMoved = espPcb.translate([-19.4 / 2, -(rodR + 7.7), 57.0]);
    espPcb.delete();

    // 4. Motor Driver PCB Groove (Z = 80.0 to 102.0, width 25.0mm -> groove 25.4mm)
    let drvPcb = Manifold.cube([25.4, 1.8, 22.0], false);
    let drvPcbMoved = drvPcb.translate([-25.4 / 2, -(rodR + 7.7), 80.0]);
    drvPcb.delete();

    // Union all PCB grooves
    let pcbGrooves = lipoPcbMoved.add(mpuPcbMoved).add(espPcbMoved).add(drvPcbMoved);
    lipoPcbMoved.delete();
    mpuPcbMoved.delete();
    espPcbMoved.delete();
    drvPcbMoved.delete();

    // Combine all electronics bay cutouts and subtract (walls are left constant thickness, uncut)
    let elCombined = elMoved.add(elCutoutMoved).add(pcbGrooves);
    elMoved.delete();
    elCutoutMoved.delete();
    pcbGrooves.delete();

    let tempGuard2 = guard.subtract(elCombined);
    guard.delete();
    elCombined.delete();
    guard = tempGuard2;

    // Add bridge across the top of the electronics tray pocket (Z = 96.0 to 102.0)
    let elBridge = Manifold.cube([elBayW, 5.0, 6.0], false);
    let elBridgeMoved = elBridge.translate([-elBayW / 2, -(rodR + 18.0), 96.0]);
    elBridge.delete();
    let tempGuardBridge = guard.add(elBridgeMoved);
    guard.delete();
    elBridgeMoved.delete();
    guard = tempGuardBridge;

    // Add bridge across the bottom of the electronics tray pocket (Z = 0.0 to 6.0)
    let elBotBridge = Manifold.cube([elBayW, 5.0, 6.0], false);
    let elBotBridgeMoved = elBotBridge.translate([-elBayW / 2, -(rodR + 18.0), 0.0]);
    elBotBridge.delete();
    let tempGuardBotBridge = guard.add(elBotBridgeMoved);
    guard.delete();
    elBotBridgeMoved.delete();
    guard = tempGuardBotBridge;

    // ─── 6. LIPO Charger USB-C Port Hole (at bottom Z=0 to 3.0) ───────────
    let usbBox = Manifold.cube([9.5, 12.0, 4.0], false);
    let usbMoved = usbBox.translate([-9.5 / 2, -(rodR + 15.0), -1.0]);
    usbBox.delete();
    let tempGuardUsb = guard.subtract(usbMoved);
    guard.delete();
    usbMoved.delete();
    guard = tempGuardUsb;

    // ─── 7. Motor Slots (Sideways cylindrical pocket with support-free diamond roof at Z>=0) ───────────
    const coinR = 5.6;
    const coinT = 3.2;
    const d_roof = coinR * Math.SQRT2;

    // Right motor slot (+X)
    let cy1 = Manifold.cylinder(30.0, coinR, coinR, 32, false);
    let cy1Rot = cy1.rotate([0, 90, 0]); // orient along X
    cy1.delete();

    // Create a 45-degree diamond roof at Z >= 0
    let baseRoof = Manifold.cube([30.0, d_roof, d_roof], true).rotate([45, 0, 0]);
    let limitBox = Manifold.cube([32.0, 15.0, 10.0], false).translate([-16.0, -7.5, 0.0]);
    let clippedRoof = baseRoof.intersect(limitBox);
    baseRoof.delete();
    limitBox.delete();

    // Scale vertically to apex Z = 8.6 (3mm above cylinder top)
    let scaledRoof = clippedRoof.scale([1.0, 1.0, 8.6 / coinR]);
    clippedRoof.delete();

    let roofMoved = scaledRoof.translate([15.0, 0, 0]);
    scaledRoof.delete();

    let combined1 = cy1Rot.add(roofMoved);
    cy1Rot.delete();
    roofMoved.delete();

    let cy1Moved = combined1.translate([rodR + 0.2, 0, 57.5]);
    combined1.delete();

    let tempGuardM1 = guard.subtract(cy1Moved);
    guard.delete();
    cy1Moved.delete();
    guard = tempGuardM1;

    // Left motor slot (-X)
    let cy2 = Manifold.cylinder(30.0, coinR, coinR, 32, false);
    let cy2Rot = cy2.rotate([0, 90, 0]); // orient along X
    cy2.delete();

    let baseRoof2 = Manifold.cube([30.0, d_roof, d_roof], true).rotate([45, 0, 0]);
    let limitBox2 = Manifold.cube([32.0, 15.0, 10.0], false).translate([-16.0, -7.5, 0.0]);
    let clippedRoof2 = baseRoof2.intersect(limitBox2);
    baseRoof2.delete();
    limitBox2.delete();

    let scaledRoof2 = clippedRoof2.scale([1.0, 1.0, 8.6 / coinR]);
    clippedRoof2.delete();

    let roofMoved2 = scaledRoof2.translate([15.0, 0, 0]);
    scaledRoof2.delete();

    let combined2 = cy2Rot.add(roofMoved2);
    cy2Rot.delete();
    roofMoved2.delete();

    let cy2Moved = combined2.translate([-(rodR + 0.2 + 30.0), 0, 57.5]);
    combined2.delete();

    let tempGuardM2 = guard.subtract(cy2Moved);
    guard.delete();
    cy2Moved.delete();
    guard = tempGuardM2;

    // Helper functions for support-free V-channels
    const createVChannelY = (w, L, centerX, yMin, zVal) => {
        const d = w * Math.SQRT1_2;
        let diamond = Manifold.cube([d, L, d], true).rotate([0, 45, 0]);
        let moved = diamond.translate([centerX, yMin + L / 2, zVal]);
        diamond.delete();
        return moved;
    };

    const createVChannelX = (w, L, xMin, centerY, zVal) => {
        const d = w * Math.SQRT1_2;
        let diamond = Manifold.cube([L, d, d], true).rotate([45, 0, 0]);
        let moved = diamond.translate([xMin + L / 2, centerY, zVal]);
        diamond.delete();
        return moved;
    };

    // ─── 8. Wire Paths / Passages ─────────────────────────────────────────
    // Helper to generate a 5mm V-channel bypass channel around the right side of the central rod
    const generateBypass = (zVal, includeBatterySide = true) => {
        const w = 5.0; // channel size
        const centerX = rodR + 0.3 + w / 2;

        const crossNY = -(rodR + 9.2 + w / 2);
        const crossPY = rodR + 0.2 + w / 2;

        const yMin = crossNY - w / 2;
        const yMax = crossPY + w / 2;

        // Right side channel running along Y
        let rightMoved = createVChannelY(w, yMax - yMin, centerX, yMin, zVal);

        // -Y cross channel connecting pockets to the right side channel
        const crossXLength = (centerX + w) - (-5.0);
        let crossNMoved = createVChannelX(w, crossXLength, -5.0, crossNY, zVal);

        let combined;
        if (includeBatterySide) {
            // +Y cross channel connecting pockets to the right side channel
            let crossPMoved = createVChannelX(w, crossXLength, -5.0, crossPY, zVal);

            combined = rightMoved.add(crossPMoved).add(crossNMoved);
            crossPMoved.delete();
        } else {
            combined = rightMoved.add(crossNMoved);
        }
        rightMoved.delete();
        crossNMoved.delete();

        return combined;
    };

    // Battery wire passage bottom: bypass around the central rod at Z = 4.0 (now goes all the way through into the battery area)
    let batWireBot = generateBypass(4.0, true);
    let tempGuardW1 = guard.subtract(batWireBot);
    guard.delete();
    batWireBot.delete();
    guard = tempGuardW1;

    // Switch to electronics bay wire passage: bypass around the central rod at Z = 84.7 (shifted 6mm down)
    let swWire = generateBypass(84.7);
    let tempGuardWSw = guard.subtract(swWire);
    guard.delete();
    swWire.delete();
    guard = tempGuardWSw;

    // Switch to battery bay vertical wire passage: Z = 74.0 to 86.0 (5mm x 5mm square channel connecting switch pocket and top of battery bay)
    let swBatWire = Manifold.cube([5.0, 5.0, 12.0], false);
    let swBatWireMoved = swBatWire.translate([-2.5, rodR + 2.0, 74.0]);
    swBatWire.delete();
    let tempGuardWBat = guard.subtract(swBatWireMoved);
    guard.delete();
    swBatWireMoved.delete();
    guard = tempGuardWBat;

    // Electronics bay to central rod wire hole (for LED strips routing): Z = 95.0 (4.0mm V-channel)
    const wireHoleLen = rodR + 15.0;
    let elRodWireMoved = createVChannelY(4.0, wireHoleLen, 0, -(rodR + 9.2) / 2 - wireHoleLen / 2, 95.0);
    let tempGuardWRod = guard.subtract(elRodWireMoved);
    guard.delete();
    elRodWireMoved.delete();
    guard = tempGuardWRod;

    // Motor cells wire channels to electronics bay (5mm V-channels, centered with motors at Z = 57.5)
    // Left channel
    const motorChanLen = rodR + 15.0;
    let leftChanMoved = createVChannelY(5.0, motorChanLen, -(rodR + 1.7), -motorChanLen, 57.5);
    let tempGuardW3 = guard.subtract(leftChanMoved);
    guard.delete();
    leftChanMoved.delete();
    guard = tempGuardW3;

    // Right channel
    let rightChanMoved = createVChannelY(5.0, motorChanLen, rodR + 1.7, -motorChanLen, 57.5);
    let tempGuardW4 = guard.subtract(rightChanMoved);
    guard.delete();
    rightChanMoved.delete();
    guard = tempGuardW4;

    // ─── 9. M3 Cover Locking Screws (at Z = 3.5mm from bottom) ────────────
    // Battery cover locking screw hole (lengthened to 20mm, translated Y to rodR + 28.0 to cut through, and Z to 2.0 to clear battery shelf)
    let batLockHole = Manifold.cylinder(20, screwR, screwR, 16, true);
    let batLockHoleRot = batLockHole.rotate([0, 90, 0]).rotate([0, 0, 90]);
    batLockHole.delete();
    let batLockHoleMoved = batLockHoleRot.translate([0, rodR + 28.0, 2.0]);
    batLockHoleRot.delete();
    let tempGuard5 = guard.subtract(batLockHoleMoved);
    guard.delete();
    batLockHoleMoved.delete();
    guard = tempGuard5;

    // Electronics cover locking screw hole (shifted to Y = -(rodR + 24.0) to match new bulge depth)
    let elLockHole = Manifold.cylinder(30, screwR, screwR, 16, true);
    let elLockHoleRot = elLockHole.rotate([0, 90, 0]).rotate([0, 0, 90]);
    elLockHole.delete();
    
    let elLockHoleMoved = elLockHoleRot.translate([0, -(rodR + 24.0), 3.0]);
    let tempGuard6 = guard.subtract(elLockHoleMoved);
    guard.delete();
    elLockHoleMoved.delete();
    guard = tempGuard6;

    // Top electronics cover locking screw hole through the bridge (at Z = 99.0)
    let elTopLockHoleMoved = elLockHoleRot.translate([0, -(rodR + 24.0), 99.0]);
    let tempGuard7 = guard.subtract(elTopLockHoleMoved);
    guard.delete();
    elTopLockHoleMoved.delete();
    guard = tempGuard7;

    elLockHoleRot.delete();

    // ─── 10. Vertical JST Wire Routing Channel (Z = 101.0 to h_trimmed + 2.0) ───
    const jstChanRadius = 3.0; // 6.0mm diameter
    const jstChanHeight = h_trimmed - 101.0 + 2.0;
    
    // Main vertical cylinder
    let jstChan = Manifold.cylinder(jstChanHeight, jstChanRadius, jstChanRadius, 16, false);
    let jstChanMoved = jstChan.translate([0, -(rodR + 4.5), 101.0]);
    jstChan.delete();

    // Box to make the channel oblong (slot shape) towards the central rod
    let jstSlot = Manifold.cube([6.0, 5.0, jstChanHeight], false);
    let jstSlotMoved = jstSlot.translate([-3.0, -(rodR + 4.5), 101.0]);
    jstSlot.delete();

    let combinedChan = jstChanMoved.add(jstSlotMoved);
    jstChanMoved.delete();
    jstSlotMoved.delete();

    // 45-degree exit ramp down into the device tray (bounded to Z <= 0 in local space to prevent cutting into ceiling)
    let rampBox = Manifold.cube([6.0, 12.0, 12.0], false).translate([-3.0, -6.0, -6.0]);
    let rampRot = rampBox.rotate([45, 0, 0]);
    rampBox.delete();

    // Bounding box to clip anything above Z = 0
    let rampLimit = Manifold.cube([10.0, 20.0, 20.0], false).translate([-5.0, -10.0, -20.0]);
    let boundedRamp = rampRot.intersect(rampLimit);
    rampRot.delete();
    rampLimit.delete();

    let rampMoved = boundedRamp.translate([0, -(rodR + 4.5) - 3.0, 102.0]);
    boundedRamp.delete();

    let combinedChanAndRamp = combinedChan.add(rampMoved);
    combinedChan.delete();
    rampMoved.delete();

    let tempGuard8 = guard.subtract(combinedChanAndRamp);
    guard.delete();
    combinedChanAndRamp.delete();
    guard = tempGuard8;

    // Position guard at its Z location
    let positioned = guard.translate([0, 0, z.guardStart]);
    guard.delete();

    return positioned;
}

function generateSled() {
    const group = new THREE.Group();
    const z = getLayoutZones();
    const rodR = params.rodOD / 2;
    const h = params.guardLength;

    // Materials - Neon Cyberpunk aesthetics
    const matPCBBlue = new THREE.MeshPhysicalMaterial({ color: 0x0055ff, roughness: 0.5, metalness: 0.1 });
    const matPCBRed = new THREE.MeshPhysicalMaterial({ color: 0xff1133, roughness: 0.5, metalness: 0.1 });
    const matPCBGreen = new THREE.MeshPhysicalMaterial({ color: 0x008833, roughness: 0.5, metalness: 0.1 });
    const matPCBTurquoise = new THREE.MeshPhysicalMaterial({ color: 0x00a8a8, roughness: 0.5, metalness: 0.1 });
    const matSilver = new THREE.MeshPhysicalMaterial({ color: 0xcccccc, roughness: 0.2, metalness: 0.9 });
    const matBlack = new THREE.MeshPhysicalMaterial({ color: 0x1a1a1a, roughness: 0.8, metalness: 0.1 });
    const matGreenBat = new THREE.MeshPhysicalMaterial({ color: 0x39ff14, roughness: 0.3, metalness: 0.2, emissive: 0x39ff14, emissiveIntensity: 0.2 });
    
    // Translucent neon violet covers (glassmorphism look)
    const matCover = new THREE.MeshPhysicalMaterial({
        color: 0xbf00ff,
        roughness: 0.1,
        metalness: 0.1,
        transparent: true,
        opacity: 0.55,
        transmission: 0.4,
        side: THREE.DoubleSide
    });

    // ─── 1. Battery & Switch Side (+Y) ────────────────────────────────────
    // Battery Holder (starts at Z = 4.0, Z-center = 41.5, shifted 6mm down)
    const holderGeom = new THREE.BoxGeometry(22, 24, 75);
    const holder = new THREE.Mesh(holderGeom, matBlack);
    holder.position.set(0, rodR + 12.2, 41.5);
    group.add(holder);

    // Battery inside holder
    const batGeom = new THREE.CylinderGeometry(9, 9, 65, 16);
    const bat = new THREE.Mesh(batGeom, matGreenBat);
    bat.rotation.x = Math.PI / 2;
    bat.position.set(0, rodR + 12.2, 41.5);
    group.add(bat);

    // Power Switch (above battery, Z = 80.0 to 89.0, Z-center = 84.5, shifted 6mm down)
    const swGeom = new THREE.BoxGeometry(15, 20, 9);
    const sw = new THREE.Mesh(swGeom, matBlack);
    sw.position.set(0, rodR + 10.2, 84.5);
    group.add(sw);

    // Red rocker button
    const toggleGeom = new THREE.BoxGeometry(10, 4, 5);
    const toggle = new THREE.Mesh(toggleGeom, new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    toggle.position.set(0, rodR + 21.0, 84.5);
    group.add(toggle);

    // ─── 2. Electronics Side (-Y) ─────────────────────────────────────────
    // LIPO USB-C Charger (Z = 2.0 to 30.0, Z-center = 16.0)
    const lipoGeom = new THREE.BoxGeometry(17, 1.6, 28);
    const lipo = new THREE.Mesh(lipoGeom, matPCBTurquoise);
    lipo.position.set(0, -(rodR + 6.8), 16.0);
    group.add(lipo);

    // USB-C Connector port
    const usbGeom = new THREE.BoxGeometry(9, 3.2, 6);
    const usb = new THREE.Mesh(usbGeom, matSilver);
    usb.position.set(0, -(rodR + 8.4), 1.0);
    group.add(usb);

    // MPU 6500 (Z = 30.0 to 57.0, Z-center = 43.5)
    const mpuGeom = new THREE.BoxGeometry(16, 1.6, 27);
    const mpu = new THREE.Mesh(mpuGeom, matPCBGreen);
    mpu.position.set(0, -(rodR + 6.8), 43.5);
    group.add(mpu);

    const mpuChipGeom = new THREE.BoxGeometry(4, 1.0, 4);
    const mpuChip = new THREE.Mesh(mpuChipGeom, matBlack);
    mpuChip.position.set(0, -(rodR + 6.8 + 1.3), 43.5);
    group.add(mpuChip);

    // ESP32 C3 Supermini (Z = 57.0 to 80.0, Z-center = 68.5)
    const espGeom = new THREE.BoxGeometry(19, 1.6, 23);
    const esp = new THREE.Mesh(espGeom, matPCBBlue);
    esp.position.set(0, -(rodR + 6.8), 68.5);
    group.add(esp);

    const espChipGeom = new THREE.BoxGeometry(6, 1.0, 6);
    const espChip = new THREE.Mesh(espChipGeom, matSilver);
    espChip.position.set(0, -(rodR + 6.8 + 1.3), 68.5);
    group.add(espChip);

    // Motor Driver (Z = 80.0 to 102.0, Z-center = 91.0)
    const drvGeom = new THREE.BoxGeometry(25, 1.6, 22);
    const drv = new THREE.Mesh(drvGeom, matPCBRed);
    drv.position.set(0, -(rodR + 6.8), 91.0);
    group.add(drv);

    const drvChipGeom = new THREE.BoxGeometry(8, 3.0, 8);
    const drvChip = new THREE.Mesh(drvChipGeom, matBlack);
    drvChip.position.set(0, -(rodR + 6.8 + 2.3), 91.0);
    group.add(drvChip);

    // ─── 3. Coin Vibration Cells (+/- X sides, centered at Z = 57.5) ──────
    const coinGeom = new THREE.CylinderGeometry(5.5, 5.5, 3, 16);
    coinGeom.rotateZ(Math.PI / 2);

    const coin1 = new THREE.Mesh(coinGeom, matSilver);
    coin1.position.set(rodR + 1.7, 0, 57.5);
    group.add(coin1);

    const coin2 = new THREE.Mesh(coinGeom, matSilver);
    coin2.position.set(-(rodR + 1.7), 0, 57.5);
    group.add(coin2);

    // ─── 4. Slide-on Covers (Extended lengths, with physical locking screw holes) ───
    const screwR = params.m3Diam / 2;

    // Battery Cover (Side A, length = 80.0, starting at Z = 0.0, wrapping halfway over the uncut bulge walls)
    let batCoverBase = Manifold.cube([32.0, 16.0, 80.0], false).translate([-16.0, rodR + 14.0, 0.0]);
    let batCoverCutout = Manifold.cube([28.0, 14.0, 82.0], false).translate([-14.0, rodR + 14.0, -1.0]);
    let batCoverSolidMoved = batCoverBase.subtract(batCoverCutout);
    batCoverBase.delete();
    batCoverCutout.delete();

    let batHole = Manifold.cylinder(20, screwR, screwR, 16, true);
    let batHoleRot = batHole.rotate([0, 90, 0]).rotate([0, 0, 90]);
    batHole.delete();
    let batHoleMoved = batHoleRot.translate([0, rodR + 28.0, 2.0]);
    batHoleRot.delete();

    let finalBatCoverSolid = batCoverSolidMoved.subtract(batHoleMoved);
    batCoverSolidMoved.delete();
    batHoleMoved.delete();

    const batCoverMeshProps = finalBatCoverSolid.getMesh();
    const batCoverGeom = manifoldToThree(batCoverMeshProps);
    finalBatCoverSolid.delete();

    const batCover = new THREE.Mesh(batCoverGeom, matCover);
    batCover.name = "batteryCover";
    group.add(batCover);

    // Electronics Cover (Side B, length = 102.0, wrapping halfway over the uncut bulge walls)
    let elCoverBase = Manifold.cube([32.0, 8.5, 102.0], false).translate([-16.0, -(rodR + 22.0), 0.0]);
    let elCoverCutout = Manifold.cube([28.0, 6.5, 104.0], false).translate([-14.0, -(rodR + 20.0), -1.0]);
    let elCoverSolidMoved = elCoverBase.subtract(elCoverCutout);
    elCoverBase.delete();
    elCoverCutout.delete();

    let elHole = Manifold.cylinder(30, screwR, screwR, 16, true);
    let elHoleRot = elHole.rotate([0, 90, 0]).rotate([0, 0, 90]);
    elHole.delete();
    
    let elHoleMoved = elHoleRot.translate([0, -(rodR + 24.0), 3.0]);
    let elTopHoleMoved = elHoleRot.translate([0, -(rodR + 24.0), 99.0]);
    elHoleRot.delete();

    let finalElCoverSolid = elCoverSolidMoved.subtract(elHoleMoved).subtract(elTopHoleMoved);
    elCoverSolidMoved.delete();
    elHoleMoved.delete();
    elTopHoleMoved.delete();

    const elCoverMeshProps = finalElCoverSolid.getMesh();
    const elCoverGeom = manifoldToThree(elCoverMeshProps);
    finalElCoverSolid.delete();

    const elCover = new THREE.Mesh(elCoverGeom, matCover);
    elCover.name = "electronicsCover";
    group.add(elCover);

    // Position the entire group at z.guardStart
    group.position.z = z.guardStart;

    return group;
}

function generateTransparentCylinder(index) {
    if (!Manifold) return null;

    const z = getLayoutZones();
    const rodR = params.rodOD / 2;
    const boreR = rodR + params.ledHeight + 0.3; // clear LEDs
    const cylInnerR = Math.max(params.cylOD / 2 - params.cylWall, boreR + 1.5);
    const cylOuterR = cylInnerR + params.cylWall;
    const h = z.cylLen;
    const flangeH = z.flangeH; // 10.0mm
    const cbR = cylInnerR;
    const chamferH = cbR - boreR;

    let outer = Manifold.cylinder(h, cylOuterR, cylOuterR, 32, false);
    let cyl;
    if (index === z.N - 1) {
        // Last cylinder gets a flat cap on top. Cap thickness is 3.0 mm.
        const capThick = 3.0;
        let inner = Manifold.cylinder(h - capThick, boreR, boreR, 32, false);
        cyl = outer.subtract(inner);
        outer.delete();
        inner.delete();
    } else {
        let inner = Manifold.cylinder(h + 2, boreR, boreR, 32, false).translate([0, 0, -1]);
        cyl = outer.subtract(inner);
        outer.delete();
        inner.delete();
    }

    // A. Subtract bottom conical pocket (for Ring index top flange)
    let cbCyl = Manifold.cylinder(flangeH - chamferH, cbR, cbR, 32, false);
    let cbCone = Manifold.cylinder(chamferH, cbR, boreR, 32, false).translate([0, 0, flangeH - chamferH]);
    let cbCombined = cbCyl.add(cbCone);
    cbCyl.delete();
    cbCone.delete();
    
    let tempCyl = cyl.subtract(cbCombined);
    cyl.delete();
    cbCombined.delete();
    cyl = tempCyl;

    // B. Subtract top conical pocket (for Ring index + 1 bottom flange) - only if not the last cylinder
    if (index < z.N - 1) {
        let cbCyl2 = Manifold.cylinder(flangeH - chamferH, cbR, cbR, 32, false).translate([0, 0, h - flangeH + chamferH]);
        let cbCone2 = Manifold.cylinder(chamferH, boreR, cbR, 32, false).translate([0, 0, h - flangeH]);
        let cbCombined2 = cbCyl2.add(cbCone2);
        cbCyl2.delete();
        cbCone2.delete();
        
        let tempCyl2 = cyl.subtract(cbCombined2);
        cyl.delete();
        cbCombined2.delete();
        cyl = tempCyl2;
    }

    // Subtract 4 RADIAL screw holes at bottom and top
    // Screws go through the cylinder wall toward the rod (radially, not axially)
    // Positioned at 45°, 135°, 225°, 315° to avoid LED strip positions at 0/90/180/270
    const screwR = params.m3Diam / 2;
    const holeLen = cylOuterR * 2 + 10; // long enough to punch clean through the wall and ridges
    
    // Updated Z positions with screwDist (4.5mm from edges)
    const screwDist = 3.0 + params.m3Diam / 2;
    const botScrewZ = screwDist;
    const topScrewZ = h - screwDist;

    for (let s = 0; s < 4; s++) {
        const angle = (Math.PI / 4) + s * (Math.PI / 2); // 45°, 135°, 225°, 315°
        const angleDeg = angle * (180 / Math.PI);

        // Bottom radial screw hole
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

        // Top radial screw hole (only if not the last cylinder)
        if (index < z.N - 1) {
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
    }

    // Position the cylinder in the LED section
    const cylZ = z.ledStart + index * (z.cylLen + z.centerH) + z.centerH / 2;
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

    const endR = cylInnerR - 0.15; // 0.15mm clearance for slip fit inside cylinder
    const centerR = Math.max(params.ringCenterOD / 2, cylOuterR + 1.0);

    const flangeH = z.flangeH; // 10.0mm
    const centerH = z.centerH;
    const boreR2 = boreR; // keep clearance bore
    const chamferH = endR - boreR2;

    // Bottom flange (Z = 0 to flangeH) with 45-degree chamfer at tip (0 to chamferH)
    let botCone = Manifold.cylinder(chamferH, boreR2, endR, 32, false);
    let botCyl = Manifold.cylinder(flangeH - chamferH, endR, endR, 32, false).translate([0, 0, chamferH]);
    let botOuter = botCone.add(botCyl);
    botCone.delete();
    botCyl.delete();
    let botBore = Manifold.cylinder(flangeH + 2, boreR2, boreR2, 32, false).translate([0, 0, -1]);
    let bot = botOuter.subtract(botBore);
    botOuter.delete();
    botBore.delete();

    // Center body (Z = flangeH to flangeH + centerH) with support-free 45-degree slopes
    const slopeH = Math.min(centerR - endR, centerH / 2);
    let cenParts = [];
    
    if (slopeH > 0.01) {
        // Bottom slope: cone from endR to (endR + slopeH)
        let botSlope = Manifold.cylinder(slopeH, endR, endR + slopeH, 32, false).translate([0, 0, flangeH]);
        cenParts.push(botSlope);
        
        // Middle flat cylinder
        const midH = centerH - 2 * slopeH;
        if (midH > 0.01) {
            let midCyl = Manifold.cylinder(midH, endR + slopeH, endR + slopeH, 32, false).translate([0, 0, flangeH + slopeH]);
            cenParts.push(midCyl);
        }
        
        // Top slope: cone from (endR + slopeH) to endR
        let topSlope = Manifold.cylinder(slopeH, endR + slopeH, endR, 32, false).translate([0, 0, flangeH + centerH - slopeH]);
        cenParts.push(topSlope);
    } else {
        // Fallback if no slope is needed
        let fallback = Manifold.cylinder(centerH, endR, endR, 32, false).translate([0, 0, flangeH]);
        cenParts.push(fallback);
    }
    
    let cenOuter = cenParts[0];
    for (let i = 1; i < cenParts.length; i++) {
        let temp = cenOuter.add(cenParts[i]);
        cenOuter.delete();
        cenParts[i].delete();
        cenOuter = temp;
    }

    let cenBore = Manifold.cylinder(centerH + 2, boreR2, boreR2, 32, false).translate([0, 0, flangeH - 1]);
    let cen = cenOuter.subtract(cenBore);
    cenOuter.delete();
    cenBore.delete();

    // Top flange (Z = flangeH + centerH to h) with 45-degree chamfer at tip (h - chamferH to h)
    let topCyl = Manifold.cylinder(flangeH - chamferH, endR, endR, 32, false).translate([0, 0, flangeH + centerH]);
    let topCone = Manifold.cylinder(chamferH, endR, boreR2, 32, false).translate([0, 0, h - chamferH]);
    let topOuter = topCyl.add(topCone);
    topCyl.delete();
    topCone.delete();
    let topBore = Manifold.cylinder(flangeH + 2, boreR2, boreR2, 32, false).translate([0, 0, flangeH + centerH - 1]);
    let top = topOuter.subtract(topBore);
    topOuter.delete();
    topBore.delete();

    let ring = bot.add(cen).add(top);
    bot.delete();
    cen.delete();
    top.delete();

    // RADIAL through-holes for M3 screws at bottom flange and top flange
    const screwR = params.m3Diam / 2;
    const holeLen = centerR * 2 + 10; // long enough to punch through all components
    const screwDist = 3.0 + params.m3Diam / 2;
    const botHoleZ = screwDist;
    const topHoleZ = h - screwDist;

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

    // If it is the first connector ring (index === 0), subtract the JST wire channel notch
    if (index === 0) {
        const jstR = 3.0;
        let jstHole = Manifold.cylinder(h + 2, jstR, jstR, 16, false).translate([0, -(rodR + 4.5), -1]);
        let jstSlot = Manifold.cube([6.0, 5.0, h + 2], false).translate([-3.0, -(rodR + 4.5), -1]);
        let jstCombined = jstHole.add(jstSlot);
        jstHole.delete();
        jstSlot.delete();
        
        let temp = ring.subtract(jstCombined);
        ring.delete();
        jstCombined.delete();
        ring = temp;
    }

    // Position: ring sits between cylinders
    const ringZ = z.ledStart + index * (z.cylLen + z.centerH) - params.ringHeight / 2;

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
    const ringInnerR = cylOuterR + 0.15; // 0.15mm clearance gap to slide over cylinder surface

    const parts = [];

    // Calculate cylZ dynamically (preventing overlap with ring center body)
    const cylZ = z.ledStart + cylinderIndex * (z.cylLen + z.centerH) + z.centerH / 2;

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

        // Translate outward to sit on cylinder surface (inner surface at cylOuterR + 0.15)
        let translated = ridge.translate([0, cylOuterR + 0.15, 0]);
        ridge.delete();

        // Rotate to correct angle around Z axis
        const degZ = angle * (180 / Math.PI);
        let rotated = translated.rotate([0, 0, degZ]);
        translated.delete();

        // Position along Z (starts at cylZ)
        let positioned = rotated.translate([0, 0, cylZ]);
        rotated.delete();

        parts.push(positioned);
    }

    // ─── Bottom Mounting Ring (Solid with arches) ─────────────────────
    let botRingOuter = Manifold.cylinder(ringThick, botRingOuterR, botRingOuterR, 32, true);
    let botRingInner = Manifold.cylinder(ringThick + 2, ringInnerR, ringInnerR, 32, true);
    let botRing = botRingOuter.subtract(botRingInner);
    botRingOuter.delete();
    botRingInner.delete();

    // Calculate mathematically perfect support-free arches starting exactly at the spine edges
    const R_mid_bot = (ringInnerR + botRingOuterR) / 2;
    const theta_edge_bot = (Math.PI / 4) - (rw / 2) / R_mid_bot;
    const d_edge_bot = R_mid_bot * Math.sin(theta_edge_bot);
    const deltaZ = ringThick - 2.0; // arch depth
    const archR_bot = (d_edge_bot * d_edge_bot + deltaZ * deltaZ) / (2 * deltaZ);
    const z_axis_bot = ringThick / 2 - deltaZ + archR_bot;

    const cutLen_bot = botRingOuterR * 2 + 10;
    
    let cutX_bot = Manifold.cylinder(cutLen_bot, archR_bot, archR_bot, 32, true).rotate([0, 90, 0]).translate([0, 0, z_axis_bot]);
    let cutY_bot = Manifold.cylinder(cutLen_bot, archR_bot, archR_bot, 32, true).rotate([90, 0, 0]).translate([0, 0, z_axis_bot]);
    let cuts_bot = cutX_bot.add(cutY_bot);
    cutX_bot.delete();
    cutY_bot.delete();
    
    let botRingArched = botRing.subtract(cuts_bot);
    botRing.delete();
    cuts_bot.delete();

    let botPos = botRingArched.translate([0, 0, cylZ + ringThick / 2]);
    botRingArched.delete();
    parts.push(botPos);

    // ─── Top Mounting Ring (Solid with arches) ────────────────────────
    let topRingOuter = Manifold.cylinder(ringThick, topRingOuterR, topRingOuterR, 32, true);
    let topRingInner = Manifold.cylinder(ringThick + 2, ringInnerR, ringInnerR, 32, true);
    let topRing = topRingOuter.subtract(topRingInner);
    topRingOuter.delete();
    topRingInner.delete();

    const R_mid_top = (ringInnerR + topRingOuterR) / 2;
    const theta_edge_top = (Math.PI / 4) - (rw / 2) / R_mid_top;
    const d_edge_top = R_mid_top * Math.sin(theta_edge_top);
    const archR_top = (d_edge_top * d_edge_top + deltaZ * deltaZ) / (2 * deltaZ);
    const z_axis_top = -ringThick / 2 + deltaZ - archR_top;

    const cutLen_top = topRingOuterR * 2 + 10;

    let cutX_top = Manifold.cylinder(cutLen_top, archR_top, archR_top, 32, true).rotate([0, 90, 0]).translate([0, 0, z_axis_top]);
    let cutY_top = Manifold.cylinder(cutLen_top, archR_top, archR_top, 32, true).rotate([90, 0, 0]).translate([0, 0, z_axis_top]);
    let cuts_top = cutX_top.add(cutY_top);
    cutX_top.delete();
    cutY_top.delete();

    let topRingArched = topRing.subtract(cuts_top);
    topRing.delete();
    cuts_top.delete();

    let topPos = topRingArched.translate([0, 0, cylZ + cylLen - ringThick / 2]);
    topRingArched.delete();
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
    const screwDist = 3.0 + params.m3Diam / 2;
    const botScrewZ = cylZ + screwDist;
    const topScrewZ = cylZ + cylLen - screwDist;

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

        // Top radial hole (only if not the last cylinder)
        if (cylinderIndex < z.N - 1) {
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
    }

    return merged;
}

function generateHandle() {
    if (!Manifold) return null;

    const rodR = params.rodOD / 2;
    const innerR = rodR + 0.15; // 0.15mm clearance slip fit
    const wallThick = 3.0; // add 3mm thickness
    const outerR = rodR + wallThick;

    const socketL = params.handleLength;
    const handleL = Math.max(100.0, socketL);

    // 1. Solid sleeve cylinder (Z = 0 to handleL) with top 45-degree chamfer (handleL - 2.85 to handleL)
    let sleeveCyl = Manifold.cylinder(handleL - 2.85, outerR, outerR, 32, false);
    let sleeveCone = Manifold.cylinder(2.85, outerR, innerR, 32, false).translate([0, 0, handleL - 2.85]);
    let sleeve = sleeveCyl.add(sleeveCone);
    sleeveCyl.delete();
    sleeveCone.delete();

    // 2. Solid pommel flared shape (cone + cylinder + sphere)
    const pommelR = outerR + 4.0;
    let pCone = Manifold.cylinder(5.0, pommelR, outerR, 32, false).translate([0, 0, -5.0]);
    let pCyl = Manifold.cylinder(7.0, pommelR, pommelR, 32, false).translate([0, 0, -12.0]);
    let pSphere = Manifold.sphere(pommelR, 32).translate([0, 0, -12.0]);
    
    let solidPommel = pCone.add(pCyl).add(pSphere);
    pCone.delete();
    pCyl.delete();
    pSphere.delete();

    // Union solid sleeve and solid pommel to form a single solid handle body
    let solidHandle = sleeve.add(solidPommel);
    sleeve.delete();
    solidPommel.delete();

    // 3. Support-free internal socket cavity:
    // A. Main cylindrical socket of radius innerR from Z = handleL - socketL to Z = handleL
    let socket = Manifold.cylinder(socketL + 0.1, innerR, innerR, 32, false).translate([0, 0, handleL - socketL]);
    
    // B. A 1.0mm transition cylinder of same radius innerR just below the rod seat
    let transition = Manifold.cylinder(1.0 + 0.1, innerR, innerR, 32, false).translate([0, 0, handleL - socketL - 1.0]);
    
    // C. A 45-degree cone tapering from innerR to 0 starting from the wall (Z = handleL - socketL - 1.0 - innerR to Z = handleL - socketL - 1.0)
    let cone = Manifold.cylinder(innerR, 0, innerR, 32, false).translate([0, 0, handleL - socketL - 1.0 - innerR]);
    
    // Union all socket cutouts
    let socketCombined = socket.add(transition).add(cone);
    socket.delete();
    transition.delete();
    cone.delete();

    // Now subtract the socket cavity from the solid handle body
    let handleWithSocket = solidHandle.subtract(socketCombined);
    solidHandle.delete();
    socketCombined.delete();

    // Lanyard hole drilled horizontally (along X axis)
    const holeR = params.lanyardHoleDiam / 2;
    let hole = Manifold.cylinder(pommelR * 2 + 10.0, holeR, holeR, 16, true).rotate([0, 90, 0]).translate([0, 0, -9.0]);
    
    let handle = handleWithSocket.subtract(hole);
    handleWithSocket.delete();
    hole.delete();

    // Subtract 4 radial screw holes at the top of the handle (connecting to the guard bottom)
    const screwR = params.m3Diam / 2;
    const screwDist = 3.0 + params.m3Diam / 2;
    const topScrewZ = handleL - screwDist;
    const holeLen = outerR * 2 + 10;
    
    for (let s = 0; s < 4; s++) {
        const angle = (Math.PI / 4) + s * (Math.PI / 2);
        const angleDeg = angle * (180 / Math.PI);

        let hole = Manifold.cylinder(holeLen, screwR, screwR, 16, true);
        let rotY = hole.rotate([0, 90, 0]);
        hole.delete();
        let rotZ = rotY.rotate([0, 0, angleDeg]);
        rotY.delete();
        let positioned = rotZ.translate([0, 0, topScrewZ]);
        rotZ.delete();
        let temp = handle.subtract(positioned);
        handle.delete();
        positioned.delete();
        handle = temp;
    }

    return handle;
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

    const bindNumberInput = (id, paramKey, isFloat = true, minVal = 0, maxVal = Infinity, autoRebuild = true) => {
        const numInput = document.getElementById(id);
        if (!numInput) return;

        numInput.addEventListener('input', (e) => {
            let val = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value);
            if (isNaN(val)) return;
            if (val < minVal) val = minVal;
            if (val > maxVal) val = maxVal;
            params[paramKey] = val;
            if (autoRebuild) rebuild();
        });

        numInput.addEventListener('blur', () => {
            let val = params[paramKey];
            if (val < minVal) val = minVal;
            if (val > maxVal) val = maxVal;
            params[paramKey] = val;
            numInput.value = isFloat ? val.toFixed(1) : val;
            if (autoRebuild) rebuild();
        });
    };

    // Rod
    bindSlider('input-rodOD', 'rodOD');
    bindSlider('input-rodWall', 'rodWall');
    bindSlider('input-handleLength', 'handleLength');

    // Guard
    bindSlider('input-guardWall', 'guardWall');
    bindSlider('input-guardLength', 'guardLength');

    // Sled
    bindSlider('input-sledWidth', 'sledWidth');
    bindSlider('input-sledLength', 'sledLength');
    bindSlider('input-sledDepth', 'sledDepth');

    // Cylinder
    bindSlider('input-cylLedGap', 'cylLedGap');
    bindSlider('input-cylWall', 'cylWall');
    bindNumberInput('val-ledSectionLen', 'ledSectionLen', true, 300.0, Infinity, false);
    bindNumberInput('val-maxCylLen', 'maxCylLen', true, 10.0, Infinity, false);

    // Update button listener
    const updateBtn = document.getElementById('btn-update-cylinder');
    if (updateBtn) {
        updateBtn.addEventListener('click', () => {
            const valLed = parseFloat(document.getElementById('val-ledSectionLen').value);
            if (!isNaN(valLed) && valLed >= 300.0) params.ledSectionLen = valLed;

            const valMax = parseFloat(document.getElementById('val-maxCylLen').value);
            if (!isNaN(valMax) && valMax >= 10.0) params.maxCylLen = valMax;

            rebuild();
        });
    }

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

    // Handle
    bindSlider('input-lanyardHoleDiam', 'lanyardHoleDiam');

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
    bindVis('show-handle', 'handle');
    bindVis('show-screwholes', 'screwholes');

    // Export STL
    document.getElementById('btn-export-all').addEventListener('click', () => {
        exportComponentSTL('all');
    });
    document.getElementById('btn-export-guard').addEventListener('click', () => exportComponentSTL('guard'));
    document.getElementById('btn-export-covers').addEventListener('click', () => exportComponentSTL('covers'));
    document.getElementById('btn-export-cylinder').addEventListener('click', () => exportComponentSTL('cylinder'));
    document.getElementById('btn-export-ring').addEventListener('click', () => exportComponentSTL('ring'));
    document.getElementById('btn-export-ridges').addEventListener('click', () => exportComponentSTL('ridges'));
    document.getElementById('btn-export-handle').addEventListener('click', () => exportComponentSTL('handle'));

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
    handleLength: {
        text: "Handle Length",
        desc: "Exposed rod grip section length. Measured between bottom cap and guard housing.",
        getPos: () => new THREE.Vector3(params.rodOD / 2, 0, params.capThick + params.handleLength / 2),
        dir: [1, -1]
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
    cylLedGap: {
        text: "Cylinder-LED Radial Gap",
        desc: "Clearance gap between the LED strips and the inner wall of the transparent cylinders.",
        getPos: () => { const z = getLayoutZones(); const rodR = params.rodOD / 2; return new THREE.Vector3(rodR + params.ledHeight + params.cylLedGap / 2, 0, z.ledStart + z.centerH / 2 + z.cylLen / 2); },
        dir: [1, 1]
    },
    cylWall: {
        text: "Cylinder Wall Thickness",
        desc: "Wall thickness of the transparent cylinders. Single wall for light diffusion.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(params.cylOD / 2, 0, z.ledStart + z.centerH / 2 + z.cylLen * 0.5); },
        dir: [1, -1]
    },
    ledSectionLen: {
        text: "Max LED Strip Length",
        desc: "Total length of the LED section covered by the transparent cylinders.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(0, 0, z.ledEnd); },
        dir: [1, 1]
    },
    maxCylLen: {
        text: "Max Cylinder Section Length",
        desc: "Maximum length of a single transparent cylinder before a new section is added.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(params.cylOD / 2, 0, z.ledStart + z.centerH / 2 + z.cylLen * 0.5); },
        dir: [1, -1]
    },
    ringHeight: {
        text: "Ring Height",
        desc: "Height of connector rings between transparent cylinder sections.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(params.ringCenterOD / 2, 0, z.ledStart + z.cylLen + z.centerH); },
        dir: [1, 1]
    },
    ringCenterOD: {
        text: "Ring Center Flange OD",
        desc: "Outer diameter of the ring's center section. Wider for structural strength.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(params.ringCenterOD / 2, 0, z.ledStart + z.cylLen + z.centerH); },
        dir: [1, -1]
    },
    ringEndOD: {
        text: "Ring End Flange OD",
        desc: "Outer diameter of the ring's top/bottom flanges. Matches or is slightly smaller than cylinder OD.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(params.ringEndOD / 2, 0, z.ledStart + z.cylLen + z.centerH + z.centerH / 2 + z.flangeH / 2); },
        dir: [1, 1]
    },
    ridgeWidth: {
        text: "Ridge Width",
        desc: "Width of the decorative ridges running between LED strips.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(params.cylOD / 2 + params.ridgeHeight, params.cylOD / 2 + params.ridgeHeight, z.ledStart + z.centerH / 2 + z.cylLen / 2); },
        dir: [1, -1]
    },
    ridgeHeight: {
        text: "Ridge Protrusion",
        desc: "Height the ridges protrude above the cylinder surface. Hides screw heads underneath.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(params.cylOD / 2 + params.ridgeHeight, 0, z.ledStart + z.centerH / 2 + z.cylLen * 0.5); },
        dir: [1, 1]
    },
    ridgeRamp: {
        text: "Ridge Ramp",
        desc: "Additional height protrusion at the bottom of the ridges to create a ramped profile.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(params.cylOD / 2 + params.ridgeHeight + params.ridgeRamp, 0, z.ledStart + z.centerH / 2 + z.cylLen * 0.2); },
        dir: [1, 1]
    },
    ledWidth: {
        text: "LED Strip Width",
        desc: "Width of each LED strip (12mm default). 4 strips at 0°, 90°, 180°, 270°.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(params.rodOD / 2 + params.ledHeight, 0, z.ledStart + z.actualLedLen * 0.5); },
        dir: [1, -1]
    },
    ledHeight: {
        text: "LED Strip Height",
        desc: "Thickness of each LED strip (4mm default). Glued directly onto the rod surface.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(params.rodOD / 2 + params.ledHeight / 2, 0, z.ledStart + z.actualLedLen * 0.2); },
        dir: [1, 1]
    },
    m3Diam: {
        text: "M3 Hole Diameter",
        desc: "Clearance hole diameter for M3 screws connecting cylinder sections.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(params.cylOD / 2, params.cylOD / 2, z.ledStart + z.centerH / 2 + (3.0 + params.m3Diam / 2)); },
        dir: [1, -1]
    },
    screwDepth: {
        text: "Screw Thread Depth",
        desc: "Depth of screw engagement into the cylinder wall. 5mm default.",
        getPos: () => { const z = getLayoutZones(); return new THREE.Vector3(params.cylOD / 2, 0, z.ledStart + z.centerH / 2 + (3.0 + params.m3Diam / 2)); },
        dir: [1, -1]
    },
    lanyardHoleDiam: {
        text: "Lanyard Hole Diameter",
        desc: "Diameter of the horizontal hole in the pommel for lanyard or keychain cord.",
        getPos: () => {
            const outerR = params.rodOD / 2 + 3.0;
            const socketL = params.handleLength;
            const handleL = Math.max(100.0, socketL);
            const handleBottomZ = Math.min(3.0, 3.0 + params.handleLength - handleL);
            return new THREE.Vector3(0, 0, handleBottomZ - 9.0);
        },
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

    const tStart = performance.now();
    let totalTriangles = 0;
    const stats = {};

    const explodeDist = params.explode * 1.5;
    const z = getLayoutZones();

    // Clear all meshes
    const clearMesh = (mesh) => {
        if (mesh) {
            mainGroup.remove(mesh);
            mesh.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }
        return null;
    };

    rodMesh = clearMesh(rodMesh);
    guardMesh = clearMesh(guardMesh);
    sledMesh = clearMesh(sledMesh);
    handleMesh = clearMesh(handleMesh);
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
            const tris = rMesh.triVerts.length / 3;
            stats['Central Rod'] = tris;
            totalTriangles += tris;
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
            const tris = gMesh.triVerts.length / 3;
            stats['Guard Housing'] = tris;
            totalTriangles += tris;
            guardSolid.delete();

            guardMesh = new THREE.Mesh(guardGeom, makeMat(colors.guard, params.opacity / 100));
            addBlueprintEdges(guardMesh, guardGeom, colors.blueprintLine);
            guardMesh.position.z -= explodeDist * 0.3;
            mainGroup.add(guardMesh);
        }
    }

    // ─── 3. Packaged Electronics ─────────────────────────────────────────
    if (visibilities.sled) {
        sledMesh = generateSled();
        if (sledMesh) {
            if (params.mode === 'blueprint') {
                sledMesh.traverse(child => {
                    if (child.isMesh && child.geometry) {
                        child.material = new THREE.MeshBasicMaterial({
                            color: 0x071830,
                            transparent: true,
                            opacity: 0.4,
                            side: THREE.DoubleSide
                        });
                        addBlueprintEdges(child, child.geometry, 0xffaa00);
                    }
                });
            }
            // Move components out of the guard in explode view
            sledMesh.position.z -= explodeDist * 0.5;

            // Animate covers sliding further out of their grooves!
            const batCover = sledMesh.getObjectByName("batteryCover");
            const elCover = sledMesh.getObjectByName("electronicsCover");
            if (batCover) batCover.position.z -= explodeDist * 1.5;
            if (elCover) elCover.position.z -= explodeDist * 1.5;

            mainGroup.add(sledMesh);

            stats['Electronics Sled'] = 820;
            totalTriangles += 820;
        }
    }

    // ─── 4. Transparent Cylinders ───────────────────────────────────
    if (visibilities.cylinders) {
        let cylTris = 0;
        for (let i = 0; i < z.N; i++) {
            const cylSolid = generateTransparentCylinder(i);
            if (cylSolid) {
                const cMesh = cylSolid.getMesh();
                cylTris += cMesh.triVerts.length / 3;
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
        stats[`Cylinders (x${z.N})`] = cylTris;
        totalTriangles += cylTris;
    }

    // ─── 5. Connector Rings ─────────────────────────────────────────
    if (visibilities.rings) {
        let ringTris = 0;
        for (let i = 0; i < z.N; i++) {
            const ringSolid = generateConnectorRing(i);
            if (ringSolid) {
                const rMesh = ringSolid.getMesh();
                ringTris += rMesh.triVerts.length / 3;
                const ringGeom = manifoldToThree(rMesh);
                ringSolid.delete();

                const mesh = new THREE.Mesh(ringGeom, makeMat(colors.ring, params.opacity / 100));
                addBlueprintEdges(mesh, ringGeom, colors.blueprintLine);
                mesh.position.z += explodeDist * (i + 0.5) * 0.5;
                mainGroup.add(mesh);
                ringMeshes.push(mesh);
            }
        }
        stats[`Connector Rings (x${z.N})`] = ringTris;
        totalTriangles += ringTris;
    }

    // ─── 6. Decorative Ridges ────────────────────────────────────────────
    if (visibilities.ridges) {
        let ridgeTris = 0;
        for (let i = 0; i < z.N; i++) {
            const ridgeSolid = generateDecorativeRidges(i);
            if (ridgeSolid) {
                const rMesh = ridgeSolid.getMesh();
                ridgeTris += rMesh.triVerts.length / 3;
                const ridgeGeom = manifoldToThree(rMesh);
                ridgeSolid.delete();

                const mesh = new THREE.Mesh(ridgeGeom, makeMat(colors.ridge, 0.9));
                addBlueprintEdges(mesh, ridgeGeom, 0x9933ff);
                mesh.position.z += explodeDist * (i + 1) * 0.5;
                mainGroup.add(mesh);
                ridgeMeshes.push(mesh);
            }
        }
        stats[`Decorative Ridges (x${z.N})`] = ridgeTris;
        totalTriangles += ridgeTris;
    }

    // ─── 7. LED Strips (Visual-only, 4 strips at 0°/90°/180°/270°) ──────
    if (visibilities.leds) {
        stats['LED Strips (Visual-only)'] = 48;
        totalTriangles += 48;
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

    // ─── 8. Handle & Pommel ──────────────────────────────────────────────
    if (visibilities.handle) {
        const handleSolid = generateHandle();
        if (handleSolid) {
            const hMesh = handleSolid.getMesh();
            const handleGeom = manifoldToThree(hMesh);
            const tris = hMesh.triVerts.length / 3;
            stats['Handle & Pommel'] = tris;
            totalTriangles += tris;
            handleSolid.delete();

            handleMesh = new THREE.Mesh(handleGeom, makeMat(colors.handle, 0.95));
            addBlueprintEdges(handleMesh, handleGeom, colors.blueprintLineCyan);

            // Position it in assembly space: Z-axis translation (with 10mm overlap into the guard bottom)
            const socketL = params.handleLength;
            const handleL = Math.max(100.0, socketL);
            const assemblyZ = (3.0 + socketL) - handleL + 10.0;
            handleMesh.position.z += assemblyZ - explodeDist * 0.8;

            mainGroup.add(handleMesh);
        }
    }

    // ─── 9. Screw Hole Indicators ────────────────────────────────────────
    if (visibilities.screwholes) {
        const holeTris = (8 * z.N + 4) * 32;
        stats['Screw Indicators (Visual-only)'] = holeTris;
        totalTriangles += holeTris;
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
        const screwDist = 3.0 + params.m3Diam / 2;

        // Cylinders screw indicators
        for (let ci = 0; ci < z.N; ci++) {
            const cylZ = z.ledStart + ci * (z.cylLen + z.centerH) + z.centerH / 2;

            for (let s = 0; s < 4; s++) {
                const angle = (Math.PI / 4) + s * (Math.PI / 2);

                // Bottom radial screw indicator
                const botGeom = new THREE.CylinderGeometry(screwR, screwR, cylOuterR * 2, 8);
                const botMesh = new THREE.Mesh(botGeom, screwMat);
                botMesh.position.set(0, 0, cylZ + screwDist);
                botMesh.rotation.z = angle + Math.PI / 2; // orient radially
                screwHoleGroup.add(botMesh);

                // Top radial screw indicator (only if not the last cylinder)
                if (ci < z.N - 1) {
                    const topGeom = new THREE.CylinderGeometry(screwR, screwR, cylOuterR * 2, 8);
                    const topMesh = new THREE.Mesh(topGeom, screwMat);
                    topMesh.position.set(0, 0, cylZ + z.cylLen - screwDist);
                    topMesh.rotation.z = angle + Math.PI / 2;
                    screwHoleGroup.add(topMesh);
                }
            }
        }

        // Guard top screw indicators (connecting to Ring 0)
        const h_ring = params.ringHeight;
        const guardScrewZ = z.guardEnd - h_ring / 2 + screwDist;
        for (let s = 0; s < 4; s++) {
            const angle = (Math.PI / 4) + s * (Math.PI / 2);
            const geom = new THREE.CylinderGeometry(screwR, screwR, guardR * 2, 8);
            const mesh = new THREE.Mesh(geom, screwMat);
            mesh.position.set(0, 0, guardScrewZ);
            mesh.rotation.z = angle + Math.PI / 2;
            screwHoleGroup.add(mesh);
        }

        // Guard bottom screw indicators (connecting to Handle top)
        const jointScrewZ = z.guardStart + 5.0;
        for (let s = 0; s < 4; s++) {
            const angle = (Math.PI / 4) + s * (Math.PI / 2);
            const geom = new THREE.CylinderGeometry(screwR, screwR, guardR * 2, 8);
            const mesh = new THREE.Mesh(geom, screwMat);
            mesh.position.set(0, 0, jointScrewZ);
            mesh.rotation.z = angle + Math.PI / 2;
            screwHoleGroup.add(mesh);
        }

        // Rod-securing screw indicators (along X-axis)
        const h_trimmed = params.guardLength - (h_ring / 2 - 10.0);
        
        const rodMesh1 = new THREE.Mesh(new THREE.CylinderGeometry(screwR, screwR, guardR * 2 + 10, 8), screwMat);
        rodMesh1.position.set(0, 0, z.guardStart + 15.0);
        rodMesh1.rotation.y = Math.PI / 2;
        screwHoleGroup.add(rodMesh1);

        const rodMesh2 = new THREE.Mesh(new THREE.CylinderGeometry(screwR, screwR, guardR * 2 + 10, 8), screwMat);
        rodMesh2.position.set(0, 0, z.guardStart + h_trimmed - 15.0);
        rodMesh2.rotation.y = Math.PI / 2;
        screwHoleGroup.add(rodMesh2);
    }

    // ─── Update Spec Sheet ───────────────────────────────────────────────
    const elTotal = document.getElementById('spec-total-length');
    if (elTotal) elTotal.innerText = `${params.rodLength.toFixed(1)} mm`;

    const elLed = document.getElementById('spec-led-section');
    if (elLed) elLed.innerText = `${params.ledSectionLen.toFixed(1)} mm (${z.N}× ${z.cylLen.toFixed(1)} mm)`;

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

    const elScrews = document.getElementById('spec-total-screws');
    if (elScrews) {
        const totalScrews = 8 * z.N + 4;
        elScrews.innerText = `${totalScrews}× M3`;
    }

    const tEnd = performance.now();
    const duration = tEnd - tStart;
    
    console.log(`%c=== CAD GEOMETRY DIAGNOSTICS ===`, "color: #00f2ff; font-weight: bold;");
    console.log(`Generation Time: ${duration.toFixed(1)} ms`);
    console.log(`Total Polygon Count: ${totalTriangles} triangles`);
    console.table(stats);
    console.log(`%c================================`, "color: #00f2ff; font-weight: bold;");

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

    // ─── Draw Overall Length Bracket ───
    const drawOverallLength = () => {
        const offset3D = -params.cylOD / 2 - 25; // 25mm to the left of the cylinder outer face
        const botPoint = new THREE.Vector3(offset3D, 0, 0);
        const topPoint = new THREE.Vector3(offset3D, 0, params.rodLength);

        // Project actual baton center points for extension lines
        const botCenter = new THREE.Vector3(0, 0, 0);
        const topCenter = new THREE.Vector3(0, 0, params.rodLength);

        mainGroup.updateMatrixWorld();
        
        const bp = botPoint.clone().applyMatrix4(mainGroup.matrixWorld).project(camera);
        const tp = topPoint.clone().applyMatrix4(mainGroup.matrixWorld).project(camera);
        const bcp = botCenter.clone().applyMatrix4(mainGroup.matrixWorld).project(camera);
        const tcp = topCenter.clone().applyMatrix4(mainGroup.matrixWorld).project(camera);

        if (bp.z > 1 || tp.z > 1) return; // behind camera

        const xB = (bp.x * 0.5 + 0.5) * width;
        const yB = (-(bp.y * 0.5) + 0.5) * height;
        const xT = (tp.x * 0.5 + 0.5) * width;
        const yT = (-(tp.y * 0.5) + 0.5) * height;

        const xBC = (bcp.x * 0.5 + 0.5) * width;
        const yBC = (-(bcp.y * 0.5) + 0.5) * height;
        const xTC = (tcp.x * 0.5 + 0.5) * width;
        const yTC = (-(tcp.y * 0.5) + 0.5) * height;

        const drawLine = (x1, y1, x2, y2, color, lineWidthVal, dash = null) => {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', x1);
            line.setAttribute('y1', y1);
            line.setAttribute('x2', x2);
            line.setAttribute('y2', y2);
            line.setAttribute('stroke', color);
            line.setAttribute('stroke-width', lineWidthVal);
            if (dash) line.setAttribute('stroke-dasharray', dash);
            overlaySvg.appendChild(line);
        };

        // Dashed lines going from baton ends to the bracket ends
        drawLine(xBC, yBC, xB, yB, 'rgba(0, 242, 255, 0.4)', '1', '3,3');
        drawLine(xTC, yTC, xT, yT, 'rgba(0, 242, 255, 0.4)', '1', '3,3');

        // Draw bracket line from bottom to top
        const dx = xT - xB;
        const dy = yT - yB;
        const dlen = Math.sqrt(dx*dx + dy*dy);
        if (dlen < 5) return;
        const nx = -dy / dlen; // perpendicular vector
        const ny = dx / dlen;
        const tick = 6;

        const bracket = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = `
            M ${xB - nx * tick},${yB - ny * tick} L ${xB + nx * tick},${yB + ny * tick}
            M ${xB},${yB} L ${xT},${yT}
            M ${xT - nx * tick},${yT - ny * tick} L ${xT + nx * tick},${yT + ny * tick}
        `;
        bracket.setAttribute('d', d);
        bracket.setAttribute('stroke', '#00f2ff');
        bracket.setAttribute('stroke-width', '1.5');
        bracket.setAttribute('fill', 'none');
        overlaySvg.appendChild(bracket);

        // Draw overall length label next to the vertical line
        const mx = (xB + xT) / 2;
        const my = (yB + yT) / 2;
        const textOffset = 12;

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', mx - nx * textOffset);
        text.setAttribute('y', my - ny * textOffset + 4);
        text.setAttribute('fill', '#00f2ff');
        text.setAttribute('font-size', '11px');
        text.setAttribute('font-weight', 'bold');
        text.setAttribute('font-family', 'Space Mono');
        text.setAttribute('text-anchor', 'end');
        text.textContent = `OVERALL: ${params.rodLength.toFixed(1)} mm`;
        overlaySvg.appendChild(text);
    };

    drawOverallLength();

    if (visibilities.guard) {
        drawDimension(
            new THREE.Vector3(params.rodOD / 2 + params.guardWall + 2, 0, zz.guardStart + params.guardLength / 2),
            "Guard Housing", 1, -1
        );
    }

    if (visibilities.cylinders) {
        const indicesToLabel = [];
        if (zz.N <= 4) {
            for (let i = 0; i < zz.N; i++) indicesToLabel.push(i);
        } else {
            indicesToLabel.push(0);
            indicesToLabel.push(Math.floor(zz.N / 2));
            indicesToLabel.push(zz.N - 1);
        }

        indicesToLabel.forEach(i => {
            const cylZ = zz.ledStart + i * (zz.cylLen + zz.centerH) + zz.centerH / 2;
            drawDimension(
                new THREE.Vector3(params.cylOD / 2 + 3, 0, cylZ + zz.cylLen * 0.5),
                `Cylinder #${i + 1}`, 1, (i % 2 === 0 ? -1 : 1)
            );
        });
    }

    if (visibilities.handle) {
        const outerR = params.rodOD / 2 + 3.0;
        const socketL = params.handleLength;
        const handleL = Math.max(100.0, socketL);
        const handleBottomZ = Math.min(3.0, 3.0 + params.handleLength - handleL);
        drawDimension(
            new THREE.Vector3(outerR + 2, 0, handleBottomZ + handleL / 2),
            "Handle Sleeve", 1, 1
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
        case 'all':
            {
                const z = getLayoutZones();
                const rodR = params.rodOD / 2;
                const screwR = params.m3Diam / 2;
                const h = params.ringHeight;
                const spacing = params.cylOD + (params.ridgeHeight + params.ridgeRamp) * 2 + 10.0;
                let partsToUnion = [];

                // 1. Guard (stands upright, isolated at X = -60.0, Y = 0.0)
                let guardSolid = generateGuard();
                if (guardSolid) {
                    let bedGuard = guardSolid.translate([-60.0, 0.0, -z.guardStart]);
                    guardSolid.delete();
                    partsToUnion.push(bedGuard);
                }

                // 2. Battery Cover (translated to X=135.0, Y=-60.0)
                let batCoverBase = Manifold.cube([32.0, 16.0, 80.0], false).translate([-16.0, rodR + 14.0, 0.0]);
                let batCoverCutout = Manifold.cube([28.0, 14.0, 82.0], false).translate([-14.0, rodR + 14.0, -1.0]);
                let batCoverSolid = batCoverBase.subtract(batCoverCutout);
                batCoverBase.delete();
                batCoverCutout.delete();

                let batHole = Manifold.cylinder(20, screwR, screwR, 16, true);
                let batHoleRot = batHole.rotate([0, 90, 0]).rotate([0, 0, 90]);
                batHole.delete();
                let batHoleMoved = batHoleRot.translate([0, rodR + 28.0, 2.0]);
                batHoleRot.delete();

                let finalBatCover = batCoverSolid.subtract(batHoleMoved);
                batCoverSolid.delete();
                batHoleMoved.delete();

                let batFlat = finalBatCover.translate([0, -(rodR + 30.0), 0.0]);
                let batFlatRot = batFlat.rotate([-90, 0, 0]);
                let batReady = batFlatRot.translate([125.0, -60.0, 0.0]);
                batFlat.delete();
                batFlatRot.delete();
                finalBatCover.delete();
                partsToUnion.push(batReady);

                // 3. Electronics Cover (translated to X=175.0, Y=0.0)
                let elCoverBase = Manifold.cube([32.0, 8.5, 102.0], false).translate([-16.0, -(rodR + 22.0), 0.0]);
                let elCoverCutout = Manifold.cube([28.0, 6.5, 104.0], false).translate([-14.0, -(rodR + 20.0), -1.0]);
                let elCoverSolid = elCoverBase.subtract(elCoverCutout);
                elCoverBase.delete();
                elCoverCutout.delete();

                let elHole = Manifold.cylinder(30, screwR, screwR, 16, true);
                let elHoleRot = elHole.rotate([0, 90, 0]).rotate([0, 0, 90]);
                elHole.delete();
                
                let elHoleMoved = elHoleRot.translate([0, -(rodR + 24.0), 3.0]);
                let elTopHoleMoved = elHoleRot.translate([0, -(rodR + 24.0), 99.0]);
                elHoleRot.delete();

                let finalElCover = elCoverSolid.subtract(elHoleMoved).subtract(elTopHoleMoved);
                elCoverSolid.delete();
                elHoleMoved.delete();
                elTopHoleMoved.delete();

                let elFlat = finalElCover.translate([0, rodR + 22.0, 0.0]);
                let elFlatRot = elFlat.rotate([90, 0, 0]);
                let elReady = elFlatRot.translate([175.0, 0.0, 0.0]);
                elFlat.delete();
                elFlatRot.delete();
                finalElCover.delete();
                partsToUnion.push(elReady);

                // 4. Cylinders (N) (spaced along X=-130.0)
                for (let i = 0; i < z.N; i++) {
                    let cyl = generateTransparentCylinder(i);
                    if (cyl) {
                        const cylZ = z.ledStart + i * (z.cylLen + z.centerH) + z.centerH / 2;
                        const yOffset = (i - (z.N - 1) / 2) * (params.cylOD + 25.0);
                        let bedCyl = cyl.translate([-130.0, yOffset, -cylZ]);
                        cyl.delete();
                        partsToUnion.push(bedCyl);
                    }
                }

                // 5. Connector Rings (N) (spaced along X=5.0)
                for (let i = 0; i < z.N; i++) {
                    let ring = generateConnectorRing(i);
                    if (ring) {
                        const ringZ = z.ledStart + i * (z.cylLen + z.centerH) - params.ringHeight / 2;
                        const yOffset = (i - (z.N - 1) / 2) * (params.ringCenterOD + 25.0);
                        let bedRing = ring.translate([5.0, yOffset, -ringZ]);
                        ring.delete();
                        partsToUnion.push(bedRing);
                    }
                }

                // 6. Decorative Ridges (N) (spaced along X=70.0)
                for (let i = 0; i < z.N; i++) {
                    let ridges = generateDecorativeRidges(i);
                    if (ridges) {
                        const cylZ = z.ledStart + i * (z.cylLen + z.centerH) + z.centerH / 2;
                        const yOffset = (i - (z.N - 1) / 2) * (spacing + 15.0);
                        let bedRidges = ridges.translate([70.0, yOffset, -cylZ]);
                        ridges.delete();
                        partsToUnion.push(bedRidges);
                    }
                }

                // 7. Handle & Pommel (translated to X=-200.0, Y=0.0)
                let handleSolid = generateHandle();
                if (handleSolid) {
                    const outerR = params.rodOD / 2 + 3.0;
                    // Rotate by 90 degrees around X axis to lay it flat, and offset Z to sit flat at Z=0
                    let flatHandle = handleSolid.rotate([90, 0, 0]);
                    let bedHandle = flatHandle.translate([-200.0, 0.0, outerR]);
                    handleSolid.delete();
                    flatHandle.delete();
                    partsToUnion.push(bedHandle);
                }

                // Merge all into solid
                if (partsToUnion.length > 0) {
                    let merged = partsToUnion[0];
                    for (let i = 1; i < partsToUnion.length; i++) {
                        let temp = merged.add(partsToUnion[i]);
                        merged.delete();
                        partsToUnion[i].delete();
                        merged = temp;
                    }
                    solid = merged;
                }
                filename = `lightbaton_all_parts_plate.stl`;
            }
            break;
        case 'guard':
            {
                let guardSolid = generateGuard();
                if (!guardSolid) return;
                
                const z = getLayoutZones();
                // Translate down to Z = 0 so it stands upright on the print bed
                solid = guardSolid.translate([0, 0, -z.guardStart]);
                guardSolid.delete();
                filename = `lightbaton_guard_wall${params.guardWall}mm.stl`;
            }
            break;
        case 'covers':
            {
                const z = getLayoutZones();
                const rodR = params.rodOD / 2;
                const screwR = params.m3Diam / 2;
                
                // Battery Cover Solid
                let batCoverBase = Manifold.cube([32.0, 16.0, 80.0], false).translate([-16.0, rodR + 14.0, 0.0]);
                let batCoverCutout = Manifold.cube([28.0, 14.0, 82.0], false).translate([-14.0, rodR + 14.0, -1.0]);
                let batCoverSolid = batCoverBase.subtract(batCoverCutout);
                batCoverBase.delete();
                batCoverCutout.delete();

                let batHole = Manifold.cylinder(20, screwR, screwR, 16, true);
                let batHoleRot = batHole.rotate([0, 90, 0]).rotate([0, 0, 90]);
                batHole.delete();
                let batHoleMoved = batHoleRot.translate([0, rodR + 28.0, 2.0]);
                batHoleRot.delete();

                let finalBatCover = batCoverSolid.subtract(batHoleMoved);
                batCoverSolid.delete();
                batHoleMoved.delete();
                
                // Electronics Cover Solid (screw hole at Z=5.0)
                let elCoverBase = Manifold.cube([32.0, 8.5, 102.0], false).translate([-16.0, -(rodR + 22.0), 0.0]);
                let elCoverCutout = Manifold.cube([28.0, 6.5, 104.0], false).translate([-14.0, -(rodR + 20.0), -1.0]);
                let elCoverSolid = elCoverBase.subtract(elCoverCutout);
                elCoverBase.delete();
                elCoverCutout.delete();

                let elHole = Manifold.cylinder(30, screwR, screwR, 16, true);
                let elHoleRot = elHole.rotate([0, 90, 0]).rotate([0, 0, 90]);
                elHole.delete();
                
                let elHoleMoved = elHoleRot.translate([0, -(rodR + 24.0), 3.0]);
                let elTopHoleMoved = elHoleRot.translate([0, -(rodR + 24.0), 99.0]);
                elHoleRot.delete();

                let finalElCover = elCoverSolid.subtract(elHoleMoved).subtract(elTopHoleMoved);
                elCoverSolid.delete();
                elHoleMoved.delete();
                elTopHoleMoved.delete();
                
                // Lay both covers flat on the print bed side-by-side at Z = 0
                let batFlat = finalBatCover.translate([0, -(rodR + 30.0), 0.0]);
                let batFlatRot = batFlat.rotate([-90, 0, 0]);
                let batReady = batFlatRot.translate([-35.0, -40.0, 0.0]);
                batFlat.delete();
                batFlatRot.delete();
                finalBatCover.delete();

                let elFlat = finalElCover.translate([0, rodR + 22.0, 0.0]);
                let elFlatRot = elFlat.rotate([90, 0, 0]);
                let elReady = elFlatRot.translate([35.0, 50.0, 0.0]);
                elFlat.delete();
                elFlatRot.delete();
                finalElCover.delete();
                
                solid = batReady.add(elReady);
                batReady.delete();
                elReady.delete();
                
                filename = `lightbaton_covers.stl`;
            }
            break;
        case 'cylinder':
            {
                const z = getLayoutZones();
                let mergedCyl = null;
                for (let i = 0; i < z.N; i++) {
                    let cyl = generateTransparentCylinder(i);
                    if (cyl) {
                        const cylZ = z.ledStart + i * (z.cylLen + z.centerH) + z.centerH / 2;
                        // Stand upright on print bed, arranged side-by-side along X
                        let bedCyl = cyl.translate([i * (params.cylOD + 15.0), 0, -cylZ]);
                        cyl.delete();
                        if (!mergedCyl) {
                            mergedCyl = bedCyl;
                        } else {
                            let temp = mergedCyl.add(bedCyl);
                            mergedCyl.delete();
                            bedCyl.delete();
                            mergedCyl = temp;
                        }
                    }
                }
                solid = mergedCyl;
                filename = `lightbaton_cylinders_OD${params.cylOD}mm.stl`;
            }
            break;
        case 'ring':
            {
                const z = getLayoutZones();
                let mergedRing = null;
                for (let i = 0; i < z.N; i++) {
                    let ring = generateConnectorRing(i);
                    if (ring) {
                        const ringZ = z.ledStart + i * (z.cylLen + z.centerH) - params.ringHeight / 2;
                        // Stand upright on print bed, arranged side-by-side along X
                        let bedRing = ring.translate([i * (params.ringCenterOD + 15.0), 0, -ringZ]);
                        ring.delete();
                        if (!mergedRing) {
                            mergedRing = bedRing;
                        } else {
                            let temp = mergedRing.add(bedRing);
                            mergedRing.delete();
                            bedRing.delete();
                            mergedRing = temp;
                        }
                    }
                }
                solid = mergedRing;
                filename = `lightbaton_rings_center${params.ringCenterOD}mm.stl`;
            }
            break;
        case 'handle':
            {
                solid = generateHandle();
                filename = `lightbaton_handle_pommel.stl`;
            }
            break;
        case 'ridges':
            {
                const z = getLayoutZones();
                let mergedRidges = null;
                const spacing = params.cylOD + (params.ridgeHeight + params.ridgeRamp) * 2 + 15.0;
                for (let i = 0; i < z.N; i++) {
                    let ridges = generateDecorativeRidges(i);
                    if (ridges) {
                        const cylZ = z.ledStart + i * (z.cylLen + z.centerH) + z.centerH / 2;
                        // Stand upright on print bed, arranged side-by-side along X
                        let bedRidges = ridges.translate([i * spacing, 0, -cylZ]);
                        ridges.delete();
                        if (!mergedRidges) {
                            mergedRidges = bedRidges;
                        } else {
                            let temp = mergedRidges.add(bedRidges);
                            mergedRidges.delete();
                            bedRidges.delete();
                            mergedRidges = temp;
                        }
                    }
                }
                solid = mergedRidges;
                filename = `lightbaton_decorative_ridges_width${params.ridgeWidth}mm.stl`;
            }
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
