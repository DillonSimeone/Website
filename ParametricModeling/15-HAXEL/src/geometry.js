// Geometry module for HAXEL Dense Electronics Enclosure
// Generates: Shell (bottom box), Lid (top), Sled (open tray), Motor Clamp, component ghosts
//
// COORDINATE SYSTEM (Manifold, Z-up in CAD space):
//   X = width (left/right)
//   Y = depth (front/back) — motor shaft exits -Y (back), USB ports face +Y (front)
//   Z = height (bottom/top) — components drop into sled from above
//
// Motor orientation: shaft axis runs along Y. Body sits with flat side (H) facing up.
import * as THREE from 'three';
import { context, params } from './state.js';

// ─── Manifold Helpers ────────────────────────────────────────────────────────

function box(w, d, h) {
    return context.Manifold.cube([w, d, h], true);
}

function cyl(r, h, facets = 32) {
    return context.Manifold.cylinder(h, r, r, facets, true);
}

/** Convert a Manifold model to Three.js BufferGeometry */
export function manifoldToThree(model) {
    const mesh = model.getMesh();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.vertProperties, 3));
    geometry.setIndex(new THREE.Uint32BufferAttribute(mesh.triVerts, 1));
    geometry.computeVertexNormals();
    return geometry;
}

// ─── Layout Calculator ───────────────────────────────────────────────────────

/**
 * Computes the internal cavity dimensions and component positions.
 *
 * Packing strategy (2-layer stack, components drop in from top):
 *   - Bottom layer: Motor (left, shaft along Y axis) + Battery (right)
 *   - Top layer:    L298N (left) + ESP32 (center) + TP4056 (right)
 *   - USB ports (ESP32 + TP4056) face +Y "front" wall
 *   - Motor shaft exits -Y "back" wall
 */
export function computeLayout() {
    const p = params;
    const tol = p.pocketTolerance;
    const gap = 1.0; // mm gap between components

    // Motor occupies: W=motorW, D=motorL (shaft axis = Y), H=motorH
    // Bottom layer height = max(motorH, batH)
    const bottomH = Math.max(p.motorH, p.batH);
    // Top layer height = max(L298N, ESP32, TP4056)
    const topH = Math.max(p.l298H, p.espH, p.tpH);
    // Floor thickness between layers
    const floorT = 1.5;

    const totalInnerH = bottomH + floorT + topH;

    // Inner width = max of bottom row and top row
    const bottomW = p.motorW + gap + p.batW;
    const topW = p.l298W + gap + p.espW + gap + p.tpW;
    const innerW = Math.max(bottomW, topW) + tol * 2;

    // Inner depth = max of all component depths (motor body length = motorL along Y)
    const innerD = Math.max(p.motorL, p.batD, p.l298D, p.espD, p.tpD) + tol * 2;
    const innerH = totalInnerH + tol * 2;

    // Sled dimensions
    const sledW = innerW;
    const sledD = innerD;
    const sledH = innerH;

    // Shell outer dimensions
    const shellW = sledW + p.tolerance * 2 + p.wallThick * 2;
    const shellD = sledD + p.tolerance * 2 + p.wallThick * 2;
    const shellH = sledH + p.tolerance * 2 + p.wallThick * 2;

    // ── Component positions (relative to sled center, sled centered at origin) ──

    // Bottom layer: motor on -X side, battery on +X side
    // Motor: W along X, L along Y (shaft axis), H along Z
    const motorPos = {
        x: -sledW / 2 + tol + p.motorW / 2,
        y: 0, // centered along Y; shaft exits -Y end
        z: -sledH / 2 + tol + p.motorH / 2
    };

    const batteryPos = {
        x: sledW / 2 - tol - p.batW / 2,
        y: -sledD / 2 + tol + p.batD / 2,
        z: -sledH / 2 + tol + p.batH / 2
    };

    // Top layer: L298N (left), ESP32 (center), TP4056 (right)
    const topZ = -sledH / 2 + tol + bottomH + floorT + topH / 2;

    const l298nPos = {
        x: -sledW / 2 + tol + p.l298W / 2,
        y: -sledD / 2 + tol + p.l298D / 2,
        z: topZ
    };

    const espPos = {
        x: -sledW / 2 + tol + p.l298W + gap + p.espW / 2,
        y: sledD / 2 - tol - p.espD / 2, // USB faces front (+Y)
        z: topZ
    };

    const tp4056Pos = {
        x: sledW / 2 - tol - p.tpW / 2,
        y: sledD / 2 - tol - p.tpD / 2, // USB faces front (+Y)
        z: topZ
    };

    return {
        innerW, innerD, innerH, totalInnerH,
        bottomH, topH, floorT,
        sledW, sledD, sledH,
        shellW, shellD, shellH,
        motorPos, batteryPos, l298nPos, espPos, tp4056Pos,
        tol, gap
    };
}

// ─── Shell (Bottom Box) ──────────────────────────────────────────────────────

export function generateShell(layout) {
    const p = params;
    const { shellW, shellD, shellH } = layout;

    // Outer box
    let outer = box(shellW, shellD, shellH);
    // Inner cavity (open top — lid covers it)
    const cavW = shellW - p.wallThick * 2;
    const cavD = shellD - p.wallThick * 2;
    const cavH = shellH - p.wallThick;
    let inner = box(cavW, cavD, cavH).translate([0, 0, p.wallThick / 2]);
    let shell = outer.subtract(inner);

    // M3 corner screw holes — vertical through the full shell height
    const screwR = p.cornerScrewDiam / 2;
    const inset = p.wallThick / 2 + 1.0;
    const corners = [
        [-shellW / 2 + inset, -shellD / 2 + inset],
        [ shellW / 2 - inset, -shellD / 2 + inset],
        [-shellW / 2 + inset,  shellD / 2 - inset],
        [ shellW / 2 - inset,  shellD / 2 - inset]
    ];
    for (const [cx, cy] of corners) {
        let hole = cyl(screwR, shellH + 4, 16).translate([cx, cy, 0]);
        shell = shell.subtract(hole);
        hole.delete();
    }

    // USB cutouts on +Y face (front) for ESP32 and TP4056
    const usbW = 10.0;
    const usbH = 4.0;
    let usbCut1 = box(usbW, p.wallThick + 4, usbH)
        .translate([layout.espPos.x, shellD / 2 - 1, layout.espPos.z]);
    shell = shell.subtract(usbCut1);
    usbCut1.delete();

    let usbCut2 = box(usbW, p.wallThick + 4, usbH)
        .translate([layout.tp4056Pos.x, shellD / 2 - 1, layout.tp4056Pos.z]);
    shell = shell.subtract(usbCut2);
    usbCut2.delete();

    // Motor shaft exit on -Y face (back) — shaft runs along Y axis
    const shaftHoleR = p.motorShaftDiam / 2 + 1.0;
    let shaftCut = cyl(shaftHoleR, p.wallThick + 4, 16)
        .rotate([90, 0, 0])
        .translate([layout.motorPos.x, -shellD / 2 + 1, layout.motorPos.z]);
    shell = shell.subtract(shaftCut);
    shaftCut.delete();

    // Sled slide-in rails — grooves cut into inner +X and -X walls
    // Sled slides in along Y axis
    const railW = 2.0;
    const railH = 3.0;
    const railLen = shellD - p.wallThick * 2;
    const railZ = -shellH / 2 + p.wallThick + railH / 2 + 1.0;
    let railL = box(railW, railLen, railH).translate([-(cavW / 2 - railW / 2), 0, railZ]);
    let railR = box(railW, railLen, railH).translate([  cavW / 2 - railW / 2,  0, railZ]);
    shell = shell.subtract(railL).subtract(railR);
    railL.delete();
    railR.delete();

    outer.delete();
    inner.delete();

    return shell;
}

// ─── Lid ─────────────────────────────────────────────────────────────────────

export function generateLid(layout) {
    const p = params;
    const { shellW, shellD, shellH } = layout;

    const lidThick = p.wallThick;
    let lid = box(shellW, shellD, lidThick);

    // Lip that fits inside the shell opening
    const lipInset = p.wallThick + p.tolerance;
    const lipW = shellW - lipInset * 2;
    const lipD = shellD - lipInset * 2;
    const lipH = 3.0;
    let lip = box(lipW, lipD, lipH).translate([0, 0, -(lidThick / 2 + lipH / 2 - 0.1)]);
    lid = lid.add(lip);
    lip.delete();

    // M3 corner screw holes matching shell
    const screwR = p.cornerScrewDiam / 2;
    const inset = p.wallThick / 2 + 1.0;
    const corners = [
        [-shellW / 2 + inset, -shellD / 2 + inset],
        [ shellW / 2 - inset, -shellD / 2 + inset],
        [-shellW / 2 + inset,  shellD / 2 - inset],
        [ shellW / 2 - inset,  shellD / 2 - inset]
    ];
    for (const [cx, cy] of corners) {
        let hole = cyl(screwR, lidThick + lipH + 4, 16).translate([cx, cy, -lipH / 2]);
        lid = lid.subtract(hole);
        hole.delete();
    }

    return lid;
}

// ─── Sled (Open Tray — components drop in from above) ───────────────────────

export function generateSled(layout) {
    const p = params;
    const { sledW, sledD, sledH, floorT, bottomH, topH } = layout;
    const tol = p.pocketTolerance;

    const sledWallT = 1.5;  // mm — tray perimeter wall thickness
    const dividerT = 1.2;   // mm — internal divider wall thickness
    const baseT = 1.5;      // mm — floor thickness

    // ── Build the tray by adding walls to a base plate ──

    // Base plate (full footprint, thin)
    let sled = box(sledW, sledD, baseT)
        .translate([0, 0, -sledH / 2 + baseT / 2]);

    // ── Perimeter walls (4 sides, full height) ──
    // Left wall (-X)
    let wallL = box(sledWallT, sledD, sledH)
        .translate([-(sledW / 2 - sledWallT / 2), 0, 0]);
    // Right wall (+X)
    let wallR = box(sledWallT, sledD, sledH)
        .translate([sledW / 2 - sledWallT / 2, 0, 0]);
    // Back wall (-Y)
    let wallB = box(sledW - sledWallT * 2, sledWallT, sledH)
        .translate([0, -(sledD / 2 - sledWallT / 2), 0]);
    // Front wall (+Y) — needs USB cutouts, but we add full and cut later
    let wallF = box(sledW - sledWallT * 2, sledWallT, sledH)
        .translate([0, sledD / 2 - sledWallT / 2, 0]);

    sled = sled.add(wallL).add(wallR).add(wallB).add(wallF);
    wallL.delete(); wallR.delete(); wallB.delete(); wallF.delete();

    // ── Mid-level floor between bottom and top layers ──
    const midFloorZ = -sledH / 2 + baseT + bottomH + floorT / 2 - baseT / 2;
    // Only span the inner region
    let midFloor = box(sledW - sledWallT * 2, sledD - sledWallT * 2, floorT)
        .translate([0, 0, midFloorZ]);
    sled = sled.add(midFloor);
    midFloor.delete();

    // ── Bottom layer divider: separates motor from battery ──
    const divBottomZ = -sledH / 2 + baseT + bottomH / 2 - baseT / 2;
    // Divider runs along Y, positioned at boundary between motor and battery
    const divX = layout.motorPos.x + p.motorW / 2 + tol / 2 + layout.gap / 2;
    let divBottom = box(dividerT, sledD - sledWallT * 2, bottomH)
        .translate([divX, 0, divBottomZ]);
    sled = sled.add(divBottom);
    divBottom.delete();

    // ── Top layer dividers: separate L298N | ESP32 | TP4056 ──
    const divTopZ = midFloorZ + floorT / 2 + topH / 2;
    // Divider between L298N and ESP32
    const divTopX1 = layout.l298nPos.x + p.l298W / 2 + tol / 2 + layout.gap / 2;
    let divTop1 = box(dividerT, sledD - sledWallT * 2, topH)
        .translate([divTopX1, 0, divTopZ]);
    sled = sled.add(divTop1);
    divTop1.delete();

    // Divider between ESP32 and TP4056
    const divTopX2 = layout.espPos.x + p.espW / 2 + tol / 2 + layout.gap / 2;
    let divTop2 = box(dividerT, sledD - sledWallT * 2, topH)
        .translate([divTopX2, 0, divTopZ]);
    sled = sled.add(divTop2);
    divTop2.delete();

    // ── Slide rails on ±X sides (tongues that mate with shell grooves) ──
    const railW = 2.0 - 0.3; // clearance from shell groove
    const railH = 3.0 - 0.4;
    const railLen = sledD - 2;
    const railZ = -sledH / 2 + railH / 2 + baseT + 0.5;
    let rL = box(railW, railLen, railH).translate([-(sledW / 2 + railW / 2), 0, railZ]);
    let rR = box(railW, railLen, railH).translate([  sledW / 2 + railW / 2,  0, railZ]);
    sled = sled.add(rL).add(rR);
    rL.delete(); rR.delete();

    // ── USB channels through front wall (+Y) ──
    // ESP32 USB
    let espUsb = box(10.0, sledWallT + 2, 4.0)
        .translate([layout.espPos.x, sledD / 2 - sledWallT / 2, layout.espPos.z]);
    sled = sled.subtract(espUsb);
    espUsb.delete();

    // TP4056 USB
    let tpUsb = box(10.0, sledWallT + 2, 4.0)
        .translate([layout.tp4056Pos.x, sledD / 2 - sledWallT / 2, layout.tp4056Pos.z]);
    sled = sled.subtract(tpUsb);
    tpUsb.delete();

    // ── Motor shaft channel through back wall (-Y) ──
    let shaftChannel = cyl(p.motorShaftDiam / 2 + 1.0, sledWallT + 2, 16)
        .rotate([90, 0, 0])
        .translate([layout.motorPos.x, -(sledD / 2 - sledWallT / 2), layout.motorPos.z]);
    sled = sled.subtract(shaftChannel);
    shaftChannel.delete();

    // ── Wire routing holes through mid floor ──
    const wireR = 2.0;
    // Between motor area and L298N
    let wire1 = cyl(wireR, floorT + 2, 12).translate([
        (layout.motorPos.x + layout.l298nPos.x) / 2,
        (layout.motorPos.y + layout.l298nPos.y) / 2,
        midFloorZ
    ]);
    sled = sled.subtract(wire1);
    wire1.delete();

    // Between battery area and TP4056
    let wire2 = cyl(wireR, floorT + 2, 12).translate([
        (layout.batteryPos.x + layout.tp4056Pos.x) / 2,
        (layout.batteryPos.y + layout.tp4056Pos.y) / 2,
        midFloorZ
    ]);
    sled = sled.subtract(wire2);
    wire2.delete();

    return sled;
}

// ─── Motor Clamp (PULSE-style half-ring with screw tabs) ─────────────────────
//
// The clamp wraps around the motor body (which sits flat on the bottom layer).
// Motor body: W along X, L along Y (shaft axis), H along Z.
// The clamp is a half-cylinder that wraps over the top of the motor,
// with horizontal screw tabs extending to each side for M3 bolts.

export function generateMotorClamp(layout) {
    const p = params;

    // Clamp wraps over the motor's wider cross-section (W × H plane)
    const motorCrossR = Math.max(p.motorW, p.motorH) / 2 + 0.3; // slight clearance
    const clampLen = p.motorL * 0.65; // covers ~65% of motor length
    const clampR = motorCrossR + p.clampThick;

    // Half-ring: outer cylinder minus inner cylinder, cut below motor center
    let outerCyl = cyl(clampR, clampLen, 32);
    let innerCyl = cyl(motorCrossR, clampLen + 2, 32);
    let ring = outerCyl.subtract(innerCyl);
    outerCyl.delete();
    innerCyl.delete();

    // Cut away the bottom half — keep the top half that wraps over the motor
    let bottomCut = box(clampR * 3, clampR * 3, clampLen + 4)
        .translate([0, 0, -(clampR * 1.5)]);
    // The cylinder is created along Z axis; rotate so it runs along Y (motor shaft axis)
    // First cut bottom half while still Z-aligned
    ring = ring.subtract(bottomCut);
    bottomCut.delete();

    // Screw tabs extending left and right from the base of the half-ring
    const tabW = 8.0;
    const tabH = p.clampThick;
    let tabL = box(tabW, clampLen, tabH)
        .translate([-(motorCrossR + tabW / 2), 0, -tabH / 2 + 0.5]);
    let tabR = box(tabW, clampLen, tabH)
        .translate([  motorCrossR + tabW / 2,  0, -tabH / 2 + 0.5]);
    ring = ring.add(tabL).add(tabR);
    tabL.delete();
    tabR.delete();

    // M3 screw holes through the tabs (vertical holes)
    const screwR = p.clampScrewDiam / 2;
    for (let i = 0; i < p.clampScrewCount; i++) {
        const yOff = (i - (p.clampScrewCount - 1) / 2) * (clampLen / (p.clampScrewCount + 0.5));
        // Left tab hole
        let hL = cyl(screwR, tabH + 10, 16)
            .translate([-(motorCrossR + tabW / 2), yOff, -tabH / 2]);
        ring = ring.subtract(hL);
        hL.delete();
        // Right tab hole
        let hR = cyl(screwR, tabH + 10, 16)
            .translate([motorCrossR + tabW / 2, yOff, -tabH / 2]);
        ring = ring.subtract(hR);
        hR.delete();
    }

    // Rotate from Z-axis to Y-axis alignment (motor shaft runs along Y)
    ring = ring.rotate([90, 0, 0]);

    // Position at motor location
    ring = ring.translate([
        layout.motorPos.x,
        layout.motorPos.y,
        layout.motorPos.z
    ]);

    return ring;
}

// ─── Component Ghost Meshes ──────────────────────────────────────────────────
//
// These are translucent visualizations showing where each component sits.
// Motor: body W×L×H with shaft extending along -Y axis.

export function generateComponentGhost(type, layout) {
    const p = params;
    let comp;

    switch (type) {
        case 'motor': {
            // Type 130 body: W along X, L along Y (shaft axis), H along Z
            let body = box(p.motorW, p.motorL, p.motorH);
            // Shaft extends from -Y face of motor body
            let shaft = cyl(p.motorShaftDiam / 2, p.motorShaftLen, 12)
                .rotate([90, 0, 0])
                .translate([0, -(p.motorL / 2 + p.motorShaftLen / 2), 0]);
            comp = body.add(shaft);
            body.delete();
            shaft.delete();
            comp = comp.translate([layout.motorPos.x, layout.motorPos.y, layout.motorPos.z]);
            break;
        }
        case 'esp32': {
            let pcb = box(p.espW, p.espD, 1.6);
            let usb = box(9.0, 6.0, 3.0).translate([0, p.espD / 2 - 1.0, 1.6 / 2 + 0.5]);
            comp = pcb.add(usb);
            pcb.delete();
            usb.delete();
            comp = comp.translate([layout.espPos.x, layout.espPos.y, layout.espPos.z]);
            break;
        }
        case 'l298n': {
            comp = box(p.l298W, p.l298D, p.l298H);
            comp = comp.translate([layout.l298nPos.x, layout.l298nPos.y, layout.l298nPos.z]);
            break;
        }
        case 'tp4056': {
            let pcb = box(p.tpW, p.tpD, 1.2);
            let usb = box(9.0, 6.0, 3.0).translate([0, p.tpD / 2 - 1.5, 1.2 / 2 + 0.5]);
            comp = pcb.add(usb);
            pcb.delete();
            usb.delete();
            comp = comp.translate([layout.tp4056Pos.x, layout.tp4056Pos.y, layout.tp4056Pos.z]);
            break;
        }
        case 'battery': {
            comp = box(p.batW, p.batD, p.batH);
            comp = comp.translate([layout.batteryPos.x, layout.batteryPos.y, layout.batteryPos.z]);
            break;
        }
        default:
            return null;
    }
    return comp;
}
