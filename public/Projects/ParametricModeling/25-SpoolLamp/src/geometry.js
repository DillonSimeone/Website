// Parametric Manifold WASM geometry builders for 25-SpoolLamp
import { context } from './state.js';

function cosWaveShape(phase, sharpness) {
    const c = Math.cos(phase);
    // Triangle wave aligned with cos (1 at 0, -1 at pi)
    const tri = (2 / Math.PI) * Math.asin(Math.max(-1, Math.min(1, c)));
    return c * (1 - sharpness) + tri * sharpness;
}

function computeNormalOffsets(pts, halfThick) {
    const n = pts.length;
    const outer = [];
    const inner = [];

    for (let i = 0; i < n; i++) {
        const prev = pts[Math.max(0, i - 1)];
        const next = pts[Math.min(n - 1, i + 1)];
        const dx = next[0] - prev[0];
        const dy = next[1] - prev[1];
        const len = Math.hypot(dx, dy) || 1;
        const nx = dy / len;
        const ny = -dx / len;

        outer.push([pts[i][0] + nx * halfThick, pts[i][1] + ny * halfThick]);
        inner.push([pts[i][0] - nx * halfThick, pts[i][1] - ny * halfThick]);
    }
    return { outer, inner };
}

function buildArcPolygon(rIn, rOut, thetaStart, thetaEnd, segs = 96) {
    const pts = [];
    for (let i = 0; i <= segs; i++) {
        const a = thetaStart + (thetaEnd - thetaStart) * (i / segs);
        pts.push([rOut * Math.cos(a), rOut * Math.sin(a)]);
    }
    for (let i = segs; i >= 0; i--) {
        const a = thetaStart + (thetaEnd - thetaStart) * (i / segs);
        pts.push([rIn * Math.cos(a), rIn * Math.sin(a)]);
    }
    return pts;
}

function buildCarvedSCurveBlock(M, blockW, yCenter, blockLen, wallHeight, baseZ) {
    // Cubic Bezier S-curve cable strain relief adapted from 23-ProtoTray
    let block = M.cube([blockW, blockLen, wallHeight], true)
        .translate([0, yCenter, baseZ + wallHeight / 2]);

    const r = 2.1; // 4.2mm cable channel width
    const swing = Math.min(3.4, (blockW - r * 2) * 0.62);
    const y0 = yCenter + blockLen / 2 + 1.0;
    const y3 = yCenter - blockLen / 2 - 1.0;
    const p0 = [0, y0];
    const p1 = [swing * 1.45, y0 - blockLen * 0.28];
    const p2 = [-swing * 1.45, y3 + blockLen * 0.28];
    const p3 = [0, y3];

    const steps = 16;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        pts.push([
            u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
            u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
        ]);
    }

    const chH = wallHeight + 1.2;
    const zC = baseZ + 0.8 + chH / 2;
    let sCut = M.cylinder(chH, r, r, 16, true).translate([pts[0][0], pts[0][1], zC]);
    for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[i + 1];
        const len = Math.hypot(x2 - x1, y2 - y1);
        const deg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
        const cyl = M.cylinder(chH, r, r, 16, true).translate([x2, y2, zC]);
        const seg = M.cube([len + 0.2, r * 2, chH], true)
            .rotate([0, 0, deg])
            .translate([(x1 + x2) / 2, (y1 + y2) / 2, zC]);
        sCut = sCut.add(cyl).add(seg);
    }

    return block.subtract(sCut);
}

/**
 * 54.5mm Front Center Hub Plug (Flush cylinder, NO lip. Print orientation: front face at z=0)
 */
export function buildHubPlug(M, p) {
    const barrelDia = p.spoolBoreDia - p.plugClearance;
    const barrelR = barrelDia / 2;
    const innerR = Math.max(12, barrelR - p.plugWall);
    const totalH = p.plugDepth;

    // 1. Smooth flush outer barrel (no front lip, no side ribs)
    let body = M.cylinder(totalH, barrelR, barrelR, 64);

    // 3. Hollow interior cavity (leaving flush front face = plugWall)
    const cavity = M.cylinder(totalH, innerR, innerR, 56).translate([0, 0, p.plugWall]);
    body = body.subtract(cavity);

    // 4. Centered 10.2mm MAX4466 mic capsule pass-through
    const micHole = M.cylinder(p.plugWall + 4, p.micHoleDia / 2, p.micHoleDia / 2, 40)
        .translate([0, 0, -1]);
    body = body.subtract(micHole);

    // 5. Internal MAX4466 PCB cradle rails
    const railH = 10.0;
    const railThick = 1.6;
    const railOffset = p.max4466Width / 2 + railThick / 2;
    const railL = M.cube([railThick, p.max4466Length, railH], true)
        .translate([-railOffset, 0, p.plugWall + railH / 2]);
    const railR = M.cube([railThick, p.max4466Length, railH], true)
        .translate([railOffset, 0, p.plugWall + railH / 2]);
    body = body.add(railL).add(railR);

    // 6. ESP32-C3 SuperMini side cradle rail
    const espX = railOffset + railThick / 2 + p.espWidth / 2 + 1.5;
    if (espX + p.espWidth / 2 < innerR - 0.5) {
        const espRail = M.cube([1.6, p.espLength, 12.0], true)
            .translate([espX + p.espWidth / 2 + 0.8, 0, p.plugWall + 6.0]);
        body = body.add(espRail);
    }

    // 7. S-Curve Cable Strain Relief inside barrel beside ESP32 (from 23-ProtoTray)
    const reliefX = -(railOffset + railThick / 2 + 6.2);
    const reliefBound = M.cylinder(totalH, innerR + 0.2, innerR + 0.2, 56);
    const sRelief = buildCarvedSCurveBlock(M, 11.5, 0, 18.0, 8.5, p.plugWall)
        .translate([reliefX, 0, 0])
        .intersect(reliefBound);
    body = body.add(sRelief);

    // 8. Rear USB-C & LED wire pass-through notch aligned with S-curve exit
    const wireNotch = M.cube([8.0, barrelR + 4, 10.0], true)
        .translate([reliefX, -barrelR * 0.75, totalH - 4.0]);
    body = body.subtract(wireNotch);

    return body;
}

/**
 * Internal LED Wave Insert 180° C-Half (Slides radially between permanent spool flanges & glues to 82mm core)
 */
export function buildWaveHalf(M, p) {
    const height = Math.min(p.waveHeight, p.spoolInnerWidth - 1.5);
    const coreInnerR = (p.spoolCoreOD + 0.4) / 2;
    const collarWall = 2.0;
    const collarOuterR = coreInnerR + collarWall;
    const thetaPad = 0.025; // ~1.4 deg clearance gap between the two C-halves
    const tStart = thetaPad;
    const tEnd = Math.PI - thetaPad;

    // 1. 180° C-shaped core mounting collar (slides radially onto 82mm core)
    const collarPts = buildArcPolygon(coreInnerR, collarOuterR, tStart, tEnd, 96);
    let part = M.extrude([collarPts], height);

    // 2. Radial wave bounds filling the entire inner spool cavity
    const rMin = collarOuterR + 1.2;
    const rMax = Math.max(rMin + 8, (p.spoolMaxOD / 2) - 2.0);
    const rMid = (rMin + rMax) / 2;
    const maxAmp = Math.max(2, (rMax - rMin) / 2 - p.waveWall);
    const amp = Math.min(p.waveAmplitude, maxAmp);
    const halfThick = p.waveWall / 2;

    let totalLenMm = 0;

    if (p.waveMode === 'spiral') {
        // 180° Serpentine Switchback Spiral (slides radially onto core, continuous LED path)
        const layers = Math.max(2, Math.round(p.spiralTurns));
        const pts = [];
        const arcSegs = 72;

        for (let l = 0; l < layers; l++) {
            const rLayer = rMin + ((rMax - rMin) * l) / (layers - 1);
            const forward = l % 2 === 0;
            for (let i = 0; i <= arcSegs; i++) {
                const frac = forward ? i / arcSegs : 1 - i / arcSegs;
                const theta = (tStart + 0.03) + (tEnd - tStart - 0.06) * frac;
                const ripple = (amp * 0.12) * Math.sin(theta * p.waveCount);
                const r = Math.max(rMin, Math.min(rMax, rLayer + ripple));
                pts.push([r * Math.cos(theta), r * Math.sin(theta)]);
            }
        }

        for (let i = 1; i < pts.length; i++) {
            totalLenMm += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        }

        const { outer, inner } = computeNormalOffsets(pts, halfThick);
        const ribbon = M.extrude([outer.concat(inner.reverse())], height);
        part = part.add(ribbon);

        // 3 clean base radial spines stopping strictly at rMax (never protruding)
        const spineAngles = [Math.PI * 0.2, Math.PI * 0.5, Math.PI * 0.8];
        const spineLen = rMax - coreInnerR;
        spineAngles.forEach(ang => {
            const spoke = M.cube([spineLen, 2.2, 3.0], false)
                .translate([coreInnerR + 0.4, -1.1, 0])
                .rotate([0, 0, (ang * 180) / Math.PI]);
            part = part.add(spoke);
        });
    } else {
        // 180° C-Half Sinusoidal or Star/Zig-Zag wave
        const halfLobes = Math.max(2, Math.round(p.waveCount / 2));
        const steps = 200;
        const pts = [];
        const sharpness = p.waveMode === 'zigzag' ? Math.max(0.75, p.petalSharpness) : p.petalSharpness;

        for (let i = 0; i <= steps; i++) {
            const theta = tStart + (tEnd - tStart) * (i / steps);
            const normT = (theta - tStart) / (tEnd - tStart);
            // -cosWaveShape starts & ends at inner valley (-1) at both ends of the C-half
            const r = rMid - amp * cosWaveShape(normT * halfLobes * 2 * Math.PI, sharpness);
            pts.push([r * Math.cos(theta), r * Math.sin(theta)]);
        }

        for (let i = 1; i < pts.length; i++) {
            totalLenMm += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        }

        const { outer, inner } = computeNormalOffsets(pts, halfThick);
        const ribbon = M.extrude([outer.concat(inner.reverse())], height);
        part = part.add(ribbon);

        // Short radial spokes ONLY at inner valleys, stopping inside the wave wall (never sticking out)
        const valleyR = rMid - amp;
        const spokeLen = Math.max(1.5, valleyR - coreInnerR);
        for (let k = 0; k <= halfLobes; k++) {
            const theta = tStart + (tEnd - tStart) * (k / halfLobes);
            const spoke = M.cube([spokeLen, 2.2, Math.min(height, 4.0)], false)
                .translate([coreInnerR + 0.4, -1.1, 0])
                .rotate([0, 0, (theta * 180) / Math.PI]);
            part = part.add(spoke);
        }
    }

    context.estimatedStripCm = Math.round((totalLenMm * 2) / 10);
    return part;
}

/**
 * Ghost reference of Bambu A1 Spool (for visual alignment only, not exported)
 */
export function buildSpoolGhost(M, p) {
    const flangeThick = 2.5;
    const halfW = p.spoolInnerWidth / 2;
    const boreR = p.spoolBoreDia / 2;
    const coreR = p.spoolCoreOD / 2;
    const flangeR = (p.spoolMaxOD + 5) / 2;

    const frontFlange = M.cylinder(flangeThick, flangeR, flangeR, 64)
        .subtract(M.cylinder(flangeThick + 2, boreR, boreR, 48).translate([0, 0, -1]))
        .translate([0, 0, halfW]);

    const backFlange = M.cylinder(flangeThick, flangeR, flangeR, 64)
        .subtract(M.cylinder(flangeThick + 2, boreR, boreR, 48).translate([0, 0, -1]))
        .translate([0, 0, -halfW - flangeThick]);

    const core = M.cylinder(p.spoolInnerWidth, coreR, coreR, 64)
        .subtract(M.cylinder(p.spoolInnerWidth + 2, boreR, boreR, 48).translate([0, 0, -1]))
        .translate([0, 0, -halfW]);

    return frontFlange.add(backFlange).add(core);
}
