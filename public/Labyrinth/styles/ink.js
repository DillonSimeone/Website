import { MASK } from './common.js';

/* Ink and paper: rendered as inverted glyphs. */
export default {
    id: 'ink',
    name: 'Ink and paper',
    mask: MASK.ink,
    glsl: /* glsl */ `
        albedo = vec3(0.95, 0.92, 0.85) * (0.92 + 0.08 * noise2(uv * 40.0));
        tint = vec3(1.0) * 1.7;
        ambient = 0.08;
        mask = 1.0;
    `,
};
