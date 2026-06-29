// Geometry generation for Luer connection Universal Wrench
import { createFin } from './connectors.js';

export function generateUniversalWrench(Manifold, config, q) {
    const cube = (w, h, d) => Manifold.cube([w, h, d], true);
    const cylinder = (r, h, s = 64) => Manifold.cylinder(h, r, r, s, true);

    const innerRingR = config.ringDiam / 2;
    const outerRingR = innerRingR + 5.0;
    
    const uwHeadR = 15;
    const uwHeadH = config.wrenchThick;
    const fullCutH = config.wrenchThick + 4;
    const socketOffsetX = -2;

    // --- STEP 1: BUILD SOLID BODY ---
    let uwHead = cylinder(uwHeadR, config.wrenchThick, q);
    
    const uwHandleEnd = -uwHeadR - config.wrenchHandleLen;
    const uwMidX = -uwHeadR - config.wrenchHandleLen / 2;
    
    const R_handle = config.handleDiam / 2;
    const transitionLength = 15.0;
    const handleLength = config.wrenchHandleLen;

    // Cylinder part of the handle
    let handleCyl = cylinder(R_handle, handleLength - transitionLength, q)
        .rotate([0, 90, 0])
        .translate([-uwHeadR - transitionLength - (handleLength - transitionLength) / 2, 0, 0]);

    // Tapered transition cone to Head to remove weak joint
    let transition = Manifold.cylinder(transitionLength, R_handle, config.wrenchThick / 2, q, true)
        .rotate([0, 90, 0])
        .translate([-uwHeadR - transitionLength / 2, 0, 0]);

    let uwBlend = cylinder(config.wrenchHandleW / 2 + 4, config.wrenchThick, q)
        .translate([-uwHeadR + 1, 0, 0]);

    let uwRoundEnd = cylinder(outerRingR, config.wrenchThick, q)
        .translate([uwHandleEnd, 0, 0]);
        
    let uwS1 = Manifold.union(uwHead, handleCyl);
    let uwS2 = Manifold.union(uwS1, transition);
    let uwS3 = Manifold.union(uwS2, uwBlend);
    let wrenchSolid = Manifold.union(uwS3, uwRoundEnd);
    
    uwHead.delete(); handleCyl.delete(); transition.delete(); uwBlend.delete(); uwRoundEnd.delete();
    uwS1.delete(); uwS2.delete(); uwS3.delete();

    // --- STEP 2: FLAT BOTTOM AND GROOVE ---
    const cutLen = handleLength + outerRingR * 2 + 10;
    // Flat cut at the bottom (Z <= -R_handle + 2.5 mm)
    let flatCut = cube(cutLen, outerRingR * 2 + 10, 10).translate([-uwHeadR - handleLength / 2, 0, -5.0 - R_handle + 2.5]);
    let handleFlat = wrenchSolid.subtract(flatCut);
    wrenchSolid.delete();
    flatCut.delete();

    // Parametric T-slot groove at the top with overhanging card guides
    const gBotZ = R_handle - config.grooveDepth;
    const gMidZ = R_handle - config.cardGuideLip;
    const gTopZ = R_handle + 1.0;

    let botGroove = cube(cutLen, config.grooveWidth, gMidZ - gBotZ)
        .translate([-uwHeadR - handleLength / 2, 0, (gBotZ + gMidZ) / 2]);
    let topOpening = cube(cutLen, config.grooveWidth - 2 * config.cardGuideLip, gTopZ - gMidZ)
        .translate([-uwHeadR - handleLength / 2, 0, (gMidZ + gTopZ) / 2]);

    let tSlotCutter = Manifold.union(botGroove, topOpening);
    botGroove.delete();
    topOpening.delete();

    let wrenchGrooved = handleFlat.subtract(tSlotCutter);
    handleFlat.delete();
    tSlotCutter.delete();

    // --- STEP 3: FINAL CUTOUTS ---
    // A) Connectors slots (Female square cavity + fins core + fins cutters)
    const tol = config.tolerance;
    const sqCutD = config.topSqD + tol * 2;
    const rCore = config.botCoreD / 2;
    const bwCoreR = rCore + tol;
    const sqCutW = config.topSqW + tol * 2;
    
    const sqLength = (uwHeadR + 5) + (sqCutW / 2);
    const sqCenterX = ((uwHeadR + 5) - (sqCutW / 2)) / 2;
    let uwSqSlot = cube(sqLength, sqCutD, fullCutH).translate([sqCenterX, 0, 0]);
    let uwCenterHole = cylinder(bwCoreR, fullCutH, q);
    
    let cutFinN = createFin(Manifold, config.finW + tol*2, config.finD + tol*2, fullCutH, rCore, 0);
    let cutFinS = createFin(Manifold, config.finW + tol*2, config.finD + tol*2, fullCutH, rCore, 180);
    let cutFinW_ = createFin(Manifold, config.finW + tol*2, config.finD + tol*2, fullCutH, rCore, 90);
    
    let c1 = Manifold.union(uwSqSlot, uwCenterHole);
    let c2 = Manifold.union(c1, cutFinN);
    let c3 = Manifold.union(c2, cutFinS);
    let cutters = Manifold.union(c3, cutFinW_);
    c1.delete(); c2.delete(); c3.delete();

    if (config.entryAngle > 0) {
        const X_outer = uwHeadR - socketOffsetX;
        const X_start = bwCoreR;
        const dx = X_outer - X_start;
        const theta = config.entryAngle;
        
        let topWedge = cube(30, 30, fullCutH)
            .translate([15, -15, 0])
            .rotate([0, 0, theta])
            .translate([X_start, sqCutD / 2, 0]);
        let topBox = cube(dx + 5, 30, fullCutH)
            .translate([X_start + (dx + 5) / 2, sqCutD / 2 + 15, 0]);
        let fullRampTop = topWedge.intersect(topBox);
        topWedge.delete();
        topBox.delete();
        
        let botWedge = cube(30, 30, fullCutH)
            .translate([15, 15, 0])
            .rotate([0, 0, -theta])
            .translate([X_start, -sqCutD / 2, 0]);
        let botBox = cube(dx + 5, 30, fullCutH)
            .translate([X_start + (dx + 5) / 2, -sqCutD / 2 - 15, 0]);
        let fullRampBot = botWedge.intersect(botBox);
        botWedge.delete();
        botBox.delete();
        
        let tempR = cutters;
        cutters = Manifold.union(cutters, fullRampTop);
        tempR.delete();
        
        tempR = cutters;
        cutters = Manifold.union(cutters, fullRampBot);
        tempR.delete();
        
        fullRampTop.delete();
        fullRampBot.delete();
    }
    
    let cuttersMoved = cutters.translate([socketOffsetX, 0, 0]);
    let wrenchWithSlots = wrenchGrooved.subtract(cuttersMoved);
    wrenchGrooved.delete();
    cutters.delete();
    cuttersMoved.delete();

    // B) Thumb hole (using tall cylinder to prevent handle leaks)
    let uwThumbHole = cylinder(innerRingR, 40, q).translate([uwHandleEnd, 0, 0]);
    let wrenchWithHole = wrenchWithSlots.subtract(uwThumbHole);
    wrenchWithSlots.delete();
    uwThumbHole.delete();
    
    const bottomWrenchModel = wrenchWithHole.translate([0, 0, 0]);
    
    return {
        topWrenchModel: wrenchWithHole,
        bottomWrenchModel
    };
}
