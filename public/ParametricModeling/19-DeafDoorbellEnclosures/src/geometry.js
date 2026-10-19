// Geometry generation module using Manifold WASM for 19-DeafDoorbellEnclosures
import * as THREE from 'three';
import { context, params } from './state.js';

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
// Helper: Standard Screw Keyhole Slot
// -------------------------------------------------------------------------
function makeKeyhole(M, headDia, neckDia, depth) {
    const bigHole = M.cylinder(depth + 2, headDia / 2, headDia / 2, 24);
    const slot = M.cube([neckDia, 7.0, depth + 2], true).translate([0, 3.5, 0]);
    const neckCyl = M.cylinder(depth + 2, neckDia / 2, neckDia / 2, 24).translate([0, 7.0, 0]);
    return bigHole.add(slot).add(neckCyl);
}

// -------------------------------------------------------------------------
// MASTER NODE: Base Chassis
// -------------------------------------------------------------------------
export function buildMasterBase(M, p) {
    const wall = p.wallThickness;
    const cl = p.printClearance;
    const outW = p.espWidth + wall * 2 + 7.0; // ~31mm
    const outL = p.espLength + p.micLength + wall * 3 + 8.0; // ~58mm
    const outH = 13.0; // Base depth

    // Outer shell block
    let base = M.cube([outW, outL, outH], true);

    // Chamfer outer vertical corners
    const cornerCutter = M.cube([6, 6, outH + 2], true);
    const r = outW / 2;
    const l = outL / 2;

    // ESP32-C3 SuperMini upper cavity
    const espCavW = p.espWidth + cl * 2;
    const espCavL = p.espLength + cl * 2;
    const espCavH = 9.0;
    const espPocket = M.cube([espCavW, espCavL, espCavH], true)
        .translate([0, l - espCavL / 2 - wall, (outH - espCavH) / 2]);

    // Bottom PCB shelf clearance (bottom SMD passives pocket)
    const espUnderPocket = M.cube([espCavW - 2.4, espCavL - 2.0, 3.5], true)
        .translate([0, l - espCavL / 2 - wall, (outH - espCavH) / 2 - 4.0]);

    // USB-C plug cradle & cable strain relief bed (at top face)
    const bootW = p.cableBootWidth + cl * 2;
    const bootH = 4.2;
    const bootL = 12.0;
    const bootCradle = M.cube([bootW, bootL, bootH], true)
        .translate([0, l - bootL / 2 + 0.1, outH / 2 - bootH / 2]);

    // Cable round jacket channel with anti-slip teeth
    const cableChan = M.cylinder(14.0, (p.cableJacketDia + 0.4) / 2, (p.cableJacketDia + 0.4) / 2, 20)
        .rotate([90, 0, 0])
        .translate([0, l - 5.0, outH / 2 - (p.cableJacketDia) / 4]);

    // Teeth ridges for cable strain relief
    let cableTeeth = M.cube([0.1, 0.1, 0.1], true);
    for (let t = 0; t < 3; t++) {
        const tooth = M.cylinder(1.2, (p.cableJacketDia - 0.5) / 2, (p.cableJacketDia - 0.5) / 2, 16)
            .rotate([90, 0, 0])
            .translate([0, l - 3.0 - t * 3.0, outH / 2 - 1.2]);
        cableTeeth = cableTeeth.add(tooth);
    }

    // INMP441 Microphone Lower Bay
    const micW = p.micWidth + cl * 2;
    const micL = p.micLength + cl * 2;
    const micH = 7.0;
    const micPocket = M.cube([micW, micL, micH], true)
        .translate([0, -l + micL / 2 + wall, (outH - micH) / 2]);

    // Acoustic waveguide intake funnel (chamfered intake horn on bottom/front)
    const hornDia = p.acousticHornDia;
    const acousticHole = M.cylinder(outH, hornDia / 2, hornDia / 2, 24)
        .translate([0, -l + micL / 2 + wall, 0]);
    const acousticHorn = M.cylinder(3.0, hornDia / 2, hornDia * 1.3, 24)
        .translate([0, -l + micL / 2 + wall, -outH / 2 + 1.5]);

    // Internal wire passageway between ESP32 and Mic
    const wireTunnel = M.cube([9.0, 10.0, 5.0], true)
        .translate([0, 0, (outH - 5.0) / 2 - 1.0]);

    // 2x M3 Screw Pilot Holes for Lid Clamping
    const screwDia = p.screwHoleDia;
    const screw1 = M.cylinder(outH, screwDia / 2, screwDia / 2, 20).translate([-outW / 2 + 3.8, l - 4.5, 0]);
    const screw2 = M.cylinder(outH, screwDia / 2, screwDia / 2, 20).translate([outW / 2 - 3.8, l - 4.5, 0]);
    const screw3 = M.cylinder(outH, screwDia / 2, screwDia / 2, 20).translate([-outW / 2 + 3.8, -l + 4.5, 0]);
    const screw4 = M.cylinder(outH, screwDia / 2, screwDia / 2, 20).translate([outW / 2 - 3.8, -l + 4.5, 0]);

    // Backplate Mounting: 2x Keyhole slots (Top & Bottom)
    const khDepth = 4.0;
    const kh1 = makeKeyhole(M, 7.2, 3.8, khDepth).translate([0, p.masterKeyholePitch / 2 - 3.5, -outH / 2 + khDepth / 2 - 0.1]);
    const kh2 = makeKeyhole(M, 7.2, 3.8, khDepth).translate([0, -p.masterKeyholePitch / 2 - 3.5, -outH / 2 + khDepth / 2 - 0.1]);

    // Backplate Mounting: 3M Command Drywall Adhesive Recess
    const adhW = 19.5;
    const adhL = 44.0;
    const adhRecess = M.cube([adhW, adhL, 0.8], true).translate([0, 0, -outH / 2 + 0.4]);
    // Bottom pull-tab release notch
    const pullTab = M.cube([14.0, 10.0, 2.0], true).translate([0, -l + 4.0, -outH / 2 + 0.8]);

    // Perform CSG subtractions
    base = base
        .subtract(espPocket)
        .subtract(espUnderPocket)
        .subtract(bootCradle)
        .subtract(cableChan)
        .subtract(micPocket)
        .subtract(acousticHole)
        .subtract(acousticHorn)
        .subtract(wireTunnel)
        .subtract(screw1)
        .subtract(screw2)
        .subtract(screw3)
        .subtract(screw4)
        .subtract(kh1)
        .subtract(kh2)
        .subtract(adhRecess)
        .subtract(pullTab)
        .add(cableTeeth);

    return base;
}

// -------------------------------------------------------------------------
// MASTER NODE: Clamping Top Lid
// -------------------------------------------------------------------------
export function buildMasterLid(M, p) {
    const wall = p.wallThickness;
    const cl = p.printClearance;
    const outW = p.espWidth + wall * 2 + 7.0;
    const outL = p.espLength + p.micLength + wall * 3 + 8.0;
    const lidH = 4.5;
    const l = outL / 2;

    let lid = M.cube([outW, outL, lidH], true);

    // Cable Clamp Channel (upper half with gripping teeth)
    const upperCableChan = M.cylinder(14.0, (p.cableJacketDia + 0.2) / 2, (p.cableJacketDia + 0.2) / 2, 20)
        .rotate([90, 0, 0])
        .translate([0, l - 5.0, -lidH / 2 + (p.cableJacketDia) / 4]);

    const upperBootRecess = M.cube([p.cableBootWidth + cl * 2, 10.0, 2.8], true)
        .translate([0, l - 5.0, -lidH / 2 + 1.2]);

    // Downward PCB retaining shoulder (presses down on ESP32 non-component edge)
    const boardStop = M.cube([p.espWidth, 2.0, 1.2], true)
        .translate([0, l - p.espLength - wall, -lidH / 2 - 0.5]);

    // Tactile Button Access Ports (Boot & Reset pinholes)
    // ESP32-C3 SuperMini Boot is GPIO 9 (left of USB-C), Reset is EN (right of USB-C)
    const bootBtnHole = M.cylinder(lidH + 2, 1.5, 1.5, 16)
        .translate([-4.8, l - 5.5, 0]);
    const resetBtnHole = M.cylinder(lidH + 2, 1.5, 1.5, 16)
        .translate([4.8, l - 5.5, 0]);

    // Status LED Optical Port (GPIO 8 LED)
    const ledPort = M.cylinder(lidH + 2, 1.1, 1.1, 16)
        .translate([3.5, l - 13.0, 0]);

    // 4x M3 Lid Screw Clearance & Counterbore holes
    const screwHole = p.screwHoleDia + 0.5;
    const headDia = p.screwHeadDia;
    const makeScrew = (x, y) => {
        const pass = M.cylinder(lidH + 2, screwHole / 2, screwHole / 2, 20).translate([x, y, 0]);
        const head = M.cylinder(2.5, headDia / 2, headDia / 2, 20).translate([x, y, lidH / 2 - 1.2]);
        return pass.add(head);
    };

    const s1 = makeScrew(-outW / 2 + 3.8, l - 4.5);
    const s2 = makeScrew(outW / 2 - 3.8, l - 4.5);
    const s3 = makeScrew(-outW / 2 + 3.8, -l + 4.5);
    const s4 = makeScrew(outW / 2 - 3.8, -l + 4.5);

    lid = lid
        .subtract(upperCableChan)
        .subtract(upperBootRecess)
        .subtract(bootBtnHole)
        .subtract(resetBtnHole)
        .subtract(ledPort)
        .subtract(s1).subtract(s2).subtract(s3).subtract(s4);

    return lid;
}

// -------------------------------------------------------------------------
// FOLLOWER NODE: Base Chassis (Matrix Bay + ESP32 Rear Top Pocket)
// -------------------------------------------------------------------------
export function buildFollowerBase(M, p) {
    const wall = p.wallThickness;
    const cl = p.printClearance;
    const outSize = p.matrixWidth + wall * 2 + 4.0; // ~73.6mm
    const baseD = 18.0;

    let base = M.cube([outSize, outSize, baseD], true);

    // Front Matrix Cavity (65.6mm x 65.6mm x 4.0mm)
    const matW = p.matrixWidth + cl * 2;
    const matL = p.matrixLength + cl * 2;
    const matD = 4.0;
    const matrixPocket = M.cube([matW, matL, matD], true)
        .translate([0, 0, baseD / 2 - matD / 2 + 0.1]);

    // Front Diffuser Lip / Bezel Step
    const bezelPocket = M.cube([outSize - wall, outSize - wall, 2.0], true)
        .translate([0, 0, baseD / 2 - 1.0 + 0.1]);

    // Rear ESP32-C3 SuperMini Top-Loading Bay (on upper backside)
    const espW = p.espWidth + cl * 2;
    const espL = p.espLength + cl * 2;
    const espD = 10.0;
    const espY = outSize / 2 - espL / 2 - wall - 2.0;
    const espRearPocket = M.cube([espW, espL, espD], true)
        .translate([0, espY, -baseD / 2 + espD / 2 - 0.1]);

    // Rear USB-C Cable Trap & Strain Relief
    const bootW = p.cableBootWidth + cl * 2;
    const bootPocket = M.cube([bootW, 10.0, 4.5], true)
        .translate([0, outSize / 2 - 4.5, -baseD / 2 + 2.2]);

    const cableChan = M.cylinder(12.0, (p.cableJacketDia + 0.4) / 2, (p.cableJacketDia + 0.4) / 2, 20)
        .rotate([90, 0, 0])
        .translate([0, outSize / 2 - 4.0, -baseD / 2 + p.cableJacketDia / 4]);

    // Internal wiring conduit from ESP32 to Matrix input pads
    const wireHole = M.cube([12.0, 8.0, 6.0], true)
        .translate([0, espY - espL / 2, 0]);

    // 2x Drywall Keyhole Mounts (Lower half of rear face)
    const khDepth = 4.0;
    const kh1 = makeKeyhole(M, 7.2, 3.8, khDepth).translate([-p.followerKeyholePitch / 2, -12.0, -baseD / 2 + khDepth / 2 - 0.1]);
    const kh2 = makeKeyhole(M, 7.2, 3.8, khDepth).translate([p.followerKeyholePitch / 2, -12.0, -baseD / 2 + khDepth / 2 - 0.1]);

    // 2x 3M Command Drywall Adhesive Landing Channels
    const adh1 = M.cube([18.0, 48.0, 0.8], true).translate([-18.0, -8.0, -baseD / 2 + 0.4]);
    const adh2 = M.cube([18.0, 48.0, 0.8], true).translate([18.0, -8.0, -baseD / 2 + 0.4]);
    // Bottom pull-tab notches
    const tab1 = M.cube([12.0, 8.0, 2.0], true).translate([-18.0, -outSize / 2 + 3.0, -baseD / 2 + 0.8]);
    const tab2 = M.cube([12.0, 8.0, 2.0], true).translate([18.0, -outSize / 2 + 3.0, -baseD / 2 + 0.8]);

    // 2x Screw Pilot Holes for ESP32 Clamp Lid
    const sDia = p.screwHoleDia;
    const s1 = M.cylinder(12.0, sDia / 2, sDia / 2, 20).translate([-espW / 2 - 3.2, espY, -baseD / 2 + 6.0]);
    const s2 = M.cylinder(12.0, sDia / 2, sDia / 2, 20).translate([espW / 2 + 3.2, espY, -baseD / 2 + 6.0]);

    base = base
        .subtract(matrixPocket)
        .subtract(bezelPocket)
        .subtract(espRearPocket)
        .subtract(bootPocket)
        .subtract(cableChan)
        .subtract(wireHole)
        .subtract(kh1)
        .subtract(kh2)
        .subtract(adh1).subtract(adh2)
        .subtract(tab1).subtract(tab2)
        .subtract(s1).subtract(s2);

    return base;
}

// -------------------------------------------------------------------------
// FOLLOWER NODE: ESP32 Clamping Lid
// -------------------------------------------------------------------------
export function buildFollowerLid(M, p) {
    const wall = p.wallThickness;
    const cl = p.printClearance;
    const lidW = p.espWidth + wall * 2 + 7.0;
    const lidL = p.espLength + wall * 2 + 4.0;
    const lidH = 4.2;

    let lid = M.cube([lidW, lidL, lidH], true);

    // Cable Clamp Channel
    const cableChan = M.cylinder(12.0, (p.cableJacketDia + 0.2) / 2, (p.cableJacketDia + 0.2) / 2, 20)
        .rotate([90, 0, 0])
        .translate([0, lidL / 2 - 4.0, -lidH / 2 + p.cableJacketDia / 4]);

    // Button Ports (Boot & Reset)
    const bootHole = M.cylinder(lidH + 2, 1.5, 1.5, 16).translate([-4.8, lidL / 2 - 6.0, 0]);
    const resetHole = M.cylinder(lidH + 2, 1.5, 1.5, 16).translate([4.8, lidL / 2 - 6.0, 0]);

    // Screw holes
    const sDia = p.screwHoleDia + 0.5;
    const hDia = p.screwHeadDia;
    const makeScrew = (x, y) => {
        const pass = M.cylinder(lidH + 2, sDia / 2, sDia / 2, 20).translate([x, y, 0]);
        const head = M.cylinder(2.2, hDia / 2, hDia / 2, 20).translate([x, y, lidH / 2 - 1.1]);
        return pass.add(head);
    };

    const s1 = makeScrew(-lidW / 2 + 3.0, 0);
    const s2 = makeScrew(lidW / 2 - 3.0, 0);

    lid = lid
        .subtract(cableChan)
        .subtract(bootHole)
        .subtract(resetHole)
        .subtract(s1).subtract(s2);

    return lid;
}

// -------------------------------------------------------------------------
// FOLLOWER NODE: 8x8 Optical Isolation Baffle Grid
// -------------------------------------------------------------------------
export function buildFollowerGrid(M, p) {
    const gridSize = p.matrixWidth + 0.4;
    const gridH = p.matrixGridDepth; // 4.5mm
    const cellPitch = gridSize / 8;
    const wallThick = 0.8;
    const cellInner = cellPitch - wallThick;

    let grid = M.cube([gridSize, gridSize, gridH], true);

    // Subtract 64 individual square light isolation cells
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
