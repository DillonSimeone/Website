import { MASK } from './common.js';

/* Library amber: old wood, drawn in the library's glyphs. */
export default {
    id: 'amber',
    name: 'Library amber',
    mask: MASK.ascii,
    glsl: /* glsl */ `
        float plank = floor(uv.x * 3.0);
        albedo = vec3(0.5, 0.31, 0.13) * (0.7 + 0.35 * hash1(vec2(plank, 1.0))) * (0.85 + 0.25 * noise2(vec2(uv.x * 40.0, uv.y * 3.0)));
        if (isFloor || isCeiling) albedo *= 0.7;
        tint = vec3(1.0, 0.75, 0.45) * 1.6;
        ambient = 0.05;
        mask = 0.5;
    `,
};
