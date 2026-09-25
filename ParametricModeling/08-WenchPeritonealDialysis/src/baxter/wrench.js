// Socket Wrench geometry generation for Baxter Twist config
import { makeText } from '../text-geom.js';

export function generateSocketWrench(Manifold, config, q) {
    const cube = (w, h, d) => Manifold.cube([w, h, d], true);
    const cylinder = (r, h, s = 64) => Manifold.cylinder(h, r, r, s, true);

    const tipR = config.tipDiam / 2;
    const sInnerR = tipR + config.tolerance;
    const sFlatDist = config.socketDiam + config.tolerance * 2;
    const sOuterR = sInnerR + config.socketWall;
    const sHeadH = config.socketDepth;

    const R_handle = config.handleDiam / 2;
    const Z_flat = -R_handle + 2.5;

    // Extend the head and collar down to Z_flat
    const headH = (sHeadH - config.sHandleThick / 2) - Z_flat;
    const headZ = ((sHeadH - config.sHandleThick / 2) + Z_flat) / 2;
    const sHeadShiftZ = headZ;

    // --- STEP 1: BUILD SOLID BODY ---
    let sOuterCyl = cylinder(sOuterR, headH, q).translate([0, 0, headZ]);
    const hexFlat = sOuterR * Math.cos(Math.PI / 6);
    let sHexCutter = null;
    for (let i = 0; i < 6; i++) {
        const ang = i * 60;
        let slab = cube(sOuterR * 3, sOuterR * 3, headH + 4)
            .translate([sOuterR * 1.5 + hexFlat, 0, 0])
            .rotate([0, 0, ang])
            .translate([0, 0, headZ]);
        if (sHexCutter === null) sHexCutter = slab;
        else {
            let tH = sHexCutter;
            sHexCutter = Manifold.union(sHexCutter, slab);
            tH.delete();
            slab.delete();
        }
    }
    if (sHexCutter) {
        let tO = sOuterCyl;
        sOuterCyl = sOuterCyl.subtract(sHexCutter);
        tO.delete();
        sHexCutter.delete();
    }

    const collarH = (config.sHandleThick / 2) - Z_flat;
    const collarZ = (config.sHandleThick / 2 + Z_flat) / 2;
    let sCollar = cylinder(sOuterR, collarH, q).translate([0, 0, collarZ]);

    const collarBoreH = (config.sHandleThick / 2) - Z_flat + 2;
    const collarBoreZ = collarZ;
    let sCollarBore = cylinder(sInnerR, collarBoreH, q).translate([0, 0, collarBoreZ]);
    let sCollarShell = sCollar.subtract(sCollarBore);
    sCollar.delete();
    sCollarBore.delete();

    // Wrench Head Solid
    let sHeadSolid = Manifold.union(sOuterCyl, sCollarShell);
    sOuterCyl.delete();
    sCollarShell.delete();

    // Wrench Handle Solid
    const sHeadOuterR = sOuterR;
    const sHandleEndX = -sHeadOuterR - config.sHandleLen;
    const sHandleMidX = -sHeadOuterR - config.sHandleLen / 2;
    const sHandleTotalLen = sHeadOuterR + config.sHandleLen;

    const sInnerRingR = config.sRingDiam / 2;
    const sOuterRingR = sInnerRingR + 5.0;

    const transitionLength = 15.0;
    const handleLength = config.sHandleLen;
    const overlap = 14.0; // Sink the handle/transition 14mm deep into the circular head
    const transitionStartX = -sHeadOuterR + overlap;

    // Cylinder part of the handle
    let handleCyl = cylinder(R_handle, handleLength - transitionLength + overlap, q)
        .rotate([0, 90, 0])
        .translate([sHandleEndX + (handleLength - transitionLength + overlap) / 2, 0, 0]);

    // Flat top block to contain the groove and ensure lips are not cut away
    let handleBlock = cube(handleLength - transitionLength + overlap, config.grooveWidth + 4, R_handle)
        .translate([sHandleEndX + (handleLength - transitionLength + overlap) / 2, 0, R_handle / 2]);

    // Tapered transition cone to Head (overlapping into head to make joint strong)
    let transition = Manifold.cylinder(transitionLength, R_handle, config.sHandleThick / 2, q, true)
        .rotate([0, 90, 0])
        .translate([transitionStartX - transitionLength / 2, 0, 0]);

    // Round end ring
    const ringH = (config.sHandleThick / 2) - Z_flat;
    const ringZ = (config.sHandleThick / 2 + Z_flat) / 2;
    let sRoundEnd = cylinder(sOuterRingR, ringH, q).translate([sHandleEndX, 0, ringZ]);

    // Union handle components
    let handleParts = Manifold.union(handleCyl, handleBlock);
    let handleParts2 = Manifold.union(handleParts, transition);
    let handleSolid = Manifold.union(handleParts2, sRoundEnd);
    handleCyl.delete();
    handleBlock.delete();
    transition.delete();
    sRoundEnd.delete();
    handleParts.delete();
    handleParts2.delete();

    // Combine Wrench Head and Wrench Handle
    let wrenchSolid = Manifold.union(sHeadSolid, handleSolid);
    sHeadSolid.delete();
    handleSolid.delete();

    // --- STEP 2: FLAT BOTTOM AND GROOVE ---
    const cutLen = handleLength + sOuterRingR * 2 + 10;
    // Flat cut at the bottom (Z <= -R_handle + 2.5 mm)
    let flatCut = cube(cutLen, sOuterRingR * 2 + 10, 10).translate([-sHeadOuterR - handleLength / 2, 0, -5.0 - R_handle + 2.5]);
    let wrenchFlat = wrenchSolid.subtract(flatCut);
    wrenchSolid.delete();
    flatCut.delete();

    // Parametric T-slot groove at the top with overhanging card guides
    const gBotZ = R_handle - config.grooveDepth;
    const gMidZ = R_handle - config.cardGuideLip;
    const gTopZ = R_handle + 1.0;

    let botGroove = cube(cutLen, config.grooveWidth, gMidZ - gBotZ)
        .translate([-sHeadOuterR - handleLength / 2, 0, (gBotZ + gMidZ) / 2]);
    let topOpening = cube(cutLen, config.grooveWidth - 2 * config.cardGuideLip, gTopZ - gMidZ)
        .translate([-sHeadOuterR - handleLength / 2, 0, (gMidZ + gTopZ) / 2]);
    
    let tSlotCutter = Manifold.union(botGroove, topOpening);
    botGroove.delete();
    topOpening.delete();

    let wrenchGrooved = wrenchFlat.subtract(tSlotCutter);
    wrenchFlat.delete();
    tSlotCutter.delete();

    // --- STEP 3: FINAL CUTOUTS ---
    // A) Hex socket / inner bore cut (Using tall cylinder to cut through entire handle depth)
    let sFinalBore = cylinder(sInnerR, 40, q).translate([0, 0, sHeadShiftZ]);
    const cutBoxSize = config.tipDiam + 10;
    let sFinalSlab = cube(cutBoxSize, sFlatDist, 40).translate([0, 0, sHeadShiftZ]);
    let sFinalBoreClipped = Manifold.intersection(sFinalBore, sFinalSlab);
    sFinalBore.delete();
    sFinalSlab.delete();

    let wrenchWithBore = wrenchGrooved.subtract(sFinalBoreClipped);
    wrenchGrooved.delete();
    sFinalBoreClipped.delete();

    // B) Thumb hole (using tall cylinder to prevent handle leaks)
    let sThumbHole = cylinder(sInnerRingR, 40, q).translate([sHandleEndX, 0, 0]);
    let wrenchWithHole = wrenchWithBore.subtract(sThumbHole);
    wrenchWithBore.delete();
    sThumbHole.delete();

    return wrenchWithHole;
}
