// Glued shaft hub — hex drive slot on top, shaft bore toward motor
import { MOTOR, params } from '../state.js';
import { box, cyl } from './helpers.js';

/** Vertex radius for a regular hex with given across-flats size */
export function hexVertexR(acrossFlats) {
  return acrossFlats / (2 * Math.cos(Math.PI / 6));
}

export function hexPrism(acrossFlats, height) {
  return cyl(hexVertexR(acrossFlats), height, 6);
}

/** Shared hex + skirt dimensions (0.6 mm nozzle–friendly). */
export function hexMountDims() {
  const p = params;
  const clr = p.hexClearance;
  const hubR = p.hubOd / 2;
  const hexAf = p.hexAf;
  const skirtWall = Math.max(1.6, p.skirtWall);
  const skirtInnerR = hubR + clr;
  const skirtOuterR = skirtInnerR + skirtWall;
  return {
    clr,
    hubR,
    hexAf,
    hexDepth: p.hexDepth,
    skirtWall,
    skirtInnerR,
    skirtOuterR,
    // Female slot in hub slightly larger than male peg on weight
    slotAf: hexAf + clr * 2,
    pegAf: hexAf
  };
}

/**
 * Hub / adapter
 *  -Z face: blind shaft pilot (motor inserts here) — visible from motor side
 *  +Z face: hex SLOT for the weight peg
 * Glue: stand with bore facing up, glue, press motor in from above.
 * In the viewport the motor sits on -Z, so the bore faces the shaft.
 */
export function generateHub() {
  const p = params;
  const hubR = p.hubOd / 2;
  const bodyH = p.hubHeight;
  const floor = Math.max(1.6, p.minWall);
  const { slotAf, hexDepth } = hexMountDims();

  let hub = cyl(hubR, bodyH, 48);

  // Height budget (from top): hex slot → separator wall → shaft bore.
  // Hex gets priority so it is always a clear, usable socket.
  const separator = Math.max(floor, p.minWall);
  const hexH = Math.min(hexDepth, bodyH - separator - 2.0);
  const boreDepth = Math.min(p.shaftInsertMax, bodyH - separator - hexH);

  // ── Shaft pilot bore, opens on -Z (motor / glue face) ──
  const boreR = Math.max(0.4, p.shaftPilotDiam / 2);
  const boreZ = -bodyH / 2 + boreDepth / 2 - 0.05;
  let bore = cyl(boreR, boreDepth + 0.2, 32).translate([0, 0, boreZ]);
  hub = hub.subtract(bore);
  bore.delete();

  // Wide glue well / counterbore — makes the hole obvious and holds adhesive
  const wellR = Math.max(1.1, boreR + 0.6);
  let well = cyl(wellR, 1.2, 28).translate([0, 0, -bodyH / 2 + 0.5]);
  hub = hub.subtract(well);
  well.delete();
  let step = cyl(boreR + 0.3, 0.7, 24).translate([0, 0, -bodyH / 2 + 1.05]);
  hub = hub.subtract(step);
  step.delete();

  // ── Hex SLOT on +Z (weight side) — deep, chamfered lead-in ──
  let hexCut = hexPrism(slotAf, hexH + 0.1)
    .translate([0, 0, bodyH / 2 - hexH / 2 + 0.05]);
  hub = hub.subtract(hexCut);
  hexCut.delete();

  // Funnel lead-in so the peg self-centers when sliding down
  const leadAf = slotAf + 1.0;
  let lead = hexPrism(leadAf, 0.9).translate([0, 0, bodyH / 2 - 0.35]);
  hub = hub.subtract(lead);
  lead.delete();

  // Small top-edge alignment nick (which hex flat = heavy side reference)
  let nick = box(1.0, 1.4, 1.2).translate([0, hubR - 0.4, bodyH / 2 - 0.6]);
  hub = hub.subtract(nick);
  nick.delete();

  return hub;
}

/**
 * Cutter / interface for a weight: hex peg + full-height skirt cavity.
 * Used by rotors and fit coupon. Rotor eccentric body sits on +Z.
 */
export function weightInterfaceSolid(eccentricTop) {
  const p = params;
  const { pegAf, hexDepth, skirtInnerR, skirtOuterR } = hexMountDims();
  const skirtH = p.hubHeight;
  const topT = eccentricTop;

  // Outer skirt shell
  let skirt = cyl(skirtOuterR, skirtH, 48);
  let cavity = cyl(skirtInnerR, skirtH + 0.2, 48);
  let shell = skirt.subtract(cavity);
  skirt.delete();
  cavity.delete();

  // Top cap plate (caller may union eccentric mass instead — this is the drive plate)
  let cap = cyl(skirtOuterR, topT, 48)
    .translate([0, 0, skirtH / 2 + topT / 2]);
  shell = shell.add(cap);
  cap.delete();

  // Hex peg hanging from underside of cap into the hub slot
  const pegH = Math.min(hexDepth - p.hexClearance, skirtH * 0.55);
  let peg = hexPrism(pegAf, pegH)
    .translate([0, 0, skirtH / 2 - pegH / 2]);
  shell = shell.add(peg);
  peg.delete();

  return shell;
}

/** Fit coupon — short skirt + hex peg for clearance checks (compact for kit) */
export function generateFitCoupon() {
  const p = params;
  const { skirtOuterR, skirtInnerR, pegAf, hexDepth } = hexMountDims();
  // Keep coupon short so it packs beside full-height weights
  const skirtH = Math.min(3.6, p.hubHeight * 0.5);
  const topT = Math.max(2.0, p.minWall);
  const outerR = Math.min(skirtOuterR, 4.2);

  let skirt = cyl(outerR, skirtH, 40);
  let cavity = cyl(Math.min(skirtInnerR, outerR - p.skirtWall), skirtH + 0.2, 40);
  let coupon = skirt.subtract(cavity);
  skirt.delete();
  cavity.delete();

  const overlap = 0.15;
  let cap = cyl(outerR, topT, 40)
    .translate([0, 0, skirtH / 2 + topT / 2 - overlap]);
  coupon = coupon.add(cap);
  cap.delete();

  const pegH = Math.min(hexDepth - 0.15, 2.4);
  let peg = hexPrism(Math.min(pegAf, 2.8), pegH + overlap)
    .translate([0, 0, skirtH / 2 - pegH / 2]);
  coupon = coupon.add(peg);
  peg.delete();

  let notch = box(1.0, outerR * 2, topT + 0.2)
    .translate([outerR - 0.25, 0, skirtH / 2 + topT / 2 - overlap]);
  coupon = coupon.subtract(notch);
  notch.delete();

  return coupon;
}

export function generateMotorGhost() {
  const m = MOTOR;
  let body = box(m.frameW, m.frameH, m.frameL);
  let shaft = cyl(m.shaftDiam / 2, m.shaftLen, 16)
    .translate([0, 0, m.frameL / 2 + m.shaftLen / 2]);
  let motor = body.add(shaft);
  body.delete();
  shaft.delete();
  return motor;
}

// Back-compat alias during refactor
export function bayonetSocketCutter() {
  return null;
}
export function bayonetDims() {
  return hexMountDims();
}
