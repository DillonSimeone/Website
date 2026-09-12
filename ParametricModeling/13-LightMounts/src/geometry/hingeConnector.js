// Hinge Connector geometry builder — L-shaped standoff arm with solid gusset ramp
import { context, params } from '../state.js';
import { makeCSGCylinder, makeCSGBox } from './helpers.js';

export function generateHingeConnectorGeometry() {
    if (!context.Manifold) return null;
    
    const Manifold = context.Manifold;
    
    const r = params.hingeKnuckleRadius;
    const w = params.hingeWidth;
    const pinR = params.hingePinDiameter / 2;
    
    // Hinge Pivot center — +Y side of the frame
    const backY = 36.0;
    const pivotY = backY + r + 12.0 + params.hingeOffsetY;
    const pivotZ = -0.58 + params.hingeOffsetZ;
    const knuckleX = -0.5 + params.hingeOffsetX;
    
    // Wall plate front face (arm-side surface)
    const sliderY = params.lightOffset;
    
    // --- CLEVIS PRONGS at the hinge end ---
    const prongThick = 7.0;
    const clearance = 0.25;
    const prongW = prongThick;
    const leftX = knuckleX - (w / 2 + clearance + prongW / 2);
    const rightX = knuckleX + (w / 2 + clearance + prongW / 2);
    
    let leftProng = makeCSGCylinder(r, prongW, leftX, pivotY, pivotZ, 0, 90, 0);
    let rightProng = makeCSGCylinder(r, prongW, rightX, pivotY, pivotZ, 0, 90, 0);
    let prongs = leftProng.add(rightProng);
    leftProng.delete();
    rightProng.delete();
    
    // --- HORIZONTAL STANDOFF ARM ---
    const armW = w + 2 * (prongThick + clearance); // 34.5mm wide
    const armH = 24.0;
    const armD = Math.max(4.0, Math.abs(sliderY - pivotY));
    const armCenterY = (pivotY + sliderY) / 2;
    
    let arm = makeCSGBox(armW, armD, armH, knuckleX, armCenterY, pivotZ);
    
    // Combine prongs and arm
    let body = prongs.add(arm);
    prongs.delete();
    arm.delete();
    
    // --- DUAL OUTER TRUSS RAMPS (Symmetric Top & Bottom side ribs) ---
    // These run along the outer left/right side arms from the hinge to the wall plate,
    // reinforcing the slider key both from the top and bottom against shear stress.
    const ribW = 7.0; 
    const ribH = 18.0; // height of each gusset ramp (top and bottom)
    const rampD = sliderY - (pivotY + 12.0); 
    const blockCenterY = (pivotY + 12.0) + rampD / 2;
    const cutterSize = rampD * 3;
    const slopeAngleRad = Math.atan2(ribH, rampD);
    const slopeAngleDeg = (slopeAngleRad * 180) / Math.PI;
    
    // 1. Bottom Ramps (Z from pivotZ - 12 to pivotZ - 30)
    const bottomCenterZ = pivotZ - 12.0 - (ribH / 2);
    let leftBottom = makeCSGBox(ribW, rampD, ribH, leftX, blockCenterY, bottomCenterZ);
    let rightBottom = makeCSGBox(ribW, rampD, ribH, rightX, blockCenterY, bottomCenterZ);
    let bottomSolid = leftBottom.add(rightBottom);
    leftBottom.delete();
    rightBottom.delete();
    
    let rawCutter1 = Manifold.cube([armW + 2, cutterSize, cutterSize], true);
    let rotatedCutter1 = rawCutter1.rotate([-slopeAngleDeg, 0, 0]);
    rawCutter1.delete();
    
    const normalY = -Math.sin(slopeAngleRad); 
    const normalZ = -Math.cos(slopeAngleRad);
    const shiftDist = cutterSize / 2;
    const cutter1Y = blockCenterY + normalY * shiftDist;
    const cutter1Z = bottomCenterZ + normalZ * shiftDist;
    
    let translatedCutter1 = rotatedCutter1.translate([knuckleX, cutter1Y, cutter1Z]);
    rotatedCutter1.delete();
    
    let cleanBottomRamp = bottomSolid.subtract(translatedCutter1);
    bottomSolid.delete();
    translatedCutter1.delete();
    
    // 2. Top Ramps (Z from pivotZ + 12 to pivotZ + 30)
    const topCenterZ = pivotZ + 12.0 + (ribH / 2);
    let leftTop = makeCSGBox(ribW, rampD, ribH, leftX, blockCenterY, topCenterZ);
    let rightTop = makeCSGBox(ribW, rampD, ribH, rightX, blockCenterY, topCenterZ);
    let topSolid = leftTop.add(rightTop);
    leftTop.delete();
    rightTop.delete();
    
    let rawCutter2 = Manifold.cube([armW + 2, cutterSize, cutterSize], true);
    let rotatedCutter2 = rawCutter2.rotate([slopeAngleDeg, 0, 0]);
    rawCutter2.delete();
    
    const cutter2Y = blockCenterY + normalY * shiftDist;
    const cutter2Z = topCenterZ - normalZ * shiftDist; 
    
    let translatedCutter2 = rotatedCutter2.translate([knuckleX, cutter2Y, cutter2Z]);
    rotatedCutter2.delete();
    
    let cleanTopRamp = topSolid.subtract(translatedCutter2);
    topSolid.delete();
    translatedCutter2.delete();
    
    // Union both top and bottom ramps to the body
    let bodyWithBottom = body.add(cleanBottomRamp);
    let fullTrussBody = bodyWithBottom.add(cleanTopRamp);
    body.delete();
    cleanBottomRamp.delete();
    cleanTopRamp.delete();
    bodyWithBottom.delete();
    body = fullTrussBody;
    
    // --- LOCAL HINGE CLEARANCE POCKET ---
    // Cuts a local slot in the front of the arm to clear the knuckle cylinder (width 20.5mm).
    const slotW = w + 2 * clearance; 
    const slotD = r + 4.0; // 12mm total depth from pivot center
    const slotH = 80.0;
    const slotCenterY = pivotY + (slotD / 2) - 1.0; 
    let centralSlot = makeCSGBox(slotW, slotD + r, slotH, knuckleX, slotCenterY, pivotZ);
    
    let slottedBody = body.subtract(centralSlot);
    body.delete();
    centralSlot.delete();
    body = slottedBody;
    
    // --- MALE T-SLOT SLIDER KEY (Protrudes from flat back face in +Y direction) ---
    const sliderH = params.wallPlateHeight - 10.0;
    
    // Neck starts at Y = sliderY and extends 4mm inside the wall plate
    const neckW = 20.0; // Widened to 20mm
    const neckT = 4.0;
    const neckY = sliderY + (neckT / 2);
    let maleNeck = makeCSGBox(neckW, neckT, sliderH, knuckleX, neckY, pivotZ);
    
    // Head sits behind the neck (Y = sliderY + 4.0 to sliderY + 8.0)
    const headW = 28.0; // Widened to 28mm
    const headT = 4.0;
    const headY = sliderY + neckT + (headT / 2); 
    let maleHead = makeCSGBox(headW, headT, sliderH, knuckleX, headY, pivotZ);
    
    let maleSlider = maleNeck.add(maleHead);
    maleNeck.delete();
    maleHead.delete();
    
    // --- VERTICAL U-SHAPED RELIEF CHANNEL ---
    const reliefW = params.screwHeadDiameter + 1.5;
    const reliefDepth = 12.0;
    const reliefY = sliderY + 4.0; 
    let reliefChannel = makeCSGBox(reliefW, reliefDepth, sliderH + 2.0, knuckleX, reliefY, pivotZ);
    
    let clearedSlider = maleSlider.subtract(reliefChannel);
    maleSlider.delete();
    reliefChannel.delete();
    
    // Union body and slider key
    let fullBody = body.add(clearedSlider);
    body.delete();
    clearedSlider.delete();
    
    // --- SUBTRACT PIN HOLE ---
    const pinHoleW = armW + 4.0;
    let pinHole = makeCSGCylinder(pinR, pinHoleW, knuckleX, pivotY, pivotZ, 0, 90, 0);
    let result = fullBody.subtract(pinHole);
    
    fullBody.delete();
    pinHole.delete();
    
    return result;
}
