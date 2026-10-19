// Geometry generation module using Manifold WASM for 19-DeafDoorbellEnclosures (v2.3)
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
// Helper: External Wall Mounting Tab with Through-Hole and Counterbore
// -------------------------------------------------------------------------
function makeMountingTab(M, width, length, thick, screwDia, cbDia, dualHoles = false, holeSpacing = 36.0) {
    let tab = M.cube([width, length, thick], true);
    if (dualHoles) {
        const h1 = M.cylinder(thick + 4, screwDia / 2, screwDia / 2, 24, true).translate([-holeSpacing / 2, 0, 0]);
        const cb1 = M.cylinder(thick / 2 + 0.2, cbDia / 2, cbDia / 2, 24, true).translate([-holeSpacing / 2, 0, thick / 4]);
        const h2 = M.cylinder(thick + 4, screwDia / 2, screwDia / 2, 24, true).translate([holeSpacing / 2, 0, 0]);
        const cb2 = M.cylinder(thick / 2 + 0.2, cbDia / 2, cbDia / 2, 24, true).translate([holeSpacing / 2, 0, thick / 4]);
        return tab.subtract(h1).subtract(cb1).subtract(h2).subtract(cb2);
    } else {
        const screwHole = M.cylinder(thick + 4, screwDia / 2, screwDia / 2, 24, true);
        const cb = M.cylinder(thick / 2 + 0.2, cbDia / 2, cbDia / 2, 24, true).translate([0, 0, thick / 4]);
        return tab.subtract(screwHole).subtract(cb);
    }
}

// -------------------------------------------------------------------------
// 1. MASTER NODE: Base Chassis (Monolithic Rectangle, 4 M3 Screws, MAX4466 Sideways Wing)
// -------------------------------------------------------------------------
export function buildMasterBase(M, p) {
    const cl = p.printClearance;
    const bodyW = 56.0; // 56mm monolithic rectangle (ESP32 on right + MAX4466 on left)
    const bodyL = 48.0; // 48mm monolithic rectangle
    const bodyH = 22.0; // 18mm total cavity depth
    const tabL = 10.0;
    const tabThick = 4.5;

    // Single continuous rectangular chassis without any stepped-down weak areas
    let base = M.cube([bodyW, bodyL, bodyH], true);

    // External Top and Bottom Mounting Tabs (Drywall screw ears) with dual screw holes
    const topTab = makeMountingTab(M, bodyW - 8.0, tabL, tabThick, p.wallTabScrewDia, p.wallTabCounterbore, true, 32.0)
        .translate([0, bodyL / 2 + tabL / 2 - 0.5, -bodyH / 2 + tabThick / 2]);
    const botTab = makeMountingTab(M, bodyW - 8.0, tabL, tabThick, p.wallTabScrewDia, p.wallTabCounterbore, true, 32.0)
        .translate([0, -bodyL / 2 - tabL / 2 + 0.5, -bodyH / 2 + tabThick / 2]);
    base = base.add(topTab).add(botTab);

    // Back Face is 100% FLAT, SOLID & CLEAN (NO odd grooves or cutouts)

    // ESP32-C3 SuperMini Cavity Architecture (Placed at X = +9.0mm)
    const espX = 9.0;
    const cavL = p.espLength + cl * 2; // 23.5mm
    const cavW = p.espWidth + cl * 2;  // 18.7mm
    const cavY = -2.7;

    // 1. Upper Pocket: PCB seating shelf at Z = +6.6mm (USB-C sits flush with top rim at Z = +11.0mm)
    const upperH = 4.6;
    const upperPocket = M.cube([cavW, cavL, upperH], true)
        .translate([espX, cavY, bodyH / 2 - upperH / 2 + 0.1]);

    // 2. Lower Chamber: Sized between the 4 corner pillars for stacked headers
    const lowerW = cavW - 4.4;
    const lowerL = cavL - 4.4;
    const lowerH = 14.0;
    const lowerPocket = M.cube([lowerW, lowerL, lowerH], true)
        .translate([espX, cavY, bodyH / 2 - upperH - lowerH / 2 + 0.2]);

    // 3. LARGE HOLLOW BAY TO THE LEFT OF ESP32 (Zero Wasted Material, Full Drop-In Freedom!)
    // Completely hollows out the entire section to the left of the ESP32:
    // Spans X = -25.5mm to X = +0.5mm (26.0mm wide)
    // Spans Y = -16.0mm to Y = +16.0mm (32.0mm long, clearing the M3 corner screw bosses at Y = ±19.5mm)
    // Full top-loading depth: from top rim (Z = +11.1mm) down to solid backplate floor (Z = -8.0mm)
    const hollowW = 26.0;
    const hollowL = 32.0;
    const hollowH = 19.2;
    const hollowX = -12.5; // spans from X = -25.5 to X = +0.5 (meets ESP32 cavity with zero barrier)
    const hollowY = 0.0;   // perfectly centered between top & bottom M3 screw bosses
    const leftHollowBay = M.cube([hollowW, hollowL, hollowH], true)
        .translate([hollowX, hollowY, bodyH / 2 - hollowH / 2 + 0.1]);

    // 4. Backside Acoustic Port Hole directly under MAX4466 electret microphone capsule
    const micCapsuleX = -13.5;
    const micCapsuleY = -7.0;
    const micAcousticHole = M.cylinder(bodyH + 2, (p.acousticHornDia || 4.5) / 2, (p.acousticHornDia || 4.5) / 2, 24, true)
        .translate([micCapsuleX, micCapsuleY, 0]);
    // Internal acoustic cone chamfer for enhanced sensitivity
    const acousticCone = M.cylinder(3.0, ((p.acousticHornDia || 4.5) + 3.0) / 2, (p.acousticHornDia || 4.5) / 2, 24, true)
        .translate([micCapsuleX, micCapsuleY, -bodyH / 2 + 3.0]);

    // 5. Integrated USB-C Boot & Cable Clamping Channel (Aligned at espX = +9.0mm)
    const bootPocket = M.cube([12.0, 8.0, 7.0], true)
        .translate([espX, 11.0, bodyH / 2 - 3.5 + 0.1]);

    const cableGroove = M.cylinder(16.0, (p.cableJacketDia + 0.3) / 2, (p.cableJacketDia + 0.3) / 2, 24, true)
        .rotate([90, 0, 0])
        .translate([espX, bodyL / 2 - 5.0, bodyH / 2 - p.cableJacketDia / 4]);

    const toothG1 = M.cube([12.0, 1.8, 1.6], true).translate([espX, bodyL / 2 - 7.0, bodyH / 2 - 1.0]);
    const toothG2 = M.cube([12.0, 1.8, 1.6], true).translate([espX, bodyL / 2 - 3.0, bodyH / 2 - 1.0]);

    const zipTieTunnel = M.cube([bodyW + 4.0, 3.2, 2.0], true)
        .translate([0, bodyL / 2 - 5.0, bodyH / 2 - 5.6]);

    const bellMouth = M.cylinder(6.0, (p.cableJacketDia + 0.3) / 2, (p.cableJacketDia + 3.0) / 2, 24, true)
        .rotate([90, 0, 0])
        .translate([espX, bodyL / 2 - 1.0, bodyH / 2 - p.cableJacketDia / 4]);

    // 6. EXACTLY FOUR Solid Corner M3 Screw Holes at X = ±24.0mm, Y = ±19.5mm
    const sDia = p.screwHoleDia;
    const s1 = M.cylinder(bodyH + 2, sDia / 2, sDia / 2, 20, true).translate([-bodyW / 2 + 4.0, bodyL / 2 - 4.5, 0]);
    const s2 = M.cylinder(bodyH + 2, sDia / 2, sDia / 2, 20, true).translate([bodyW / 2 - 4.0, bodyL / 2 - 4.5, 0]);
    const s3 = M.cylinder(bodyH + 2, sDia / 2, sDia / 2, 20, true).translate([-bodyW / 2 + 4.0, -bodyL / 2 + 4.5, 0]);
    const s4 = M.cylinder(bodyH + 2, sDia / 2, sDia / 2, 20, true).translate([bodyW / 2 - 4.0, -bodyL / 2 + 4.5, 0]);

    return base
        .subtract(upperPocket)
        .subtract(lowerPocket)
        .subtract(leftHollowBay)
        .subtract(micAcousticHole)
        .subtract(acousticCone)
        .subtract(bootPocket)
        .subtract(cableGroove)
        .subtract(toothG1).subtract(toothG2)
        .subtract(zipTieTunnel)
        .subtract(bellMouth)
        .subtract(s1).subtract(s2).subtract(s3).subtract(s4);
}

// -------------------------------------------------------------------------
// 2. MASTER NODE: Monolithic Clamping Lid (4x M3 Counterbored Screws, Aligned)
// -------------------------------------------------------------------------
export function buildMasterLid(M, p) {
    const bodyW = 56.0;
    const bodyL = 48.0;
    const lidH = 4.5;
    const cl = p.printClearance;
    const espX = 9.0;
    const cavL = p.espLength + cl * 2;
    const cavW = p.espWidth + cl * 2;
    const cavY = -2.7;

    let lid = M.cube([bodyW, bodyL, lidH], true);

    // 4 Downward Corner Clamping Studs for ESP32 PCB
    const studW = 2.0;
    const studH = 1.0;
    const cs1 = M.cube([studW, studW, studH], true).translate([espX - cavW / 2 + studW / 2, cavY + cavL / 2 - studW / 2, -lidH / 2 - studH / 2]);
    const cs2 = M.cube([studW, studW, studH], true).translate([espX + cavW / 2 - studW / 2, cavY + cavL / 2 - studW / 2, -lidH / 2 - studH / 2]);
    const cs3 = M.cube([studW, studW, studH], true).translate([espX - cavW / 2 + studW / 2, cavY - cavL / 2 + studW / 2, -lidH / 2 - studH / 2]);
    const cs4 = M.cube([studW, studW, studH], true).translate([espX + cavW / 2 - studW / 2, cavY - cavL / 2 + studW / 2, -lidH / 2 - studH / 2]);
    lid = lid.add(cs1).add(cs2).add(cs3).add(cs4);

    // Upper Cable Clamping Arch (Aligned at espX = +9.0mm)
    const cableClampArch = M.cylinder(16.0, (p.cableJacketDia - 0.3) / 2, (p.cableJacketDia - 0.3) / 2, 24, true)
        .rotate([90, 0, 0])
        .translate([espX, bodyL / 2 - 5.0, -lidH / 2 + p.cableJacketDia / 4]);

    // Upper Boot Clamp Recess
    const bootClamp = M.cube([12.0, 8.0, 2.5], true)
        .translate([espX, 11.0, -lidH / 2 + 1.25]);

    // Tactile Button Access Ports (Boot GPIO 9 on left, Reset EN on right)
    const bootHole = M.cylinder(lidH + 4, 1.5, 1.5, 16, true).translate([espX - 4.8, cavY + 6.5, 0]);
    const resetHole = M.cylinder(lidH + 4, 1.5, 1.5, 16, true).translate([espX + 4.8, cavY + 6.5, 0]);

    // Status LED Optical Port
    const ledHole = M.cylinder(lidH + 4, 1.2, 1.2, 16, true).translate([espX + 3.5, cavY, 0]);

    // EXACTLY FOUR M3 Counterbored Through-Holes at X = ±24.0mm, Y = ±19.5mm
    const sDia = 3.4;
    const hDia = p.screwHeadDia;
    const makeScrew = (x, y) => {
        const pass = M.cylinder(lidH + 4, sDia / 2, sDia / 2, 24, true).translate([x, y, 0]);
        const head = M.cylinder(2.6, hDia / 2, hDia / 2, 24, true).translate([x, y, lidH / 2 - 1.25]);
        return pass.add(head);
    };

    const s1 = makeScrew(-bodyW / 2 + 4.0, bodyL / 2 - 4.5);
    const s2 = makeScrew(bodyW / 2 - 4.0, bodyL / 2 - 4.5);
    const s3 = makeScrew(-bodyW / 2 + 4.0, -bodyL / 2 + 4.5);
    const s4 = makeScrew(bodyW / 2 - 4.0, -bodyL / 2 + 4.5);

    return lid
        .subtract(cableClampArch)
        .subtract(bootClamp)
        .subtract(bootHole)
        .subtract(resetHole)
        .subtract(ledHole)
        .subtract(s1).subtract(s2).subtract(s3).subtract(s4);
}

// -------------------------------------------------------------------------
// 3. FOLLOWER NODE: Base Chassis (ESP32 at BOTTOM, 100% Flat Back, Wall Tabs)
// -------------------------------------------------------------------------
export function buildFollowerBase(M, p) {
    const cl = p.printClearance;
    const bodyW = 76.0;
    const bodyL = 104.0;
    const bodyH = 18.0;
    const tabL = 10.0;
    const tabThick = 4.5;

    let base = M.cube([bodyW, bodyL, bodyH], true);

    // External Top and Bottom Mounting Tabs (Drywall screw ears) with dual screw holes
    const topTab = makeMountingTab(M, bodyW - 16.0, tabL, tabThick, p.wallTabScrewDia, p.wallTabCounterbore, true, 36.0)
        .translate([0, bodyL / 2 + tabL / 2 - 0.5, -bodyH / 2 + tabThick / 2]);
    const botTab = makeMountingTab(M, bodyW - 16.0, tabL, tabThick, p.wallTabScrewDia, p.wallTabCounterbore, true, 36.0)
        .translate([0, -bodyL / 2 - tabL / 2 + 0.5, -bodyH / 2 + tabThick / 2]);

    base = base.add(topTab).add(botTab);

    // Back Face is 100% FLAT, SOLID & CLEAN (NO odd grooves or cutouts!)

    // Front Upper Section: 8x8 WS2812B Matrix Cavity (65.6 x 65.6 x 4.5mm)
    const matSize = p.matrixWidth + cl * 2;
    const matY = 16.0;
    const matrixPocket = M.cube([matSize, matSize, 4.5], true)
        .translate([0, matY, bodyH / 2 - 2.25 + 0.1]);

    const bezelPocket = M.cube([matSize + 2.0, matSize + 2.0, 1.8], true)
        .translate([0, matY, bodyH / 2 - 0.9 + 0.1]);

    // Front Lower Section: Top-Loading ESP32-C3 Bay (Bottom side where legs attach)
    const espW = p.espWidth + cl * 2;
    const espL = p.espLength + cl * 2;
    const espH = 9.0;
    const espY = -32.0;
    const espPocket = M.cube([espW, espL, espH], true)
        .translate([0, espY, bodyH / 2 - espH / 2 + 0.1]);

    // Bottom USB-C Cradle & Cable Exit
    const bootW = p.cableBootWidth + cl * 2;
    const bootPocket = M.cube([bootW, 10.0, 4.5], true)
        .translate([0, -bodyL / 2 + 4.5, bodyH / 2 - 2.25 + 0.1]);

    const cableChan = M.cylinder(12.0, (p.cableJacketDia + 0.4) / 2, (p.cableJacketDia + 0.4) / 2, 24, true)
        .rotate([90, 0, 0])
        .translate([0, -bodyL / 2 + 4.0, bodyH / 2 - p.cableJacketDia / 4]);

    // Internal Wiring Conduit: ESP32 up to 8x8 Matrix
    const wireTunnel = M.cube([14.0, 10.0, 5.0], true)
        .translate([0, espY + espL / 2 + 2.0, bodyH / 2 - 4.0]);

    // 2x M3 Screw Pilot Holes for Follower ESP32 Lid
    const sDia = p.screwHoleDia;
    const s1 = M.cylinder(bodyH + 2, sDia / 2, sDia / 2, 20, true).translate([-espW / 2 - 3.2, espY, bodyH / 2 - 5.0]);
    const s2 = M.cylinder(bodyH + 2, sDia / 2, sDia / 2, 20, true).translate([espW / 2 + 3.2, espY, bodyH / 2 - 5.0]);

    return base
        .subtract(matrixPocket)
        .subtract(bezelPocket)
        .subtract(espPocket)
        .subtract(bootPocket)
        .subtract(cableChan)
        .subtract(wireTunnel)
        .subtract(s1).subtract(s2);
}

// -------------------------------------------------------------------------
// 4. FOLLOWER NODE: ESP32 Clamping Lid (2x M3 Counterbored Through-Holes)
// -------------------------------------------------------------------------
export function buildFollowerLid(M, p) {
    const wall = p.wallThickness;
    const lidW = p.espWidth + wall * 2 + 7.0;
    const lidL = p.espLength + wall * 2 + 4.0;
    const lidH = 4.2;

    let lid = M.cube([lidW, lidL, lidH], true);

    const cableChan = M.cylinder(12.0, (p.cableJacketDia + 0.2) / 2, (p.cableJacketDia + 0.2) / 2, 24, true)
        .rotate([90, 0, 0])
        .translate([0, -lidL / 2 + 4.0, -lidH / 2 + p.cableJacketDia / 4]);

    const bootHole = M.cylinder(lidH + 4, 1.5, 1.5, 16, true).translate([-4.8, lidL / 2 - 6.0, 0]);
    const resetHole = M.cylinder(lidH + 4, 1.5, 1.5, 16, true).translate([4.8, lidL / 2 - 6.0, 0]);

    const sDia = 3.4;
    const hDia = p.screwHeadDia;
    const makeScrew = (x, y) => {
        const pass = M.cylinder(lidH + 4, sDia / 2, sDia / 2, 24, true).translate([x, y, 0]);
        const head = M.cylinder(2.4, hDia / 2, hDia / 2, 24, true).translate([x, y, lidH / 2 - 1.2]);
        return pass.add(head);
    };

    const s1 = makeScrew(-lidW / 2 + 3.0, 0);
    const s2 = makeScrew(lidW / 2 - 3.0, 0);

    return lid
        .subtract(cableChan)
        .subtract(bootHole)
        .subtract(resetHole)
        .subtract(s1).subtract(s2);
}

// -------------------------------------------------------------------------
// 5. FOLLOWER NODE: 8x8 Optical Isolation Baffle Grid
// -------------------------------------------------------------------------
export function buildFollowerGrid(M, p) {
    const gridSize = p.matrixWidth + 0.2;
    const gridH = p.matrixGridDepth;
    const cellPitch = gridSize / 8;
    const wallThick = 0.8;
    const cellInner = cellPitch - wallThick;

    let grid = M.cube([gridSize, gridSize, gridH], true);

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const cx = -gridSize / 2 + cellPitch / 2 + col * cellPitch;
            const cy = -gridSize / 2 + cellPitch / 2 + row * cellPitch;
            const cell = M.cube([cellInner, cellInner, gridH + 2], true).translate([cx, cy, 0]);
            grid = grid.subtract(cell);
        }
    }
    return grid;
}

// -------------------------------------------------------------------------
// 6. FOLLOWER NODE: Outrigger Desk Dock Stand (Zero-Overhang Vertical Winding Bollards)
// -------------------------------------------------------------------------
export function buildFollowerStand(M, p) {
    const standW = 100.0; // 100mm wide outrigger stance
    const standD = 120.0; // 120mm deep footprint (40mm front, 80mm back)
    const standH = 52.0;  // Upright dock tower

    // 1. Broad Outrigger Base Plate (12mm thick)
    let foot = M.cube([standW, standD, 12.0], true).translate([0, 20.0, 6.0]);
    const footCutout = M.cube([48.0, 60.0, 16.0], true).translate([0, -10.0, 6.0]);
    foot = foot.subtract(footCutout);

    // 2. Upright Docking Tower
    const tower = M.cube([88.0, 36.0, standH], true).translate([0, 0, standH / 2]);
    let stand = foot.add(tower);

    // 3. Clean Vertical Slide-In Docking Pocket for Follower Base (Shelf at Z = 16.0mm)
    const pocket = M.cube([77.2, 19.2, 40.0], true).translate([0, 0, 16.0 + 20.0]);
    stand = stand.subtract(pocket);

    // 4. Precision Groove in Floor for Follower Bottom Mounting Tab ("the screw part of the follower")
    // When docked, the tab is 60mm wide, from Y = +4.5 to +9.0, hanging from Z = 16.0 down to 6.5
    const tabGroove = M.cube([64.0, 8.5, 14.0], true).translate([0, 7.75, 11.0]);
    stand = stand.subtract(tabGroove);

    // 5. Wire Groove running from middle under USB-C port straight to the back of the tower
    // Follower USB-C port is at X = 0, Y = -6.75, Z = 16.0.
    // Groove runs from Y = -12.0 all the way to Y = +26.0 (exiting out the back onto the legs)
    const wireGroove = M.cube([10.0, 40.0, 10.0], true).translate([0, 7.0, 11.0]);
    stand = stand.subtract(wireGroove);

    // 6. Front Clearance Window (34mm wide so the 29.4mm lid slides in with ZERO clipping)
    const frontSlot = M.cube([34.0, 25.0, 42.0], true).translate([0, -15.0, 16.0 + 20.0]);
    stand = stand.subtract(frontSlot);

    // 7. SOLID MONOLITHIC RECTANGULAR CABLE WINDER WITH SIDE NOTCHES (Zero Fragility!)
    // Eliminates fragile thin pillars; replaces them with a single solid monolithic rectangular block
    // featuring 45° self-supporting side notches for winding the USB-C cable around securely.
    const cleatY = 48.0;
    const blockW = 56.0;
    const blockL = 16.0;
    const blockH = 20.0;
    const blockZ = 12.0 + blockH / 2; // Rises from deck Z = 12.0mm to Z = 32.0mm (height 20mm)

    let winderBlock = M.cube([blockW, blockL, blockH], true)
        .translate([0, cleatY, blockZ]);

    // Left & Right 45° Self-Supporting Side Notches for winding cable
    // 12x24x12mm cube rotated 45° creates 8.5mm deep, 17mm tall V-notches on each side
    const notchL = M.cube([12.0, blockL + 4.0, 12.0], true)
        .rotate([0, 45, 0])
        .translate([-blockW / 2, cleatY, blockZ]);

    const notchR = M.cube([12.0, blockL + 4.0, 12.0], true)
        .rotate([0, 45, 0])
        .translate([blockW / 2, cleatY, blockZ]);

    winderBlock = winderBlock.subtract(notchL).subtract(notchR);
    stand = stand.add(winderBlock);

    return stand;
}
