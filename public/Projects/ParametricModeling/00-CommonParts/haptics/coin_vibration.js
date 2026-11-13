// Reusable 5V Coin Vibration Motor (10mm x 3.0mm) Geometry Model
import { makeBox, makeCylinder } from '../helpers.js';

export function generateCoinVibrationGeometry(M, diameter = 10.0, thickness = 3.0) {
    if (!M) return null;

    const disc = makeCylinder(M, diameter / 2, thickness, 32, true)
        .translate([0, 0, thickness / 2]);
    // Side wire lead boss (3mm wide strain tab)
    const lead = makeBox(M, 3.0, 4.0, 1.5, true)
        .translate([0, diameter / 2 + 1.5, 0.75]);

    const res = disc.add(lead);
    disc.delete();
    lead.delete();
    return res;
}
