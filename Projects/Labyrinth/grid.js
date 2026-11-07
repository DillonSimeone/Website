import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

/* Grid squares, floor spacing and wall sizes shared by the generator, the builder and the editor. */
export const CELL = 4;
export const LEVEL = 3.4;
export const EYE = 1.6;
export const WALL_H = 3.2;
export const WALL_T = 0.2;
export const DOOR_W = 2.0;
export const DOOR_H = 2.6;
export const STUB_DEPTH = 1.6;
/* Half the interior: walls' inner faces sit this far from the cell centre. */
export const INNER = CELL / 2 - WALL_T;

/* Sides and travel directions: 0 north (-z), 1 east (+x), 2 south (+z), 3 west (-x). */
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export const keyOf = (gx, gz, lvl) => `${gx},${gz},${lvl}`;
export const opposite = (d) => (d + 2) % 4;
export const dirVec = (d) => new THREE.Vector3(DIRS[d][0], 0, DIRS[d][1]);

export function yawOf(dir) {
    return Math.atan2(-DIRS[dir][0], -DIRS[dir][1]);
}

export function nodeOf(cell) {
    const y = cell.kind === 'stairs'
        ? Math.min(cell.lvl, cell.exitLvl) * LEVEL + LEVEL / 2 + EYE
        : cell.lvl * LEVEL + EYE;
    return new THREE.Vector3(cell.gx * CELL, y, cell.gz * CELL);
}

export function doorBetween(a, b) {
    const p = nodeOf(a).lerp(nodeOf(b), 0.5);
    p.y = a.exitLvl * LEVEL + EYE;
    return p;
}
