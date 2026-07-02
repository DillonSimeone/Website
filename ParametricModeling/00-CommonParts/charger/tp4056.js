// Reusable TP4056 Lipo Charger Geometry Model
import { makeBox } from '../helpers.js';

export function generateTP4056Geometry(M) {
    if (!M) return null;

    let pcb = makeBox(M, 17.2, 28.0, 1.2, true).translate([0, 0, 1.2 / 2]);
    let usb = makeBox(M, 9.0, 6.0, 3.0, true).translate([0, 28.0 / 2 - 1.5, 1.2 + 3.0 / 2]);

    let tp = pcb.add(usb);
    pcb.delete();
    usb.delete();

    return tp;
}
