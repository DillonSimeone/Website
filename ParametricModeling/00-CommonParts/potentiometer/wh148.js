// Reusable WH148 Potentiometer & Synth Knob Geometry Generator
import { makeCylinder, makeBox } from '../helpers.js';

export function generatePotentiometerGeometry(M, shaftLength = 15.0, shaftStyle = 'dshaft') {
    if (!M) return null;

    const bodyD = 17.0;
    const bodyH = 9.2;
    let body = makeCylinder(M, bodyD / 2, bodyH, 32, true);
    let tempBody = body.translate([0, 0, -bodyH / 2]);
    body.delete();
    body = tempBody;

    const bushD = 7.0;
    const bushH = 6.2;
    let bush = makeCylinder(M, bushD / 2, bushH, 32, true);
    let tempBush = bush.translate([0, 0, bushH / 2]);
    bush.delete();
    bush = tempBush;

    const shaftD = 6.0;
    const shaftH = shaftLength;
    let shaft = makeCylinder(M, shaftD / 2, shaftH, 32, true);
    let tempShaft = shaft.translate([0, 0, bushH + shaftH / 2]);
    shaft.delete();
    shaft = tempShaft;

    if (shaftStyle === 'dshaft') {
        const flatDepth = 1.0;
        const cutW = 8.0;
        const cutH = shaftLength + 1.0;
        let flatCutter = makeBox(M, cutW, cutW, cutH, true);
        let shiftedCutter = flatCutter.translate([0, shaftD / 2 - flatDepth + cutW / 2, bushH + shaftLength / 2]);
        let flatShaft = shaft.subtract(shiftedCutter);
        
        flatCutter.delete();
        shiftedCutter.delete();
        shaft.delete();
        shaft = flatShaft;
    }

    let terminalLeft = makeBox(M, 1.5, 0.5, 4.0, true).translate([-5.0, -bodyD / 2, -bodyH / 2 - 2.0]);
    let terminalCenter = makeBox(M, 1.5, 0.5, 4.0, true).translate([0.0, -bodyD / 2, -bodyH / 2 - 2.0]);
    let terminalRight = makeBox(M, 1.5, 0.5, 4.0, true).translate([5.0, -bodyD / 2, -bodyH / 2 - 2.0]);

    let antiPin = makeCylinder(M, 1.4, 2.0, 16, true).translate([-7.8, 0, 1.0]);

    let pot = body.add(bush).add(shaft).add(terminalLeft).add(terminalCenter).add(terminalRight).add(antiPin);

    bush.delete();
    shaft.delete();
    terminalLeft.delete();
    terminalCenter.delete();
    terminalRight.delete();
    antiPin.delete();

    return pot;
}

export function generatePotCutout(M) {
    if (!M) return null;

    let bushHole = makeCylinder(M, 7.2 / 2, 20.0, 32, true).translate([0, 0, 0]);
    let pinHole = makeCylinder(M, 3.2 / 2, 20.0, 16, true).translate([-7.8, 0, 0]);

    let cutout = bushHole.add(pinHole);
    
    bushHole.delete();
    pinHole.delete();

    return cutout;
}

export function generateSynthKnobGeometry(M, shaftStyle = 'dshaft') {
    if (!M) return null;

    const knobD = 15.0;
    const topD = 12.0;
    const knobH = 13.0;

    let body = M.cylinder(knobH, knobD / 2, topD / 2, 48, true);
    let indicator = makeBox(M, 1.5, 3.0, knobH + 1.0, true).translate([0, topD / 2 - 0.5, 0]);

    const boreD = 6.15;
    const boreH = knobH - 2.0;
    let bore = makeCylinder(M, boreD / 2, boreH, 32, true).translate([0, 0, -knobH / 2 + boreH / 2]);

    if (shaftStyle === 'dshaft') {
        const flatDepth = 1.1;
        const cutW = 8.0;
        const cutH = boreH + 1.0;
        let flatCutter = makeBox(M, cutW, cutW, cutH, true).translate([0, boreD / 2 - flatDepth + cutW / 2, -knobH / 2 + boreH / 2]);
        let flatBore = bore.subtract(flatCutter);
        flatCutter.delete();
        bore.delete();
        bore = flatBore;
    }

    let knob = body.subtract(indicator).subtract(bore);

    body.delete();
    indicator.delete();
    bore.delete();

    const bushH = 6.2;
    let positionedKnob = knob.translate([0, 0, bushH + knobH / 2]);
    knob.delete();

    return positionedKnob;
}
