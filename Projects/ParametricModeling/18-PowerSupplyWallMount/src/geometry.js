// Geometry builder module for 18-PowerSupplyWallMount
// Monolithic U-bracket with solid flat floor, front bridge, self-supporting corner triangles,
// and lightweight honeycomb lattice (speeding up 3D print jobs & maximizing convective cooling).
import * as THREE from 'three';
import { context, params } from './state.js';

export function makeCSGBox(w, d, h, x = 0, y = 0, z = 0) {
    const Manifold = context.Manifold;
    let box = Manifold.cube([w, d, h], true);
    if (x !== 0 || y !== 0 || z !== 0) {
        let translated = box.translate([x, y, z]);
        box.delete();
        box = translated;
    }
    return box;
}

export function makeCSGCylinder(r, h, x = 0, y = 0, z = 0, rotX = 0, rotY = 0, rotZ = 0, segs = 32) {
    const Manifold = context.Manifold;
    let cyl = Manifold.cylinder(h, r, r, segs, true);
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

export function makeCSGSlot(slotW, slotL, depth, x = 0, y = 0, z = 0) {
    const r = slotW / 2;
    const bodyL = Math.max(0.1, slotL - slotW);

    let centerBox = makeCSGBox(slotW, depth, bodyL, x, y, z);
    let topCyl = makeCSGCylinder(r, depth, x, y, z + bodyL / 2, 90, 0, 0, 24);
    let btmCyl = makeCSGCylinder(r, depth, x, y, z - bodyL / 2, 90, 0, 0, 24);

    let slot = centerBox.add(topCyl);
    centerBox.delete();
    topCyl.delete();

    let finalSlot = slot.add(btmCyl);
    slot.delete();
    btmCyl.delete();

    return finalSlot;
}

/**
 * Creates a regular hexagonal prism for honeycomb cutouts.
 * Pointed top along Z axis ensures 100% self-supporting 3D printing with zero supports.
 */
export function makeCSGHexagon(r, depth, x = 0, y = 0, z = 0, rotX = 0, rotY = 0, rotZ = 0) {
    const Manifold = context.Manifold;
    let hex = Manifold.cylinder(depth, r, r, 6, true);
    if (rotX !== 0 || rotY !== 0 || rotZ !== 0) {
        let rotated = hex.rotate([rotX, rotY, rotZ]);
        hex.delete();
        hex = rotated;
    }
    if (x !== 0 || y !== 0 || z !== 0) {
        let translated = hex.translate([x, y, z]);
        hex.delete();
        hex = translated;
    }
    return hex;
}

export function manifoldToThree(manifoldMesh) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(manifoldMesh.vertProperties, 3));
    geometry.setIndex(new THREE.Uint32BufferAttribute(manifoldMesh.triVerts, 1));
    geometry.computeVertexNormals();
    return geometry;
}

/**
 * Builds the monolithic U-Bracket with a solid flat bottom, self-supporting triangles,
 * and lightweight honeycomb lattice:
 * - Solid flat floor: Power supply rests squarely on the bottom.
 * - Top 100% open: Cables attached to the top terminals exit freely upward.
 * - Front retaining bridge: Solid cross-band locks the brick against the wall.
 * - Corner triangles: Slanted gussets under the bridge meet in the middle for support-free printing.
 * - Honeycomb Lattice: Pointed-top hexagonal cutouts on side walls & backplate save ~45% plastic,
 *   drastically cut print time, and maximize convective cooling.
 * - 6 side mounting screw slots (3 left, 3 right) on flat flanges with direct tool access.
 */
export function generateBracketGeometry() {
    const Manifold = context.Manifold;
    if (!Manifold) return null;

    const pw = params.psuWidth + params.clearance;
    const pd = params.psuDepth + params.clearance;
    const wt = params.wallThickness;           // 4.5mm
    const bt = params.backplateThickness;       // 4.5mm
    const fw = params.flangeWidth;              // 18.0mm
    const bh = params.bracketHeight;            // 110.0mm
    const brH = params.bridgeHeight;            // 35.0mm
    const brZ = params.bridgeElevation;         // 25.0mm
    const flT = params.floorThickness;          // 5.0mm solid flat floor

    const outerW = pw + 2 * wt;
    const outerD = bt + pd + wt;
    const totalH = bh + flT;
    const halfW = pw / 2;
    const frontY = bt + pd;

    // 1. Solid Outer Main Block (from Z = 0 to totalH)
    let mainBlock = makeCSGBox(outerW, outerD, totalH, 0, outerD / 2, totalH / 2);

    // Left and right mounting flange ears (against the wall at Y = 0 to bt)
    let leftFlange = makeCSGBox(fw + 1.0, bt, totalH, -outerW / 2 - fw / 2, bt / 2, totalH / 2);
    let rightFlange = makeCSGBox(fw + 1.0, bt, totalH, outerW / 2 + fw / 2, bt / 2, totalH / 2);

    let b1 = mainBlock.add(leftFlange);
    mainBlock.delete();
    leftFlange.delete();

    let b2 = b1.add(rightFlange);
    b1.delete();
    rightFlange.delete();
    let body = b2;

    // 2. Subtract Inside Pocket for PSU Brick
    // Starts at Z = flT (leaving a solid flat floor of thickness flT at the bottom!)
    // Extends all the way out through the top (Z = flT to totalH + 10)
    const pocketH = bh + 20.0;
    const pocketY = bt + pd / 2;
    const pocketZ = flT + pocketH / 2;
    let pocket = makeCSGBox(pw, pd, pocketH, 0, pocketY, pocketZ);

    let b3 = body.subtract(pocket);
    body.delete();
    pocket.delete();
    body = b3;

    // 3. Cut out front wall ABOVE the bridge (Z = flT + brZ + brH to totalH + 10)
    const bridgeTopZ = flT + brZ + brH;
    const cutTopH = Math.max(1.0, totalH - bridgeTopZ + 10.0);
    const cutTopZ = bridgeTopZ + cutTopH / 2;
    const frontCutY = bt + pd + wt / 2;
    let cutTop = makeCSGBox(pw + 0.2, wt * 3, cutTopH, 0, frontCutY, cutTopZ);

    let b4 = body.subtract(cutTop);
    body.delete();
    cutTop.delete();
    body = b4;

    // 4. Cut out front wall BELOW the bridge (Z = flT to flT + brZ)
    if (brZ > 2.0) {
        const cutBtmH = brZ;
        const cutBtmZ = flT + cutBtmH / 2;
        let cutBtm = makeCSGBox(pw + 0.2, wt * 3, cutBtmH, 0, frontCutY, cutBtmZ);

        let b5 = body.subtract(cutBtm);
        body.delete();
        cutBtm.delete();
        body = b5;

        // 5. Add corner support triangles meeting in the middle of the bridge
        const apexZ = flT + brZ;
        if (context.wasm?.CrossSection) {
            try {
                const leftPts = [[-halfW, flT], [0, apexZ], [-halfW, apexZ]];
                const csL = new context.wasm.CrossSection([leftPts]);
                let wedgeL = Manifold.extrude(csL, wt);
                csL.delete();
                wedgeL = wedgeL.rotate([90, 0, 0]).translate([0, frontY + wt, 0]);

                let b6 = body.add(wedgeL);
                body.delete();
                wedgeL.delete();
                body = b6;

                const rightPts = [[0, apexZ], [halfW, flT], [halfW, apexZ]];
                const csR = new context.wasm.CrossSection([rightPts]);
                let wedgeR = Manifold.extrude(csR, wt);
                csR.delete();
                wedgeR = wedgeR.rotate([90, 0, 0]).translate([0, frontY + wt, 0]);

                let b7 = body.add(wedgeR);
                body.delete();
                wedgeR.delete();
                body = b7;
            } catch (e) {
                console.warn("CrossSection extrusion failed", e);
            }
        }
    }

    // ========================================================
    // 6. HONEYCOMB LATTICE (Weight Reduction & Convective Airflow)
    // ========================================================
    if (params.enableHoneycomb) {
        const r = params.honeycombRadius;
        const rib = Math.max(2.8, params.honeycombRib);
        
        // Exact regular pointy-topped hexagon packing math:
        // Inradius = r * sqrt(3) / 2
        // Distance between opposite parallel edges = r * sqrt(3)
        // Center-to-center neighbor distance L = r * sqrt(3) + rib
        // Guarantees uniform rib thickness between ALL adjacent edges in all directions.
        const L = Math.sqrt(3) * r + rib;
        const stepX = L;
        const stepY = L;
        const stepZ = L * Math.sqrt(3) / 2;
        const xOffset = L / 2;
        const yOffset = L / 2;

        // Structural solid perimeter margins:
        // 22mm solid floor beam and top rim prevent layer snapping under PSU weight
        const zMin = flT + 22.0;
        const zMax = totalH - 22.0;

        // A. Side Wall Honeycomb
        if (params.honeycombWalls) {
            const yMin = bt + 16.0;
            const yMax = bt + pd - 16.0;

            for (let z = zMin; z <= zMax; z += stepZ) {
                const row = Math.round((z - zMin) / stepZ);
                const offset = (row % 2 === 0) ? 0 : yOffset;
                for (let y = yMin + offset; y <= yMax; y += stepY) {
                    // rot: [0, 90, 0] produces pointed top and bottom along Z (100% self-supporting)
                    let hex = makeCSGHexagon(r, outerW + 10.0, 0, y, z, 0, 90, 0);
                    let subHex = body.subtract(hex);
                    body.delete();
                    hex.delete();
                    body = subHex;
                }
            }
        }

        // B. Backplate Honeycomb
        if (params.honeycombBack) {
            // Keep at least 22mm solid borders near the side wall junctions and mounting flanges
            const xMin = -pw / 2 + 22.0;
            const xMax = pw / 2 - 22.0;

            for (let z = zMin; z <= zMax; z += stepZ) {
                const row = Math.round((z - zMin) / stepZ);
                const offset = (row % 2 === 0) ? 0 : xOffset;
                for (let x = xMin + offset; x <= xMax; x += stepX) {
                    // rot: [90, 30, 0] produces pointed apex at top and bottom along Z (zero horizontal bridging)
                    let hex = makeCSGHexagon(r, bt * 4, x, bt / 2, z, 90, 30, 0);
                    let subHex = body.subtract(hex);
                    body.delete();
                    hex.delete();
                    body = subHex;
                }
            }
        }
    }

    // ========================================================
    // 7. SUBTRACT 6 SCREW SLOTS (3 Left / 3 Right on clean flanges)
    // ========================================================
    const slotW = params.screwSlotWidth;
    const slotL = params.screwSlotLength;
    const leftSlotX = -outerW / 2 - fw / 2;
    const rightSlotX = outerW / 2 + fw / 2;
    const screwZ = [flT + 16.0, flT + bh / 2, totalH - 16.0];

    for (let sz of screwZ) {
        let sL = makeCSGSlot(slotW, slotL, bt * 4, leftSlotX, bt / 2, sz);
        let sR = makeCSGSlot(slotW, slotL, bt * 4, rightSlotX, bt / 2, sz);

        let sub1 = body.subtract(sL);
        body.delete();
        sL.delete();

        let sub2 = sub1.subtract(sR);
        sub1.delete();
        sR.delete();
        body = sub2;
    }

    return body;
}
