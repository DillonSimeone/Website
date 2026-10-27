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
// 4b. FOLLOWER NODE: Full-Body Transparent PETG Cover Lid (All-Ramped Printable Geometry)
//     Spans from top wall-tab screws (Y = +56.5) down to bottom wall-tab screws (Y = -56.5),
//     uses smooth angled ramps instead of 90° steps, wraps the sides of the Follower shell,
//     ramps +5mm up over the 8x8 matrix for light diffusion, clamps the ESP32-C3 with
//     45° pyramidal wedges, and matches the middle M3 screws (Y = -21.0).
// -------------------------------------------------------------------------
export function buildFollowerPetgLid(M, p) {
    const cl = p.printClearance;
    const bodyW = 76.0;
    const bodyL = 104.0;
    const bodyH = p.followerBaseThickness || 12.0; // Base spans Z = -6.0 to +6.0
    const wall = 1.2;                             // Slim 1.2mm transparent PETG window thickness
    const sideWall = 1.6;                         // Solid 1.6mm perimeter skirt wall (4 nozzle widths, zero thin-wall gaps!)

    const skirtBottomZ = -bodyH / 2 + 4.5;        // Z = -1.5mm (flush with top surface of mounting tabs)
    const deckInnerZ = bodyH / 2 + 0.15;          // Z = +6.15mm (mates directly over Z = +6.0mm front face)
    const deckOuterZ = deckInnerZ + wall;         // Z = +7.35mm

    const innerW = bodyW + cl * 2;                // 76.70mm
    const innerL = bodyL + cl * 2;                // 104.70mm
    const outerW = innerW + sideWall * 2;         // 79.90mm (wraps left & right flanks with full 1.6mm wall)
    const outerL = innerL + sideWall * 2;         // 107.90mm (wraps top & bottom walls with full 1.6mm wall)

    // Helper: 4-sided rectangular frustum (ramped pyramid box with sloped walls on all 4 sides)
    // Uses uniform XY taper ratio so both X and Y scale cleanly from bottom to top.
    function makeRectFrustum(wBot, lBot, wTop, lTop, h) {
        const rBot = wBot * Math.SQRT1_2;
        const rTop = wTop * Math.SQRT1_2;
        let frustum = M.cylinder(h, rBot, rTop, 4, true).rotate([0, 0, 45]);
        const sy = lBot / wBot;
        if (Math.abs(sy - 1.0) > 1e-3) {
            frustum = frustum.scale([1, sy, 1]);
        }
        return frustum;
    }

    // 1. Lower Vertical Wrap-Around Skirt Cap (Z = -1.50mm to +6.00mm)
    //    Reaches Z = +6.00mm so the wall stays a full 1.60mm thick right up to the top of baseRecess (+6.15mm)
    //    before both the inner and outer walls taper inward together in parallel (zero thin-wall layer skipping!).
    const skirtTopZ = 6.00;
    const lowerSkirtH = skirtTopZ - skirtBottomZ; // 7.50mm vertical skirt
    let cover = M.cube([outerW, outerL, lowerSkirtH], true)
        .translate([0, 0, (skirtBottomZ + skirtTopZ) / 2]);

    // Helper: Asymmetric 4-sided frustum connecting any bottom Y-range [yMinBot, yMaxBot] (width wBot at zBot)
    // to any top Y-range [yMinTop, yMaxTop] (width wTop at zTop) via exact 3D convex hull.
    function makeAsymFrustum(wBot, yMinBot, yMaxBot, wTop, yMinTop, yMaxTop, zBot, zTop) {
        const eps = 0.04;
        const lBot = yMaxBot - yMinBot;
        const yMidBot = (yMinBot + yMaxBot) / 2;
        const lTop = yMaxTop - yMinTop;
        const yMidTop = (yMinTop + yMaxTop) / 2;
        if (typeof M.hull === 'function') {
            const botSlab = M.cube([wBot, lBot, eps], true).translate([0, yMidBot, zBot + eps / 2]);
            const topSlab = M.cube([wTop, lTop, eps], true).translate([0, yMidTop, zTop - eps / 2]);
            const hullSolid = M.hull([botSlab, topSlab]);
            botSlab.delete();
            topSlab.delete();
            return hullSolid;
        }
        const h = zTop - zBot;
        return M.cube([wBot, lBot, h], true).translate([0, yMidBot, (zBot + zTop) / 2]);
    }

    const diffuserRise = 4.2;                     // 4.2mm diffusion air gap above 8x8 matrix
    const hoodInnerZ = deckInnerZ + diffuserRise; // Z = +10.35mm inner ceiling
    const hoodOuterZ = hoodInnerZ + wall;         // Z = +11.55mm outer top face (1.2mm thin window!)
    const outerHoodBaseZ = skirtTopZ - 0.20;      // Z = +5.80mm (overlaps 0.20mm into lower vertical skirt)

    // 2. Full-Width Ramped Top & Bottom Tab Clamping Aprons + Corner Reinforcing Fins
    //    - Keeps full 64.0mm width (X = ±32.0mm) all the way from Z = +0.40mm up to the Z = +11.55mm build plate
    //      so the outer tab corners have zero 90° overhang steps!
    //    - Adds dedicated 4.0mm-wide corner buttress fins along the outer edges (X = ±28.0 to ±32.0mm)
    //      and inner cable-slot edges that anchor directly to the Z = +11.55mm build plate at 35° from vertical!
    const tabW = bodyW - 12.0;        // 64.0mm wide matching base tabs (X = -32.0 to +32.0mm)
    const tabTotalL = 123.0;          // Spans Y = -61.50mm to +61.50mm
    const tabBaseTopZ = 0.60;         // Slim 2.10mm thickness at the outer tip of the tabs
    const tabBaseH = tabBaseTopZ - skirtBottomZ;

    const tabBasePlate = M.cube([tabW, tabTotalL, tabBaseH], true)
        .translate([0, 0, skirtBottomZ + tabBaseH / 2]);
    cover = cover.add(tabBasePlate);

    const tabRampFrustum = makeAsymFrustum(
        tabW, -61.50, 61.50, // Full 64.0mm width at Z = +0.40mm (supports entire tab corner to corner!)
        tabW, -51.15, 51.15, // Full 64.0mm width at Z = +11.55mm (meets build plate plateau flush!)
        tabBaseTopZ - 0.20, hoodOuterZ
    );
    cover = cover.add(tabRampFrustum);

    // Outer Edge Reinforcing Fins at X = ±30.0mm (width 4.0mm, spanning X = ±28.0 to ±32.0mm outside the screw holes)
    const finW = 4.0;
    for (let sx of [-1, 1]) {
        const edgeFin = makeAsymFrustum(
            finW, -61.50, 61.50, // Reaches all the way to the outer tab corners (Y = ±61.50mm)
            finW, -53.50, 53.50, // Anchors on the Z = +11.55mm build plate out to Y = ±53.50mm (35.6° steep fin!)
            tabBaseTopZ - 0.20, hoodOuterZ
        ).translate([sx * (tabW / 2 - finW / 2), 0, 0]);
        cover = cover.add(edgeFin);
    }

    // Inner Bottom-Tab Reinforcing Fins next to the 12mm USB-C slot (X = ±7.8mm, width 3.2mm)
    const innerFinW = 3.2;
    for (let sx of [-1, 1]) {
        const innerFin = makeAsymFrustum(
            innerFinW, -61.50, -50.00,
            innerFinW, -53.50, -50.00,
            tabBaseTopZ - 0.20, hoodOuterZ
        ).translate([sx * (6.2 + innerFinW / 2), 0, 0]);
        cover = cover.add(innerFin);
    }

    // 3. Parallel-Walled Sloped Upper Shell + Diffuser Hood (Z = +5.80mm to +11.55mm)
    //    - Both outer and inner frustums start tapering at Z = +5.80mm, maintaining a constant 1.60mm
    //      horizontal wall thickness at every single Z layer (zero thin-wall pinch!).
    //    - 26.0° overhang angle from vertical on all 4 edges for 100% support-free face-down printing!

    const matrixHoodOuter = makeAsymFrustum(
        outerW, -53.95, 53.95, // Base at Z = +5.80mm (79.90mm x 107.90mm, flush with vertical skirt!)
        74.30, -51.15, 51.15,  // Full-length top plateau at Z = +11.55mm (26.0° slope on all 4 edges!)
        outerHoodBaseZ, hoodOuterZ
    );
    cover = cover.add(matrixHoodOuter);

    // Subtract inner Follower Base body recess so skirts & end walls mate closely around the 76x104mm shell
    const baseRecessH = deckInnerZ - skirtBottomZ + 2.0;
    const baseRecess = M.cube([innerW, innerL, baseRecessH], true)
        .translate([0, 0, deckInnerZ - baseRecessH / 2]);
    cover = cover.subtract(baseRecess);

    // Hollow out the upper chamber starting at Z = +6.00mm in parallel with matrixHoodOuter
    // Maintains a full >=1.60mm wall thickness across the Z = +6.15mm transition!
    const innerRampBaseZ = deckInnerZ - 0.15; // Z = +6.00mm
    const matrixHoodInner = makeAsymFrustum(
        innerW, -52.35, 52.35, // 76.70mm x 104.70mm at Z = +6.00mm (1.60mm inside outer wall!)
        70.70, -49.35, 49.35,  // 70.70mm x 98.70mm at Z = +10.35mm (1.80mm inside outer sloped wall!)
        innerRampBaseZ, hoodInnerZ
    );
    cover = cover.subtract(matrixHoodInner);

    // Solid M3 Screw Bosses at X = ±31.0mm, Y = -21.0mm (reaches from Z = +6.15mm base seat up into Z = +10.35mm ceiling)
    const m3BossBottomZ = deckInnerZ;     // Z = +6.15mm (rests flat on Follower Base M3 bosses)
    const m3BossTopZ = hoodInnerZ + 0.30; // Z = +10.65mm (fuses into 1.2mm ceiling)
    const m3BossH = m3BossTopZ - m3BossBottomZ;
    for (let x of [-31.0, 31.0]) {
        const m3Boss = M.cylinder(m3BossH, 4.2, 4.4, 24, true)
            .translate([x, -21.0, (m3BossBottomZ + m3BossTopZ) / 2]);
        cover = cover.add(m3Boss);
    }

    // 4. Steep Self-Supporting ESP32-C3 Clamping Pillars (Positioned at X = +24.8mm & +34.4mm, completely clear of the button window!)
    const espL = 22.52 + cl * 2;
    const espW = 18.0 + cl * 2;
    const espX = 36.0 - espL / 2; // 24.39mm
    const espY = -34.5;
    const studTipW = 2.2;
    const studBottomZ = 3.40;             // Sits right over the 1.2mm ESP32 PCB on its Z = +2.0mm shelf
    const studTopZ = hoodInnerZ + 0.30;   // Z = +10.65mm (fuses into ceiling)
    const studH = studTopZ - studBottomZ;
    const studBaseW = 3.6;
    for (let px of [24.8, 34.4]) {
        for (let dy of [-espW / 2 + studTipW / 2 + 0.4, espW / 2 - studTipW / 2 - 0.4]) {
            const wedge = makeRectFrustum(studTipW, studTipW, studBaseW, studBaseW, studH)
                .translate([px, espY + dy, (studBottomZ + studTopZ) / 2]);
            cover = cover.add(wedge);
        }
    }

    // Slim Self-Supporting Cable Hold-Down Fin over left cable bay (reaches from Z = +10.65mm ceiling down to Z = +4.65mm)
    const ribBottomZ = deckInnerZ - 1.5; // Z = +4.65mm
    const ribTopZ = hoodInnerZ + 0.30;   // Z = +10.65mm
    const ribH = ribTopZ - ribBottomZ;
    const cableHoldWedge = makeRectFrustum(12.0, 2.4, 15.0, 4.2, ribH)
        .translate([-11.0, -34.0, (ribBottomZ + ribTopZ) / 2]);
    cover = cover.add(cableHoldWedge);

    // 5. Clean Rectangular Cutout Window over ESP32-C3 (Exposes BOOT Button, RESET Button, Red LED & Blue LED!)
    //    Spans X = +13.8mm to +22.8mm, Y = -40.3mm to -28.7mm (completely clear of all 4 clamping pillars!).
    const espWindow = M.cube([9.0, 11.6, 20.0], true)
        .translate([18.3, espY, hoodOuterZ]);
    cover = cover.subtract(espWindow);

    // 6. Center Bottom USB-C Cable Exit Tunnel with 45° Gabled Arch Roof (Leaves solid bridge at Z = +5.6..+8.15mm!)
    const cableTabCut = M.cube([12.4, 9.0, 12.0], true)
        .translate([0, -58.85, skirtBottomZ + 4.0]);
    const archW = 12.0;
    const archWallH = 3.2; // Side walls from Z = -1.5mm to Z = +1.7mm, then 45° peak up to Z = +5.3mm
    const cableRectTunnel = M.cube([archW, 14.0, archWallH + 1.0], true)
        .translate([0, -53.5, skirtBottomZ + (archWallH - 1.0) / 2]);
    const gableSide = archW * Math.SQRT1_2;
    const cableGableRoof = M.cube([gableSide, 14.0, gableSide], true)
        .rotate([0, 45, 0])
        .translate([0, -53.5, skirtBottomZ + archWallH - 2.4]);
    cover = cover.subtract(cableTabCut).subtract(cableRectTunnel).subtract(cableGableRoof);

    // 7. Matching Screw Holes (with Face-Down Self-Supporting Conical Counterbore Seats!):
    //    - 2x Middle M3 Screws at X = ±31.0mm, Y = -21.0mm (unchanged M3 locations)
    //    - 2x Top Tab Screws at X = ±24.0mm, Y = +56.5mm
    //    - 2x Bottom Tab Screws at X = ±24.0mm, Y = -56.5mm
    const m3PassDia = 3.4;
    const m3HeadDia = p.screwHeadDia;
    const m3ConeH = (m3HeadDia - m3PassDia) * 1.25; // <22° overhang cone when printed face-down!
    const m3SeatZ = deckInnerZ + 1.2;               // Z = +7.35mm
    for (let x of [-31.0, 31.0]) {
        const pass = M.cylinder(30.0, m3PassDia / 2, m3PassDia / 2, 24, true)
            .translate([x, -21.0, 5.0]);
        const cone = M.cylinder(m3ConeH, m3PassDia / 2, m3HeadDia / 2, 24, true)
            .translate([x, -21.0, m3SeatZ + m3ConeH / 2]);
        const head = M.cylinder(12.0, m3HeadDia / 2, m3HeadDia / 2, 24, true)
            .translate([x, -21.0, m3SeatZ + m3ConeH + 6.0 - 0.05]);
        cover = cover.subtract(pass).subtract(cone).subtract(head);
    }

    const tabScrewDia = p.wallTabScrewDia;
    const tabCbDia = p.wallTabCounterbore;
    const tabConeH = (tabCbDia - tabScrewDia) * 0.85; // <30° overhang cone when printed face-down!
    const tabSeatZ = skirtBottomZ + 1.2;              // Z = -0.30mm (1.2mm clamping seat)
    for (let y of [56.5, -56.5]) {
        for (let x of [-24.0, 24.0]) {
            const pass = M.cylinder(20.0, tabScrewDia / 2, tabScrewDia / 2, 24, true)
                .translate([x, y, skirtBottomZ]);
            const cone = M.cylinder(tabConeH, tabScrewDia / 2, tabCbDia / 2, 24, true)
                .translate([x, y, tabSeatZ + tabConeH / 2]);
            const cb = M.cylinder(12.0, tabCbDia / 2, tabCbDia / 2, 24, true)
                .translate([x, y, tabSeatZ + tabConeH + 6.0 - 0.05]);
            cover = cover.subtract(pass).subtract(cone).subtract(cb);
        }
    }

    return cover;
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
    const cradleW = 81.5; // Inner pocket width for Follower + PETG Cover (80.7mm wide)
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

    // Pocket for Follower base + PETG cover (81.5mm wide x 16.4mm thick, rear wall at Y = +10.5, shelf at Z = 12.0mm)
    const pocket = M.cube([cradleW, 16.4, 30.0], true).translate([0, 2.3, shelfZ + 15.0]);

    // Tab slot below shelf: receives the 64mm wide bottom mounting tab + PETG tab flange (Z = 2.5 to 12.0mm on solid floor)
    const tabSlot = M.cube([65.0, 8.6, shelfZ - 2.5 + 0.1], true).translate([0, 5.7, (shelfZ + 2.5) / 2]);

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

    // 7. Follower Full-Body PETG Cover (Flat on perimeter rim at Z = 0, size 80.7 x 123 x 14.65 mm)
    const fPetg = buildFollowerPetgLid(M, p).translate([155.0, 38.5, 1.5]);

    let plate = stand.add(fBase).add(fLid).add(fPetg).add(fGrid).add(mBase).add(mLid);
    [stand, fBase, fLid, fPetg, fGrid, mBase, mLid].forEach(m => m.delete());
    return plate;
}


