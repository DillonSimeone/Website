import { MASK } from './common.js';

/* Frozen hall: pale ice, dark cracks, glints of frost. */
export default {
    id: 'ice',
    name: 'Frozen hall',
    mask: MASK.shaded,
    glsl: /* glsl */ `
        vec3 v = voronoi(uv * 1.3);
        float crack = 1.0 - smoothstep(0.0, 0.03, v.y);
        albedo = mix(vec3(0.72, 0.85, 0.95), vec3(0.45, 0.62, 0.8), v.z * 0.6 + 0.2 * fbm2(uv * 6.0));
        albedo *= 1.0 - crack * 0.6;
        float glint = step(0.985, hash1(floor(uv * 40.0))) * (0.5 + 0.5 * sin(uTime * 3.0 + hash1(floor(uv * 40.0)) * 40.0));
        emissive = vec3(0.8, 0.9, 1.0) * glint * 0.8;
        tint = vec3(0.75, 0.88, 1.0) * 1.5;
        ambient = 0.1;
    `,
};
