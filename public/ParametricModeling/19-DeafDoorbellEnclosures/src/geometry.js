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
// 1. MASTER (LEADER) NODE: Compact Vertical Inline Base Chassis
//    - Houses stacked ESP32-C3 + MAX4466 block (20mm W x 24mm L x 21mm H)
//      with MAX4466 mic facing DOWN toward floor and ESP32 PCB at top of pocket.
//    - Inline internal cavity below ESP32 for the full 20mm USB-C plug head,
//      followed by a serpentine S-curve strain-relief channel exiting the bottom.
// -------------------------------------------------------------------------
export function buildMasterBase(M, p) {
    const cl = p.printClearance;
    const bodyW = 38.0; // Compact 38mm width (down from 56mm side-by-side layout!)
    const bodyL = 62.0; // 62mm inline length (24mm stacked block + 22mm USB-C plug + strain relief)
    const bodyH = 23.5; // 23.5mm height (21.2mm pocket depth + 2.3mm acoustic floor)
    const tabL = 10.0;
    const tabThick = 4.5;

    let base = M.cube([bodyW, bodyL, bodyH], true);

    // External Top and Bottom Mounting Tabs (Drywall screw ears, holes at X = ±13.0mm)
    const tabW = 34.0;
    const topTab = makeMountingTab(M, tabW, tabL, tabThick, p.wallTabScrewDia, p.wallTabCounterbore, true, 26.0)
        .translate([0, bodyL / 2 + tabL / 2 - 0.5, -bodyH / 2 + tabThick / 2]);
    const botTab = makeMountingTab(M, tabW, tabL, tabThick, p.wallTabScrewDia, p.wallTabCounterbore, true, 26.0)
        .translate([0, -bodyL / 2 - tabL / 2 + 0.5, -bodyH / 2 + tabThick / 2]);
    base = base.add(topTab).add(botTab);

    // 1. Stacked ESP32-C3 + MAX4466 Block Pocket (20mm x 24mm x 21mm + clearance)
    //    - Centered at X = 0, Y = +14.65mm (spans Y = +2.30mm to +27.00mm, leaving 4.0mm top wall)
    //    - Depth = 21.20mm from top rim (Z = +11.75mm down to floor at Z = -9.45mm)
    //    - Mic faces DOWN against the Z = -9.45mm floor; ESP32 PCB sits at top with USB-C facing -Y!
    const blockW = 20.0 + cl * 2; // 20.70mm
    const blockL = 24.0 + cl * 2; // 24.70mm
    const blockH = 21.20;         // 21.0mm block height + 0.20mm clearance
    const blockY = 14.65;         // Spans Y = +2.30mm to +27.00mm
    const blockPocket = M.cube([blockW, blockL, blockH + 0.1], true)
        .translate([0, blockY, bodyH / 2 - blockH / 2 + 0.05]);

    // 2. Floor Acoustic Horn + 6-Hole Hex Sound Array (Directly under downward-facing MAX4466 mic)
    //    Ensures unobstructed sound capture anywhere under the 20x24mm block!
    const hornDia = p.acousticHornDia || 4.5;
    const micCenterHole = M.cylinder(bodyH + 2, hornDia / 2, hornDia / 2, 24, true)
        .translate([0, blockY, 0]);
    const micHornCone = M.cylinder(2.4, (hornDia + 4.0) / 2, hornDia / 2, 24, true)
        .translate([0, blockY, -bodyH / 2 + 1.2]);

    // Rear Bottom Acoustic Sound Channels (1.6mm deep grooves from bottom face out to left/right edges
    // so sound reaches the bottom acoustic port even when screwed flat against drywall!)
    const rearSoundCrossSlot = M.cube([bodyW + 2.0, 8.0, 1.6], true)
        .translate([0, blockY, -bodyH / 2 + 0.8]);

    // 3. Internal USB-C Plug Head Bay (Directly below ESP32 at Y = -19.70mm to +2.30mm)
    //    Houses the full 11mm W x 7mm H x 20mm L USB-C plug head inside the enclosure!
    const plugBayW = 13.0;
    const plugBayL = 22.5; // Spans Y = -19.70mm to +2.80mm (overlaps 0.5mm into ESP32 pocket)
    const plugBayH = 9.0;  // 9.0mm deep from top rim (clears 7mm plug head + lid channel)
    const plugBayY = -8.45;
    const usbPlugBay = M.cube([plugBayW, plugBayL, plugBayH + 0.1], true)
        .translate([0, plugBayY, bodyH / 2 - plugBayH / 2 + 0.05]);

    // Weight-saving hollow under the USB-C plug bay (leaves a 2.5mm shelf supporting the USB-C plug)
    const underPlugHollow = M.cube([16.0, 18.0, 9.0], true)
        .translate([0, -8.5, -2.5]);

    // 4. Serpentine S-Curve USB-C Cable Strain-Relief Bay (Y = -31.0mm to -18.5mm)
    //    Weaves the 4.0mm USB-C cable around 3 staggered rounded grippers before exiting the bottom!
    const srBayW = 11.0;
    const srBayL = 13.5; // Spans Y = -31.5mm to -18.0mm
    const srBayH = 7.5;  // 7.5mm deep from top rim
    const srBayY = -24.75;
    const srBay = M.cube([srBayW, srBayL, srBayH + 0.1], true)
        .translate([0, srBayY, bodyH / 2 - srBayH / 2 + 0.05]);

    // Center Bottom Cable Exit Slot through bottom wall and mounting tab (5.0mm wide for 4.0mm cable jacket)
    const cableExitW = (p.cableJacketDia || 4.0) + 1.0; // 5.0mm
    const cableExitSlot = M.cube([cableExitW, 14.0, srBayH + 0.1], true)
        .translate([0, -35.0, bodyH / 2 - srBayH / 2 + 0.05]);
    // Full-depth notch through the protruding bottom mounting tab (Y = -31.0 to -41.0mm)
    const tabCableNotch = M.cube([cableExitW + 1.0, 12.0, bodyH + 2.0], true)
        .translate([0, -36.5, 0]);

    // 5. Four Corner M3 Screw Holes at X = ±15.0mm, Y = ±26.5mm
    const sDia = p.screwHoleDia;
    const sx = bodyW / 2 - 4.0; // 15.0mm
    const sy = bodyL / 2 - 4.5; // 26.5mm
    const s1 = M.cylinder(bodyH + 2, sDia / 2, sDia / 2, 20, true).translate([-sx, sy, 0]);
    const s2 = M.cylinder(bodyH + 2, sDia / 2, sDia / 2, 20, true).translate([sx, sy, 0]);
    const s3 = M.cylinder(bodyH + 2, sDia / 2, sDia / 2, 20, true).translate([-sx, -sy, 0]);
    const s4 = M.cylinder(bodyH + 2, sDia / 2, sDia / 2, 20, true).translate([sx, -sy, 0]);

    base = base
        .subtract(blockPocket)
        .subtract(micCenterHole)
        .subtract(micHornCone)
        .subtract(rearSoundCrossSlot)
        .subtract(usbPlugBay)
        .subtract(underPlugHollow)
        .subtract(srBay)
        .subtract(cableExitSlot)
        .subtract(tabCableNotch)
        .subtract(s1).subtract(s2).subtract(s3).subtract(s4);

    // Add 3 Staggered Serpentine Strain-Relief Gripper Pillars inside srBay
    // Forces the 4mm USB-C cable into a gentle S-curve that locks against pull-out forces!
    const postR = 2.4;
    const postZ = bodyH / 2 - srBayH / 2;
    const srPost1 = M.cylinder(srBayH, postR, postR, 20, true).translate([-3.1, -20.5, postZ]);
    const srPost2 = M.cylinder(srBayH, postR, postR, 20, true).translate([3.1, -24.5, postZ]);
    const srPost3 = M.cylinder(srBayH, postR, postR, 20, true).translate([-3.1, -28.5, postZ]);
    base = base.add(srPost1).add(srPost2).add(srPost3);

    // 6. Six-Hole Hex Acoustic Array in Pocket Floor around Central Horn
    for (let dy of [-6.5, 6.5]) {
        for (let dx of [-5.5, 0, 5.5]) {
            base = base.subtract(
                M.cylinder(bodyH + 2, 2.0, 2.0, 6, true).translate([dx, blockY + dy, 0])
            );
        }
    }

    // 7. Support-Free 45° Diamond Side Acoustic Vents feeding directly into the lower MAX4466 chamber
    for (let dy of [-6.0, 0, 6.0]) {
        base = base.subtract(M.cube([10.0, 3.2, 3.2], true).rotate([45, 0, 0]).translate([-bodyW / 2, blockY + dy, -5.5]));
        base = base.subtract(M.cube([10.0, 3.2, 3.2], true).rotate([45, 0, 0]).translate([bodyW / 2, blockY + dy, -5.5]));
    }

    // 8. Outer 45° Bottom Flank Bevels
    base = base.subtract(M.cube([5.0, bodyL + 10, 5.0], true).rotate([0, 45, 0]).translate([-bodyW / 2, 0, -bodyH / 2]))
               .subtract(M.cube([5.0, bodyL + 10, 5.0], true).rotate([0, 45, 0]).translate([bodyW / 2, 0, -bodyH / 2]));

    return base;
}

// -------------------------------------------------------------------------
// 2. MASTER (LEADER) NODE: Compact Clamping Lid (38 x 62 x 2.8mm)
//    - Clamps the 20x24x21mm ESP32+MAX4466 block and locks the USB-C cable
//      into the serpentine strain-relief channel.
//    - Features a clean rectangular cutout window exposing BOOT, RESET,
//      Blue LED & Red LED on top of the ESP32-C3.
// -------------------------------------------------------------------------
export function buildMasterLid(M, p) {
    const bodyW = 38.0;
    const bodyL = 62.0;
    const lidH = 2.8;
    const cl = p.printClearance;
    const blockW = 20.0 + cl * 2;
    const blockL = 24.0 + cl * 2;
    const blockY = 14.65;

    let lid = M.cube([bodyW, bodyL, lidH], true);

    // 1. Four Corner Clamping Pads for the 20x24x21mm ESP32+MAX4466 Block
    const studW = 2.4;
    const studH = 0.6;
    for (let dx of [-blockW / 2 + studW / 2 + 0.2, blockW / 2 - studW / 2 - 0.2]) {
        for (let dy of [-blockL / 2 + studW / 2 + 0.2, blockL / 2 - studW / 2 - 0.2]) {
            const stud = M.cube([studW, studW, studH], true)
                .translate([dx, blockY + dy, -lidH / 2 - studH / 2]);
            lid = lid.add(stud);
        }
    }

    // 2. Strain-Relief Cable Hold-Down Bar (Presses down into serpentine bay at Y = -30.0 to -19.0mm
    //    so the 4.0mm USB-C cable stays locked between the S-curve posts)
    const srHoldBar = M.cube([3.2, 11.0, 1.8], true)
        .translate([0, -24.5, -lidH / 2 - 0.9]);
    lid = lid.add(srHoldBar);

    // 3. Upper USB-C Plug Relief Channel (13.0mm W x 1.0mm D over plug bay at Y = -19.0 to +2.5mm)
    const plugRelief = M.cube([13.0, 21.5, 1.0], true)
        .translate([0, -8.25, -lidH / 2 + 0.5]);

    // 4. Clean Rectangular Cutout Window over ESP32-C3 (Exposes BOOT, RESET, Blue LED & Red LED!)
    //    Located near the -Y (USB-C) end of the 20x24mm ESP32 block (Y = +4.0mm to +13.0mm).
    const espWindow = M.cube([11.6, 9.0, lidH + 4.0], true)
        .translate([0, 8.5, 0]);

    // 5. Front Acoustic & Thermal Vent Slots over upper half of ESP32/MAX4466 chamber
    for (let y of [17.0, 20.5, 24.0]) {
        const vent = M.cube([12.0, 1.8, lidH + 4.0], true).translate([0, y, 0]);
        lid = lid.subtract(vent);
    }

    // 6. Four M3 Counterbored Through-Holes at X = ±15.0mm, Y = ±26.5mm
    const sDia = 3.4;
    const hDia = p.screwHeadDia;
    const sx = bodyW / 2 - 4.0; // 15.0mm
    const sy = bodyL / 2 - 4.5; // 26.5mm
    const makeScrew = (x, y) => {
        const pass = M.cylinder(lidH + 4, sDia / 2, sDia / 2, 24, true).translate([x, y, 0]);
        const head = M.cylinder(1.5, hDia / 2, hDia / 2, 24, true).translate([x, y, lidH / 2 - 0.75]);
        return pass.add(head);
    };

    const s1 = makeScrew(-sx, sy);
    const s2 = makeScrew(sx, sy);
    const s3 = makeScrew(-sx, -sy);
    const s4 = makeScrew(sx, -sy);

    return lid
        .subtract(plugRelief)
        .subtract(espWindow)
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

    // Helper: General 3D frustum connecting any bottom rectangle [xMinBot..xMaxBot, yMinBot..yMaxBot] at zBot
    // to any top rectangle [xMinTop..xMaxTop, yMinTop..yMaxTop] at zTop via exact 3D convex hull.
    function makeXYFrustum(xMinBot, xMaxBot, yMinBot, yMaxBot, xMinTop, xMaxTop, yMinTop, yMaxTop, zBot, zTop) {
        const eps = 0.04;
        const wBot = xMaxBot - xMinBot;
        const xMidBot = (xMinBot + xMaxBot) / 2;
        const lBot = yMaxBot - yMinBot;
        const yMidBot = (yMinBot + yMaxBot) / 2;
        const wTop = xMaxTop - xMinTop;
        const xMidTop = (xMinTop + xMaxTop) / 2;
        const lTop = yMaxTop - yMinTop;
        const yMidTop = (yMinTop + yMaxTop) / 2;
        if (typeof M.hull === 'function') {
            const botSlab = M.cube([wBot, lBot, eps], true).translate([xMidBot, yMidBot, zBot + eps / 2]);
            const topSlab = M.cube([wTop, lTop, eps], true).translate([xMidTop, yMidTop, zTop - eps / 2]);
            const hullSolid = M.hull([botSlab, topSlab]);
            botSlab.delete();
            topSlab.delete();
            return hullSolid;
        }
        const h = zTop - zBot;
        return M.cube([wBot, lBot, h], true).translate([xMidBot, yMidBot, (zBot + zTop) / 2]);
    }

    function makeAsymFrustum(wBot, yMinBot, yMaxBot, wTop, yMinTop, yMaxTop, zBot, zTop) {
        return makeXYFrustum(-wBot / 2, wBot / 2, yMinBot, yMaxBot, -wTop / 2, wTop / 2, yMinTop, yMaxTop, zBot, zTop);
    }

    const diffuserRise = 4.2;                     // 4.2mm diffusion air gap above 8x8 matrix
    const hoodInnerZ = deckInnerZ + diffuserRise; // Z = +10.35mm inner ceiling
    const hoodOuterZ = hoodInnerZ + wall;         // Z = +11.55mm outer top face (1.2mm thin window!)
    const outerHoodBaseZ = skirtTopZ - 0.20;      // Z = +5.80mm (overlaps 0.20mm into lower vertical skirt)

    // 2. Bed-Touching Drywall Tab Fins ("Straight out to the bed, then down across the screw sides")
    //    - Both the outer fins (X = ±28.4..±32.0mm) and inner fins (X = ±6.2..±16.0mm on bottom,
    //      X = -16.0..+16.0mm on top) touch the Z = +11.55mm build plate all the way out to Y = ±61.50mm!
    //    - From those flat-on-bed fin crests, the walls slope inward in X across both sides of the
    //      X = ±24.0mm drywall screw counterbores down to the Z = +0.60mm clamping plate!
    const tabW = bodyW - 12.0;        // 64.0mm wide matching base tabs (X = -32.0 to +32.0mm)
    const tabTotalL = 123.0;          // Spans Y = -61.50mm to +61.50mm
    const tabBaseTopZ = 0.60;         // 2.10mm clamping plate thickness around the drywall screw seats
    const tabBaseH = tabBaseTopZ - skirtBottomZ;

    const tabBasePlate = M.cube([tabW, tabTotalL, tabBaseH], true)
        .translate([0, 0, skirtBottomZ + tabBaseH / 2]);
    cover = cover.add(tabBasePlate);

    // Back-of-tab Y-ramp behind the screw holes (ramps from Y = ±51.15mm on bed to Y = ±57.50mm at Z = +0.40mm)
    const tabBackRamp = makeAsymFrustum(
        tabW, -57.50, 57.50,
        tabW, -51.15, 51.15,
        tabBaseTopZ - 0.20, hoodOuterZ
    );
    cover = cover.add(tabBackRamp);

    // Outer Edge Fins: Go STRAIGHT OUT on the print bed (Z = +11.55mm) all the way to Y = ±61.50mm
    // along X = ±28.4..±32.0mm, then ramp DOWN ACROSS THE SCREW SIDES in X to X = ±22.5mm at Z = +0.40mm!
    for (let sx of [-1, 1]) {
        const xOut = sx * 32.0;
        const xBedIn = sx * 28.4; // 3.6mm flat footprint on the bed outside the X = ±24.0mm screw counterbore
        const xBaseIn = sx * 22.0; // Slopes across the screw side down to X = ±22.0mm at the clamping plate
        const outerFin = makeXYFrustum(
            Math.min(xOut, xBaseIn), Math.max(xOut, xBaseIn), -61.50, 61.50,
            Math.min(xOut, xBedIn), Math.max(xOut, xBedIn), -61.50, 61.50,
            tabBaseTopZ - 0.20, hoodOuterZ
        );
        cover = cover.add(outerFin);
    }

    // Top-Tab Center Fin: Goes STRAIGHT OUT on the print bed (Z = +11.55mm) to Y = +61.50mm
    // across X = -16.0..+16.0mm, then ramps DOWN ACROSS THE INNER SCREW SIDES in X to X = ±22.5mm!
    const topCenterFin = makeXYFrustum(
        -22.5, 22.5, 50.00, 61.50,
        -16.0, 16.0, 50.00, 61.50,
        tabBaseTopZ - 0.20, hoodOuterZ
    );
    cover = cover.add(topCenterFin);

    // Bottom-Tab Inner Fins (flanking the 12.4mm USB-C slot): Go STRAIGHT OUT on the print bed (Z = +11.55mm)
    // to Y = -61.50mm across X = ±6.2..±16.0mm, then ramp DOWN ACROSS THE INNER SCREW SIDES in X to X = ±22.5mm!
    for (let sx of [-1, 1]) {
        const xSlot = sx * 6.2;
        const xBedOut = sx * 16.0;
        const xBaseOut = sx * 22.5;
        const botInnerFin = makeXYFrustum(
            Math.min(xSlot, xBaseOut), Math.max(xSlot, xBaseOut), -61.50, -50.00,
            Math.min(xSlot, xBedOut), Math.max(xSlot, xBedOut), -61.50, -50.00,
            tabBaseTopZ - 0.20, hoodOuterZ
        );
        cover = cover.add(botInnerFin);
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
        const m3Boss = M.cylinder(m3BossH, 4.4, 4.6, 24, true)
            .translate([x, -21.0, (m3BossBottomZ + m3BossTopZ) / 2]);
        cover = cover.add(m3Boss);
    }

    // 4. Steep Self-Supporting ESP32-C3 Clamping Pillars
    //    Moved to X = +27.5mm & +34.2mm so there is a full 2.9mm solid margin from the X = +22.8mm edge
    //    of the rectangular button window (eliminates thin-wall merging/stringing at the window corners!).
    const espL = 22.52 + cl * 2;
    const espW = 18.0 + cl * 2;
    const espX = 36.0 - espL / 2; // 24.39mm
    const espY = -34.5;
    const studTipW = 2.2;
    const studBottomZ = 3.40;             // Sits right over the 1.2mm ESP32 PCB on its Z = +2.0mm shelf
    const studTopZ = hoodInnerZ + 0.30;   // Z = +10.65mm (fuses into ceiling)
    const studH = studTopZ - studBottomZ;
    const studBaseW = 3.4;
    for (let px of [27.5, 34.2]) {
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
    //    Spans X = +13.8mm to +22.8mm, Y = -40.3mm to -28.7mm (2.9mm clear of all clamping pillars!).
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

    // 7. Matching Screw Holes with 2-Stage Sequential Straight-Line Bridge Counterbores!
    //    When printed face-down (Z = +11.55mm on bed), instead of printing a circular ring in mid-air,
    //    each counterbore transitions via 2 straight-line bridge layers (slot -> square -> circle)
    //    so zero filament strings across the screw holes!
    const m3PassDia = 3.4;
    const m3HeadDia = p.screwHeadDia; // 5.8mm
    const m3BridgeZ = deckInnerZ + 1.8; // Z = +7.95mm (leaves 1.8mm solid M3 clamping boss below counterbore)
    for (let x of [-31.0, 31.0]) {
        const pass = M.cylinder(30.0, m3PassDia / 2, m3PassDia / 2, 24, true)
            .translate([x, -21.0, 5.0]);
        const head = M.cylinder(10.0, m3HeadDia / 2, m3HeadDia / 2, 24, true)
            .translate([x, -21.0, m3BridgeZ + 5.0]);
        // Stage 1 bridge (2 layers = 0.4mm): straight parallel bridge chords along Y
        const bridgeSlot = M.cube([m3PassDia, m3HeadDia, 0.44], true)
            .translate([x, -21.0, m3BridgeZ - 0.20]);
        // Stage 2 bridge (2 layers = 0.4mm): perpendicular straight bridge chords forming square
        const bridgeSq = M.cube([m3PassDia, m3PassDia, 0.44], true)
            .translate([x, -21.0, m3BridgeZ - 0.60]);
        cover = cover.subtract(pass).subtract(head).subtract(bridgeSlot).subtract(bridgeSq);
    }

    const tabScrewDia = p.wallTabScrewDia; // 4.2mm
    const tabCbDia = p.wallTabCounterbore; // 7.6mm
    const tabSeatZ = skirtBottomZ + 1.4;   // Z = -0.10mm (1.4mm solid clamping seat)
    for (let y of [56.5, -56.5]) {
        for (let x of [-24.0, 24.0]) {
            const pass = M.cylinder(24.0, tabScrewDia / 2, tabScrewDia / 2, 24, true)
                .translate([x, y, 2.0]);
            const cb = M.cylinder(20.0, tabCbDia / 2, tabCbDia / 2, 24, true)
                .translate([x, y, tabSeatZ + 10.0]);
            // Stage 1 sequential straight-line bridge slot across counterbore
            const bridgeSlot = M.cube([tabScrewDia, tabCbDia, 0.44], true)
                .translate([x, y, tabSeatZ - 0.20]);
            // Stage 2 perpendicular bridge square
            const bridgeSq = M.cube([tabScrewDia, tabScrewDia, 0.44], true)
                .translate([x, y, tabSeatZ - 0.60]);
            cover = cover.subtract(pass).subtract(cb).subtract(bridgeSlot).subtract(bridgeSq);
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

    // Tab slot below shelf: receives the 64mm wide bottom mounting tab + full-height PETG tab fins (Z = 2.5 to 12.0mm on solid floor)
    const tabSlot = M.cube([65.0, 16.4, shelfZ - 2.5 + 0.1], true).translate([0, 2.3, (shelfZ + 2.5) / 2]);

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

    // 3. Master Clamp Lid (Inverted flat at Z = 0, size 38 x 62 x 2.8 mm)
    const mLid = buildMasterLid(M, p).rotate([180, 0, 0]).translate([-60.0, -135.0, 1.4]);

    // Right Column:
    // 4. Follower Base (Flat at Z = 0, size 76 x 123 x 12 mm, Y: -23 to 100)
    const fBase = buildFollowerBase(M, p).translate([55.0, 38.5, baseH / 2]);

    // 5. Master Base (Flat at Z = 0, size 38 x 81 x 23.5 mm)
    const mBase = buildMasterBase(M, p).translate([55.0, -72.0, 23.5 / 2]);

    // 6. Follower Cover Lid (Inverted flat at Z = 0, size 74 x 30.0 x 2.0 mm, Y: -155.0 to -125.0)
    const fLid = buildFollowerLid(M, p).rotate([180, 0, 0]).translate([55.0, -140.0, 1.0]);

    // 7. Follower Full-Body PETG Cover (Flat on perimeter rim at Z = 0, size 80.7 x 123 x 14.65 mm)
    const fPetg = buildFollowerPetgLid(M, p).translate([155.0, 38.5, 1.5]);

    let plate = stand.add(fBase).add(fLid).add(fPetg).add(fGrid).add(mBase).add(mLid);
    [stand, fBase, fLid, fPetg, fGrid, mBase, mLid].forEach(m => m.delete());
    return plate;
}


