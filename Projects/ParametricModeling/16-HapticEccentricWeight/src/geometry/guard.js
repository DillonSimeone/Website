// Separate printable spin-test guard / stand (NOT packed in kit envelope)
import { MOTOR, KIT_ENVELOPE, params } from '../state.js';
import { box, cyl } from './helpers.js';

/**
 * Open cage around the motor + spinning rotor.
 * Motor sits in a cradle; shaft points +Z into a clearance dome.
 * Exported separately — keep clear of rotating parts during tests.
 */
export function generateGuard() {
  const m = MOTOR;
  const wall = 2.0;
  const pad = 2.5;
  const rotorClearR = params.rotorOdMax / 2 + 3.0;
  const rotorZoneH = params.rotorThickness + params.hubHeight + 8;

  const baseW = m.frameW + pad * 2 + wall * 2;
  const baseD = m.frameH + pad * 2 + wall * 2;
  const baseH = 3.0;
  let guard = box(baseW + 8, baseD + 8, baseH).translate([0, 0, -baseH / 2]);

  const cradleH = m.frameL * 0.55;
  const cavW = m.frameW + pad;
  const cavD = m.frameH + pad;
  let outer = box(cavW + wall * 2, cavD + wall * 2, cradleH)
    .translate([0, 0, cradleH / 2]);
  let inner = box(cavW, cavD, cradleH + 0.4)
    .translate([0, 0, cradleH / 2 + 0.2]);
  let cradle = outer.subtract(inner);
  outer.delete();
  inner.delete();
  guard = guard.add(cradle);
  cradle.delete();

  const columnH = cradleH + rotorZoneH;
  const span = rotorClearR + 2;
  for (const [x, y] of [[-span, -span], [span, -span], [-span, span], [span, span]]) {
    let col = cyl(1.6, columnH, 16).translate([x, y, columnH / 2]);
    guard = guard.add(col);
    col.delete();
  }

  let ringOuter = cyl(rotorClearR + 3.5, 2.2, 48).translate([0, 0, columnH]);
  let ringInner = cyl(rotorClearR + 0.8, 2.6, 48).translate([0, 0, columnH]);
  let ring = ringOuter.subtract(ringInner);
  ringOuter.delete();
  ringInner.delete();
  guard = guard.add(ring);
  ring.delete();

  let win = box(cavW * 0.7, wall + 2, cradleH * 0.45)
    .translate([0, (cavD + wall) / 2, cradleH * 0.55]);
  guard = guard.subtract(win);
  win.delete();

  return guard;
}

/** Thin shell representing the 41×19×10 packing box */
export function generateEnvelopeGhost() {
  const w = KIT_ENVELOPE.w;
  const d = KIT_ENVELOPE.d;
  const h = KIT_ENVELOPE.h;
  let outer = box(w, d, h);
  let inner = box(w - 0.6, d - 0.6, h - 0.6);
  let shell = outer.subtract(inner);
  outer.delete();
  inner.delete();
  return shell;
}
