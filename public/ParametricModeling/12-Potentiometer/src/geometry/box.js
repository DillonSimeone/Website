import { makeCylinder, makeBox } from './helpers.js';
import { generatePotCutout } from '../../../00-CommonParts/potentiometer/wh148.js';
import { generateOLEDCutout } from '../../../00-CommonParts/screen/oled.js';
import { generateSwitchCutout } from '../../../00-CommonParts/switch/rocker.js';
import { context, params } from '../state.js';

export function generateEnclosureGeometry() {
    const M = context.Manifold;
    if (!M) return { base: null, lid: null };

    const wall = params.wallThick;
    const cl = params.clearance;
    const pad = params.padding;
    const pitch = params.pitch;
    const rows = params.rows;
    const cols = params.cols;

    // 1. Calculate dimensions dynamically
    const gridW = (cols - 1) * pitch;
    const gridL = (rows - 1) * pitch;

    // Enclosure internal dimensions
    // Ensure width fits at least 80mm so components fit nicely side-by-side
    const W_int = Math.max(gridW + 20.0, 80.0);
    // Ensure length fits the grid + OLED space, locking the top row below OLED
    const L_int = Math.max(gridL + pad + 50.0, 85.0);
    const H_int = 24.0; // Internal height

    // External dimensions
    const W_ext = W_int + 2 * wall;
    const L_ext = L_int + 2 * wall;
    const H_ext = H_int + wall;

    // --- BASE BOX ---
    let baseSolid = makeBox(W_ext, L_ext, H_ext, true).translate([0, 0, H_ext / 2]);
    let basePocket = makeBox(W_int, L_int, H_int + 2.0, true).translate([0, 0, H_int / 2 + wall]);
    let baseBox = baseSolid.subtract(basePocket);
    baseSolid.delete();
    basePocket.delete();

    // Standoffs / mounting slot for 18650 Battery Holder (Rotated 90 deg: 76.0 x 21.0 x 18.0 mm)
    // Positioned horizontally in the back-left corner: y = L_int / 2 - 10.5 - 2.0
    const batX = -W_int / 2 + 38.0 + 2.0; // 38.0 is half of length (76.0), shifted left with 2mm wall clearance
    const batY = L_int / 2 - 10.5 - 2.0; // 10.5 is half of width (21.0)
    let batHolderCradle = makeBox(76.0 + 2.0, 21.0 + 2.0, 8.0, true).translate([batX, batY, wall + 4.0]);
    let batHolderCutout = makeBox(76.4, 21.4, 10.0, true).translate([batX, batY, wall + 5.0]);
    let tempCradle = batHolderCradle.subtract(batHolderCutout);
    let tempBase = baseBox.add(tempCradle);
    baseBox.delete();
    batHolderCradle.delete();
    batHolderCutout.delete();
    tempCradle.delete();
    baseBox = tempBase;

    // ESP32 C3 Cradle (Length 22.52 along Y, width 18.0 along X)
    // Placed on front wall (negative Y), right side (x = 18.0)
    const espX = 18.0;
    const espY = -L_int / 2 + 11.26 + 2.0; // 11.26 is half of length (22.52)
    let espCradle = makeBox(18.0 + 3.0, 22.52 + 3.0, 6.0, true).translate([espX, espY, wall + 3.0]);
    let espCutout = makeBox(18.4, 22.92, 8.0, true).translate([espX, espY, wall + 4.0]);
    // Cutout for Type-C port facing south (negative Y, out front wall)
    let espPortCut = makeBox(10.0, 10.0, 5.0, true).translate([espX, -L_int / 2 - 1.0, wall + 3.5]);
    
    let tempEsp = espCradle.subtract(espCutout);
    let tempBase2 = baseBox.add(tempEsp).subtract(espPortCut);
    baseBox.delete();
    espCradle.delete();
    espCutout.delete();
    espPortCut.delete();
    tempEsp.delete();
    baseBox = tempBase2;

    // TP4056 Lipo Charger Cradle (Length 28.0 along Y, width 17.2 along X)
    // Placed on front wall (negative Y), left side (x = -18.0)
    const chgX = -18.0;
    const chgY = -L_int / 2 + 14.0 + 2.0; // 14.0 is half of length (28.0)
    let chgCradle = makeBox(17.2 + 3.0, 28.0 + 3.0, 6.0, true).translate([chgX, chgY, wall + 3.0]);
    let chgCutout = makeBox(17.6, 28.4, 8.0, true).translate([chgX, chgY, wall + 4.0]);
    // Cutout through the front wall for the charger's Type-C port
    let chgPortCut = makeBox(10.0, 10.0, 5.0, true).translate([chgX, -L_int / 2 - 1.0, wall + 3.5]);

    let tempChg = chgCradle.subtract(chgCutout);
    let tempBase3 = baseBox.add(tempChg).subtract(chgPortCut);
    baseBox.delete();
    chgCradle.delete();
    chgCutout.delete();
    chgPortCut.delete();
    baseBox = tempBase3;

    // Cable cutout slot: 8.0mm diameter cylinder through the front wall next to ESP32
    const cableX = 18.0 + (W_int / 2 - 18.0) / 2;
    let cableHole = makeCylinder(8.0 / 2, wall * 3.0 + 2.0, 16, true)
                     .rotate([90, 0, 0])
                     .translate([cableX, -L_int / 2 - wall / 2, wall + 8.0]);
    let tempBase4 = baseBox.subtract(cableHole);
    baseBox.delete();
    cableHole.delete();
    baseBox = tempBase4;

    // Add some corner screw bosses inside base for drop-on lid alignment pins if needed,
    // or keep it clean as a smooth friction-fit drop-on lid. Let's make it a friction fit.

    // --- LID ---
    // Lip height/depth for drop-on: 4.0mm
    const lipDepth = 4.0;
    const lidHeight = 6.0;

    let lidSolid = makeBox(W_ext + cl, L_ext + cl, lidHeight, true).translate([0, 0, lidHeight / 2]);
    // Inner lip cutout (mates with base inner perimeter)
    let lidLipCut = makeBox(W_int + cl * 2, L_int + cl * 2, lipDepth + 0.1, true).translate([0, 0, lipDepth / 2 - 0.05]);
    let lidBox = lidSolid.subtract(lidLipCut);
    lidSolid.delete();
    lidLipCut.delete();

    // Now subtract Potentiometer grid holes, OLED screen cutout, and Rocker Switch from the Lid
    // OLED is placed at x = 0, y = L_int / 2 - 22.0
    const oledY = L_int / 2 - 22.0;
    let oledCut = generateOLEDCutout(M);
    let translatedOled = oledCut.translate([0, oledY, lidHeight / 2]);
    let tempLid = lidBox.subtract(translatedOled);
    lidBox.delete();
    oledCut.delete();
    translatedOled.delete();
    lidBox = tempLid;

    // Rocker Switch cutout next to OLED (placed further away at x = 35.0, y = oledY)
    const switchX = 35.0;
    const switchY = oledY;
    let swCut = generateSwitchCutout(M);
    let translatedSwCut = swCut.translate([switchX, switchY, lidHeight / 2]);
    let tempLid2 = lidBox.subtract(translatedSwCut);
    lidBox.delete();
    swCut.delete();
    translatedSwCut.delete();
    lidBox = tempLid2;

    // Potentiometer grid coordinates
    // Lock the top row at 25mm below the OLED center (oledY = L_int / 2 - 22.0)
    const py_top = L_int / 2 - 47.0;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const px = c * pitch - gridW / 2;
            const py = py_top - (rows - 1 - r) * pitch;

            let potCut = generatePotCutout(M);
            let translatedPotCut = potCut.translate([px, py, lidHeight / 2]);
            let nextLid = lidBox.subtract(translatedPotCut);
            lidBox.delete();
            potCut.delete();
            translatedPotCut.delete();
            lidBox = nextLid;
        }
    }

    // Exploded View representation positioning
    // Base stays at Z = 0.
    // Lid shifts up by params.exploded
    let finalLid = lidBox.translate([0, 0, H_ext + params.exploded]);
    lidBox.delete();

    return {
        base: baseBox,
        lid: finalLid,
        internalW: W_int,
        internalL: L_int,
        height: H_ext,
        esp32Pos: [espX, espY, wall],
        batteryPos: [batX, batY, wall],
        chargerPos: [chgX, chgY, wall],
        oledPos: [0, oledY, H_ext],
        switchPos: [switchX, switchY, H_ext]
    };
}
