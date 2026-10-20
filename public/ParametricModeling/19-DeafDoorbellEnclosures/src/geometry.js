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
    const xs = dualHoles ? [-holeSpacing / 2, holeSpacing / 2] : [0];
    for (let x of xs) {
        tab = tab.subtract(M.cylinder(thick + 4, screwDia / 2, screwDia / 2, 24, true).translate([x, 0, 0]))
                 .subtract(M.cylinder(thick / 2 + 0.2, cbDia / 2, cbDia / 2, 24, true).translate([x, 0, thick / 4]));
    }
    return tab;
}

// -------------------------------------------------------------------------
// 1. MASTER NODE: Base Chassis (Monolithic Rectangle, 4 M3 Screws, Flipped Mic to Right)
// -------------------------------------------------------------------------
export function buildMasterBase(M, p) {
    const cl = p.printClearance;
    const bodyW = 56.0; // 56mm monolithic rectangle (ESP32 on left + MAX4466 on right)
    const bodyL = 48.0; // 48mm monolithic rectangle
    const bodyH = 22.0; // 22mm chassis depth
    const tabL = 10.0;
    const tabThick = 4.5;

    let base = M.cube([bodyW, bodyL, bodyH], true);

    // External Top and Bottom Mounting Tabs (Drywall screw ears) with solid continuous plates
    const tabW = 52.0;
    const topTab = makeMountingTab(M, tabW, tabL, tabThick, p.wallTabScrewDia, p.wallTabCounterbore, true, 35.0)
        .translate([0, bodyL / 2 + tabL / 2 - 0.5, -bodyH / 2 + tabThick / 2]);
    const botTab = makeMountingTab(M, tabW, tabL, tabThick, p.wallTabScrewDia, p.wallTabCounterbore, true, 35.0)
        .translate([0, -bodyL / 2 - tabL / 2 + 0.5, -bodyH / 2 + tabThick / 2]);
    base = base.add(topTab).add(botTab);

    // ESP32-C3 SuperMini Cavity Architecture (Placed at X = -9.0mm on the LEFT)
    // Orientation: PCB ON BOTTOM (sitting flat on floor), USB-C AND BUTTONS ON TOP!
    const espX = -9.0;
    const cavL = p.espLength + cl * 2; // 23.22mm
    const cavW = p.espWidth + cl * 2;  // 18.7mm
    const cavY = -2.7;

    // 1. ESP32 PCB Seating Shelf: exactly 4.0mm deep from top rim (Z = +11.0 down to +7.0mm)
    const shelfH = 4.0;
    const upperPocket = M.cube([cavW, cavL, shelfH + 0.1], true)
        .translate([espX, cavY, bodyH / 2 - shelfH / 2 + 0.05]);

    // 2. Central Pin/Header Solder Clearance Well under ESP32: deep 16.0mm well (Z = -9.0mm)
    const lowerPocket = M.cube([14.5, 19.0, 16.0], true)
        .translate([espX, cavY, bodyH / 2 - shelfH - 8.0 + 0.05]);

    // 3. Large Hollow Bay for MAX4466 (Expanded to 26x34x20mm for maximum weight reduction)
    const hollowW = 26.0;
    const hollowL = 34.0;
    const hollowH = 20.0;
    const hollowX = 12.5; // Spans X = -0.5 to X = +25.5mm
    const rightHollowBay = M.cube([hollowW, hollowL, hollowH], true)
        .translate([hollowX, 0, bodyH / 2 - hollowH / 2 + 0.1]);

    // 4. Backside Acoustic Port Hole directly under MAX4466 electret microphone capsule (on the RIGHT)
    const micCapsuleX = 13.5;
    const micCapsuleY = -7.0;
    const micAcousticHole = M.cylinder(bodyH + 2, (p.acousticHornDia || 4.5) / 2, (p.acousticHornDia || 4.5) / 2, 24, true)
        .translate([micCapsuleX, micCapsuleY, 0]);
    const acousticCone = M.cylinder(3.0, ((p.acousticHornDia || 4.5) + 3.0) / 2, (p.acousticHornDia || 4.5) / 2, 24, true)
        .translate([micCapsuleX, micCapsuleY, -bodyH / 2 + 3.0]);

    // 5. USB-C Cable Head Port (12mm W x 5.2mm D, fitting 11x7x20mm cable head)
    const cableY_start = cavY + cavL / 2 - 0.5;
    const cableY_end = bodyL / 2 + 0.5;
    const cableL = cableY_end - cableY_start;
    const cableY_mid = (cableY_start + cableY_end) / 2;
    const cableSlotH = 5.2;
    const cableSlot = M.cube([12.0, cableL, cableSlotH], true)
        .translate([espX, cableY_mid, bodyH / 2 - cableSlotH / 2 + 0.1]);

    // 6. Exactly Four Corner M3 Screw Holes at X = ±24.0mm, Y = ±19.5mm
    const sDia = p.screwHoleDia;
    const s1 = M.cylinder(bodyH + 2, sDia / 2, sDia / 2, 20, true).translate([-bodyW / 2 + 4.0, bodyL / 2 - 4.5, 0]);
    const s2 = M.cylinder(bodyH + 2, sDia / 2, sDia / 2, 20, true).translate([bodyW / 2 - 4.0, bodyL / 2 - 4.5, 0]);
    const s3 = M.cylinder(bodyH + 2, sDia / 2, sDia / 2, 20, true).translate([-bodyW / 2 + 4.0, -bodyL / 2 + 4.5, 0]);
    const s4 = M.cylinder(bodyH + 2, sDia / 2, sDia / 2, 20, true).translate([bodyW / 2 - 4.0, -bodyL / 2 + 4.5, 0]);

    base = base
        .subtract(upperPocket)
        .subtract(lowerPocket)
        .subtract(rightHollowBay)
        .subtract(micAcousticHole)
        .subtract(acousticCone)
        .subtract(cableSlot)
        .subtract(s1).subtract(s2).subtract(s3).subtract(s4);

    // 7. Cool Pass-Through Hex Acoustic/Sound Vents in Right Chamber Floor
    for (let y of [-10.0, 0, 10.0]) {
        for (let dx of [-6.0, 6.0]) base = base.subtract(M.cylinder(30.0, 2.5, 2.5, 6, true).translate([hollowX + dx, y, 0]));
    }

    // 8. Cool Pass-Through Airflow/Heat Slots in Floor under ESP32
    for (let dy of [-6.0, 0, 6.0]) {
        base = base.subtract(M.cube([9.0, 2.4, 30.0], true).translate([espX, cavY + dy, 0]));
    }

    // 9. Cool 45° Diamond Side Vents on Left & Right Flanks (100% Support-Free)
    for (let y of [-7.0, 0, 7.0]) {
        base = base.subtract(M.cube([10.0, 3.5, 3.5], true).rotate([45, 0, 0]).translate([-bodyW / 2, y, 2.0]));
        base = base.subtract(M.cube([10.0, 3.5, 3.5], true).rotate([45, 0, 0]).translate([bodyW / 2, y, 2.0]));
    }

    // 10. Outer 45° Bottom Bevels along Lower Flank Edges (Saves Solid Corners)
    base = base.subtract(M.cube([6.0, bodyL + 10, 6.0], true).rotate([0, 45, 0]).translate([-bodyW / 2, 0, -bodyH / 2]))
               .subtract(M.cube([6.0, bodyL + 10, 6.0], true).rotate([0, 45, 0]).translate([bodyW / 2, 0, -bodyH / 2]));

    return base;
}

// -------------------------------------------------------------------------
// 2. MASTER NODE: Monolithic Clamping Lid (Slim 3.0mm Thickness)
// -------------------------------------------------------------------------
export function buildMasterLid(M, p) {
    const bodyW = 56.0;
    const bodyL = 48.0;
    const lidH = 3.0; // Slim 3.0mm thickness (drastically cuts print time)
    const cl = p.printClearance;
    const espX = -9.0;
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

    // Upper Cable Channel (12.0mm W x 1.6mm D into lid, clears 7mm cable with base)
    const cableClampPocket = M.cube([12.0, 26.0, 1.6], true)
        .translate([espX, 21.0, -lidH / 2 + 0.8]);

    // Tactile Button Access Ports (BOOT at X=-11.5mm, RESET at X=-6.5mm on TOP of PCB)
    const bootHole = M.cylinder(lidH + 4, 1.3, 1.3, 20, true).translate([espX - 2.5, cavY + 2.42, 0]);
    const resetHole = M.cylinder(lidH + 4, 1.3, 1.3, 20, true).translate([espX + 2.5, cavY + 2.42, 0]);

    // Status LED Optical Port
    const ledHole = M.cylinder(lidH + 4, 1.2, 1.2, 16, true).translate([espX - 3.5, cavY, 0]);

    // Exactly Four M3 Counterbored Through-Holes at X = ±24.0mm, Y = ±19.5mm
    const sDia = 3.4;
    const hDia = p.screwHeadDia;
    const makeScrew = (x, y) => {
        const pass = M.cylinder(lidH + 4, sDia / 2, sDia / 2, 24, true).translate([x, y, 0]);
        const head = M.cylinder(1.6, hDia / 2, hDia / 2, 24, true).translate([x, y, lidH / 2 - 0.8]);
        return pass.add(head);
    };

    const s1 = makeScrew(-bodyW / 2 + 4.0, bodyL / 2 - 4.5);
    const s2 = makeScrew(bodyW / 2 - 4.0, bodyL / 2 - 4.5);
    const s3 = makeScrew(-bodyW / 2 + 4.0, -bodyL / 2 + 4.5);
    const s4 = makeScrew(bodyW / 2 - 4.0, -bodyL / 2 + 4.5);

    return lid
        .subtract(cableClampPocket)
        .subtract(bootHole)
        .subtract(resetHole)
        .subtract(ledHole)
        .subtract(s1).subtract(s2).subtract(s3).subtract(s4);
}

// -------------------------------------------------------------------------
// 3. FOLLOWER NODE: Base Chassis (PCB on Bottom, USB-C on Top, Zero Pane)
// -------------------------------------------------------------------------
export function buildFollowerBase(M, p) {
    const cl = p.printClearance;
    const bodyW = 76.0;
    const bodyL = 104.0;
    const bodyH = p.followerBaseThickness || 12.0; // Slim 12.0mm thickness
    const tabL = 10.0;
    const tabThick = 4.5;

    let base = M.cube([bodyW, bodyL, bodyH], true);

    // External Top and Bottom Mounting Tabs (Drywall screw ears)
    // Dual holes spaced 48mm apart (X = ±24.0mm) - provides 14.2mm margin from center cable notch!
    const tabW = bodyW - 12.0; // 64.0mm wide tab
    const topTab = makeMountingTab(M, tabW, tabL, tabThick, p.wallTabScrewDia, p.wallTabCounterbore, true, 48.0)
        .translate([0, bodyL / 2 + tabL / 2 - 0.5, -bodyH / 2 + tabThick / 2]);
    const botTab = makeMountingTab(M, tabW, tabL, tabThick, p.wallTabScrewDia, p.wallTabCounterbore, true, 48.0)
        .translate([0, -bodyL / 2 - tabL / 2 + 0.5, -bodyH / 2 + tabThick / 2]);

    base = base.add(topTab).add(botTab);

    // Front Upper Section: 8x8 WS2812B Matrix Cavity (Solid 2.0mm Backplate Floor!)
    const matSize = p.matrixWidth + cl * 2;
    const matY = 16.0;
    const backplateThick = 2.0;
    const matCavDepth = bodyH - backplateThick; // 10.0mm deep from front face down to 2mm backplate
    const matrixPocket = M.cube([matSize, matSize, matCavDepth + 0.2], true)
        .translate([0, matY, -bodyH / 2 + backplateThick + matCavDepth / 2]);

    const bezelPocket = M.cube([matSize + 2.0, matSize + 2.0, 1.8], true)
        .translate([0, matY, bodyH / 2 - 0.9 + 0.1]);

    // Center 14.0mm Hole in 2.0mm Backplate for screen poke-out / hook hanging
    const matrixHookHole = M.cylinder(bodyH + 4, 7.0, 7.0, 32, true)
        .translate([0, matY, 0]);

    // Front Lower Section: Rotated ESP32-C3 SuperMini (Right) + Internal Cable Bay (Left)
    const espL = 22.52 + cl * 2; // 23.22mm in X
    const espW = 18.0 + cl * 2;  // 18.70mm in Y
    const espX = 36.0 - espL / 2; // 24.39mm (2mm from outer right edge X = +38.0)
    const espY = -34.5;

    // 1. ESP32 PCB Seating Shelf: exactly 4.0mm deep from rim (Z = +2.0 to +6.0mm)
    const shelfH = 4.0;
    const espPocket = M.cube([espL, espW, shelfH + 0.1], true)
        .translate([espX, espY, bodyH / 2 - shelfH / 2 + 0.05]);

    // 2. Central Pin/Header Solder Clearance Well under ESP32 (Z = -0.5 to +2.0mm):
    const lowerPocket = M.cube([18.0, 13.0, 2.5], true)
        .translate([espX, espY, bodyH / 2 - shelfH - 1.25 + 0.05]);

    // 3. Large Internal Cable & Loop Bay (spans X = +13.0 to X = -35.0, Y = -47.0 to -21.0)
    const cableBay = M.cube([48.0, 26.0, 7.6], true)
        .translate([-11.0, -34.0, bodyH / 2 - 3.75 + 0.05]);

    // Solid cylinder boss in top-left corner of cable bay (at X = -31.0, Y = -21.0)
    const bossR = 4.5;
    const cornerBoss = M.cylinder(bodyH, bossR, bossR, 24, true)
        .translate([-31.0, -21.0, 0]);

    // 4. Direct Wire Notch to 8x8 Matrix (Connects inner pin row to matrix bay)
    const wireNotch = M.cube([10.0, 12.0, 7.0], true)
        .translate([18.0, -21.0, bodyH / 2 - 3.5 + 0.5]);

    // 5. Center Bottom Cable Exit Notch (12mm W through front wall and mounting tab)
    const cableExit = M.cube([12.0, 22.0, bodyH + 2.0], true)
        .translate([0, -56.0, 0]);

    // 6. 2x M3 Screw Pilot Holes in top corners (X = ±31.0mm, Y = -21.0mm)
    const sDia = p.screwHoleDia;
    const s1 = M.cylinder(bodyH + 2, sDia / 2, sDia / 2, 20, true).translate([31.0, -21.0, 0]);
    const s2 = M.cylinder(bodyH + 2, sDia / 2, sDia / 2, 20, true).translate([-31.0, -21.0, 0]);

    return base
        .subtract(espPocket)
        .subtract(lowerPocket)
        .subtract(cableBay)
        .add(cornerBoss)
        .subtract(matrixPocket)
        .subtract(bezelPocket)
        .subtract(matrixHookHole)
        .subtract(wireNotch)
        .subtract(cableExit)
        .subtract(s1).subtract(s2);
}

// -------------------------------------------------------------------------
// 4. FOLLOWER NODE: Full-Width 2.0mm Cover Lid (Hides ESP32, USB-C & Cable Loop)
// -------------------------------------------------------------------------
export function buildFollowerLid(M, p) {
    const lidW = 74.0;                        // 74.0mm wide (covers entire lower bay)
    const lidL = 30.0;                        // 30.0mm (spans Y = -47.0 to -17.0, meets stand cradle lips flush)
    const lidH = 2.0;                         // Slim 2.0mm thickness (10-minute print!)

    let lid = M.cube([lidW, lidL, lidH], true);

    // Tactile Button Access Holes (SuperMini rotated 90°, centered at Y = -32.0)
    const bootHole = M.cylinder(lidH + 4, 1.3, 1.3, 20, true).translate([15.2, 0.0, 0]);
    const resetHole = M.cylinder(lidH + 4, 1.3, 1.3, 20, true).translate([15.2, -5.0, 0]);
    const ledHole = M.cylinder(lidH + 4, 1.2, 1.2, 16, true).translate([17.28, 1.0, 0]);

    // 2x M3 Screws in top corners (X = ±31.0, global Y = -21.0 -> local Y = +11.0)
    const sDia = 3.4;
    const hDia = p.screwHeadDia;
    const makeScrew = (x, y) => {
        const pass = M.cylinder(lidH + 4, sDia / 2, sDia / 2, 24, true).translate([x, y, 0]);
        const head = M.cylinder(1.2, hDia / 2, hDia / 2, 24, true).translate([x, y, lidH / 2 - 0.6]);
        return pass.add(head);
    };

    const s1 = makeScrew(31.0, 11.0);
    const s2 = makeScrew(-31.0, 11.0);

    return lid
        .subtract(bootHole)
        .subtract(resetHole)
        .subtract(ledHole)
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
// 6. FOLLOWER NODE: Triangle-Buttressed Easel Dock with Shoe-Lace Hooks
// -------------------------------------------------------------------------
export function buildFollowerStand(M, p) {
    const baseW = 96.0;   // Overall stance width
    const baseL = 105.0;  // Length from front toe to rear tips
    const deckThick = 4.5;
    const cradleW = 77.0; // Inner pocket width for Follower (76.0mm wide)
    const shelfZ = 12.0;  // Positive bottom shelf height (prevents dropping through!)
    const cradleH = 34.0; // 34.0mm tall cradle cheeks
    const baseH = p.followerBaseThickness || 12.0;

    // Helper for pure, smooth right-triangular prisms (no notches, clean 45° hypotenuse)
    function makeTrianglePrism(sizeX, sizeY, height) {
        const Cx = sizeX / 2 + 20 * Math.SQRT1_2;
        const Cy = sizeY / 2 + 20 * Math.SQRT1_2;
        const cutter = M.cube([40, 40, height + 2], true)
            .rotate([0, 0, 45])
            .translate([Cx, Cy, height / 2]);
        const box = M.cube([sizeX, sizeY, height], true).translate([sizeX / 2, sizeY / 2, height / 2]);
        return box.subtract(cutter);
    }

    // 1. Base Plate with open central wire well
    let base = M.cube([baseW, baseL, deckThick], true).translate([0, 20.0, deckThick / 2]);

    // Cutout between the legs for weight reduction and wire path (X: -32 to +32 open)
    const legCutout = M.cube([baseW - 32.0, baseL - 25.0, deckThick + 2], true).translate([0, 30.0, deckThick / 2]);
    base = base.subtract(legCutout);

    // Front toe cutout
    const toeCutout = M.cube([baseW - 24.0, 18.0, deckThick + 2], true).translate([0, -24.0, deckThick / 2]);
    base = base.subtract(toeCutout);

    // Smooth triangular corner gussets on inner angles of front legs (zero notches, clean 45° face!)
    const triL = makeTrianglePrism(18.0, 18.0, deckThick)
        .scale([1, -1, 1])
        .translate([-36.0, -15.0, 0]);
    const triR = makeTrianglePrism(18.0, 18.0, deckThick)
        .scale([-1, -1, 1])
        .translate([36.0, -15.0, 0]);
    base = base.add(triL).add(triR);

    // 2. Docking Cradle at the front (Y = -5 to +15)
    const cradleBody = M.cube([87.0, 22.0, cradleH], true).translate([0, 3.0, cradleH / 2]);

    // Pocket for Follower base (77.0mm wide x 14.0mm thick, shelf at Z = 12.0mm)
    const pocket = M.cube([cradleW, 14.0, 30.0], true).translate([0, 3.5, shelfZ + 15.0]);

    // Tab slot below shelf: receives the 64mm wide bottom mounting tab (Z = 2.5 to 12.0mm on solid floor)
    const tabSlot = M.cube([65.0, 6.0, shelfZ - 2.5 + 0.1], true).translate([0, 7.0, (shelfZ + 2.5) / 2]);

    // Center wire drop slot: 14mm wide conduit cutting out the back
    const wireSlot = M.cube([14.0, 30.0, cradleH + 5.0], true).translate([0, 10.0, cradleH / 2]);

    // Half-space buttress slice: cuts all material above 45° slope (zero overhangs, zero floating slivers!)
    const buttressSlice = M.cube([200.0, 200.0, 200.0], true)
        .rotate([45, 0, 0])
        .translate([0, 88.71, 88.71]);

    // Front Lid Clearance Window: 36.0mm wide opening completely clearing Follower lid and M3 screws
    const lidWindow = M.cube([36.0, 30.0, cradleH + 10.0], true)
        .translate([0, -10.0, cradleH / 2]);

    // Front Retaining Lip on shoulders: 5mm tall lip above shelf at Z = 17mm
    const shoulderLipCut = M.cube([95.0, 20.0, cradleH], true)
        .translate([0, -13.4, 17.0 + cradleH / 2]);

    let cradle = cradleBody
        .subtract(pocket)
        .subtract(tabSlot)
        .subtract(wireSlot)
        .subtract(buttressSlice)
        .subtract(lidWindow)
        .subtract(shoulderLipCut);

    let stand = base.add(cradle);

    // 3. SHOE-LACING HOOKS ROTATED 180° (Facing OUTWARD to catch winding cable!)
    function makeLaceHook(x, y) {
        const postW = 8.0;
        const postL = 10.0;
        const postH = 14.0;
        let hook = M.cube([postW, postL, postH], true).translate([0, 0, postH / 2]);

        // ROTATED 180°: 45° self-supporting undercut on OUTER face (facing away from center X=0)
        const outerSide = x > 0 ? 1 : -1;
        const vCut = M.cube([6.0, postL + 2.0, 6.0], true)
            .rotate([0, 45, 0])
            .translate([outerSide * postW / 2, 0, 8.0]);
        hook = hook.subtract(vCut);

        // 45° top chamfer on INNER face
        const topChamfer = M.cube([6.0, postL + 2.0, 6.0], true)
            .rotate([0, 45, 0])
            .translate([-outerSide * (postW / 2 + 1.0), 0, postH]);
        hook = hook.subtract(topChamfer);

        return hook.translate([x, y, 0]);
    }

    const hookYPositions = [26.0, 46.0, 66.0];
    const hookX = 39.0;
    hookYPositions.forEach(y => {
        stand = stand.add(makeLaceHook(-hookX, y)).add(makeLaceHook(hookX, y));
    });

    return stand;
}

// -------------------------------------------------------------------------
// 7. ALL-IN-ONE BUILD PLATE (All 6 Parts Arrayed Flat on Bed at Z = 0, Min Gap >= 15.5mm)
// -------------------------------------------------------------------------
export function buildFullPlate(M, p) {
    const baseH = p.followerBaseThickness || 12.0;

    // Left Column:
    // 1. Follower Desk Stand (Bottom at Z = 0, size 96 x 105 x 37 mm, Y: -7.5 to 97.5)
    const stand = buildFollowerStand(M, p).translate([-60.0, 25.0, 0]);

    // 2. Follower 8x8 Diffuser Grid (Flat at Z = 0, size 65.4 x 65.4 x 4.5 mm, Y: -92.7 to -27.3)
    const fGrid = buildFollowerGrid(M, p).translate([-60.0, -60.0, 2.25]);

    // 3. Master Clamp Lid (Inverted flat at Z = 0, size 56 x 48 x 3.0 mm, Y: -159 to -111)
    const mLid = buildMasterLid(M, p).rotate([180, 0, 0]).translate([-60.0, -135.0, 1.5]);

    // Right Column:
    // 4. Follower Base (Flat at Z = 0, size 76 x 123 x 12 mm, Y: -23 to 100)
    const fBase = buildFollowerBase(M, p).translate([55.0, 38.5, baseH / 2]);

    // 5. Master Base (Flat at Z = 0, size 56 x 67 x 22 mm, Y: -105.5 to -38.5)
    const mBase = buildMasterBase(M, p).translate([55.0, -72.0, 11.0]);

    // 6. Follower Cover Lid (Inverted flat at Z = 0, size 74 x 30.0 x 2.0 mm, Y: -155.0 to -125.0)
    const fLid = buildFollowerLid(M, p).rotate([180, 0, 0]).translate([55.0, -140.0, 1.0]);

    let plate = stand.add(fBase).add(fLid).add(fGrid).add(mBase).add(mLid);
    [stand, fBase, fLid, fGrid, mBase, mLid].forEach(m => m.delete());
    return plate;
}


