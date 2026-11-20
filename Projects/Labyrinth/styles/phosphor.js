import { MASK } from './common.js';

/* Phosphor terminal: a green grid drawn as glyphs. */
export default {
    id: 'phosphor',
    name: 'Phosphor terminal',
    mask: MASK.ascii,
    glsl: /* glsl */ `
        vec2 g = abs(fract(uv * 2.0) - 0.5);
        float grid = 1.0 - smoothstep(0.42, 0.47, max(g.x, g.y));
        albedo = vec3(0.12, 0.95, 0.35) * (0.35 + 0.65 * grid) * (0.8 + 0.3 * noise2(uv * 6.0 + uTime * 0.3));
        tint = vec3(0.7, 1.0, 0.75) * 1.5;
        ambient = 0.06;
        mask = 0.5;
    `,
};
