import { context, params } from '../state.js';
import { makeCSGCylinder } from './helpers.js';
import { MOTOR_130 } from './motorHolder.js';

// Generic Spur Gear Generator (chamfered/involute-like teeth for smooth engagement)
// Returns a Manifold gear disc with `numTeeth` tapered teeth, centered at origin
export function createSpurGear(mod, numTeeth, thickness, boreRadius) {
    const Manifold = context.Manifold;
    if (!Manifold) return null;

    const pitchR = (numTeeth * mod) / 2;
    const addendum = mod;                       // tooth height above pitch circle
    const dedendum = mod * 0.6;                 // cut depth below pitch circle (shallow for strength)
    const outerR = pitchR + addendum;           // tooth tip radius
    const rootR = pitchR - dedendum;            // tooth root radius
    const toothArcWidth = mod * 0.45 * Math.PI; // tooth width at pitch circle

    // 1. Base cylinder at root diameter
    let gear = makeCSGCylinder(rootR, thickness, 0, 0, thickness / 2);

    // 2. Add each tooth as a tapered block
    for (let i = 0; i < numTeeth; i++) {
        const angle = (i * 2 * Math.PI) / numTeeth;
        const toothH = outerR - rootR;

        let tooth = Manifold.cube([toothH, toothArcWidth, thickness], true);
        
        // Chamfer/taper the outer corners of the tooth tip for smooth engagement
        const chamferSize = mod * 0.3; // chamfer for smooth meshing
        let cut1 = Manifold.cube([chamferSize * 2, chamferSize * 2, thickness + 2], true);
        let cut1Rot = cut1.rotate([0, 0, 45]);
        cut1.delete();
        let cut1Trans = cut1Rot.translate([toothH / 2, toothArcWidth / 2, 0]);
        cut1Rot.delete();
        
        let cut2 = Manifold.cube([chamferSize * 2, chamferSize * 2, thickness + 2], true);
        let cut2Rot = cut2.rotate([0, 0, 45]);
        cut2.delete();
        let cut2Trans = cut2Rot.translate([toothH / 2, -toothArcWidth / 2, 0]);
        cut2Rot.delete();
        
        let temp1 = tooth.subtract(cut1Trans);
        tooth.delete();
        cut1Trans.delete();
        
        let temp2 = temp1.subtract(cut2Trans);
        temp1.delete();
        cut2Trans.delete();
        tooth = temp2;

        let toothTrans = tooth.translate([rootR + toothH / 2, 0, thickness / 2]);
        tooth.delete();
        let toothRot = toothTrans.rotate([0, 0, (angle * 180) / Math.PI]);
        toothTrans.delete();

        let temp = gear.add(toothRot);
        gear.delete();
        toothRot.delete();
        gear = temp;
    }

    // 3. Subtract center bore
    if (boreRadius > 0) {
        let bore = makeCSGCylinder(boreRadius, thickness + 2, 0, 0, thickness / 2);
        let temp = gear.subtract(bore);
        gear.delete();
        bore.delete();
        gear = temp;
    }

    return gear;
}

export function generateRingGearGeometry(D_out) {
    const Manifold = context.Manifold;
    if (!Manifold) return null;

    const mod = 2.0;          // gear module
    const ringThick = 6.0;    // radial wall thickness of the ring body
    const gearHeight = 10.0;  // axial height of the ring body
    const toothHeight = 4.0;  // height of teeth at the bottom

    const T_cap = params.wallThick;
    const c = params.tolerance;
    const R_g_out = (D_out / 2) + c;
    const R_cap_out = R_g_out + T_cap;

    // Ring dimensions (innerR has 1.0mm radial clearance to clear bottom cap and motor housing)
    const innerR = R_cap_out + 1.0;
    const bodyOuterR = innerR + ringThick;
    const ringCenterR = innerR + ringThick / 2;

    // Calculate number of teeth based on circumference at ringCenterR
    const pitchCircum = 2 * Math.PI * ringCenterR;
    const numTeeth = Math.round(pitchCircum / (mod * Math.PI));

    // 1. Create the solid ring body
    let outerCyl = makeCSGCylinder(bodyOuterR, gearHeight, 0, 0, gearHeight / 2);
    let innerCyl = makeCSGCylinder(innerR, gearHeight + 2, 0, 0, gearHeight / 2);
    let ring = outerCyl.subtract(innerCyl);
    outerCyl.delete();
    innerCyl.delete();

    // 2. Add each tooth as a tapered block pointing downwards
    const pitchAngle = (2 * Math.PI) / numTeeth;
    const toothArcWidth = mod * 0.45 * Math.PI;

    for (let j = 0; j < numTeeth; j++) {
        const theta = j * pitchAngle;
        
        // Tooth block centered at origin
        let tooth = Manifold.cube([ringThick, toothArcWidth, toothHeight], true);

        // Chamfer the corners at the bottom tip (Z = toothHeight / 2 in local cube coordinates)
        const chamferSize = mod * 0.3; // 0.6mm chamfer
        let cut1 = Manifold.cube([ringThick + 2.0, chamferSize * 2, chamferSize * 2], true);
        let cut1Rot = cut1.rotate([45, 0, 0]); // rotate around X-axis by 45 deg
        cut1.delete();
        let cut1Trans = cut1Rot.translate([0, toothArcWidth / 2, -toothHeight / 2]);
        cut1Rot.delete();

        let cut2 = Manifold.cube([ringThick + 2.0, chamferSize * 2, chamferSize * 2], true);
        let cut2Rot = cut2.rotate([45, 0, 0]);
        cut2.delete();
        let cut2Trans = cut2Rot.translate([0, -toothArcWidth / 2, -toothHeight / 2]);
        cut2Rot.delete();

        let temp1 = tooth.subtract(cut1Trans);
        tooth.delete();
        cut1Trans.delete();

        let temp2 = temp1.subtract(cut2Trans);
        temp1.delete();
        cut2Trans.delete();
        tooth = temp2;

        // Translate the tooth to ringCenterR and pointing downwards (from Z = 0 to Z = -4.0)
        let toothTrans = tooth.translate([ringCenterR, 0, -toothHeight / 2]);
        tooth.delete();
        
        let toothRot = toothTrans.rotate([0, 0, (theta * 180) / Math.PI]);
        toothTrans.delete();

        let temp = ring.add(toothRot);
        ring.delete();
        toothRot.delete();
        ring = temp;
    }

    // 3. Cut notches for the bracket vertical bars to pass through (must cut through both the gear body and the teeth)
    const count = params.bracketCount;
    const offsetAngle = params.ledCount > 0 ? (Math.PI / params.ledCount) : 0;
    const notchHeight = gearHeight + toothHeight + 2.0;

    for (let j = 0; j < count; j++) {
        const theta = (j * 2 * Math.PI) / count + offsetAngle;
        // Bracket bar notch - tangential width 8.4mm, radial depth 4.3mm
        let notch = Manifold.cube([4.3, 8.4, notchHeight], true);
        let notchTrans = notch.translate([R_cap_out - 1.0 + 2.15, 0, (gearHeight - toothHeight) / 2]);
        let notchRot = notchTrans.rotate([0, 0, (theta * 180) / Math.PI]);
        notch.delete();
        notchTrans.delete();

        let temp = ring.subtract(notchRot);
        ring.delete();
        notchRot.delete();
        ring = temp;
    }

    return ring;
}

// Pinion Gear (on motor shaft)
export function generatePinionGearGeometry() {
    const mod = 2.0;       // same module as ring gear
    const numTeeth = Math.max(6, Math.round(params.motorWheelDiam / mod));
    const thickness = 8.0; // mm
    const boreR = MOTOR_130.shaftDiam / 2 + 0.1;

    return createSpurGear(mod, numTeeth, thickness, boreR);
}
