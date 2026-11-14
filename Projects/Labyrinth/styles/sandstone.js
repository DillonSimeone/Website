import { MASK } from './common.js';

/* Sandstone, lit by a flickering torch. */
export default {
    id: 'sandstone',
    name: 'Sandstone',
    mask: MASK.shaded,
    glsl: /* glsl */ `
        if (isFloor) {
            vec2 t = fract(uv);
            float grout = step(t.x, 0.03) + step(t.y, 0.03);
            albedo = mix(vec3(0.62, 0.5, 0.34) * (0.8 + 0.3 * hash1(floor(uv))), vec3(0.3, 0.24, 0.16), clamp(grout, 0.0, 1.0));
        } else if (isCeiling) {
            albedo = vec3(0.4, 0.32, 0.22) * (0.8 + 0.3 * noise2(uv * 3.0));
        } else {
            float row = floor(uv.y / 0.3);
            float shift = mod(row, 2.0) * 0.3;
            vec2 brick = vec2(fract((uv.x + shift) / 0.6), fract(uv.y / 0.3));
            float mortar = clamp(step(brick.x, 0.05) + step(brick.y, 0.08), 0.0, 1.0);
            vec3 stone = vec3(0.78, 0.62, 0.42) * (0.78 + 0.3 * hash1(vec2(floor((uv.x + shift) / 0.6), row))) * (0.9 + 0.2 * noise2(uv * 9.0));
            albedo = mix(stone, vec3(0.36, 0.28, 0.18), mortar);
        }
        tint = vec3(1.0, 0.66, 0.36) * (1.7 + 0.18 * sin(uTime * 13.0) + 0.12 * sin(uTime * 7.3 + 1.0));
        ambient = 0.06;
    `,
};
