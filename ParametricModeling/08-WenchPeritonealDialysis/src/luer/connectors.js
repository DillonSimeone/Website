// Geometry calculations for Luer male/female connectors

export function createFin(Manifold, w, depth, h, radius, angleDeg) {
    const cube = (w, h, d) => Manifold.cube([w, h, d], true);
    let fin = cube(w, depth, h);
    // Translate outwards along Y-axis from center
    let shiftY = radius + depth / 2;
    let moved = fin.translate([0, shiftY, 0]);
    fin.delete();
    if (angleDeg !== 0) {
        let rotated = moved.rotate([0, 0, angleDeg]);
        moved.delete();
        return rotated;
    }
    return moved;
}

export function generateLuerConnectors(Manifold, config, q) {
    const cube = (w, h, d) => Manifold.cube([w, h, d], true);
    const cylinder = (r, h, s = 64) => Manifold.cylinder(h, r, r, s, true);

    // =================================================================
    // BUILD BOTTOM MALE CONNECTOR
    // =================================================================
    let plugCyl = cylinder(config.plugD / 2, config.plugH, q);
    let plugCylMoved = plugCyl.translate([0, 0, config.plugH / 2]);
    plugCyl.delete();

    let baseCollar = cylinder(config.baseCylW / 2, config.baseCylD, q);
    let baseCollarMoved = baseCollar.translate([0, 0, -config.baseCylD / 2]);
    baseCollar.delete();

    const rCore = config.botCoreD / 2;
    let finCoreCyl = cylinder(rCore, config.finH, q);
    let finCoreMoved = finCoreCyl.translate([0, 0, -config.baseCylD - config.finH / 2]);
    finCoreCyl.delete();

    let finN = createFin(Manifold, config.finW, config.finD, config.finH, rCore, 0).translate([0, 0, -config.baseCylD - config.finH / 2]);
    let finS = createFin(Manifold, config.finW, config.finD, config.finH, rCore, 180).translate([0, 0, -config.baseCylD - config.finH / 2]);
    let finE = createFin(Manifold, config.finW, config.finD, config.finH, rCore, 90).translate([0, 0, -config.baseCylD - config.finH / 2]);
    let finW_ = createFin(Manifold, config.finW, config.finD, config.finH, rCore, -90).translate([0, 0, -config.baseCylD - config.finH / 2]);

    let finsUnion = Manifold.union(finCoreMoved, finN);
    let temp = finsUnion; finsUnion = Manifold.union(finsUnion, finS); temp.delete(); finN.delete(); finS.delete();
    temp = finsUnion; finsUnion = Manifold.union(finsUnion, finE); temp.delete(); finE.delete();
    temp = finsUnion; finsUnion = Manifold.union(finsUnion, finW_); temp.delete(); finW_.delete();
    finCoreMoved.delete();

    let u1 = Manifold.union(plugCylMoved, baseCollarMoved);
    const bottomPartModel = Manifold.union(u1, finsUnion);
    u1.delete();
    plugCylMoved.delete();
    baseCollarMoved.delete();
    finsUnion.delete();

    // =================================================================
    // BUILD TOP FEMALE CONNECTOR
    // =================================================================
    const collarH = config.plugH + 3;
    let topCollar = cylinder(config.topCylW / 2, collarH, q);
    let topCollarMoved = topCollar.translate([0, 0, collarH / 2]);
    topCollar.delete();

    let sqBlock = cube(config.topSqW, config.topSqD, config.topSqH);
    let sqBlockMoved = sqBlock.rotate([0, 0, 180]).translate([0, 0, collarH + config.topSqH / 2]);
    sqBlock.delete();

    let topSolid = Manifold.union(topCollarMoved, sqBlockMoved);
    topCollarMoved.delete();
    sqBlockMoved.delete();

    const cavD = config.plugD + config.tolerance * 2;
    const cavH = config.plugH + 0.2;
    let femaleCavity = cylinder(cavD / 2, cavH, q).translate([0, 0, cavH / 2]);

    const topPartModel = topSolid.subtract(femaleCavity);
    topSolid.delete();
    femaleCavity.delete();

    // =================================================================
    // BUILD LONG WORKSPACE-EDGE TUBES
    // =================================================================
    const edgeTubeLen = 130;
    let topEdgeTube = cylinder(config.topTubeD / 2, edgeTubeLen, q);
    let topEdgeTubeMoved = topEdgeTube.translate([0, 0, collarH + config.topSqH + edgeTubeLen / 2]);
    topEdgeTube.delete();

    let botEdgeTube = cylinder(config.botTubeD / 2, edgeTubeLen, q);
    let botEdgeTubeMoved = botEdgeTube.translate([0, 0, -config.baseCylD - config.finH - edgeTubeLen / 2]);
    botEdgeTube.delete();

    return {
        topPartModel,
        bottomPartModel,
        topEdgeTubeMoved,
        botEdgeTubeMoved
    };
}
