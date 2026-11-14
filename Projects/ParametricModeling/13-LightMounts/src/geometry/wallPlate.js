// Wall Plate geometry builder (flat drywall bracket with recessed female slider track)
import { context, params } from '../state.js';
import { makeCSGCylinder, makeCSGBox } from './helpers.js';

export function generateWallPlateGeometry() {
    if (!context.Manifold) return null;
    
    const Manifold = context.Manifold;
    
    // Recessed track wall plate specifications
    const plateW = params.wallPlateWidth;
    const plateH = params.wallPlateHeight;
    const plateT = 10.0; // Increased to 10mm to completely contain the recessed track
    
    const pivotZ = 8.5 + params.hingeOffsetZ;
    const knuckleX = -0.5 + params.hingeOffsetX;
    const sliderY = params.lightOffset;  
    
    // Backing plate sits behind sliderY (from Y = sliderY to Y = sliderY + 10.0)
    const plateY = sliderY + (plateT / 2);
    let backing = makeCSGBox(plateW, plateT, plateH, knuckleX, plateY, pivotZ);
    
    // Female track cutout (recessed inside the plate from the front face Y = sliderY)
    const clearance = params.wallClearance;
    
    const neckW = 20.0 + 2 * clearance;
    const neckT = 4.0 + clearance;
    const neckY = sliderY + (neckT / 2); // goes in +Y direction
    
    const headW = 28.0 + 2 * clearance;
    const headT = 4.0 + 2 * clearance;
    const headY = sliderY + 4.0 + (headT / 2) - clearance; // head sits behind the neck slot
    
    // Track height with end-stop (leaves 5mm solid stop at the bottom)
    const stopOffset = 5.0;
    const trackH = plateH - stopOffset + 4.0;
    const trackZ = pivotZ + (stopOffset / 2) + 2.0;
    
    let trackNeck = makeCSGBox(neckW, neckT, trackH, knuckleX, neckY, trackZ);
    let trackHead = makeCSGBox(headW, headT, trackH, knuckleX, headY, trackZ);
    let trackCutout = trackNeck.add(trackHead);
    trackNeck.delete();
    trackHead.delete();
    
    // Subtract recessed track from backing plate
    let slottedPlate = backing.subtract(trackCutout);
    backing.delete();
    trackCutout.delete();
    
    // 4. Slotted Drywall screw holes (two slots vertically spaced for multi-size screws)
    const holeD = params.screwHoleDiameter;
    const headD = params.screwHeadDiameter;
    
    const zOffset = params.screwSpacing / 2;
    const zCoords = [pivotZ - zOffset, pivotZ + zOffset];
    
    let result = slottedPlate;
    const slotH = 12.0; 
    const csDepth = 3.0; // depth of the countersink
    
    zCoords.forEach(z => {
        // Pilot slot running through the full Y depth of backing plate
        const pilotY = sliderY + (plateT / 2);
        let pilotSlot = makeCSGBox(holeD, plateT + 10.0, slotH, knuckleX, pilotY, z);
        
        // Countersink slot on the front/track side (facing arm, entering in +Y direction)
        const csY = sliderY + (csDepth / 2) - 0.1;
        let csSlot = makeCSGBox(headD, csDepth, slotH, knuckleX, csY, z);
        
        let temp1 = result.subtract(pilotSlot);
        let temp2 = temp1.subtract(csSlot);
        
        if (result !== slottedPlate) result.delete();
        pilotSlot.delete();
        csSlot.delete();
        temp1.delete();
        
        result = temp2;
    });
    
    return result;
}
