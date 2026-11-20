// Light Frame geometry builder (generates the knuckle additions and flattens the STL back)
import { context, params } from '../state.js';
import { makeCSGCylinder, makeCSGBox } from './helpers.js';

// Project vertices on the back face to be flat at cutY
export function flattenStlBackside(geometry, cutY = 36.0) {
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
        let y = position.getY(i);
        if (y > cutY) {
            position.setY(i, cutY);
        }
    }
    position.needsUpdate = true;
    geometry.computeBoundsTree ? geometry.computeBoundsTree() : null;
    geometry.computeVertexNormals();
}

export function generateLightFrameGeometry() {
    if (!context.Manifold) return null;
    
    const Manifold = context.Manifold;
    const r = params.hingeKnuckleRadius;
    const w = params.hingeWidth;
    const pinR = params.hingePinDiameter / 2;
    
    const backY = 36.0; // flat reference plane
    
    // Aligned centers with an extra 12mm standoff spacer to move the hinge pivot
    // further away from the backplate, providing full clearance for the bolt and nut.
    const knuckleX = -0.5 + params.hingeOffsetX;
    const knuckleY = backY + r + 12.0 + params.hingeOffsetY; // +12.0mm shift in +Y
    const knuckleZ = -0.58 + params.hingeOffsetZ;
    
    // 1. Hinge knuckle cylinder (centered at the pivot point)
    let knuckle = makeCSGCylinder(r, w, knuckleX, knuckleY, knuckleZ, 0, 90, 0);
    
    // 2. Wide thin backplate (77x75x3mm) to mount flush against the flat STL surface
    const plateW = 77.0;
    const plateH = 75.0;
    const backplateT = 3.0; 
    const plateY = backY + (backplateT / 2);
    let mountPlate = makeCSGBox(plateW, backplateT, plateH, knuckleX, plateY, knuckleZ);
    
    // 3. Extended solid support neck bridging the gap between backplate and knuckle.
    //    Its width matches w (20mm) so prongs have clearance on the sides.
    const supportW = w; 
    const supportD = Math.max(1.0, knuckleY - (backY + backplateT));
    const supportH = r * 2;
    const supportY = (backY + backplateT) + (supportD / 2);
    let support = makeCSGBox(supportW, supportD, supportH, knuckleX, supportY, knuckleZ);
    
    // Union components: backplate + support neck + knuckle cylinder
    let combined = mountPlate.add(support);
    let combinedKnuckle = combined.add(knuckle);
    mountPlate.delete();
    support.delete();
    knuckle.delete();
    combined.delete();
    
    // 4. Subtract pin hole (clearance for the bolt)
    let pinHole = makeCSGCylinder(pinR, Math.max(w, plateW) + 4, knuckleX, knuckleY, knuckleZ, 0, 90, 0);
    let additions = combinedKnuckle.subtract(pinHole);
    combinedKnuckle.delete();
    pinHole.delete();
    
    return additions;
}
