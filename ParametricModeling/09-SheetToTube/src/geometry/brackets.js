import { context, params } from '../state.js';
import { makeCSGCylinder } from './helpers.js';
import { generateCapGeometry } from './caps.js';

export function generateBracketGeometry(D_out, tubeHeight_mm) {
    const Manifold = context.Manifold;
    if (!Manifold) return null;

    const T_cap = params.wallThick;
    const R_g_out = (D_out / 2) + params.tolerance;
    const R_cap_out = R_g_out + T_cap;
    const H_bracket = tubeHeight_mm + 2 * T_cap;

    // 1. Vertical bar on the side of the caps (extended by 6mm to prevent top/bottom notches)
    // Thicken the bar so it extends inwards from the outer edge (R_cap_out + 3.0) to touch the cylinder outer surface (D_out / 2)
    const W_vert = (R_cap_out + 3.0) - (D_out / 2);
    let vertBar = Manifold.cube([W_vert, 8.0, H_bracket + 6.0], true);
    let vertBarTrans = vertBar.translate([(D_out / 2) + W_vert / 2, 0, H_bracket / 2]);
    vertBar.delete();

    // 2. Top arm extending inwards over the top cap (extended to 12.0mm length radially to cover the inland hole)
    let topArm = Manifold.cube([12.0, 8.0, 3.0], true);
    let topArmTrans = topArm.translate([R_cap_out - 4.5, 0, H_bracket + 1.5]);
    topArm.delete();

    // 3. Bottom arm extending inwards under the bottom cap (extended)
    let bottomArm = Manifold.cube([12.0, 8.0, 3.0], true);
    let bottomArmTrans = bottomArm.translate([R_cap_out - 4.5, 0, -1.5]);
    bottomArm.delete();

    // Union vertical bar and arms
    let temp1 = vertBarTrans.add(topArmTrans);
    vertBarTrans.delete();
    topArmTrans.delete();

    let bracketBody = temp1.add(bottomArmTrans);
    temp1.delete();
    bottomArmTrans.delete();

    // Subtract vertical screw holes (radius 1.5mm) shifted 8mm inward to avoid damaging lips
    let topHole = makeCSGCylinder(1.5, 10.0, R_cap_out - 8.0, 0, H_bracket + 1.5);
    let bottomHole = makeCSGCylinder(1.5, 10.0, R_cap_out - 8.0, 0, -1.5);

    let temp2 = bracketBody.subtract(topHole);
    bracketBody.delete();
    topHole.delete();

    let temp3 = temp2.subtract(bottomHole);
    temp2.delete();
    bottomHole.delete();

    // 4. Subtract Cap and Cylinder geometries to prevent clipping
    const L_mm = params.rollDirection === 'width' ? params.sheetWidthInches * 25.4 : params.sheetHeightInches * 25.4;
    const D_mid = L_mm / Math.PI;
    const D_in = D_mid - params.sheetThickness;

    // Generate cap volumes for subtraction (top cap must be generated with isTopCap=true so its slots align with the viewport top cap)
    let capB = generateCapGeometry(D_in, D_out, false, false);
    let capT = generateCapGeometry(D_in, D_out, false, true);
    
    // Position Top Cap volume (flipped and translated)
    let capTRot = capT.rotate([180, 0, 0]);
    let capTTrans = capTRot.translate([0, 0, tubeHeight_mm + 2 * T_cap]);
    capT.delete();
    capTRot.delete();

    // Subtract caps
    let temp4 = temp3.subtract(capB);
    temp3.delete();
    capB.delete();

    let temp5 = temp4.subtract(capTTrans);
    temp4.delete();
    capTTrans.delete();

    // Subtract Sheet Cylinder (slightly larger radius for fit/clearance subtraction)
    let sheetCutout = makeCSGCylinder(D_out / 2, tubeHeight_mm, 0, 0, T_cap + tubeHeight_mm / 2);
    let finalizedBracket = temp5.subtract(sheetCutout);
    temp5.delete();
    sheetCutout.delete();

    return finalizedBracket;
}
