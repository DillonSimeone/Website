import { DIRS, DOOR_W, DOOR_H, WALL_H, WALL_T, INNER } from './grid.js';

/* Round and vaulted cells rise this far above the usual ceiling to make room for the dome or vault. */
export const RAISE = 0.9;
const RING_R = 1.7;
const RING_SEGMENTS = 24;
const RING_T = 0.14;

/*
 * Cell shapes are layered inside the square box (whose walls stay behind as the outer shell).
 * build(k) adds pieces with k.put(x, y, z, sx, sy, sz, rotY) (a box) or k.instanced(geo, list).
 *   raised:     needs RAISE of headroom (the builder raises the walls and ceiling slab)
 *   needsRoof:  meaningless under an open sky; rooms with skyCeiling fall back to square
 *   plainOnly:  too cramped for rooms; cells with a room fall back to square
 *   tomeInset:  how far from the centre a found book stands against a solid wall
 * k gives: X, Z (centre), y0 (floor), total (wall height), raised, isDoor(side), geos { dome, vault }.
 */
export const SHAPES = {
    square: {
        name: 'Square',
        build() {},
    },

    /* Diagonal walls across every corner, running from door edge to door edge. */
    octagon: {
        name: 'Octagon',
        build(k) {
            const edge = DOOR_W / 2;
            const mid = (INNER + edge) / 2 + WALL_T / (2 * Math.SQRT2);
            const length = (INNER - edge) * Math.SQRT2 + 0.12;
            for (const sx of [-1, 1]) {
                for (const sz of [-1, 1]) {
                    k.put(k.X + sx * mid, k.y0 + k.total / 2, k.Z + sz * mid, length, k.total, WALL_T, sx * sz * Math.PI / 4);
                }
            }
        },
    },

    /* A ring of panels with arched gaps at the doors, short vestibules out to the square doorway, and a dome. */
    round: {
        name: 'Round',
        raised: true,
        build(k) {
            const doors = [0, 1, 2, 3].filter(k.isDoor);
            const doorAngles = doors.map(s => Math.atan2(DIRS[s][1], DIRS[s][0]));
            const jamb = DOOR_W / 2 + 0.1;
            const halfArc = Math.asin(jamb / RING_R) + Math.PI / RING_SEGMENTS;
            const width = 2 * RING_R * Math.sin(Math.PI / RING_SEGMENTS) + 0.05;
            for (let i = 0; i < RING_SEGMENTS; i++) {
                const a = ((i + 0.5) / RING_SEGMENTS) * Math.PI * 2;
                const inDoor = doorAngles.some(d => Math.abs(Math.atan2(Math.sin(a - d), Math.cos(a - d))) < halfArc);
                const yb = inDoor ? DOOR_H : 0;
                k.put(k.X + Math.cos(a) * RING_R, k.y0 + (yb + WALL_H) / 2, k.Z + Math.sin(a) * RING_R, width, WALL_H - yb, RING_T, -a - Math.PI / 2);
            }
            const inner = Math.sqrt(RING_R * RING_R - jamb * jamb) - 0.1;
            const depth = INNER - inner;
            const radial = inner + depth / 2;
            for (const s of doors) {
                const [dx, dz] = DIRS[s];
                const alongX = dx !== 0;
                for (const side of [-1, 1]) {
                    const x = k.X + dx * radial + (alongX ? 0 : side * jamb);
                    const z = k.Z + dz * radial + (alongX ? side * jamb : 0);
                    k.put(x, k.y0 + WALL_H / 2, z, alongX ? depth : RING_T, WALL_H, alongX ? RING_T : depth);
                }
                const span = jamb * 2 + RING_T;
                k.put(k.X + dx * radial, k.y0 + (DOOR_H + WALL_H) / 2, k.Z + dz * radial, alongX ? depth : span, WALL_H - DOOR_H, alongX ? span : depth);
            }
            if (k.raised) k.instanced(k.geos.dome, [[k.X, k.y0 + WALL_H, k.Z, RING_R, RAISE, RING_R, 0]]);
        },
    },

    /* Four columns joined by beams. */
    pillared: {
        name: 'Pillared',
        plainOnly: true,
        build(k) {
            const p = 1.25;
            for (const sx of [-1, 1]) {
                for (const sz of [-1, 1]) k.put(k.X + sx * p, k.y0 + WALL_H / 2, k.Z + sz * p, 0.36, WALL_H, 0.36);
            }
            for (const s of [-1, 1]) {
                k.put(k.X, k.y0 + WALL_H - 0.15, k.Z + s * p, p * 2 + 0.36, 0.3, 0.3);
                k.put(k.X + s * p, k.y0 + WALL_H - 0.15, k.Z, 0.3, 0.3, p * 2 + 0.36);
            }
        },
    },

    /* Two crossing barrel vaults (a groin vault). */
    vaulted: {
        name: 'Vaulted',
        raised: true,
        needsRoof: true,
        build(k) {
            if (!k.raised) return;
            const sy = RAISE / 2;
            k.instanced(k.geos.vault, [[k.X, k.y0 + WALL_H, k.Z, 1, sy, 1, 0], [k.X, k.y0 + WALL_H, k.Z, 1, sy, 1, Math.PI / 2]]);
        },
    },

    /* A cramped passage: solid corners, closed arms and a low ceiling, so only the doorways are open. */
    narrow: {
        name: 'Narrow passage',
        plainOnly: true,
        tomeInset: 0.8,
        build(k) {
            const half = DOOR_W / 2 + 0.1;
            const block = INNER - half + 0.1;
            const c = half + block / 2;
            for (const sx of [-1, 1]) {
                for (const sz of [-1, 1]) k.put(k.X + sx * c, k.y0 + k.total / 2, k.Z + sz * c, block, k.total, block);
            }
            for (let s = 0; s < 4; s++) {
                if (k.isDoor(s)) continue;
                const [dx, dz] = DIRS[s];
                const o = half + WALL_T / 2;
                k.put(k.X + dx * o, k.y0 + k.total / 2, k.Z + dz * o, dx ? WALL_T : half * 2, k.total, dx ? half * 2 : WALL_T);
            }
            k.put(k.X, k.y0 + DOOR_H + 0.1, k.Z, INNER * 2, 0.2, INNER * 2);
        },
    },
};

export const SHAPE_KEYS = Object.keys(SHAPES);
