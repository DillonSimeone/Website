import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { WALL_H, DOOR_H, DIRS } from './grid.js';
import worm from './critters/worm.js';
import beetle from './critters/beetle.js';
import spider from './critters/spider.js';
import ants from './critters/ants.js';
import moth from './critters/moth.js';
import snail from './critters/snail.js';

/*
 * Little creatures living in the cells. Each file in critters/ exports
 *   { name, fits(habitat), build(ctx) } where build returns { group, update(t, camera), dispose() }.
 * habitat: { floor, ceiling, walls } (what the cell offers). ctx is the room ctx plus floorY, ceilingY,
 * wall, wallSpan, roam and the helpers below.
 */
export const CRITTERS = { worm, beetle, spider, ants, moth, snail };
export const critterFile = (key) => `critters/${key}.js`;

export function habitatOf(cell, spec, solidSides) {
    return {
        floor: !spec.noFloor && cell.kind !== 'stairs',
        ceiling: !spec.skyCeiling && cell.kind !== 'stairs',
        walls: solidSides.length > 0 && cell.kind !== 'stairs',
    };
}

export function critterOptions(habitat) {
    return Object.keys(CRITTERS).filter(k => CRITTERS[k].fits(habitat));
}

/*
 * Per shape: how far a solid wall's inner face is from the centre, how far along it stays flat
 * (on round cells this is an angle), and the half-width of floor that is clear to walk on.
 */
const FIT = {
    square: { wall: 1.79, span: 1.4, roam: 1.5 },
    octagon: { wall: 1.79, span: 0.85, roam: 1.3 },
    round: { wall: 1.62, span: 0.6, roam: 1.1 },
    pillared: { wall: 1.79, span: 1.0, roam: 1.05 },
    vaulted: { wall: 1.79, span: 1.4, roam: 1.5 },
    narrow: { wall: 1.08, span: 0.95, roam: 0.9 },
};

export function createCritter(kind, ctx) {
    const { wall, span, roam } = FIT[ctx.shape] || FIT.square;
    const ceiling = ctx.center.y + (ctx.shape === 'narrow' ? DOOR_H : WALL_H);
    const unbroken = ctx.solidSides.filter(s => s !== ctx.windowSide);
    return CRITTERS[kind].build({
        ...ctx,
        solidSides: unbroken.length ? unbroken : ctx.solidSides,
        floorY: ctx.center.y,
        ceilingY: ceiling,
        wall,
        wallSpan: span,
        roam,
        /* A solid side's frame: out (toward the wall), tangent (along it), and the wall face distance. */
        wallFrame(side) {
            const out = new THREE.Vector3(DIRS[side][0], 0, DIRS[side][1]);
            return { out, tangent: new THREE.Vector3(-out.z, 0, out.x), dist: wall };
        },
        /* A random floor point within the roaming square. */
        randomFloorPoint() {
            return new THREE.Vector3(ctx.center.x + (Math.random() * 2 - 1) * roam, ctx.center.y, ctx.center.z + (Math.random() * 2 - 1) * roam);
        },
    });
}

/* Seconds since the last update, for critters that move by velocity. */
export function makeClock() {
    let last = null;
    return (t) => {
        const dt = last === null ? 0 : Math.min(0.1, Math.max(0, t - last));
        last = t;
        return dt;
    };
}
