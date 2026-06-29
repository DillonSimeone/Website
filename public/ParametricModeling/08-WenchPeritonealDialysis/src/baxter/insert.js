// Geometry generation for Baxter TPU socket inserts and solid templates
import { makeMiddleCylinder } from './cable.js';

export function splitModelLeft(Manifold, model) {
    const cube = (w, h, d) => Manifold.cube([w, h, d], true);
    let box = cube(500, 500, 500).translate([-250, 0, 0]);
    let leftHalf = Manifold.intersection(model, box);
    box.delete();
    return leftHalf;
}

export function splitModelRight(Manifold, model) {
    const cube = (w, h, d) => Manifold.cube([w, h, d], true);
    let box = cube(500, 500, 500).translate([250, 0, 0]);
    let rightHalf = Manifold.intersection(model, box);
    box.delete();
    return rightHalf;
}

export function generateBaxterInserts(Manifold, config, q) {
    const cube = (w, h, d) => Manifold.cube([w, h, d], true);

    const midR = config.midDiam / 2;
    const tpu2_h = config.midLength + 4.0;
    const outerR = midR + config.tolerance + config.tpuWall;
    
    // Width along Y is the diameter (2 * outerR) plus the vertical extension (clampArmLength)
    const blockWidthY = 2 * outerR + config.clampArmLength;
    const shiftY = config.clampArmLength / 2;

    const buildHalf = (isRight, isSolid) => {
        // Start with a solid block that covers the entire half space up to outerR
        let block = cube(outerR, blockWidthY, tpu2_h);
        const shiftX = isRight ? (outerR / 2) : -(outerR / 2);
        let blockMoved = block.translate([shiftX, shiftY, 0]);
        block.delete();

        if (isSolid) {
            return blockMoved;
        }

        // Subtract the inner cable shape bore
        let tbore = makeMiddleCylinder(Manifold, midR + config.tolerance, tpu2_h + 2, config.grooveDepth - config.tolerance, config.ridgeWidth + config.tolerance * 2, config.numRidges, q);
        let finalHalf = blockMoved.subtract(tbore);
        tbore.delete();
        blockMoved.delete();
        return finalHalf;
    };

    let tpu2_left = buildHalf(false, false);
    let tpu2_right = buildHalf(true, false);
    let tpu2_left_solid = buildHalf(false, true);
    let tpu2_right_solid = buildHalf(true, true);

    // Apply notches on the final outer surface of the arms
    const applyNotches = (model, outerR, height) => {
        if (!config.enableNotch) return model;
        // Notch is cut from the outer back face
        let cutter = cube(config.notchW, outerR * 3, config.notchH).translate([0, 0, height / 2 + config.notchZOffset]);
        let temp = model.subtract(cutter);
        model.delete();
        cutter.delete();
        return temp;
    };

    tpu2_left = applyNotches(tpu2_left, outerR, tpu2_h);
    tpu2_right = applyNotches(tpu2_right, outerR, tpu2_h);
    tpu2_left_solid = applyNotches(tpu2_left_solid, outerR, tpu2_h);
    tpu2_right_solid = applyNotches(tpu2_right_solid, outerR, tpu2_h);

    return {
        tpu2_left,
        tpu2_right,
        tpu2_left_solid,
        tpu2_right_solid
    };
}

export function generateBottomInserts(Manifold, config, q) {
    const cube = (w, h, d) => Manifold.cube([w, h, d], true);

    const botTopR = config.botTopDiam / 2;
    const botBotR = config.botBottomDiam / 2;
    const height = config.botLength;

    const outerR = Math.max(botBotR, botTopR) + config.tolerance + config.tpuWall;
    const blockWidthY = 2 * outerR + config.clampArmLength;
    const shiftY = config.clampArmLength / 2;

    const buildHalf = (isRight, isSolid) => {
        let block = cube(outerR, blockWidthY, height);
        const shiftX = isRight ? (outerR / 2) : -(outerR / 2);
        let blockMoved = block.translate([shiftX, shiftY, 0]);
        block.delete();

        if (isSolid) {
            return blockMoved;
        }

        let tbore = Manifold.cylinder(height + 2, botBotR + config.tolerance, botTopR + config.tolerance, q, true);
        let finalHalf = blockMoved.subtract(tbore);
        tbore.delete();
        blockMoved.delete();
        return finalHalf;
    };

    let tpu3_left = buildHalf(false, false);
    let tpu3_right = buildHalf(true, false);
    let tpu3_left_solid = buildHalf(false, true);
    let tpu3_right_solid = buildHalf(true, true);

    return {
        tpu3_left,
        tpu3_right,
        tpu3_left_solid,
        tpu3_right_solid
    };
}
