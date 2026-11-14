// Geometry generation module using Manifold WASM for 21-HypercubeFrame (v3.0 Dual-Mode)
// Mode A ('screws'): Monocoque 65x65x65mm Zero-Overhang Screw Cube with independent X/Y M2 hole spacing
// Mode B ('slots'):  Modular Open-Corner Cross-Frame ('+') Tiles with 45° drop-in PCB slot &
//                    4-edge hermaphroditic Lego-style interlocking finger-joints
import * as THREE from 'three';

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

// Helper: True 45°-tangent teardrop horizontal hole along X axis (0 overhang > 45°)
function makeTeardropHoleX(M, length, radius) {
    const cyl = M.cylinder(length, radius, radius, 24, true).rotate([0, 90, 0]);
    const roof = M.cube([length, radius, radius], true)
        .rotate([45, 0, 0])
        .translate([0, 0, radius / Math.SQRT2]);
    return cyl.add(roof);
}

// Helper: True 45°-tangent teardrop horizontal hole along Y axis (0 overhang > 45°)
function makeTeardropHoleY(M, length, radius) {
    const cyl = M.cylinder(length, radius, radius, 24, true).rotate([90, 0, 0]);
    const roof = M.cube([radius, length, radius], true)
        .rotate([0, 45, 0])
        .translate([0, 0, radius / Math.SQRT2]);
    return cyl.add(roof);
}

// -------------------------------------------------------------------------
// 1. MODE A ('screws'): MONOCOQUE ZERO-OVERHANG HYPERCUBE FRAME
//    - Independent holeSpacingX (default 48.75mm) and holeSpacingY (default 49.75mm)
//      to match generic 65x66mm WS2812B-64 AliExpress panels!
// -------------------------------------------------------------------------
export function buildHypercubeFrame(M, p) {
    const cubeSize = p.pcbSize;                         // 65.00mm flush outer cube
    const half = cubeSize / 2;                          // 32.50mm
    const wall = p.wallThickness;                       // 5.00mm continuous structural wall
    const innerHalf = half - wall;                      // 27.50mm interior half-span
    const D = Math.min(p.diamondHalfSpan, innerHalf - 0.8); // 26.50mm default
    const hx = p.holeSpacingX / 2;                      // ±24.375mm default
    const hy = p.holeSpacingY / 2;                      // ±24.875mm default (+1.0mm spacing!)

    // 1. Unified Flush Monocoque Outer Cube
    let frame = M.cube([cubeSize, cubeSize, cubeSize], true);

    // 2. Self-Supporting Interior Cavity with 50.9° Diamond Pyramid Vault Ceiling
    const cavH = innerHalf * 2;
    const rHigh = D - 0.15;
    const rLow = rHigh + cavH * 1.15;
    const innerBox = M.cube([cavH, cavH, cavH], true);
    const roofFrustum = M.cylinder(cavH + 0.02, rLow, rHigh, 4, true);
    const cavity = innerBox.intersect(roofFrustum);
    frame = frame.subtract(cavity);

    // 3. Top (+Z) 45° Diamond Window
    const topDiamond = M.cylinder(half + 2.0, D, D, 4, true)
        .translate([0, 0, half / 2 + 0.5]);
    frame = frame.subtract(topDiamond);

    // 4. Bottom (-Z) Flat Bed Plate Center Access Hole
    const botHoleR = Math.min(p.bottomHoleDia / 2, innerHalf - 2.0);
    if (botHoleR > 2.0) {
        const botCenterHole = M.cylinder(wall * 3, botHoleR, botHoleR, 48, true)
            .translate([0, 0, -half]);
        frame = frame.subtract(botCenterHole);
    }

    // 5. Four Vertical Side Faces (±X, ±Y): Horizontal 45° Diamond Tunnels
    const sideDiamondSide = D * Math.SQRT2;
    const tunnelLen = cubeSize + 4.0;
    const tunnelX = M.cube([tunnelLen, sideDiamondSide, sideDiamondSide], true).rotate([45, 0, 0]);
    const tunnelY = M.cube([sideDiamondSide, tunnelLen, sideDiamondSide], true).rotate([0, 45, 0]);
    frame = frame.subtract(tunnelX).subtract(tunnelY);

    // 6. 24x Self-Tapping M2 Corner Pilot Holes (±hx, ±hy per face)
    const rHole = p.m2HoleDia / 2;
    const hDepth = p.m2HoleDepth;
    const cylZ = M.cylinder(hDepth * 2, rHole, rHole, 24, true);
    const tearX = makeTeardropHoleX(M, hDepth * 2, rHole);
    const tearY = makeTeardropHoleY(M, hDepth * 2, rHole);

    for (let sx of [-1, 1]) {
        for (let sy of [-1, 1]) {
            const u = sx * hx;
            const v = sy * hy;
            // Top (+Z) and Bottom (-Z) vertical M2 holes
            frame = frame
                .subtract(cylZ.translate([u, v, half]))
                .subtract(cylZ.translate([u, v, -half]));
            // +X and -X horizontal M2 holes (Y = u, Z = v)
            frame = frame
                .subtract(tearX.translate([half, u, v]))
                .subtract(tearX.translate([-half, u, v]));
            // +Y and -Y horizontal M2 holes (X = u, Z = v)
            frame = frame
                .subtract(tearY.translate([u, half, v]))
                .subtract(tearY.translate([u, -half, v]));
        }
    }

    // 7. Vertical Power/Data Wire Pass-Through Bore in Flat Bottom (-Z) Plate
    if (p.enableCornerWireBore && p.wireHoleDia > 0.5) {
        const wR = p.wireHoleDia / 2;
        const borePos = 18.0;
        const vertCornerBore = M.cylinder(wall * 3, wR, wR, 32, true)
            .translate([borePos, borePos, -half]);
        frame = frame.subtract(vertCornerBore);
    }

    return frame.translate([0, 0, half]);
}

// -------------------------------------------------------------------------
// 2. MODE B ('slots'): RIGID OPEN-CORNER CROSS-RING TILE + OPENLOCK CLIPS
//    - Prints 100% flat on Z = 0 with ZERO supports!
//    - Continuous square ring across all 4 M2 screw holes (±hx, ±hy) + center '+' cross
//    - Open corners (clears V+/IN/V- & V-/OUT/V+ solder pads & 90° intersections)
//    - Drop-in / slide-in 45°-beveled PCB groove on 3 sides (+Y open for slide-in)
//    - 4x Back-side OpenLOCK dovetail clip pockets (Z = 0..2.6mm) for 90° & 180° clips
// -------------------------------------------------------------------------

// Helper: Dovetail key/pocket 2D profile extruded along Z
// Neck at r=0 (width wNeck), flaring out to width wHead at depth d
function makeDovetailPrism(M, wNeck, wHead, depth, heightZ) {
    const poly = [
        [-wNeck / 2, 0],
        [wNeck / 2, 0],
        [wHead / 2, depth],
        [-wHead / 2, depth]
    ];
    return M.extrude(poly, heightZ);
}

export function buildModularSlotTile(M, p) {
    const T = p.tileThickness;                           // 5.20mm total tile thickness
    const backZ = 2.6;                                   // 2.6mm solid backing & clip pocket thickness
    const pocketHalf = p.pcbSize / 2 + p.printClearance; // 32.75mm (65.5mm PCB pocket)
    const tileHalf = 34.5;                               // 69.0mm outer tile footprint (1.75mm wall outside PCB)
    const crossW = p.crossBeamWidth;                     // 5.00mm center '+' cross beams
    const hx = p.holeSpacingX / 2;                       // ±24.375mm
    const hy = p.holeSpacingY / 2;                       // ±24.875mm
    const cl = p.slotClearance;                          // 0.14mm clip clearance

    // 1. Unified Base Plate (Z = 0..backZ) carved from a single solid slab
    //    Eliminates coplanar union seams while forming the outer rim, screw-hole ring, and '+' cross!
    let tile = M.cube([tileHalf * 2, tileHalf * 2, backZ], true).translate([0, 0, backZ / 2]);

    // Carve 4 symmetric quadrant windows inside the screw-hole ring (between crossW/2 and 20.5mm)
    const qInner = crossW / 2; // 2.5mm
    const qOuter = 20.5;       // Leaves 20.5..28.5mm solid screw-hole ring
    const qSpan = qOuter - qInner; // 18.0mm x 18.0mm open wiring windows
    const qMid = (qInner + qOuter) / 2;
    const quadCut = M.cube([qSpan, qSpan, backZ + 2], true).translate([0, 0, backZ / 2]);
    for (let sx of [-1, 1]) {
        for (let sy of [-1, 1]) {
            tile = tile.subtract(quadCut.translate([sx * qMid, sy * qMid, 0]));
        }
    }

    // 2. Open Corners (L-shaped JST / 3-pad corner windows: clears all 3 pads V+/IN/V- & V-/OUT/V+
    //    from 21.5mm to 34.5mm along both edges while keeping >= 2.6mm solid collar around M2 holes!)
    const padWinA = M.cube([14.0, 8.0, T + 4], true);
    const padWinB = M.cube([8.0, 14.0, T + 4], true);
    for (let sx of [-1, 1]) {
        for (let sy of [-1, 1]) {
            tile = tile
                .subtract(padWinA.translate([sx * 28.5, sy * 31.5, T / 2]))
                .subtract(padWinB.translate([sx * 31.5, sy * 28.5, T / 2]));
        }
    }

    // 2b. Beefy Ø7.0mm M2 Screw Bosses at all 4 corner holes (±hx, ±hy)
    const screwBoss = M.cylinder(backZ, 3.5, 3.5, 24, true).translate([0, 0, backZ / 2]);
    for (let sx of [-1, 1]) {
        for (let sy of [-1, 1]) {
            tile = tile.add(screwBoss.translate([sx * hx, sy * hy, 0]));
        }
    }

    // 3. Front PCB Drop-In / Slide-In Rim Walls (Z = backZ-1.0 .. T) around the 65.5mm PCB pocket
    //    Overlaps 1.0mm into the base plate so Manifold fuses them into a single watertight shell!
    const rimOverlap = 1.0;
    const rimH = T - backZ + rimOverlap;
    const wallBarLen = 48.0; // Spans [-24, +24] along each edge (leaves corners open)
    const wallDepth = tileHalf - pocketHalf; // 1.75mm outer rim wall
    const wallMid = (tileHalf + pocketHalf) / 2;

    const rimX = M.cube([wallDepth, wallBarLen, rimH], true).translate([0, 0, backZ - rimOverlap + rimH / 2]);
    const rimY = M.cube([wallBarLen, wallDepth, rimH], true).translate([0, 0, backZ - rimOverlap + rimH / 2]);
    tile = tile
        .add(rimX.translate([wallMid, 0, 0]))
        .add(rimX.translate([-wallMid, 0, 0]))
        .add(rimY.translate([0, -wallMid, 0])); // -Y bottom stop wall; +Y left open for slide-in!

    // 45°-beveled retaining lips on +X, -X, and -Y (full 1.75mm overlap into rim walls = 100% fused!)
    const lipLen = 40.0;
    const lipZ = backZ + p.pcbThickness + 0.25; // 4.45mm
    const lipH = Math.max(0.75, T - lipZ);       // 0.75mm
    // 2D cross-section in (r, z) where r=0 is pocketHalf, r=+wallDepth is tileHalf (outer edge),
    // and r=-lipH is the inward overhanging tip at Z=T (45° slope from (0, lipZ) to (-lipH, T)):
    const lipPoly = [
        [0, lipZ],
        [wallDepth, lipZ],
        [wallDepth, T],
        [-lipH, T]
    ];
    const lipPrism = M.extrude(lipPoly, lipLen).translate([0, 0, -lipLen / 2]);
    // Rotate extrude (which extrudes along Z) to run along Y (for ±X walls) or along X (for -Y wall)
    const lipPosX = lipPrism.rotate([90, 0, 0]).translate([pocketHalf, 0, 0]);
    const lipNegX = lipPrism.rotate([90, 0, 180]).translate([-pocketHalf, 0, 0]);
    const lipNegY = lipPrism.rotate([90, 0, -90]).translate([0, -pocketHalf, 0]);

    tile = tile.add(lipPosX).add(lipNegX).add(lipNegY);

    // 4. 4x M2 Screw Pilot Holes right on the Screw-Hole Structural Ring (±hx, ±hy)
    //    So the user can optionally screw the PCB down OR just slide it into the groove!
    const rHole = p.m2HoleDia / 2;
    const m2Cyl = M.cylinder(backZ + 4, rHole, rHole, 20, true).translate([0, 0, backZ / 2]);
    for (let sx of [-1, 1]) {
        for (let sy of [-1, 1]) {
            tile = tile.subtract(m2Cyl.translate([sx * hx, sy * hy, 0]));
        }
    }

    // 5. 4x Back-Side OpenLOCK Dovetail Clip Pockets (Z = 0..backZ+0.2, centered on all 4 edges)
    //    Vertical walls -> 0 overhangs! Clips slide in from the back after PCBs are mounted.
    const pocketNeck = 9.0 + cl * 2;
    const pocketHead = 13.0 + cl * 2;
    const pocketDepth = 4.6;
    const dovetailCut = makeDovetailPrism(M, pocketNeck, pocketHead, pocketDepth, backZ + 0.4)
        .translate([0, 0, -0.2]);

    // Orient dovetail pocket inward from each of the 4 outer edges (r = tileHalf)
    tile = tile
        .subtract(dovetailCut.rotate([0, 0, 180]).translate([0, tileHalf + 0.05, 0]))  // +Y edge
        .subtract(dovetailCut.translate([0, -tileHalf - 0.05, 0]))                     // -Y edge
        .subtract(dovetailCut.rotate([0, 0, 90]).translate([tileHalf + 0.05, 0, 0]))   // +X edge
        .subtract(dovetailCut.rotate([0, 0, -90]).translate([-tileHalf - 0.05, 0, 0])); // -X edge

    return tile;
}

// -------------------------------------------------------------------------
// 2b. TRUE 3D 90° L-SHAPED DOVETAIL CLIP (Cube Corner Lock!)
//     - Shaped like the letter 'L' in 3D: Arm A locks into Tile 1's back pocket,
//       Arm B (bent 90° out-of-plane!) locks into Tile 2's back pocket.
//     - Printed in a symmetric 45° 'V' orientation on the bed so BOTH 90° arms
//       slope at 45° (0 supports!) and layer lines cross the corner at 45°!
// -------------------------------------------------------------------------
export function buildCornerClip90(M, p, widthDelta = null) {
    const lipH = 1.2;   // 1.2mm inner stop-flange so you can push it straight in until it stops!
    const keyH = 2.40;  // 2.40mm key height into 2.60mm pocket (0.20mm Z-clearance prevents binding)  // 2.55mm snug dovetail key into 2.6mm back-side pocket
    const delta = widthDelta !== null ? widthDelta : (p.clipWidthOffset ?? -0.20);
    const neck = Math.max(7.0, 9.0 + delta);
    const head = Math.max(10.5, 13.0 + delta);
    const depth = 4.35;
    const flangeW = 15.6;

    // Construct both 90° L-arms cleanly using exact axis-aligned rotations:
    // Start with dovetail along +Y (0..depth), width along X (-head/2..+head/2), thickness along Z (0..keyH):
    const rawKey = makeDovetailPrism(M, neck, head, depth, keyH);
    const armB = rawKey.rotate([0, 90, 0]).translate([-keyH, 0, 0]); // X in [-keyH, 0], Y in [0, depth], Z = width
    const armA = rawKey.rotate([0, 90, 0]).rotate([0, 0, -90]);       // X in [0, depth], Y in [-keyH, 0], Z = width

    // L-shaped inner stop-flange (catches against both tile back faces inside the 90° corner)
    const flangeA = M.cube([depth + lipH, lipH, flangeW], true)
        .translate([(depth - lipH) / 2, lipH / 2, 0]);
    const flangeB = M.cube([lipH, depth + lipH, flangeW], true)
        .translate([lipH / 2, (depth - lipH) / 2, 0]);
    const cornerBridge = M.cube([lipH + 1.2, lipH + 1.2, flangeW], true)
        .translate([(lipH - 1.2) / 2, (lipH - 1.2) / 2, 0]);

    let clip = armA.add(armB).add(flangeA).add(flangeB).add(cornerBridge);

    // Rotate into symmetric 45° 'V' print orientation on the bed (both arms rise at +45° -> 0 supports!)
    clip = clip.rotate([90, 0, 0]).rotate([0, -45, 0]);
    // Shift so lowest point sits cleanly on Z = 0, and trim a 0.4mm flat bed contact pad
    const bbox = clip.boundingBox();
    clip = clip.translate([0, 0, -bbox.min[2] - 0.35]);
    const bedTrim = M.cube([60, 60, 10], true).translate([0, 0, -5]);
    return clip.subtract(bedTrim);
}

// -------------------------------------------------------------------------
// 2c. 180° FLAT DOVETAIL CLIP WITH STOP-FLANGE (Locks coplanar side-by-side!)
// -------------------------------------------------------------------------
export function buildFlatClip180(M, p, widthDelta = null) {
    const lipH = 1.0;
    const keyH = 2.40;
    const totalH = lipH + keyH;
    const delta = widthDelta !== null ? widthDelta : (p.clipWidthOffset ?? -0.20);
    const neck = Math.max(7.0, 9.0 + delta);
    const head = Math.max(10.5, 13.0 + delta);
    const depth = 4.35;
    const gap = 0.5;
    const flangeW = 15.8;

    const keyPos = makeDovetailPrism(M, neck, head, depth, totalH).translate([0, gap / 2, 0]);
    const keyNeg = makeDovetailPrism(M, neck, head, depth, totalH).rotate([0, 0, 180]).translate([0, -gap / 2, 0]);
    const bridge = M.cube([neck, gap + 1.0, totalH], true).translate([0, 0, totalH / 2]);
    const stopFlange = M.cube([flangeW, depth * 2 + gap, lipH], true).translate([0, 0, lipH / 2]);

    return keyPos.add(keyNeg).add(bridge).add(stopFlange);
}

// -------------------------------------------------------------------------
// 2d. 6-SIZE DOVETAIL FIT-TEST ARRAY (#1 = 0.00mm to #6 = -0.50mm in 0.10mm steps)
//     Each clip has 1..6 tactile index notches along its front flange edge
//     so you can identify which tolerance fits your Bambu A1 + PETG best!
// -------------------------------------------------------------------------
export function buildClipFitTestArray(M, p) {
    const deltas = [0.0, -0.10, -0.20, -0.30, -0.40, -0.50];
    let arrayGeom = null;

    deltas.forEach((d, idx) => {
        let c = buildCornerClip90(M, p, d);
        // Carve (idx + 1) small index notches along the +Y end of the clip's bed-level base
        for (let n = 0; n <= idx; n++) {
            const notch = M.cube([1.0, 1.2, 2.0], true)
                .translate([-3.0 + n * 1.4, 7.6, 1.0]);
            c = c.subtract(notch);
        }
        const placed = c.translate([(idx - 2.5) * 20.0, 0, 0]);
        arrayGeom = arrayGeom ? arrayGeom.add(placed) : placed;
        c.delete();
    });

    return arrayGeom;
}

// -------------------------------------------------------------------------
// 3. HYPERCUBE TILTED CORNER PEDESTAL STAND
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
    const cubeCenterZ = socketApexZ + cornerTipDist;

    const proxyCube = M.cube([cradleSocketSize, cradleSocketSize, cradleSocketSize], true)
        .rotate(tiltDeg)
        .translate([0, 0, cubeCenterZ]);
    stand = stand.subtract(proxyCube);

    const ledClearCut = M.cylinder(standH, baseR * 0.42, baseR * 0.58, 36, false)
        .translate([0, 0, socketApexZ + 5.5]);
    stand = stand.subtract(ledClearCut);

    const verticalWireBore = M.cylinder(standH * 3, wireR, wireR, 28, true);
    const tunnelLen = baseR * 1.5;
    const rearCableTeardrop = makeTeardropHoleY(M, tunnelLen, wireR)
        .translate([0, tunnelLen / 2, wireR + 1.8]);

    stand = stand
        .subtract(verticalWireBore)
        .subtract(rearCableTeardrop);

    return stand;
}

// -------------------------------------------------------------------------
// 4. GHOST WS2812B-64 (8x8 LED MATRIX) PANEL (With Independent X/Y Hole Pitch!)
// -------------------------------------------------------------------------
export function buildGhostMatrixPcb(M, p) {
    const s = p.pcbSize;
    const t = p.pcbThickness;
    const hx = p.holeSpacingX / 2;
    const hy = p.holeSpacingY / 2;
    const m = p.midHoleOffset;
    let pcb = M.cube([s, s, t], true);

    // 6 exact mounting holes (4 corners at ±hx, ±hy + 2 mid-sides at ±m, 0)
    const holeCyl = M.cylinder(t + 2, 1.4, 1.4, 16, true);
    for (let sx of [-1, 1]) {
        for (let sy of [-1, 0, 1]) {
            const x = sx * (sy === 0 ? m : hx);
            const y = sy * hy;
            pcb = pcb.subtract(holeCyl.translate([x, y, 0]));
        }
    }

    // 8x8 5050 RGB LED grid
    const pitch = s / 8;
    const ledBox = M.cube([4.8, 4.8, 1.4], true);
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const lx = (c - 3.5) * pitch;
            const ly = (r - 3.5) * pitch;
            pcb = pcb.add(ledBox.translate([lx, ly, t / 2 + 0.7]));
        }
    }
    return pcb;
}

// -------------------------------------------------------------------------
// 5. BAMBU A1 SINGLE-PLATE EXPORTS (Mode-Aware)
// -------------------------------------------------------------------------
export function buildFullPrintPlate(M, p) {
    if (p.mountMode === 'slots') {
        // 6x Rigid Cross-Ring Tiles + 12x 90° Corner Clips + 4x 180° Flat Clips on 256x256mm bed
        const baseTile = buildModularSlotTile(M, p);
        const clip90 = buildCornerClip90(M, p);
        const clip180 = buildFlatClip180(M, p);
        let plate = null;
        const step = 76.0;
        for (let row = 0; row < 2; row++) {
            for (let col = -1; col <= 1; col++) {
                const t = baseTile.translate([col * step - 28, (row - 0.5) * step, 0]);
                plate = plate ? plate.add(t) : t;
            }
        }
        // 12x 90° Corner Clips on the right side of the bed (8.5mm clear of tiles)
        for (let i = 0; i < 12; i++) {
            const c = clip90.translate([98 + (i % 2) * 22, -62 + Math.floor(i / 2) * 22, 0]);
            plate = plate.add(c);
        }
        // 4x 180° Flat Clips along the bottom edge
        for (let j = 0; j < 4; j++) {
            const f = clip180.translate([-96 + j * 24, -96, 0]);
            plate = plate.add(f);
        }
        baseTile.delete();
        clip90.delete();
        clip180.delete();
        return plate;
    }

    const cube = buildHypercubeFrame(M, p).translate([-42, 0, 0]);
    const stand = buildCornerStand(M, p).translate([48, 0, 0]);
    return cube.add(stand);
}
