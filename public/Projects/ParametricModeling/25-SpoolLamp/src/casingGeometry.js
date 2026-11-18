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

    // 5. Centered 54.2mm OD / 48.2mm ID collar goes up into spool's 54.5mm bore
    //    Wall mount peg slides inside this collar so spools always stay centered
    const collarOutR = (p.spoolBoreDia - p.plugClearance - 0.1) / 2; // ~27.1mm (54.2mm OD)
    const collarInR = collarOutR - (p.collarWall || 3.0);             // ~24.1mm (48.2mm ID)
    const collarH = 20.0;
    const centerCollar = M.cylinder(collarH, collarOutR, collarOutR, 64).translate([0, 0, baseThick]);
    const centerPass = M.cylinder(collarH + baseThick + 4, collarInR, collarInR, 56).translate([0, 0, -1]);
    const cableSlot = M.cube([14.0, innerR * 0.72, baseThick + 4], true)
        .translate([0, -innerR * 0.36, baseThick / 2]);
    shell = shell.add(centerCollar).subtract(centerPass).subtract(cableSlot);

    // 6. Radial light/ventilation cutouts in base plate (skip ONLY i === 4 straight-down where cableSlot sits)
    for (let i = 0; i < 6; i++) {
        if (i === 4) continue;
        const slot = M.cube([28, 16, baseThick + 4], true)
            .translate([collarOutR + 28, 0, baseThick / 2])
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
 * Under-Mount Center Adapter for existing Shade.stl (156mm bed hole, 1.05mm shelf, 6-bolt ring at R=91.35mm)
 * - Prints 100% flat on the bed with ZERO overhangs:
 *   193mm outer flange (6 screw holes) sits flat on bed (z = 0..2.6mm)
 *   155.6mm locating lip rises up into Shade.stl's 156mm hole (z = 2.6..3.9mm)
 *   54.2mm center collar rises up into the spool's main cylinder
 */
export function buildShadeAdapter(M, p) {
    const shadeHoleR = p.shadeHoleDia / 2;   // 78.0mm (156mm ID of Shade.stl)
    const bedFitR = shadeHoleR - 0.2;        // 77.8mm (155.6mm OD zero-wiggle fit)
    const flangeR = shadeHoleR + 18.5;       // 96.5mm (covers 6-bolt ring at R=91.35mm)
    const flangeThick = 2.6;                 // Flat baseplate on bed (goes under Shade.stl)
    const locateStepH = 1.3;                 // Rises up into Shade.stl's 1.05mm shelf opening
    const totalBaseH = flangeThick + locateStepH;

    const collarOutR = (p.spoolBoreDia - p.plugClearance - 0.1) / 2; // ~27.1mm
    const collarInR = collarOutR - (p.collarWall || 3.0);             // ~24.1mm
    const collarH = 20.0;

    // 1. Flat 193mm outer flange on bed (z=0..2.6) + 155.6mm locating lip rising up (z=2.6..3.9)
    const bottomFlange = M.cylinder(flangeThick, flangeR, flangeR, 96);
    const locateLip = M.cylinder(locateStepH, bedFitR, bedFitR, 96).translate([0, 0, flangeThick]);
    let adapter = bottomFlange.add(locateLip);

    // 2. Hollow out inner window while keeping 6 radial spokes + 155.6mm locating rim
    const midCutR = shadeHoleR - 5.0;
    const midHollow = M.cylinder(totalBaseH + 2, midCutR, midCutR, 72)
        .subtract(M.cylinder(totalBaseH + 4, collarOutR, collarOutR, 64).translate([0, 0, -1]))
        .translate([0, 0, -1]);
    adapter = adapter.subtract(midHollow);

    // 3. 6 Radial structural spokes (flat on bed) bridging locating rim to center collar
    const spokeLen = midCutR - collarOutR + 4.0;
    for (let i = 0; i < 6; i++) {
        const spoke = M.cube([spokeLen, 6.0, flangeThick], false)
            .translate([collarOutR - 2.0, -3.0, 0])
            .rotate([0, 0, i * 60 + 30]);
        adapter = adapter.add(spoke);
    }

    // 4. Center 54.2mm OD / 48.2mm ID collar rising up into the spool's main cylinder
    const centerCollar = M.cylinder(collarH + flangeThick, collarOutR, collarOutR, 64);
    const centerHole = M.cylinder(collarH + flangeThick + 4, collarInR, collarInR, 64).translate([0, 0, -1]);
    adapter = adapter.add(centerCollar).subtract(centerHole);

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
 * Peg OD is sized to pass smoothly through the 48.2mm center collar of the shade / adapter.
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

    // Tapered cone peg: full pegR at base, 5mm narrower in diameter (2.5mm radius) at tip
    // Fits a wider range of adapter/collar tolerances and self-centers as it slides back
    const collarOutR = (p.spoolBoreDia - p.plugClearance - 0.1) / 2;
    const collarInR = collarOutR - (p.collarWall || 3.0);
    const pegR = Math.max(14, collarInR - 0.55);
    const pegTipR = Math.max(11, pegR - 2.5); // 5mm narrower diameter at tip
    const pegInnerR = Math.max(9, pegR - 3.2);
    const pegInnerTipR = Math.max(6, pegTipR - 3.2);
    const maxSafeLen = Math.max(14, (p.spoolInnerWidth + 4.0) - p.plugDepth - 2.0); // ~36mm

    let peg = M.cylinder(maxSafeLen + 5.0, pegR, pegTipR, 64)
        .translate([0, 0, -4.0])
        .subtract(M.cylinder(maxSafeLen + 3.0, pegInnerR, pegInnerTipR, 56).translate([0, 0, 0.0]));

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

/**
 * Stepped Bore Size Tester (10 hollow rings, narrow bottom -> wider top)
 * Drop narrow end into any spool center cylinder and count rings sticking out at top.
 */
export function buildSizeTester(M, p) {
    const numRings = 10;
    const ringH = 5.0;
    const step = p.testerStep || 0.5;
    const wall = 2.4;
    const startDia = p.spoolBoreDia - 4 * step; // Centered around spoolBoreDia

    const minR = startDia / 2;
    const holeR = Math.max(10, minR - wall);
    let gauge = null;

    for (let i = 0; i < numRings; i++) {
        const dia = startDia + i * step;
        const r = dia / 2;
        const ring = M.cylinder(ringH, r, r, 64).translate([0, 0, i * ringH]);
        gauge = gauge ? gauge.add(ring) : ring;
    }

    const bore = M.cylinder(numRings * ringH + 2, holeR, holeR, 56).translate([0, 0, -1]);
    return gauge.subtract(bore);
}
