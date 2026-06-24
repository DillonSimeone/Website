import { context, params } from '../state.js';
import { makeCSGCylinder } from './helpers.js';

// Type 130 DC Motor dimensions (mm)
export const MOTOR_130 = {
    bodyLength: 27.5,   // along shaft axis
    bodyWidth: 20.0,    // perpendicular to shaft (wider side)
    bodyHeight: 15.0,   // perpendicular to shaft (flat side)
    shaftDiam: 2.0,
    shaftLength: 9.0,
    mountTolerance: 0.3 // clearance around motor body
};

export function generateMotorHolderGeometry(D_in, D_out) {
    const Manifold = context.Manifold;
    if (!Manifold) return null;

    const T_cap = params.wallThick;
    const c = params.tolerance;
    const R_g_out = (D_out / 2) + c;
    const R_cap_out = R_g_out + T_cap;

    const wallT = 3.0;

    // Motor dimensions - motor is HORIZONTAL (shaft along X-axis)
    const mBodyL = MOTOR_130.bodyLength + MOTOR_130.mountTolerance * 2; // X size of pocket
    const mBodyW = MOTOR_130.bodyWidth + MOTOR_130.mountTolerance * 2;  // Y size of pocket (tangential)
    const mBodyH = MOTOR_130.bodyHeight + MOTOR_130.mountTolerance * 2; // Z size of pocket (axial)

    // Holder height parameters
    const holderHeight = 16.0;

    // Calculate gear mesh distance
    const mod = 2.0;
    const ringThick = 6.0;
    const ringInnerR = R_cap_out;
    const ringBodyOuterR = ringInnerR + ringThick;
    const ringCenterR = ringBodyOuterR - ringThick / 2;
    
    // Motor shaft sits at global Z = -13.0 (under the Z = -3.0 ring gear bottom face)
    const shaftZ_l = 4.0;
    const motorPocketCenterX = (ringCenterR - 5.0) - mBodyL / 2;

    // 1. Outer cylinder body (radius R_cap_out, local Z range 0.0 to 16.0)
    let body = makeCSGCylinder(R_cap_out, holderHeight, 0, 0, holderHeight / 2);

    // 2. Hollow out the entire inside (radius 0 to R_cap_out - wallT, local Z = -6.2 to 16.2)
    // This makes the motor holder a completely hollow cylinder shell before adding U-holder blocks
    let hollowCyl = makeCSGCylinder(R_cap_out - wallT, 22.4, 0, 0, 5.0);
    let temp = body.subtract(hollowCyl);
    body.delete();
    hollowCyl.delete();
    body = temp;

    // 3. Add localized motor U-holder blocks with thick side walls (local Z range -4.0 to 16.0)
    let uHolder = Manifold.cube([mBodyL + 2.0, mBodyW + 10.0, 20.0], true);
    let uTrans1 = uHolder.translate([motorPocketCenterX, 0, 6.0]);
    let uTrans2 = uHolder.translate([-motorPocketCenterX, 0, 6.0]);
    uHolder.delete();

    let tempBody = body.add(uTrans1);
    body.delete();
    uTrans1.delete();

    let tempBody2 = tempBody.add(uTrans2);
    tempBody.delete();
    uTrans2.delete();
    body = tempBody2;

    // 4. Add the hollow central shaft tube extending from local Z = -6.0 to 16.0 (cutting off at the bottom)
    // (Total height 22.0, centered at Z = 5.0, radius 7.0 to 13.0)
    let shaftOuter = makeCSGCylinder(13.0, 22.0, 0, 0, 5.0);
    let shaftInner = makeCSGCylinder(7.0, 24.0, 0, 0, 5.0);
    let shaftTube = shaftOuter.subtract(shaftInner);
    shaftOuter.delete();
    shaftInner.delete();

    let tempBodyS = body.add(shaftTube);
    body.delete();
    shaftTube.delete();
    body = tempBodyS;

    // Cut a 2mm depth 10mm wide notch into the hollow cylinder centered at X=13 and X=-13
    let notchCube = Manifold.cube([4.0, 10.0, 24.0], true);
    let notchTrans1 = notchCube.translate([13.0, 0, 5.0]);
    let notchTrans2 = notchCube.translate([-13.0, 0, 5.0]);
    notchCube.delete();

    let tempBodyN1 = body.subtract(notchTrans1);
    body.delete();
    notchTrans1.delete();

    let tempBodyN2 = tempBodyN1.subtract(notchTrans2);
    tempBodyN1.delete();
    notchTrans2.delete();
    body = tempBodyN2;

    // 5. Add connecting bridges (webs) at the bottom (local Z = 12.0 to 16.0) to join shaft with motor boxes
    let bridge = Manifold.cube([11.0, mBodyW, 4.0], true);
    let bridgeTrans1 = bridge.translate([18.5, 0, 14.0]); // joins shaft (R=13) to pocket
    let bridgeTrans2 = bridge.translate([-18.5, 0, 14.0]);
    bridge.delete();

    let tempBodyB1 = body.add(bridgeTrans1);
    body.delete();
    bridgeTrans1.delete();

    let tempBodyB2 = tempBodyB1.add(bridgeTrans2);
    tempBodyB1.delete();
    bridgeTrans2.delete();
    body = tempBodyB2;

    // 6. Subtract horizontal motor pockets from the body (Z = -18.2 to 11.8)
    // Leaving a solid bottom floor (from 11.8 to 16.0) and thick side walls on the Y sides
    let motorPocket = Manifold.cube([mBodyL, mBodyW, 30.0], true);
    let motorPocketTrans1 = motorPocket.translate([motorPocketCenterX, 0, shaftZ_l - 15.0 + mBodyH / 2]);
    let motorPocketTrans2 = motorPocket.translate([-motorPocketCenterX, 0, shaftZ_l - 15.0 + mBodyH / 2]);
    motorPocket.delete();

    temp = body.subtract(motorPocketTrans1);
    body.delete();
    motorPocketTrans1.delete();
    body = temp;

    temp = body.subtract(motorPocketTrans2);
    body.delete();
    motorPocketTrans2.delete();
    body = temp;

    // 4.5. Subtract U-shaped horizontal shaft slots through the outer wall (open to the top)
    const shaftHoleR = MOTOR_130.shaftDiam / 2 + 0.5;
    let cyl = Manifold.cylinder(30.0, shaftHoleR, shaftHoleR, 16, true);
    let cylRot = cyl.rotate([0, 90, 0]);
    cyl.delete();

    let box = Manifold.cube([30.0, shaftHoleR * 2, 14.0], true);
    let boxTrans = box.translate([0, 0, -3.0]); // Z goes from -10.0 to 4.0
    box.delete();

    let shaftSlot = cylRot.add(boxTrans);
    cylRot.delete();
    boxTrans.delete();

    let shaftSlotTrans1 = shaftSlot.translate([ringCenterR - 5.0, 0, shaftZ_l]);
    let shaftSlotTrans2 = shaftSlot.translate([-(ringCenterR - 5.0), 0, shaftZ_l]);
    shaftSlot.delete();

    temp = body.subtract(shaftSlotTrans1);
    body.delete();
    shaftSlotTrans1.delete();
    body = temp;

    temp = body.subtract(shaftSlotTrans2);
    body.delete();
    shaftSlotTrans2.delete();
    body = temp;

    // 5. Subtract horizontal M3 retaining screw holes through the side walls (along Y-axis, at Z = 0.0)
    let screwHole = Manifold.cylinder(mBodyW + 15.0, 1.5, 1.5, 16, true);
    let screwHoleRot = screwHole.rotate([90, 0, 0]);
    screwHole.delete();

    let sh1 = screwHoleRot.translate([motorPocketCenterX - 8.0, 0, 0.0]);
    let sh2 = screwHoleRot.translate([motorPocketCenterX + 8.0, 0, 0.0]);
    let sh3 = screwHoleRot.translate([-(motorPocketCenterX - 8.0), 0, 0.0]);
    let sh4 = screwHoleRot.translate([-(motorPocketCenterX + 8.0), 0, 0.0]);
    screwHoleRot.delete();

    temp = body.subtract(sh1); body.delete(); sh1.delete(); body = temp;
    temp = body.subtract(sh2); body.delete(); sh2.delete(); body = temp;
    temp = body.subtract(sh3); body.delete(); sh3.delete(); body = temp;
    temp = body.subtract(sh4); body.delete(); sh4.delete(); body = temp;

    // 8. Subtract a diamond-shaped tunnel horizontally through the central shaft and outer wall at local Z = 16.0
    // (runs along Y-axis, side length 10.0, rotated 45 degrees around Y)
    let tunnel = Manifold.cube([10.0, R_cap_out * 2 + 10.0, 10.0], true);
    let tunnelRot = tunnel.rotate([0, 45, 0]);
    tunnel.delete();
    let tunnelTrans = tunnelRot.translate([0, 0, 16.0]);
    tunnelRot.delete();

    temp = body.subtract(tunnelTrans);
    body.delete();
    tunnelTrans.delete();
    body = temp;

    // 9. Subtract three M3 screw holes for the slip ring flange (Z = -6.0 to 0.2)
    // Spun by 90 degrees (+Math.PI / 2) to prevent cutting into the motor pocket cutouts
    for (let i = 0; i < 3; i++) {
        const theta = (i * 2 * Math.PI) / 3 + Math.PI / 2;
        const hx = 9.0 * Math.cos(theta);
        const hy = 9.0 * Math.sin(theta);
        let screwHole = makeCSGCylinder(1.5, 6.2, hx, hy, -2.9);
        let tempBodyH = body.subtract(screwHole);
        body.delete();
        screwHole.delete();
        body = tempBodyH;
    }

    return body;
}
