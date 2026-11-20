import { SCENES } from '../scenes/index.js';
import { createSceneRoom } from './scene.js';
import pool from './pool.js';
import voidRoom from './void.js';
import babel from './babel.js';
import lanterns from './lanterns.js';
import upsidedown from './upsidedown.js';
import rain from './rain.js';
import clockwork from './clockwork.js';

/*
 * Every room type: { name, build(ctx), and flags for the cell builder }.
 *   skyCeiling / noFloor: drop that slab, window: cut a wide opening in one solid wall,
 *   square: needs the plain square shape (flat walls to hang things on).
 * Scene rooms are made from scenes/ automatically.
 */
export const ROOM_TYPES = { pool, void: voidRoom, babel, lanterns, upsidedown, rain, clockwork };
for (const [key, scene] of Object.entries(SCENES)) {
    ROOM_TYPES[key] = {
        name: scene.name, window: true, square: true, scene: key, pitch: scene.pitch,
        build: (ctx) => createSceneRoom(ctx, scene),
    };
}

export const SCENE_ROOMS = Object.keys(SCENES);
export const STRANGE_ROOMS = ['babel', 'lanterns', 'upsidedown', 'rain', 'clockwork', 'pool'];
/* Rooms the halls can place (void and garden pools come from their zones). */
export const HALL_ROOMS = [...SCENE_ROOMS, ...STRANGE_ROOMS];

/* Source file of each room, shown by the editor. */
export const roomFile = (key) => (SCENES[key] ? `scenes/${key}.js` : `rooms/${key}.js`);

/**
 * ctx: { U, fade, cellCenter (uniform), center (floor centre), entrySide, exitSide, solidSides, windowSide, shape }
 */
export function createRoom(type, ctx) {
    return ROOM_TYPES[type].build(ctx);
}
