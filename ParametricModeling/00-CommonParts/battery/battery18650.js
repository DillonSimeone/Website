// Reusable 18650 Battery Holder Geometry Model
import { makeCylinder, makeBox } from '../helpers.js';

export function generate18650HolderGeometry(M) {
    if (!M) return null;

    let body = makeBox(M, 21.0, 76.0, 18.0, true).translate([0, 0, 18.0 / 2]);
    let batteryCell = makeCylinder(M, 18.6 / 2, 65.0, 24, true).rotate([90, 0, 0]).translate([0, 0, 9.0 + 18.0 / 2]);

    let holder = body.subtract(batteryCell);
    body.delete();
    batteryCell.delete();

    return holder;
}
