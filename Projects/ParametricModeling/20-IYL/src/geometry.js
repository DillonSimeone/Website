// Geometry generation engine using Manifold WASM for 20-IYL
// Architecture: Pedestal with Retaining Lip + 100% Flat-Bottom Drop-In Top Lid + Universal Sled
import * as THREE from 'three';
import { params } from './state.js';

export function manifoldToThreeGeometry(manifold) {
    if (!manifold) return null;
    const mesh = manifold.getMesh();
    const geom = new THREE.BufferGeometry();
    const positions = [];
    const numTriangles = mesh.triVerts.length / 3;

    for (let i = 0; i < numTriangles; i++) {
        for (let v = 0; v < 3; v++) {
            const vertIdx = mesh.triVerts[i * 3 + v];
            positions.push(
                mesh.vertProperties[vertIdx * 3],
                mesh.vertProperties[vertIdx * 3 + 1],
                mesh.vertProperties[vertIdx * 3 + 2]
            );
        }
    }

    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.computeVertexNormals();
    return geom;
}

// -------------------------------------------------------------------------
// Helper: 45° Peaked Tunnel / Plug Prism (5-sided pentagon cross-section)
//   - 45° sloped roof meeting at center peak (100% support-free FDM print)
// -------------------------------------------------------------------------
function makePeakedPrism(M, w, len, wallH, baseZ) {
    const lowerBox = M.cube([w, len, wallH], false)
        .translate([-w / 2, 0, baseZ]);

    const roofSide = w * 0.707107;
    const rawDiamond = M.cube([roofSide, roofSide, len + 2.0], true)
        .rotate([0, 0, 45])
        .rotate([90, 0, 0])
        .translate([0, len / 2.0, baseZ + wallH]);

    const cropBox = M.cube([w + 4.0, len + 2.0, w], false)
        .translate([-(w + 4.0) / 2, -1.0, baseZ + wallH]);
    const roofTriangle = rawDiamond.intersect(cropBox);

    return lowerBox.add(roofTriangle);
}

// -------------------------------------------------------------------------
// Helper: Universal Sled Negative Cutter
// -------------------------------------------------------------------------
function getUniversalSledCutter(M) {
    const cl = 0.25;
    const w = 24.0 + cl * 2.0; // 24.5mm
    const wallH = 5.0 + cl;    // 5.25mm
    const rearY = -50.0;
    const frontY = 7.0;
    const len = frontY - rearY;

    return makePeakedPrism(M, w, len, wallH, 1.6)
        .translate([0, rearY, 0]);
}

// -------------------------------------------------------------------------
// 1. BASE PEDESTAL WITH RETAINING LIP (ZERO INTERNAL SUPPORTS!)
//    - Outer retaining lip extends up around the top perimeter (lips go up the sides)
//    - Internal stepped shoulder/shelf at Z = h - lidThickness
//    - Open hollow cavity inside for LED lights and wiring
//    - Universal sled receiver tunnel at bottom with 45° peaked roof
// -------------------------------------------------------------------------
export function buildBasePedestal(M, p) {
    const h = p.height;
    const lidThick = p.lidThickness || 6.0;
    const lipWall = p.lipWallThickness || 1.8;
    const rBase = p.baseDiameter / 2.0;
    const rTop = p.topDiameter / 2.0;
    const wt = p.wallThickness;

    // --- A. Outer Body Shell ---
    let outer;
    if (p.style === 'octagon') {
        const octScale = 1.0 / Math.cos(Math.PI / 8);
        outer = M.cylinder(h, rBase * octScale, rTop * octScale, 8, false).rotate([0, 0, 22.5]);
    } else {
        outer = M.cylinder(h, rBase, rTop, 64, false);
    }

    // Bottom anti-elephant-foot 45° chamfer
    const btmBevel = M.cylinder(1.5, rBase + 2, rBase, 64, false).translate([0, 0, -0.1]);
    const btmCut = M.cylinder(1.6, rBase + 3, rBase + 3, 64, false).subtract(btmBevel);
    outer = outer.subtract(btmCut);

    // --- B. Hollow Interior Chamber for Lights & Wiring ---
    const shelfZ = h - lidThick;
    const rShelfOuter = rTop - lipWall;    // Pocket boundary
    const rShelfInner = rShelfOuter - 3.0; // 3mm solid supporting shelf ledge
    const innerRBase = rBase - wt;

    const cavityH = shelfZ - 1.6;
    const cavity = M.cylinder(cavityH + 0.1, innerRBase, rShelfInner, 48, false)
        .translate([0, 0, 1.6]);
    outer = outer.subtract(cavity);

    // --- C. Drop-In Pocket (Recess inside the retaining lip) ---
    // The top lid drops right into this pocket flush with the top rim
    let pocket;
    if (p.style === 'octagon') {
        const octScale = 1.0 / Math.cos(Math.PI / 8);
        pocket = M.cylinder(lidThick + 1.0, rShelfOuter * octScale, rShelfOuter * octScale, 8, false)
            .rotate([0, 0, 22.5])
            .translate([0, 0, shelfZ]);
    } else {
        pocket = M.cylinder(lidThick + 1.0, rShelfOuter, rShelfOuter, 64, false)
            .translate([0, 0, shelfZ]);
    }
    outer = outer.subtract(pocket);

    // --- D. Negative Sled Slot Cutout ---
    const sledCutter = getUniversalSledCutter(M);
    outer = outer.subtract(sledCutter);

    return outer;
}

// -------------------------------------------------------------------------
// 2. DROP-IN TOP LID (100% FLAT BOTTOM AT Z = 0 - ZERO SUPPORTS!)
//    - Completely flat bottom rests directly on build plate (0 overhang, 0 supports!)
//    - Drops right into the pedestal retaining pocket, resting on the shelf
//    - Top surface features the 45° elliptical twist-lock socket for ilyHandStand.stl
//    - 18mm center bore for LED illumination straight into the hand
// -------------------------------------------------------------------------
export function buildTopLid(M, p) {
    const lidThick = p.lidThickness || 6.0;
    const lipWall = p.lipWallThickness || 1.8;
    const cl = p.printClearance || 0.25;
    const rTop = p.topDiameter / 2.0;
    const rLidOuter = rTop - lipWall - cl; // Sized with print clearance to drop in smoothly
    const flCl = p.flangeClearance || 0.35;

    // --- A. Drop-In Lid Plate (100% Flat Bottom at Z = 0) ---
    let lid;
    if (p.style === 'octagon') {
        const octScale = 1.0 / Math.cos(Math.PI / 8);
        lid = M.cylinder(lidThick, rLidOuter * octScale, rLidOuter * octScale, 8, false)
            .rotate([0, 0, 22.5]);
    } else {
        lid = M.cylinder(lidThick, rLidOuter, rLidOuter, 64, false);
    }

    // --- B. Elliptical Twist-Lock Socket on Top Face for ilyHandStand.stl ---
    const socketDepth = p.socketDepth || 4.2;
    const socketFloorZ = lidThick - socketDepth;
    const rMaj = 30.0 + flCl;
    const rMin = 20.0 + flCl;
    const flangeH = 3.6;
    const slopeH = socketDepth - flangeH + 1.2;

    let twistChamber = null;
    const step = 7.5;
    for (let a = 0; a <= p.lockAngle; a += step) {
        const vertSection = M.cylinder(flangeH, 1, 1, 48, false)
            .scale([rMaj, rMin, 1])
            .rotate([0, 0, a])
            .translate([0, 0, socketFloorZ]);

        const slopedCeiling = M.cylinder(slopeH, 1, (rMaj - slopeH) / rMaj, 48, false)
            .scale([rMaj, rMin, 1])
            .rotate([0, 0, a])
            .translate([0, 0, socketFloorZ + flangeH]);

        const ellSlice = vertSection.add(slopedCeiling);
        twistChamber = twistChamber ? twistChamber.add(ellSlice) : ellSlice;
    }
    if (twistChamber) lid = lid.subtract(twistChamber);

    // Top entrance aperture (at entry angle 45°)
    const lipThick = 1.2;
    const entranceEll = M.cylinder(lipThick + 1.0, 1, 1, 48, false)
        .scale([rMaj, rMin, 1])
        .rotate([0, 0, p.lockAngle])
        .translate([0, 0, lidThick - lipThick]);
    lid = lid.subtract(entranceEll);

    // Central wrist clearance & light bore (18mm)
    const centerBore = M.cylinder(lidThick + 4.0, p.cableHoleDia / 2.0, p.cableHoleDia / 2.0, 36, false)
        .translate([0, 0, -2.0]);
    lid = lid.subtract(centerBore);

    // Tactile detent stops for hand at locked position
    const detent1 = M.cylinder(0.4, 1.2, 0.4, 16, false).translate([rMaj - 3.0, 0, socketFloorZ]);
    const detent2 = M.cylinder(0.4, 1.2, 0.4, 16, false).translate([-(rMaj - 3.0), 0, socketFloorZ]);
    lid = lid.add(detent1).add(detent2);

    return lid;
}

// -------------------------------------------------------------------------
// 3. COMBINED ASSEMBLED PEDESTAL (FOR VIEWING & COMBINED EXPORT)
// -------------------------------------------------------------------------
export function buildPedestal(M, p) {
    const base = buildBasePedestal(M, p);
    const lidThick = p.lidThickness || 6.0;
    const shelfZ = p.height - lidThick;
    const lid = buildTopLid(M, p).translate([0, 0, shelfZ]);
    return base.add(lid);
}

// -------------------------------------------------------------------------
// 4. UNIVERSAL SLED (SINGLE SOURCE OF TRUTH - 100% IDENTICAL ACROSS ALL PRESETS)
//    - 100% Support-free FDM print flat on build plate
//    - SLOPED USB-C slot (45° peaked arch - 0 SUPPORTS, eliminating flat square bridges!)
//    - Solid 14.74° beveled peaked faceplate plug (dead-flush at 0 exploded view)
//    - Low curbs (2.8mm) framing the ESP32-C3 SuperMini bed
// -------------------------------------------------------------------------
export function buildSled(M) {
    const cl = 0.25;
    const w = 24.0;
    const sledWallH = 5.0;
    const rearY = -43.0; // Standardized rBase = 43.0mm
    const frontY = 6.0;   // Extends directly under central bore
    const totalLen = frontY - rearY;
    const deckThick = 1.6;
    const floorZ = 1.6 + cl; // 1.85mm

    // --- A. Flat Sled Bottom Deck ---
    let deck = M.cube([w, totalLen, deckThick], false)
        .translate([-w / 2, rearY, floorZ]);

    // Front leading edge 45° bevel (glides into tunnel smoothly)
    const nose = M.cube([w + 2.0, 3.0, 3.0], false)
        .rotate([45, 0, 0])
        .translate([-(w + 2.0) / 2, frontY - 1.0, floorZ + deckThick]);
    deck = deck.subtract(nose);

    // --- B. Low Side Curbs to Frame the ESP32-C3 ---
    const curbW = (w - 18.6) / 2.0; // 2.7mm curb on each side
    const curbH = 2.8;
    const leftCurb = M.cube([curbW, totalLen, curbH], false)
        .translate([-w / 2, rearY, floorZ + deckThick]);
    const rightCurb = M.cube([curbW, totalLen, curbH], false)
        .translate([w / 2 - curbW, rearY, floorZ + deckThick]);

    let sled = deck.add(leftCurb).add(rightCurb);

    // --- C. ESP32-C3 SuperMini Bed Features ---
    const mcuL = 23.0;
    const mcuStartY = rearY + 6.0;

    // Pin relief pocket between curbs (0.8mm deep so solder joints don't touch floor)
    const pinRelief = M.cube([14.0, mcuL - 2.0, 0.8], false)
        .translate([-7.0, mcuStartY + 1.0, floorZ + deckThick - 0.8]);
    sled = sled.subtract(pinRelief);

    // --- D. Solid Rear Peaked Plug Faceplate (100% DEAD FLUSH, ZERO THIN WALLS) ---
    const slopeAngle = Math.atan(10.0 / 38.0) * (180.0 / Math.PI); // 14.74356°
    const rawPlug = makePeakedPrism(M, w, 13.0, sledWallH, floorZ)
        .translate([0, -47.0, 0]);

    // Sloped cut plane passing through Y = -43.0 at Z = 0
    const angleCutBox = M.cube([w + 10.0, 30.0, 60.0], false)
        .translate([-(w + 10.0) / 2, -30.0, 0])
        .rotate([-slopeAngle, 0, 0])
        .translate([0, -43.0, 0]);

    let rearPlug = rawPlug.subtract(angleCutBox);

    // --- E. Sloped USB-C Cable Slot (45° Peaked Arch - ZERO SUPPORTS!) ---
    // User requirement: "The usb slot need slopes instead of a flat square for the USB-C cable."
    const cableW = 10.5;      // 10.5mm standard USB-C cable width
    const cableWallH = 3.0;   // 3.0mm vertical sidewalls
    const cableSlot = makePeakedPrism(M, cableW, 16.0, cableWallH, floorZ + 0.6)
        .translate([0, -48.0, 0]);

    rearPlug = rearPlug.subtract(cableSlot);
    sled = sled.add(rearPlug);

    return sled;
}

// -------------------------------------------------------------------------
// 5. ESP32-C3 SUPERMINI REFERENCE VISUAL GEOMETRY
// -------------------------------------------------------------------------
export function buildESP32Reference(M) {
    const pcb = M.cube([18.0, 22.52, 1.6], false).translate([-9.0, -11.26, 0]);
    const usb = M.cube([9.0, 6.0, 3.2], false).translate([-4.5, -11.26 - 1.0, 1.6]);
    const chip = M.cube([6.0, 6.0, 1.0], false).translate([-3.0, 0, 1.6]);
    return pcb.add(usb).add(chip);
}
