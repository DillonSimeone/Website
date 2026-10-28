// Reusable L298N Mini Dual H-Bridge Geometry Model
// Ultra-compact MOSFET variant: 24.7 × 21.0 × 5.0 mm
import { makeBox } from '../helpers.js';

export function generateL298NMiniGeometry(M) {
    if (!M) return null;

    let pcb = makeBox(M, 24.7, 21.0, 1.2, true).translate([0, 0, 1.2 / 2]);
    let components = makeBox(M, 22.0, 18.0, 3.8, true).translate([0, 0, 1.2 + 3.8 / 2]);

    let module = pcb.add(components);
    pcb.delete();
    components.delete();

    return module;
}
