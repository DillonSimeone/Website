// Geometry generation module using Manifold WASM for 21-HypercubeFrame (v4.0 Tri-Mode)
// Mode 1 ('screws'): Monocoque 65x65x65mm Zero-Overhang M-Screw Cube
// Mode 2 ('octa'):   Octa-Node Internal Screw Hubs (3-Way, 4-Way, 5-Way) + Cross-Ring Tiles
// Mode 3 ('miter'):  45° Miter-Rail Cross-Ring Tiles + 1.4° Tapered Wedge Cotter-Pins
import * as THREE from 'three';
import { getScrewPilotDia, getScrewClearanceDia } from './state.js';

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

function makeTeardropHoleX(M, length, radius) {
    const cyl = M.cylinder(length, radius, radius, 24, true).rotate([0, 90, 0]);
    const roof = M.cube([length, radius, radius], true).rotate([45, 0, 0]).translate([0, 0, radius / Math.SQRT2]);
    return cyl.add(roof);
}

function makeTeardropHoleY(M, length, radius) {
    const cyl = M.cylinder(length, radius, radius, 24, true).rotate([90, 0, 0]);
    const roof = M.cube([radius, length, radius], true).rotate([0, 45, 0]).translate([0, 0, radius / Math.SQRT2]);
    return cyl.add(roof);
}

// -------------------------------------------------------------------------
// MODE 1 ('screws'): MONOCOQUE ZERO-OVERHANG M-SCREW HYPERCUBE FRAME
// -------------------------------------------------------------------------
export function buildHypercubeFrame(M, p) {
    const cubeSize = p.pcbSize;
    const half = cubeSize / 2;
    const wall = p.wallThickness;
    const innerHalf = half - wall;
    const D = Math.min(p.diamondHalfSpan, innerHalf - 0.8);

    let frame = M.cube([cubeSize, cubeSize, cubeSize], true);

    // 50.9° self-supporting diamond pyramid interior vault ceiling
    const cavH = innerHalf * 2;
    const rHigh = D - 0.15;
    const rLow = rHigh + cavH * 1.15;
    const cavity = M.cube([cavH, cavH, cavH], true).intersect(M.cylinder(cavH + 0.02, rLow, rHigh, 4, true));
    frame = frame.subtract(cavity);

    // Top (+Z) 45° diamond window & Bottom (-Z) flat bed plate center access hole
    frame = frame.subtract(M.cylinder(half + 2.0, D, D, 4, true).translate([0, 0, half / 2 + 0.5]));
    const botHoleR = Math.min(p.bottomHoleDia / 2, innerHalf - 2.0);
    if (botHoleR > 2.0) {
        frame = frame.subtract(M.cylinder(wall * 3, botHoleR, botHoleR, 48, true).translate([0, 0, -half]));
    }

    // 4 vertical side 45° diamond tunnels
    const sideDiamondSide = D * Math.SQRT2;
    const tunnelLen = cubeSize + 4.0;
    frame = frame
        .subtract(M.cube([tunnelLen, sideDiamondSide, sideDiamondSide], true).rotate([45, 0, 0]))
        .subtract(M.cube([sideDiamondSide, tunnelLen, sideDiamondSide], true).rotate([0, 45, 0]));

    // 24x self-tapping Mid-Side Center M-screw pilot holes (±m, 0) & (0, ±m) on all 6 faces
    //    (Using mid-side PCB holes frees all 8 corners for full open-air solder pad access!)
    const rHole = getScrewPilotDia(p) / 2;
    const hDepth = p.m2HoleDepth;
    const m = p.midHoleOffset;
    const cylZ = M.cylinder(hDepth * 2, rHole, rHole, 24, true);
    const tearX = makeTeardropHoleX(M, hDepth * 2, rHole);
    const tearY = makeTeardropHoleY(M, hDepth * 2, rHole);

    const midCoords = [
        [m, 0], [-m, 0],
        [0, m], [0, -m]
    ];
    for (const [u, v] of midCoords) {
        frame = frame
            .subtract(cylZ.translate([u, v, half]))
            .subtract(cylZ.translate([u, v, -half]))
            .subtract(tearX.translate([half, u, v]))
            .subtract(tearX.translate([-half, u, v]))
            .subtract(tearY.translate([u, half, v]))
            .subtract(tearY.translate([u, -half, v]));
    }

    // 6b. 8-Corner 54.7° Octahedral Truncation (|x| + |y| + |z| <= half*2 + 14.0 = 79.0)
    //     Exposes 100% of all corner V+/IN/V- & V-/OUT/V+ solder pads in open air with 0° overhang issues!
    const rOct = half * 2 + 14.0;
    const octTop = M.cylinder(rOct, rOct, 0.01, 4, false);
    const octBot = M.cylinder(rOct, 0.01, rOct, 4, false).translate([0, 0, -rOct]);
    frame = frame.intersect(octTop.add(octBot));

    if (p.enableCornerWireBore && p.wireHoleDia > 0.5) {
        const wR = p.wireHoleDia / 2;
        frame = frame.subtract(M.cylinder(wall * 3, wR, wR, 32, true).translate([18.0, 18.0, -half]));
    }

    return frame.translate([0, 0, half]);
}

// -------------------------------------------------------------------------
// SHARED HELPER: Rigid Open-Corner Cross-Ring Tile Base (Used by Octa & Miter)
// -------------------------------------------------------------------------
function buildCrossRingTileBase(M, p) {
    const T = p.tileThickness;
    const backZ = 2.6;
    const pocketHalf = p.pcbSize / 2 + p.printClearance;
    const tileHalf = 34.5;
    const crossW = p.crossBeamWidth;
    const hx = p.holeSpacingX / 2;
    const hy = p.holeSpacingY / 2;

    // 1. Unified base plate carved from one solid slab (0 coplanar seams)
    let tile = M.cube([tileHalf * 2, tileHalf * 2, backZ], true).translate([0, 0, backZ / 2]);

    const qInner = crossW / 2;
    const qOuter = 20.5;
    const qSpan = qOuter - qInner;
    const qMid = (qInner + qOuter) / 2;
    const quadCut = M.cube([qSpan, qSpan, backZ + 2], true).translate([0, 0, backZ / 2]);
    for (let sx of [-1, 1]) {
        for (let sy of [-1, 1]) {
            tile = tile.subtract(quadCut.translate([sx * qMid, sy * qMid, 0]));
        }
    }

    // 2. Open L-shaped JST / 3-pad corner windows
    const padWinA = M.cube([14.0, 8.0, T + 4], true);
    const padWinB = M.cube([8.0, 14.0, T + 4], true);
    for (let sx of [-1, 1]) {
        for (let sy of [-1, 1]) {
            tile = tile
                .subtract(padWinA.translate([sx * 28.5, sy * 31.5, T / 2]))
                .subtract(padWinB.translate([sx * 31.5, sy * 28.5, T / 2]));
        }
    }

    // 3. Ø7.0mm M-screw corner bosses + pilot holes (universal M-screw slider!)
    const screwBoss = M.cylinder(backZ, 3.5, 3.5, 24, true).translate([0, 0, backZ / 2]);
    const rHole = getScrewPilotDia(p) / 2;
    const mCyl = M.cylinder(backZ + 4, rHole, rHole, 20, true).translate([0, 0, backZ / 2]);
    for (let sx of [-1, 1]) {
        for (let sy of [-1, 1]) {
            tile = tile.add(screwBoss.translate([sx * hx, sy * hy, 0]));
            tile = tile.subtract(mCyl.translate([sx * hx, sy * hy, 0]));
        }
    }

    // 4. Front PCB drop-in/slide-in rim walls (overlap 1.0mm into base plate)
    const rimOverlap = 1.0;
    const rimH = T - backZ + rimOverlap;
    const wallBarLen = 48.0;
    const wallDepth = tileHalf - pocketHalf;
    const wallMid = (tileHalf + pocketHalf) / 2;
    const rimX = M.cube([wallDepth, wallBarLen, rimH], true).translate([0, 0, backZ - rimOverlap + rimH / 2]);
    const rimY = M.cube([wallBarLen, wallDepth, rimH], true).translate([0, 0, backZ - rimOverlap + rimH / 2]);
    tile = tile
        .add(rimX.translate([wallMid, 0, 0]))
        .add(rimX.translate([-wallMid, 0, 0]))
        .add(rimY.translate([0, -wallMid, 0]));

    // 45°-beveled retaining lips (full 1.75mm rim-wall overlap)
    const lipLen = 40.0;
    const lipZ = backZ + p.pcbThickness + 0.25;
    const lipH = Math.max(0.75, T - lipZ);
    const lipPoly = [[0, lipZ], [wallDepth, lipZ], [wallDepth, T], [-lipH, T]];
    const lipPrism = M.extrude(lipPoly, lipLen).translate([0, 0, -lipLen / 2]);
    tile = tile
        .add(lipPrism.rotate([90, 0, 0]).translate([pocketHalf, 0, 0]))
        .add(lipPrism.rotate([90, 0, 180]).translate([-pocketHalf, 0, 0]))
        .add(lipPrism.rotate([90, 0, -90]).translate([0, -pocketHalf, 0]));

    return tile;
}

// -------------------------------------------------------------------------
// MODE 2 ('octa'): OCTA-NODE INTERNAL SCREW HUBS + CROSS-RING TILE
// -------------------------------------------------------------------------
export function buildOctaTile(M, p) {
    let tile = buildCrossRingTileBase(M, p);
    const tileHalf = 34.5;
    const backZ = 2.6;
    // Countersunk hub-mounting clearance holes along the 4 edges (u = 0, r = 29.8mm)
    // Accessible from the front before sliding the PCB in (or via angled driver)
    const rClear = getScrewClearanceDia(p) / 2;
    const rHead = rClear * 1.75;
    const hubHole = M.cylinder(backZ + 4, rClear, rClear, 20, true).translate([0, 0, backZ / 2])
        .add(M.cylinder(1.2, rHead, rClear, 20, true).translate([0, 0, backZ - 0.5]));
    const rPos = tileHalf - 4.8; // 29.7mm
    return tile
        .subtract(hubHole.translate([rPos, 0, 0]))
        .subtract(hubHole.translate([-rPos, 0, 0]))
        .subtract(hubHole.translate([0, rPos, 0]))
        .subtract(hubHole.translate([0, -rPos, 0]));
}

// Internal 3-Way (cube corner), 4-Way (edge T-junction), or 5-Way (concave polycube) Screw Hub
export function buildOctaHub(M, p, ways = 3) {
    const s = 12.0; // 12x12x12mm unit hub block
    const rPilot = getScrewPilotDia(p) / 2;
    const hole = M.cylinder(s + 2, rPilot, rPilot, 20, true);
    const holeX = hole.rotate([0, 90, 0]);
    const holeY = hole.rotate([90, 0, 0]);

    if (ways === 4) {
        // 4-Way Dual-Cube Edge Hub (24 x 12 x 12mm)
        let hub = M.cube([s * 2, s, s], true).translate([0, 0, s / 2]);
        return hub
            .subtract(hole.translate([-s / 2, 0, s / 2]))
            .subtract(hole.translate([s / 2, 0, s / 2]))
            .subtract(holeY.translate([-s / 2, 0, s / 2]))
            .subtract(holeY.translate([s / 2, 0, s / 2]))
            .subtract(holeX.translate([0, 0, s / 2]));
    }
    if (ways === 5) {
        // 5-Way L-Saddle Polycube Hub (24 x 24 x 12mm L-block)
        let hub = M.cube([s * 2, s, s], true).translate([s / 2, 0, s / 2])
            .add(M.cube([s, s * 2, s], true).translate([0, s / 2, s / 2]));
        return hub
            .subtract(hole.translate([0, 0, s / 2]))
            .subtract(hole.translate([s, 0, s / 2]))
            .subtract(hole.translate([0, s, s / 2]))
            .subtract(holeX.translate([s / 2, 0, s / 2]))
            .subtract(holeY.translate([0, s / 2, s / 2]));
    }
    // 3-Way Cube Corner Hub (12 x 12 x 12mm with 3 orthogonal self-tapping pilot bores)
    let hub = M.cube([s, s, s], true).translate([0, 0, s / 2]);
    return hub
        .subtract(hole.translate([0, 0, s / 2]))
        .subtract(holeX.translate([0, 0, s / 2]))
        .subtract(holeY.translate([0, 0, s / 2]));
}

// -------------------------------------------------------------------------
// MODE 3 ('miter'): 45° MITER-RAIL TILE + 1.4° TAPERED WEDGE COTTER-PIN
// -------------------------------------------------------------------------
export function buildMiterTile(M, p) {
    let tile = buildCrossRingTileBase(M, p);
    const tileHalf = 34.5;
    const backZ = 2.6;
    const lockLen = 36.0;
    const pinR = (4.0 + p.pinClearance) / 2;

    // 45° miter bevel along the back edge (Z = 0..backZ) so two tiles meet cleanly at 90°!
    // Bevel slopes inward from r = tileHalf at Z = backZ to r = tileHalf - backZ at Z = 0 (45° = 0 supports!)
    const bevelDiag = backZ * Math.SQRT2;
    const miterCutX = M.cube([bevelDiag, lockLen, bevelDiag], true).rotate([0, 45, 0]).translate([0, 0, 0]);
    const miterCutY = M.cube([lockLen, bevelDiag, bevelDiag], true).rotate([45, 0, 0]).translate([0, 0, 0]);

    // Semi-cylindrical seam channel along the 45° miter line (forms Ø4.15mm tube when two tiles meet!)
    const seamLineR = tileHalf - backZ / 2; // Midpoint of the 45° bevel
    const seamZ = backZ / 2;
    const chanX = M.cylinder(lockLen, pinR, pinR, 20, true).rotate([90, 0, 0]);
    const chanY = M.cylinder(lockLen, pinR, pinR, 20, true).rotate([0, 90, 0]);

    return tile
        .subtract(miterCutX.translate([tileHalf, 0, 0]))
        .subtract(miterCutX.translate([-tileHalf, 0, 0]))
        .subtract(miterCutY.translate([0, tileHalf, 0]))
        .subtract(miterCutY.translate([0, -tileHalf, 0]))
        .subtract(chanX.translate([seamLineR, 0, seamZ]))
        .subtract(chanX.translate([-seamLineR, 0, seamZ]))
        .subtract(chanY.translate([0, seamLineR, seamZ]))
        .subtract(chanY.translate([0, -seamLineR, seamZ]));
}

// 1.4° Tapered Wedge Cotter-Pin (Prints flat on bed with pull-ring head; self-compensates tolerances!)
export function buildCotterPin(M, p) {
    const len = 36.0;
    const rTip = (3.3 + p.pinClearance) / 2;
    const rHead = (4.35 + p.pinClearance) / 2;
    // Tapered shaft lying flat along +Y on the bed (Z flat bottom trim for crisp adhesion)
    const shaft = M.cylinder(len, rHead, rTip, 24, true)
        .rotate([-90, 0, 0])
        .translate([0, len / 2, rHead * 0.85]);
    // Pull-ring head at Y = -4mm
    const ringOuter = M.cylinder(2.6, 6.0, 6.0, 24, true).translate([0, -5.2, 1.3]);
    const ringHole = M.cylinder(4.0, 3.0, 3.0, 20, true).translate([0, -5.2, 1.3]);
    const bedTrim = M.cube([20, 60, 10], true).translate([0, 15, -5]);
    return shaft.add(ringOuter).subtract(ringHole).subtract(bedTrim);
}

// -------------------------------------------------------------------------
// CORNER PEDESTAL STAND, GHOST PCB & FULL BAMBU A1 PRINT PLATES
// -------------------------------------------------------------------------
export function buildCornerStand(M, p) {
    const outerSpan = p.pcbSize + p.pcbThickness * 2;
    const baseR = p.standBaseRadius;
    const standH = p.standHeight;
    const wireR = (p.wireHoleDia + 0.8) / 2;

    let stand = M.cylinder(standH, baseR, baseR * 0.62, 6, false);
    const cradleSocketSize = outerSpan + p.printClearance * 2;
    const vCorner = new THREE.Vector3(1, 1, -1).normalize();
    const qTilt = new THREE.Quaternion().setFromUnitVectors(vCorner, new THREE.Vector3(0, 0, -1));
    const eTilt = new THREE.Euler().setFromQuaternion(qTilt, 'XYZ');
    const tiltDeg = [
        THREE.MathUtils.radToDeg(eTilt.x),
        THREE.MathUtils.radToDeg(eTilt.y),
        THREE.MathUtils.radToDeg(eTilt.z)
    ];

    const cornerTipDist = (cradleSocketSize / 2) * Math.sqrt(3);
    const socketApexZ = Math.max(8.0, standH - 12.0);
    const proxyCube = M.cube([cradleSocketSize, cradleSocketSize, cradleSocketSize], true)
        .rotate(tiltDeg)
        .translate([0, 0, socketApexZ + cornerTipDist]);
    stand = stand.subtract(proxyCube)
        .subtract(M.cylinder(standH, baseR * 0.42, baseR * 0.58, 36, false).translate([0, 0, socketApexZ + 5.5]));

    const verticalWireBore = M.cylinder(standH * 3, wireR, wireR, 28, true);
    const tunnelLen = baseR * 1.5;
    const rearCableTeardrop = makeTeardropHoleY(M, tunnelLen, wireR).translate([0, tunnelLen / 2, wireR + 1.8]);
    return stand.subtract(verticalWireBore).subtract(rearCableTeardrop);
}

export function buildGhostMatrixPcb(M, p) {
    const s = p.pcbSize;
    const t = p.pcbThickness;
    const hx = p.holeSpacingX / 2;
    const hy = p.holeSpacingY / 2;
    const m = p.midHoleOffset;
    let pcb = M.cube([s, s, t], true);

    const holeCyl = M.cylinder(t + 2, 1.1, 1.1, 16, true);
    for (let sx of [-1, 1]) {
        for (let sy of [-1, 0, 1]) {
            pcb = pcb.subtract(holeCyl.translate([sx * (sy === 0 ? m : hx), sy * hy, 0]));
        }
    }

    const pitch = s / 8;
    const ledBox = M.cube([4.8, 4.8, 1.4], true);
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            pcb = pcb.add(ledBox.translate([(c - 3.5) * pitch, (r - 3.5) * pitch, t / 2 + 0.7]));
        }
    }
    return pcb;
}

export function buildFullPrintPlate(M, p) {
    if (p.mountMode === 'octa') {
        const tile = buildOctaTile(M, p);
        const hub3 = buildOctaHub(M, p, 3);
        const hub4 = buildOctaHub(M, p, 4);
        let plate = null;
        for (let row = 0; row < 2; row++) {
            for (let col = -1; col <= 1; col++) {
                const t = tile.translate([col * 76 - 26, (row - 0.5) * 76, 0]);
                plate = plate ? plate.add(t) : t;
            }
        }
        for (let i = 0; i < 8; i++) {
            plate = plate.add(hub3.translate([96 + (i % 2) * 20, -60 + Math.floor(i / 2) * 20, 0]));
        }
        plate = plate.add(hub4.translate([106, 36, 0])).add(hub4.translate([106, 56, 0]));
        tile.delete(); hub3.delete(); hub4.delete();
        return plate;
    }

    if (p.mountMode === 'miter') {
        const t2 = buildMiterTile(M, p);
        const p2 = buildCotterPin(M, p);
        let out = null;
        for (let row = 0; row < 2; row++) {
            for (let col = -1; col <= 1; col++) {
                const t = t2.translate([col * 76 - 28, (row - 0.5) * 76, 0]);
                out = out ? out.add(t) : t;
            }
        }
        for (let i = 0; i < 12; i++) {
            const c = i % 3;
            const r = Math.floor(i / 3);
            out = out.add(p2.translate([92 + c * 15, -90 + r * 54, 0]));
        }
        t2.delete(); p2.delete();
        return out;
    }

    const cube = buildHypercubeFrame(M, p).translate([-42, 0, 0]);
    const stand = buildCornerStand(M, p).translate([48, 0, 0]);
    return cube.add(stand);
}
