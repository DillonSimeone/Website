// Reusable ESP32 C3 Supermini Geometry Model
import { makeBox } from '../helpers.js';

export function generateESP32C3Geometry(M) {
    if (!M) return null;

    let pcb = makeBox(M, 18.0, 22.52, 1.6, true).translate([0, 0, 1.6 / 2]);
    let usb = makeBox(M, 9.0, 6.0, 3.0, true).translate([0, 22.52 / 2 - 1.0, 1.6 + 3.0 / 2]);

    let esp = pcb.add(usb);
    pcb.delete();
    usb.delete();

    return esp;
}
