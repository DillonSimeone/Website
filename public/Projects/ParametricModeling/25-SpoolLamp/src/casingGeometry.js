// Parametric Casing, Shade.stl Adapter, and Angled Wall Mount builders for 25-SpoolLamp

/**
 * Generates a 2D patterned ring profile (twisted ribs, flutes, or wave)
 */
function buildHollowRibLoops(baseR, wallThick, ribCount, ribDepth, patternType) {
    const segs = Math.max(240, ribCount * 12);
    const mid = [];
    for (let i = 0; i < segs; i++) {
        const theta = (i / segs) * 2 * Math.PI;
        let offset = 0;
        if (patternType === 'twisted_ribs') {
            offset = ribDepth * Math.abs(Math.sin(theta * ribCount * 0.5));
        } else if (patternType === 'fluted') {
            offset = ribDepth * 0.5 * (1 + Math.cos(theta * ribCount));
        } else if (patternType === 'diamond') {
            const tri = (2 / Math.PI) * Math.asin(Math.sin(theta * ribCount));
            offset = ribDepth * 0.5 * (1 + tri);
        } else if (patternType === 'double_helix') {
            // Alternating tall & short crown ribs
            const primary = Math.abs(Math.sin(theta * ribCount * 0.5));
            const secondary = 0.5 + 0.5 * Math.cos(theta * ribCount * 0.25);
            offset = ribDepth * (0.35 + 0.65 * primary * secondary);
        } else if (patternType === 'scallop_concave') {
            // Sharp outward crests with wide glowing concave scoops
            offset = ribDepth * (1 - Math.abs(Math.sin(theta * ribCount * 0.5)));
        } else if (patternType === 'gear_square') {
            // Bold castellated geometric facets
            offset = ribDepth * 0.5 * (1 + Math.tanh(3.5 * Math.cos(theta * ribCount)));
        } else if (patternType === 'ripple_beat') {
            // Sound-wave beat modulation around the shade
            const env = 0.45 + 0.55 * Math.abs(Math.cos(theta * 3));
            offset = ribDepth * env * 0.5 * (1 + Math.sin(theta * ribCount));
        }
        const r = baseR + offset;
        mid.push([r * Math.cos(theta), r * Math.sin(theta)]);
    }

    const outer = [];
    const inner = [];
    for (let i = 0; i < segs; i++) {
        const prev = mid[(i - 1 + segs) % segs];
        const next = mid[(i + 1) % segs];
        const dx = next[0] - prev[0];
        const dy = next[1] - prev[1];
        const len = Math.hypot(dx, dy) || 1;
        const nx = dy / len;
        const ny = -dx / len;
        outer.push([mid[i][0] + nx * wallThick, mid[i][1] + ny * wallThick]);
        inner.push([mid[i][0], mid[i][1]]);
    }
    return { outer, inner };
}

/**
 * Parametric Patterned Lamp Casing:
 * - Thin 1-2 layer (0.85mm default) hollow-ribbed shell so ribs glow evenly
 * - Centered 82mm spool collar + 54.5mm pass-through
 * - 45-deg printable shoulder into 208.5mm ID / 210.7mm OD top lid ring (matches Shade.stl lids)
 */
export function buildParametricCasing(M, p) {
    const wall = p.casingWall || 0.85;
    const baseThick = 2.4;
    const lidRingInR = 104.25;  // Measured Shade.stl top ID = 208.5mm
    const lidRingOutR = 105.35; // Measured Shade.stl top OD = 210.7mm
    const lidRingH = 5.0;
    const shoulderH = 4.0;
    const innerR = lidRingInR;
    const height = p.casingHeight;
    const bodyH = Math.max(20.0, height - lidRingH - shoulderH);

    // 1. Thin hollow-ribbed outer wall (both inner & outer walls follow the rib curve)
    const { outer, inner } = buildHollowRibLoops(innerR, wall, p.casingRibCount, p.casingRibDepth, p.casingPattern);
    const twist = p.casingPattern === 'fluted' ? 0 : p.casingTwistDeg;
    let shell = M.extrude([outer, inner.reverse()], bodyH, 64, twist);

    // 2. Flat base disc sealed cleanly to the exact outer rib footprint (great bed adhesion)
    const baseDisc = M.extrude([outer], baseThick);
    shell = shell.add(baseDisc);

    // 3. Zero-clip transition band + 45-deg printable shoulder into the top lid ring
    const maxRibR = innerR + p.casingRibDepth + wall + 0.6;
    const band = M.cylinder(1.2, maxRibR, maxRibR, 144)
        .subtract(M.cylinder(2.0, innerR, innerR, 144).translate([0, 0, -0.4]))
        .translate([0, 0, bodyH - 0.6]);
    const shoulderOuter = M.cylinder(shoulderH, maxRibR, lidRingOutR, 144)
        .subtract(M.cylinder(shoulderH + 1.5, innerR, innerR, 144).translate([0, 0, -0.5]))
        .translate([0, 0, bodyH + 0.4]);
    shell = shell.add(band).add(shoulderOuter);

    // 4. Thin top ring (208.5mm ID / 210.7mm OD x 5mm) that accepts existing Shade.stl lids
    const lidRing = M.cylinder(lidRingH + 0.8, lidRingOutR, lidRingOutR, 144)
        .subtract(M.cylinder(lidRingH + 2.0, lidRingInR, lidRingInR, 144).translate([0, 0, -0.5]))
        .translate([0, 0, bodyH + shoulderH - 0.2]);
    shell = shell.add(lidRing);

    // 5. Center 54.8mm pass-through bore (no 82mm collar blocking solid spool flanges)
    //    + downward 14mm cable slot through the backplate for USB-C / JST routing
    const centerR = (p.spoolBoreDia + 0.4) / 2;
    const centerPass = M.cylinder(baseThick + 4, centerR, centerR, 64).translate([0, 0, -1]);
    const cableSlot = M.cube([14.0, innerR * 0.72, baseThick + 4], true)
        .translate([0, -innerR * 0.36, baseThick / 2]);
    shell = shell.subtract(centerPass).subtract(cableSlot);

    // 6. Radial light/ventilation cutouts in base plate (skip ONLY i === 4 straight-down where cableSlot sits)
    for (let i = 0; i < 6; i++) {
        if (i === 4) continue;
        const slot = M.cube([28, 16, baseThick + 4], true)
            .translate([centerR + 30, 0, baseThick / 2])
            .rotate([0, 0, i * 60 + 30]);
        shell = shell.subtract(slot);
    }

    return shell;
}

/**
 * Ultra-Thin Front Diffuser Lid (1-2 layers thick) with double-lip groove
 * Snaps onto both buildParametricCasing and existing Shade.stl (208.5mm ID / 210.7mm OD).
 */
export function buildCasingLid(M, p) {
    const faceThick = Math.max(0.8, p.casingWall || 0.85);
    const lipH = 4.2;
    const lipWall = 1.2;
    const clearance = 0.18;
    const lidRingInR = 104.25;
    const lidRingOutR = 105.35;

    const outerSkirtOutR = lidRingOutR + clearance + lipWall;
    const outerSkirtInR = lidRingOutR + clearance;
    const innerLipOutR = lidRingInR - clearance;
    const innerLipInR = lidRingInR - clearance - lipWall;

    // 1. Ultra-thin circular face disc
    let lid = M.cylinder(faceThick, outerSkirtOutR, outerSkirtOutR, 144);

    // 2. Outer + inner double-lip groove walls (captures the 1.1mm top shade ring)
    const outerSkirt = M.cylinder(lipH, outerSkirtOutR, outerSkirtOutR, 144)
        .subtract(M.cylinder(lipH + 2, outerSkirtInR, outerSkirtInR, 144).translate([0, 0, -1]))
        .translate([0, 0, faceThick]);
    const innerLip = M.cylinder(lipH, innerLipOutR, innerLipOutR, 144)
        .subtract(M.cylinder(lipH + 2, innerLipInR, innerLipInR, 144).translate([0, 0, -1]))
        .translate([0, 0, faceThick]);
    lid = lid.add(outerSkirt).add(innerLip);

    // 3. Toggleable center cutout for 54.5mm hub (unchecked = solid thin diffuser lid)
    if (p.lidHubCutout) {
        const holeR = (p.spoolBoreDia + 0.3) / 2;
        lid = lid.subtract(M.cylinder(faceThick + 4, holeR, holeR, 64).translate([0, 0, -1]));
    }

    return lid;
}

/**
 * Drop-in Center Adapter for existing Shade.stl (156mm hole, 6-bolt ring at R=91.35mm)
 * Completely flat 3mm plate with 54.8mm center hole (no raised collar blocking solid spools).
 */
export function buildShadeAdapter(M, p) {
    const shadeHoleR = p.shadeHoleDia / 2;   // 78.0mm (156mm ID of Shade.stl)
    const flangeR = shadeHoleR + 18.5;       // 96.5mm (covers 6-bolt ring at R=91.35mm)
    const flangeThick = 3.0;                 // Uniform 3mm thin flat base

    // 1. Flat 3mm outer ring
    let adapter = M.cylinder(flangeThick, flangeR, flangeR, 72);

    // 2. Hollow out middle ring while keeping 6 radial spokes to the 54.8mm center ring
    const midCutR = shadeHoleR - 3.0;
    const centerInR = (p.spoolBoreDia + 0.4) / 2; // 27.45mm (54.9mm ID fits wall mount peg)
    const centerOutR = centerInR + 4.5;           // 31.95mm
    const midHollow = M.cylinder(flangeThick + 2, midCutR, midCutR, 64)
        .subtract(M.cylinder(flangeThick + 4, centerOutR, centerOutR, 64).translate([0, 0, -1]))
        .translate([0, 0, -1]);
    adapter = adapter.subtract(midHollow);

    // 3. 6 Radial structural spokes (3mm thin) bridging outer ring to center ring
    const spokeLen = midCutR - centerOutR + 4.0;
    for (let i = 0; i < 6; i++) {
        const spoke = M.cube([spokeLen, 6.0, flangeThick], false)
            .translate([centerOutR - 2.0, -3.0, 0])
            .rotate([0, 0, i * 60 + 30]);
        adapter = adapter.add(spoke);
    }

    // 4. Flat 3mm center 54.8mm pass-through hole (no tall collar blocking solid spool)
    const centerHole = M.cylinder(flangeThick + 4, centerInR, centerInR, 64).translate([0, 0, -1]);
    adapter = adapter.subtract(centerHole);

    // 5. 6 Screw holes matching Shade.stl (BCD = 182.7mm -> R = 91.35mm, every 60 deg)
    const boltR = p.shadeBoltR;
    for (let i = 0; i < 6; i++) {
        const hole = M.cylinder(flangeThick + 4, 2.2, 2.2, 24)
            .translate([boltR, 0, -1])
            .rotate([0, 0, i * 60]);
        adapter = adapter.subtract(hole);
    }

    return adapter;
}

/**
 * Wall Mount Bracket (2 top screws only, 5 deg upward tilt, 12mm cable groove + downward USB-C exit)
 */
export function buildWallMount(M, p) {
    const plateW = 74.0;
    const plateH = 94.0;
    const plateT = 5.0;

    let mount = M.cube([plateW, plateH, plateT], true).translate([0, 0, plateT / 2]);

    // Top 2 drywall screw holes + counterbores only (bottom 2 removed for clean cable drop)
    const sx = 25.0;
    const sy = 34.0;
    [[-sx, sy], [sx, sy]].forEach(([x, y]) => {
        const bore = M.cylinder(plateT + 4, 2.1, 2.1, 24).translate([x, y, -1]);
        const cSink = M.cylinder(2.6, 4.2, 4.2, 24).translate([x, y, plateT - 2.2]);
        mount = mount.subtract(bore).subtract(cSink);
    });

    // Center cylinder peg sized for 54.5mm spool bore, reaching max safe depth without hitting front hub
    const pegR = (p.spoolBoreDia - p.plugClearance - 0.15) / 2; // ~27.08mm (54.15mm OD)
    const pegInnerR = Math.max(10, pegR - 3.4);
    const maxSafeLen = Math.max(14, (p.spoolInnerWidth + 4.0) - p.plugDepth - 2.0); // ~36mm

    let peg = M.cylinder(maxSafeLen + 5.0, pegR, pegR, 64)
        .translate([0, 0, -4.0])
        .subtract(M.cylinder(maxSafeLen + 3.0, pegInnerR, pegInnerR, 56).translate([0, 0, 0.0]));

    if (Math.abs(p.wallMountAngle) > 0.1) {
        peg = peg.rotate([-p.wallMountAngle, 0, 0]);
    }
    peg = peg.translate([0, 0, plateT]);
    mount = mount.add(peg);

    // Center wire pass-through hole + 12mm wide open channel straight down through wall mount & peg
    const grooveW = p.wallMountGrooveW || 12.0;
    const centerWireHole = M.cylinder(plateT + 8.0, grooveW / 2, grooveW / 2, 32).translate([0, 0, -2]);
    const downSlot = M.cube([grooveW, plateH / 2 + 6.0, maxSafeLen + plateT + 10.0], true)
        .translate([0, -plateH / 4 - 2.0, (maxSafeLen + plateT) / 2]);
    mount = mount.subtract(centerWireHole).subtract(downSlot);

    const wallClip = M.cube([220, 220, 220], true).translate([0, 0, 110]);
    return mount.intersect(wallClip);
}
