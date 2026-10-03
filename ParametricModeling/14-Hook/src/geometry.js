// Geometry builder module for 14-Hook
import * as THREE from 'three';
import { context, params } from './state.js';

export function makeCSGCylinder(r, h, x=0, y=0, z=0, rotX=0, rotY=0, rotZ=0) {
    const Manifold = context.Manifold;
    let cyl = Manifold.cylinder(h, r, r, 32, true);
    
    if (rotX !== 0 || rotY !== 0 || rotZ !== 0) {
        let rotated = cyl.rotate([rotX, rotY, rotZ]);
        cyl.delete();
        cyl = rotated;
    }
    
    if (x !== 0 || y !== 0 || z !== 0) {
        let translated = cyl.translate([x, y, z]);
        cyl.delete();
        cyl = translated;
    }
    return cyl;
}

export function makeCSGBox(w, d, h, x=0, y=0, z=0) {
    const Manifold = context.Manifold;
    let box = Manifold.cube([w, d, h], true);
    
    if (x !== 0 || y !== 0 || z !== 0) {
        let translated = box.translate([x, y, z]);
        box.delete();
        box = translated;
    }
    return box;
}

export function manifoldToThree(manifoldMesh) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(manifoldMesh.vertProperties, 3));
    geometry.setIndex(new THREE.Uint32BufferAttribute(manifoldMesh.triVerts, 1));
    geometry.computeVertexNormals();
    return geometry;
}

export function generateHookGeometry() {
    const Manifold = context.Manifold;
    if (!Manifold) return null;

    const bt = params.backplateThickness;
    const bw = params.backplateWidth;
    const screwSp = params.screwSpacing;
    const holeD = params.screwHoleDiameter;
    const headD = params.screwHeadDiameter;

    const bh = screwSp + headD * 2 + 10.0;

    // 1. Create Backplate
    let backplate = makeCSGBox(bt, bw, bh, bt / 2, 0, 0);

    // 2. Main Hook Projection block
    const sw = params.barThickness + params.slotTolerance;
    const sd = params.barWidth + params.slotTolerance;
    const wt = params.hookWallThickness;

    const hpl = 2 * wt + sw;
    const xf = bt + hpl;

    // hookBlock goes from z = -wt to z = sd
    let hookBlock = makeCSGBox(hpl, bw, sd + wt, bt + hpl / 2, 0, (sd - wt) / 2);

    // Union backplate and hook block
    let hookPart = backplate.add(hookBlock);
    backplate.delete();
    hookBlock.delete();

    // 3. Subtract Slot Pocket
    // Slot main pocket (Z from 0 to sd)
    let slotPocket = makeCSGBox(sw, bw + 4.0, sd + 2.0, bt + wt + sw / 2, 0, sd / 2 + 1.0);
    
    // Front lip cutout (opening of slot on top, above the lip height Z = slotLipHeight)
    const cutW_X = wt + sw + 2.0;
    const cutC_X = bt + wt + cutW_X / 2;
    const cutH_Z = sd - params.slotLipHeight + 2.0;
    const cutC_Z = params.slotLipHeight + cutH_Z / 2;
    let frontCut = makeCSGBox(cutW_X, bw + 4.0, cutH_Z, cutC_X, 0, cutC_Z);

    let temp1 = hookPart.subtract(slotPocket);
    hookPart.delete();
    slotPocket.delete();

    let temp2 = temp1.subtract(frontCut);
    temp1.delete();
    frontCut.delete();

    // 4. Add Bottom Support Ramp (Gusset)
    const rh = params.rampHeight;
    let rampBox = makeCSGBox(hpl, bw, rh, bt + hpl / 2, 0, -wt - rh / 2);

    // Diagonal cutting box
    const cutterSize = Math.max(hpl, rh) * 3;
    let rawCutter = Manifold.cube([cutterSize, bw + 4.0, cutterSize], true);
    
    const theta = Math.atan2(rh, hpl) * 180 / Math.PI;
    let rotatedCutter = rawCutter.rotate([0, theta, 0]);
    rawCutter.delete();

    const len = Math.sqrt(hpl * hpl + rh * rh);
    const nx = rh / len;
    const nz = -hpl / len;
    const shift = cutterSize / 2;
    let translatedCutter = rotatedCutter.translate([
        bt + hpl / 2 + nx * shift,
        0,
        -wt - rh / 2 + nz * shift
    ]);
    rotatedCutter.delete();

    let rampWedge = rampBox.subtract(translatedCutter);
    rampBox.delete();
    translatedCutter.delete();

    // Union ramp with body
    let finalBody = temp2.add(rampWedge);
    temp2.delete();
    rampWedge.delete();

    // 5. Subtract screw mounting holes
    const pilotHoleL = bt + 10.0;
    let topPilot = makeCSGCylinder(holeD / 2, pilotHoleL, bt / 2, 0, screwSp / 2, 0, 90, 0);
    let bottomPilot = makeCSGCylinder(holeD / 2, pilotHoleL, bt / 2, 0, -screwSp / 2, 0, 90, 0);

    let temp3 = finalBody.subtract(topPilot);
    finalBody.delete();
    topPilot.delete();

    let temp4 = temp3.subtract(bottomPilot);
    temp3.delete();
    bottomPilot.delete();

    // Subtract countersinks
    const csDepth = Math.max(1.0, bt - 2.0);
    let topCS = makeCSGCylinder(headD / 2, csDepth, bt - csDepth / 2, 0, screwSp / 2, 0, 90, 0);
    let bottomCS = makeCSGCylinder(headD / 2, csDepth, bt - csDepth / 2, 0, -screwSp / 2, 0, 90, 0);

    let temp5 = temp4.subtract(topCS);
    temp4.delete();
    topCS.delete();

    let temp6 = temp5.subtract(bottomCS);
    temp5.delete();
    bottomCS.delete();

    return temp6;
}

export function generateBarGeometry() {
    const Manifold = context.Manifold;
    if (!Manifold) return null;

    const bt = params.backplateThickness;
    const wt = params.hookWallThickness;
    const tol = params.slotTolerance;
    
    // Bar thickness = barThickness, Bar width = barWidth, Bar length = 120mm
    const barLen = 120.0;
    
    let bar = makeCSGBox(params.barThickness, barLen, params.barWidth, bt + wt + tol / 2 + params.barThickness / 2, 0, params.barWidth / 2);
    return bar;
}
