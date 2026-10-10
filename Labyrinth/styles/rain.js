import { MASK } from './common.js';

/* Falling code: bright columns streaming down, drawn as glyphs. */
export default {
    id: 'rain',
    name: 'Falling code',
    mask: MASK.ascii,
    glsl: /* glsl */ `
        float column = floor(uv.x * 7.0);
        float speed = 0.6 + hash1(vec2(column, 3.0)) * 1.4;
        float head = fract(uv.y * 0.18 + uTime * speed * 0.35 + hash1(vec2(column, 9.0)));
        float trail = pow(head, 6.0);
        albedo = vec3(0.05, 0.2, 0.08);
        emissive = vec3(0.3, 1.0, 0.45) * trail * 1.6;
        tint = vec3(0.6, 1.0, 0.7) * 0.8;
        ambient = 0.03;
        mask = 0.5;
    `,
};
