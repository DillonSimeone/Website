// Geometry generation for Baxter PD Cable reference models

export function makeMiddleCylinder(Manifold, r, len, gDepth, rWidth, nRidges, q) {
    const cube = (w, h, d) => Manifold.cube([w, h, d], true);
    const cylinder = (r, h, s = 64) => Manifold.cylinder(h, r, r, s, true);

    let midCyl = cylinder(r, len, q);
    const totalRidges = nRidges;
    let ridgesUnion = null;
    for (let i = 0; i < totalRidges; i++) {
        const angle = (i * 360) / totalRidges;
        let ridgeBox = cube(r + gDepth + 2, rWidth, len + 2)
            .translate([r / 2, 0, 0])
            .rotate([0, 0, angle]);
        if (ridgesUnion === null) {
            ridgesUnion = ridgeBox;
        } else {
            let temp = ridgesUnion;
            ridgesUnion = Manifold.union(ridgesUnion, ridgeBox);
            temp.delete();
            ridgeBox.delete();
        }
    }
    let grooveShell = cylinder(r, len + 2, q);
    let innerKeep = cylinder(r - gDepth, len + 2, q);
    let shellOnly = grooveShell.subtract(innerKeep);
    grooveShell.delete(); innerKeep.delete();

    if (ridgesUnion !== null) {
        let grooveOnly = shellOnly.subtract(ridgesUnion);
        shellOnly.delete(); ridgesUnion.delete();
        let tempMid = midCyl;
        midCyl = midCyl.subtract(grooveOnly);
        tempMid.delete(); grooveOnly.delete();
    } else {
        shellOnly.delete();
    }
    return midCyl;
}

export function generateBaxterCable(Manifold, config, q) {
    const cube = (w, h, d) => Manifold.cube([w, h, d], true);
    const cylinder = (r, h, s = 64) => Manifold.cylinder(h, r, r, s, true);

    const tipR = config.tipDiam / 2;
    const midR = config.midDiam / 2;
    const botTopR = config.botTopDiam / 2;
    const botBotR = config.botBottomDiam / 2;

    const baxterMiddleModel = makeMiddleCylinder(Manifold, midR, config.midLength, config.grooveDepth, config.ridgeWidth, config.numRidges, q);

    let tipCyl = cylinder(tipR, config.tipTotalH, q);
    const flatCutDepth = tipR - config.tipFlatH / 2;
    if (flatCutDepth > 0) {
        const cutBoxSize = config.tipDiam + 4;
        let flatCut1 = cube(cutBoxSize, cutBoxSize, config.tipTotalH + 2).translate([0, config.tipFlatH / 2 + cutBoxSize / 2, 0]);
        let flatCut2 = cube(cutBoxSize, cutBoxSize, config.tipTotalH + 2).translate([0, -(config.tipFlatH / 2 + cutBoxSize / 2), 0]);
        let tempTip = tipCyl;
        tipCyl = tipCyl.subtract(flatCut1); tempTip.delete();
        tempTip = tipCyl;
        tipCyl = tipCyl.subtract(flatCut2); tempTip.delete();
        flatCut1.delete(); flatCut2.delete();
    }
    const baxterTipModel = tipCyl;

    let botTaper = Manifold.cylinder(config.botLength, botBotR, botTopR, q, true);
    let botSolid = botTaper;
    const refNotchDepth = 1.0;
    const refNotchWidth = 1.6;
    const rampLen = config.botLength / 2;
    const slope = refNotchDepth / rampLen;
    const rotAngleRad = Math.atan(slope);
    const rotAngleDeg = (rotAngleRad * 180) / Math.PI;
    let notchesUnion = null;
    for (let i = 0; i < 8; i++) {
        let angle = (i * 360) / 8;
        let notchBox = cube(4.0, refNotchWidth, rampLen);
        let pivotedBox = notchBox.translate([botBotR + 2.0, 0, -rampLen / 2]).translate([-botBotR, 0, 0]).rotate([0, rotAngleDeg, 0]).translate([botBotR, 0, 0]).rotate([0, 0, angle]);
        notchBox.delete();
        if (notchesUnion === null) notchesUnion = pivotedBox;
        else { let tN = notchesUnion; notchesUnion = Manifold.union(notchesUnion, pivotedBox); tN.delete(); pivotedBox.delete(); }
    }
    if (notchesUnion !== null) { let tB = botSolid; botSolid = botSolid.subtract(notchesUnion); tB.delete(); notchesUnion.delete(); }
    const baxterBottomModel = botSolid;

    // Tube reference geometry
    const tubeLen = 100.0, tubeR = 3.5, tubeOverlap = 5.0;
    const midLength = config.midLength;
    const botLength = config.botLength;
    const botCenterZ = -(midLength / 2 + botLength / 2);
    const adapterBottomZ = botCenterZ - botLength / 2;
    const tubeCenterZ = adapterBottomZ + tubeOverlap - tubeLen / 2;
    const botTube = cylinder(tubeR, tubeLen, q).translate([0, 0, tubeCenterZ]);

    return {
        baxterMiddleModel,
        baxterTipModel,
        baxterBottomModel,
        botTube
    };
}
