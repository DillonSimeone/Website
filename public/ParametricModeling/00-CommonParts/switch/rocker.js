// Reusable KCD11 Rocker Switch Geometry Model & Cutouts (Rotated 90 deg by default)
import { makeBox } from '../helpers.js';

export function generateSwitchGeometry(M) {
    if (!M) return null;

    let body = makeBox(M, 8.5, 13.5, 10.0, true).translate([0, 0, -5.0]);
    let bezel = makeBox(M, 10.0, 15.0, 1.5, true).translate([0, 0, 0.75]);

    let pin1 = makeBox(M, 4.0, 0.8, 8.0, true).translate([-3.0, 0, -10.0 - 4.0]);
    let pin2 = makeBox(M, 4.0, 0.8, 8.0, true).translate([3.0, 0, -10.0 - 4.0]);

    let rocker = makeBox(M, 7.0, 10.0, 4.0, true).rotate([0, 15, 0]).translate([0, 0, 1.5 + 2.0]);

    let sw = body.add(bezel).add(pin1).add(pin2).add(rocker);
    body.delete();
    bezel.delete();
    pin1.delete();
    pin2.delete();
    rocker.delete();

    return sw;
}

export function generateSwitchCutout(M) {
    if (!M) return null;
    return makeBox(M, 8.8, 13.8, 30.0, true);
}
