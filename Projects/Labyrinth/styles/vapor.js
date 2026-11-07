import { MASK } from './common.js';

/* Neon sunset: gradient walls, glowing grid floor and ceiling. */
export default {
    id: 'vapor',
    name: 'Neon sunset',
    mask: MASK.shaded,
    glsl: /* glsl */ `
        if (isFloor || isCeiling) {
            vec2 g = abs(fract(uv * 2.0 + (isFloor ? vec2(0.0, uTime * 0.25) : vec2(0.0))) - 0.5);
            float grid = 1.0 - smoothstep(0.44, 0.49, max(g.x, g.y));
            albedo = vec3(0.03, 0.0, 0.06);
            emissive = (isFloor ? vec3(1.0, 0.2, 0.8) : vec3(0.2, 0.8, 1.0)) * (1.0 - grid) * 0.9;
        } else {
            float ly = mod(p.y, LEVEL) / WALL_H;
            vec3 grad = mix(vec3(1.0, 0.45, 0.2), vec3(0.45, 0.1, 0.6), ly);
            float bands = step(0.5, fract(ly * 9.0)) * (1.0 - smoothstep(0.2, 0.55, ly));
            albedo = grad * 0.3;
            emissive = grad * (0.35 + 0.25 * bands);
        }
        tint = vec3(1.0, 0.6, 1.0);
        ambient = 0.05;
    `,
};
