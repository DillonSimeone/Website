import { makeBox } from '../../00-CommonParts/helpers.js';
import { getPartPreset } from './parts-catalog.js';
import { state } from './state.js';

/**
 * Generates a contour-hugging slide-over lid Manifold that wraps the outer edges
 * of non-motor, non-LED-strip bins and drops down the sides by state.lid.skirtHeight.
 */
export function buildTrayLidManifold(M, forExport = false) {
    if (!M || state.bins.length === 0) return null;

    const wall = state.global.wallThickness;
    const base = state.global.baseThickness;
    const { clearance, skirtHeight, roofThickness, wallThickness: lidWall } = state.lid;

    const isExcluded = (bin) => {
        const p = getPartPreset(bin.partId);
        return Boolean(
            bin.cradle || p.isLedStrip || p.shapeLoopSides || p.isFan || p.excludeFromLid || p.isSpacer
        );
    };
    const lidBins = state.bins.filter(b => !isExcluded(b));
    if (lidBins.length === 0) return null;

    const excludedBins = state.bins.filter(isExcluded);

    let maxTrayZ = 0;
    for (const bin of lidBins) {
        const h = base + bin.wallHeight;
        if (h > maxTrayZ) maxTrayZ = h;
    }

    const totalLidH = skirtHeight + roofThickness;
    const zBottom = maxTrayZ - skirtHeight;

    const outers = [];
    const inners = [];

    for (const bin of lidBins) {
        const innerW = bin.w + 2 * bin.tolerance;
        const tail = bin.strainRelief ? 50.0 : 0;
        const innerD = bin.d + 2 * bin.tolerance + tail;
        const ow = innerW + 2 * wall;
        const od = innerD + 2 * wall;

        outers.push(
            makeBox(M, ow + 2 * (clearance + lidWall), od + 2 * (clearance + lidWall), totalLidH, true)
                .translate([0, 0, zBottom + totalLidH / 2])
                .rotate([0, 0, bin.rot])
                .translate([bin.x, bin.y, 0])
        );

        inners.push(
            makeBox(M, ow + 2 * clearance, od + 2 * clearance, skirtHeight + 1.0, true)
                .translate([0, 0, zBottom + (skirtHeight - 1.0) / 2])
                .rotate([0, 0, bin.rot])
                .translate([bin.x, bin.y, 0])
        );
    }

    // Subtract full height of excluded bins (motors & LED strips) so lid never covers them
    for (const bin of excludedBins) {
        const innerW = bin.w + 2 * bin.tolerance;
        const tail = bin.strainRelief ? 50.0 : 0;
        const innerD = bin.d + 2 * bin.tolerance + tail;
        const ow = innerW + 2 * wall;
        const od = innerD + 2 * wall;
        inners.push(
            makeBox(M, ow + 2 * clearance, od + 2 * clearance, totalLidH + 4.0, true)
                .translate([0, 0, zBottom + totalLidH / 2])
                .rotate([0, 0, bin.rot])
                .translate([bin.x, bin.y, 0])
        );
    }

    // Subtract skirt cutouts wherever a covered bin has an active wall opening (USB-C, wires, terminals)
    for (const bin of lidBins) {
        const preset = getPartPreset(bin.partId);
        const innerW = bin.w + 2 * bin.tolerance;
        const tail = bin.strainRelief ? 50.0 : 0;
        const innerD = bin.d + 2 * bin.tolerance + tail;
        const ow = innerW + 2 * wall;
        const od = innerD + 2 * wall;
        const skirtThick = clearance + lidWall + 2.0;
        const notchH = skirtHeight + 1.0;
        const notchZ = zBottom + (skirtHeight - 1.0) / 2;

        for (const side of ['N', 'S', 'E', 'W']) {
            if (!bin.activeCutouts?.[side]) continue;
            const spec = preset.cutouts?.[side] || { width: 10 };
            const maxSpan = (side === 'N' || side === 'S') ? innerW : innerD;
            const cutW = (spec.width >= maxSpan ? maxSpan : Math.min(spec.width, maxSpan - 0.5)) + clearance * 2;
            const xOff = spec.xOffset ?? 0;
            const yOff = spec.yOffset ?? 0;

            let notch;
            if (side === 'N') notch = makeBox(M, cutW, skirtThick, notchH, true).translate([xOff, od / 2 + clearance + lidWall / 2, notchZ]);
            else if (side === 'S') notch = makeBox(M, cutW, skirtThick, notchH, true).translate([xOff, -od / 2 - clearance - lidWall / 2, notchZ]);
            else if (side === 'E') notch = makeBox(M, skirtThick, cutW, notchH, true).translate([ow / 2 + clearance + lidWall / 2, yOff, notchZ]);
            else notch = makeBox(M, skirtThick, cutW, notchH, true).translate([-ow / 2 - clearance - lidWall / 2, yOff, notchZ]);

            inners.push(notch.rotate([0, 0, bin.rot]).translate([bin.x, bin.y, 0]));
            notch.delete();
        }
    }

    let outerAcc = outers[0];
    for (let i = 1; i < outers.length; i++) {
        const n = outerAcc.add(outers[i]);
        outerAcc.delete(); outers[i].delete(); outerAcc = n;
    }

    let innerAcc = inners[0];
    for (let i = 1; i < inners.length; i++) {
        const n = innerAcc.add(inners[i]);
        innerAcc.delete(); inners[i].delete(); innerAcc = n;
    }

    let lid = outerAcc.subtract(innerAcc);
    outerAcc.delete();
    innerAcc.delete();

    if (forExport) {
        const flipped = lid.rotate([180, 0, 0]).translate([0, 0, maxTrayZ + roofThickness]);
        lid.delete();
        lid = flipped;
    }

    return lid;
}

/**
 * Generates <= 2mm thick (1.6mm) slide-in diffuser strips for all LED Strip bins.
 */
export function buildLedDiffusersManifold(M) {
    if (!M) return null;
    const ledBins = state.bins.filter(b => getPartPreset(b.partId).isLedStrip);
    const shapeBins = state.bins.filter(b => getPartPreset(b.partId).shapeLoopSides);
    if (ledBins.length === 0 && shapeBins.length === 0) return null;

    const thick = 1.6; // <= 2.0mm slide-in / clip-in diffuser
    const parts = [];
    let cursorX = 0;

    for (const bin of ledBins) {
        const innerW = bin.w + 2 * bin.tolerance;
        const innerD = bin.d + 2 * bin.tolerance;
        const diffW = innerW + 1.8; // engages 0.9mm into each diamond V-groove
        const diffD = innerD;
        const strip = makeBox(M, diffW, diffD, thick, true)
            .translate([cursorX + diffW / 2, 0, thick / 2]);
        parts.push(strip);
        cursorX += diffW + 4.0;
    }

    for (const bin of shapeBins) {
        const preset = getPartPreset(bin.partId);
        const sides = preset.shapeLoopSides;
        const wall = state.global.wallThickness;
        const outerSize = Math.min(bin.w, bin.d) + 2 * bin.tolerance + 2 * wall;
        const chW = 8.6;
        const r = (outerSize / 2) - wall - chW / 2 - 1.0;
        const angleOffset = sides === 4 ? Math.PI / 4 : Math.PI / 2;
        const verts = [];
        for (let i = 0; i < sides; i++) {
            const a = angleOffset + (i * Math.PI * 2) / sides;
            verts.push([Math.cos(a) * r, Math.sin(a) * r]);
        }
        const segs = [];
        for (let i = 0; i < sides; i++) {
            const [x1, y1] = verts[i];
            const [x2, y2] = verts[(i + 1) % sides];
            const segLen = Math.hypot(x2 - x1, y2 - y1) + chW + 1.0;
            const cx = (x1 + x2) / 2;
            const cy = (y1 + y2) / 2;
            const deg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
            segs.push(
                makeBox(M, segLen, chW + 1.2, thick, true)
                    .translate([0, 0, thick / 2])
                    .rotate([0, 0, deg])
                    .translate([cx, cy, 0])
            );
        }
        let ring = segs[0];
        for (let i = 1; i < segs.length; i++) {
            const n = ring.add(segs[i]); ring.delete(); segs[i].delete(); ring = n;
        }
        parts.push(ring.translate([cursorX + outerSize / 2, 0, 0]));
        ring.delete();
        cursorX += outerSize + 4.0;
    }

    let acc = parts[0];
    for (let i = 1; i < parts.length; i++) {
        const n = acc.add(parts[i]);
        acc.delete(); parts[i].delete(); acc = n;
    }
    return acc;
}
