import { context, params } from '../state.js';
import { makeCSGCylinder } from './helpers.js';

export function generateConnectorGeometry(D_in, D_out) {
    const Manifold = context.Manifold;
    if (!Manifold) return null;

    const c = params.tolerance;
    
    // Upward guide sleeve: outer radius 6.5 - c, inner radius 5.0, Z = 0.0 to 15.0
    const sleeveR_out = 6.5 - c;
    const sleeveR_in = 5.0;
    let upSleeve = makeCSGCylinder(sleeveR_out, 15.0, 0, 0, 7.5);
    let upHole = makeCSGCylinder(sleeveR_in, 17.0, 0, 0, 7.5);
    let sleeve = upSleeve.subtract(upHole);
    upSleeve.delete();
    upHole.delete();

    // Middle/bottom flange: outer radius 13.0, inner radius 5.0, Z = -3.0 to 0.0
    let flangeCyl = makeCSGCylinder(13.0, 3.0, 0, 0, -1.5);
    let flangeHole = makeCSGCylinder(sleeveR_in, 5.0, 0, 0, -1.5);
    let flange = flangeCyl.subtract(flangeHole);
    flangeCyl.delete();
    flangeHole.delete();

    // Downward plug: outer radius 7.0 - c, inner radius 5.0, Z = -6.0 to -3.0
    const plugR_out = 7.0 - c;
    let plugCyl = makeCSGCylinder(plugR_out, 3.0, 0, 0, -4.5);
    let plugHole = makeCSGCylinder(sleeveR_in, 5.0, 0, 0, -4.5);
    let plug = plugCyl.subtract(plugHole);
    plugCyl.delete();
    plugHole.delete();

    // Union sleeve, flange, and plug
    let temp1 = sleeve.add(flange);
    sleeve.delete();
    flange.delete();

    let connector = temp1.add(plug);
    temp1.delete();
    plug.delete();

    // Subtract three M3 screw holes in the flange (radius 1.5 at radius 9.0)
    // Spun by 90 degrees (+Math.PI / 2) to match the motor holder holes orientation
    for (let i = 0; i < 3; i++) {
        const theta = (i * 2 * Math.PI) / 3 + Math.PI / 2;
        const hx = 9.0 * Math.cos(theta);
        const hy = 9.0 * Math.sin(theta);
        let screwHole = makeCSGCylinder(1.5, 8.0, hx, hy, -3.0);
        let tempConnector = connector.subtract(screwHole);
        connector.delete();
        screwHole.delete();
        connector = tempConnector;
    }

    return connector;
}
