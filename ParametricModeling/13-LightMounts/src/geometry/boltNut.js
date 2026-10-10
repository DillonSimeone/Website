// 3D Printed Hex Bolt and Nut geometry builders with triangular thread profiles
import { context, params } from '../state.js';
import { makeCSGCylinder } from './helpers.js';

export function generateBoltGeometry() {
    if (!context.Manifold) return null;
    const Manifold = context.Manifold;
    
    // Bolt shaft parameters
    const pinD = params.hingePinDiameter;
    const pinR = pinD / 2;
    
    const prongThick = 7.0;
    const clearance = 0.25;
    const armW = params.hingeWidth + 2 * (prongThick + clearance);
    const shaftLength = armW + 12.0; 
    
    // Hex Head dimensions
    const headD = pinD * 1.8;
    const headR = headD / 2;
    const headH = Math.max(5.0, pinD * 0.8);
    
    // Hinge Pivot center coordinates
    const backY = 36.0;
    const pivotY = backY + params.hingeKnuckleRadius + 12.0 + params.hingeOffsetY;
    const pivotZ = -0.58 + params.hingeOffsetZ;
    const knuckleX = -0.5 + params.hingeOffsetX;
    
    // 1. Create Hex Head (cylinder with 6 segments)
    const headX = knuckleX - (shaftLength / 2) - (headH / 2) + 2.0;
    let rawHead = Manifold.cylinder(headH, headR, headR, 6, true);
    let rotatedHead = rawHead.rotate([0, 90, 0]);
    rawHead.delete();
    let head = rotatedHead.translate([headX, pivotY, pivotZ]);
    rotatedHead.delete();
    
    // 2. Smooth Shoulder (left portion of the shaft)
    const shoulderLength = shaftLength - 16.0; // leave the right 16mm for threads
    const shoulderX = headX + (headH / 2) + (shoulderLength / 2);
    let shoulder = makeCSGCylinder(pinR, shoulderLength, shoulderX, pivotY, pivotZ, 0, 90, 0);
    
    // 3. Threaded Shaft (right portion of the shaft)
    const threadedLength = 16.0;
    const threadStartX = shoulderX + (shoulderLength / 2);
    
    // Generate triangular thread profile rings stacked along the shaft
    const pitch = 1.5; // thread pitch
    const threadDepth = 0.6; // thread depth
    const crestR = pinR;
    const rootR = pinR - threadDepth;
    const numThreads = Math.floor(threadedLength / pitch);
    
    // Single thread pitch ring (two back-to-back cones forming a triangle)
    let cone1 = Manifold.cylinder(pitch / 2, rootR, crestR, 16, true);
    let cone2 = Manifold.cylinder(pitch / 2, crestR, rootR, 16, true);
    let c1 = cone1.translate([0, 0, -pitch / 4]);
    let c2 = cone2.translate([0, 0, pitch / 4]);
    let rawRing = c1.add(c2);
    cone1.delete();
    cone2.delete();
    c1.delete();
    c2.delete();
    
    let threadRing = rawRing.rotate([0, 90, 0]);
    rawRing.delete();
    
    // Stack thread rings
    let threadsGroup = null;
    for (let i = 0; i < numThreads; i++) {
        const xOffset = threadStartX + (i + 0.5) * pitch;
        let ring = threadRing.translate([xOffset, pivotY, pivotZ]);
        if (!threadsGroup) {
            threadsGroup = ring;
        } else {
            let temp = threadsGroup.add(ring);
            threadsGroup.delete();
            ring.delete();
            threadsGroup = temp;
        }
    }
    threadRing.delete();
    
    // Core cylinder for the threaded section
    const coreX = threadStartX + (threadedLength / 2);
    let threadCore = makeCSGCylinder(rootR, threadedLength, coreX, pivotY, pivotZ, 0, 90, 0);
    
    let threadedSection = threadCore.add(threadsGroup);
    threadCore.delete();
    threadsGroup.delete();
    
    // Combine everything: head + shoulder + threaded section
    let body = head.add(shoulder);
    let bolt = body.add(threadedSection);
    head.delete();
    shoulder.delete();
    threadedSection.delete();
    body.delete();
    
    return bolt;
}

export function generateNutGeometry() {
    if (!context.Manifold) return null;
    const Manifold = context.Manifold;
    
    // Hex Nut dimensions
    const headD = params.hingePinDiameter * 1.8;
    const headR = headD / 2;
    const nutH = Math.max(4.0, params.hingePinDiameter * 0.7);
    
    const prongThick = 7.0;
    const clearance = 0.25;
    const armW = params.hingeWidth + 2 * (prongThick + clearance);
    const shaftLength = armW + 12.0;
    
    // Hinge Pivot center coordinates
    const backY = 36.0;
    const pivotY = backY + params.hingeKnuckleRadius + 12.0 + params.hingeOffsetY;
    const pivotZ = -0.58 + params.hingeOffsetZ;
    const knuckleX = -0.5 + params.hingeOffsetX;
    
    // Position nut on the right side of the bracket
    const nutX = knuckleX + (shaftLength / 2) - (nutH / 2) + 1.0;
    
    // 1. Create Hex outer body (6 segments)
    let rawNut = Manifold.cylinder(nutH, headR, headR, 6, true);
    let rotatedNut = rawNut.rotate([0, 90, 0]);
    rawNut.delete();
    let nutBody = rotatedNut.translate([nutX, pivotY, pivotZ]);
    rotatedNut.delete();
    
    // 2. Create matching internal threads (cutout)
    const pinR = params.hingePinDiameter / 2;
    const pitch = 1.5;
    const threadDepth = 0.6;
    // Add extra clearance tolerance to the nut internal threads for ease of 3D printing
    const nutTolerance = 0.15;
    const crestR = pinR + nutTolerance;
    const rootR = pinR - threadDepth + nutTolerance;
    
    const numThreads = Math.ceil((nutH + 2) / pitch);
    
    let cone1 = Manifold.cylinder(pitch / 2, rootR, crestR, 16, true);
    let cone2 = Manifold.cylinder(pitch / 2, crestR, rootR, 16, true);
    let c1 = cone1.translate([0, 0, -pitch / 4]);
    let c2 = cone2.translate([0, 0, pitch / 4]);
    let rawRing = c1.add(c2);
    cone1.delete();
    cone2.delete();
    c1.delete();
    c2.delete();
    
    let threadRing = rawRing.rotate([0, 90, 0]);
    rawRing.delete();
    
    let nutThreadsGroup = null;
    const startX = nutX - (nutH / 2) - 1.0;
    for (let i = 0; i < numThreads; i++) {
        const xOffset = startX + (i + 0.5) * pitch;
        let ring = threadRing.translate([xOffset, pivotY, pivotZ]);
        if (!nutThreadsGroup) {
            nutThreadsGroup = ring;
        } else {
            let temp = nutThreadsGroup.add(ring);
            nutThreadsGroup.delete();
            ring.delete();
            nutThreadsGroup = temp;
        }
    }
    threadRing.delete();
    
    // Core hole cylinder
    let holeCore = makeCSGCylinder(rootR, nutH + 2, nutX, pivotY, pivotZ, 0, 90, 0);
    let threadCutout = holeCore.add(nutThreadsGroup);
    holeCore.delete();
    nutThreadsGroup.delete();
    
    // Subtract threads from hex body
    let nut = nutBody.subtract(threadCutout);
    nutBody.delete();
    threadCutout.delete();
    
    return nut;
}
