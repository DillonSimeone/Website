import { FRAME } from './frame.js';
import ocean from './ocean.js';
import dunes from './dunes.js';
import forest from './forest.js';
import underwater from './underwater.js';
import rainbow from './rainbow.js';
import waterfall from './waterfall.js';
import nova from './nova.js';

export { FRAME };

/* Each scene file exports { name, pitch, glsl }; glsl gets the shared FRAME prepended here. */
const LIST = { ocean, dunes, forest, underwater, rainbow, waterfall, nova };

export const SCENES = Object.fromEntries(
    Object.entries(LIST).map(([key, s]) => [key, { name: s.name, pitch: s.pitch, glsl: FRAME + s.glsl }]),
);
