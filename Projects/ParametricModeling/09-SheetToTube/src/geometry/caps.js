import { context, params } from '../state.js';
import { makeCSGCylinder } from './helpers.js';

export function generateCapGeometry(D_in, D_out, hasSlipRing, isTopCap = false) {
    const Manifold = context.Manifold;
    if (!Manifold) return null;

    const c = params.tolerance;
    const T_cap = params.wallThick;
    const H_lip = params.lipDepth;
    const H_cap = H_lip + T_cap;

    // Groove boundaries
    const R_g_out = (D_out / 2) + c;
    const R_g_in = (D_in / 2) - c;

    // Cap boundaries
    const R_cap_out = R_g_out + T_cap;
    const R_cap_in = Math.max(0.1, R_g_in - T_cap);

    // Center Hole Radius (Slip ring overrides to 13mm diameter / 6.5mm radius)
    const R_hole = hasSlipRing ? 6.5 : (params.holeDiam / 2);

    // 1. Create outer body solid
    let capBody = makeCSGCylinder(R_cap_out, H_cap, 0, 0, H_cap / 2);

    // 2. Subtract LED strip channels on the inner lip
    if (params.ledCount > 0) {
        const count = params.ledCount;
        const w = params.ledWidth;
        const d = params.ledDepth;
        for (let i = 0; i < count; i++) {
            const theta = (i * 2 * Math.PI) / count;
            // Create channel box centered at origin
            let box = Manifold.cube([w, d, H_cap + 2.0], true);
            // Translate it radially to the outer edge of inner lip (R_g_in)
            let translated = box.translate([0, R_g_in - d / 2, H_cap / 2]);
            // Rotate around center axis
            let rotated = translated.rotate([0, 0, (theta * 180) / Math.PI]);
            box.delete();
            translated.delete();

            // Subtract from main body
            let tempBody = capBody.subtract(rotated);
            capBody.delete();
            rotated.delete();
            capBody = tempBody;
        }
    }

    // 2.5 Add Side Bracket Tabs and subtract vertical M3 screw holes (radius 1.5mm)
    // Positioned halfway between the LED channels to prevent intersection
    if (params.bracketCount > 0) {
        const count = params.bracketCount;
        const offsetAngle = params.ledCount > 0 ? (Math.PI / params.ledCount) : 0;
        const holeRad = 1.5; // M3 screw pilot radius (3.0mm diameter)
        const tabRad = 4.5;  // Tab radius (9.0mm diameter for solid bracket mount)

        // Union the solid tabs to the cap body first
        for (let j = 0; j < count; j++) {
            const theta = (j * 2 * Math.PI) / count + offsetAngle;
            const actualTheta = isTopCap ? -theta : theta;
            // Create tab cylinder shifted 8mm inward (further inland to avoid damaging lips)
            let tab = makeCSGCylinder(tabRad, H_cap, R_cap_out - 8.0, 0, H_cap / 2);
            let rotatedTab = tab.rotate([0, 0, (actualTheta * 180) / Math.PI]);
            tab.delete();

            let tempBody = capBody.add(rotatedTab);
            capBody.delete();
            rotatedTab.delete();
            capBody = tempBody;
        }

        // Subtract the vertical screw pilot holes through the tabs (cutting completely through caps)
        for (let j = 0; j < count; j++) {
            const theta = (j * 2 * Math.PI) / count + offsetAngle;
            const actualTheta = isTopCap ? -theta : theta;
            let hole = makeCSGCylinder(holeRad, H_cap + 2.0, R_cap_out - 8.0, 0, H_cap / 2);
            let rotatedHole = hole.rotate([0, 0, (actualTheta * 180) / Math.PI]);
            hole.delete();

            let tempBody = capBody.subtract(rotatedHole);
            capBody.delete();
            rotatedHole.delete();
            capBody = tempBody;
        }
    }

    // 3. Create groove cut solid (groove outer cylinder - groove inner cylinder)
    let grOuter = makeCSGCylinder(R_g_out, H_lip + 1.0, 0, 0, T_cap + (H_lip + 1.0) / 2);
    let grInner = makeCSGCylinder(R_g_in, H_lip + 2.0, 0, 0, T_cap + (H_lip + 1.0) / 2);
    let groove = grOuter.subtract(grInner);
    grOuter.delete();
    grInner.delete();

    // 4. Create central cavity cutout (hollow out the inside of the inner lip)
    // Starts at Z = T_cap (bottom plate thickness) and goes out of the top
    let cavity = makeCSGCylinder(R_cap_in, H_lip + 1.0, 0, 0, T_cap + (H_lip + 1.0) / 2);

    // 5. Create center hole cut solid
    let hole = makeCSGCylinder(R_hole, H_cap + 2.0, 0, 0, H_cap / 2);

    // 6. Subtract groove, cavity, and hole from body
    let temp1 = capBody.subtract(groove);
    capBody.delete();
    groove.delete();

    let temp2 = temp1.subtract(cavity);
    temp1.delete();
    cavity.delete();

    let finalizedCap = temp2.subtract(hole);
    temp2.delete();
    hole.delete();

    return finalizedCap;
}
