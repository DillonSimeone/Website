import { MASK } from './common.js';

/* Crystal cave: faceted amethyst and teal with glowing seams. */
export default {
    id: 'crystal',
    name: 'Crystal cave',
    mask: MASK.shaded,
    glsl: /* glsl */ `
        vec3 v = voronoi(uv * 2.2);
        vec3 facet = mix(vec3(0.35, 0.12, 0.55), vec3(0.08, 0.45, 0.5), v.z);
        albedo = facet * (0.55 + 0.6 * v.x);
        float seam = 1.0 - smoothstep(0.0, 0.06, v.y);
        emissive = mix(vec3(0.9, 0.3, 1.0), vec3(0.2, 1.0, 0.9), v.z) * seam * (0.5 + 0.5 * sin(uTime * 1.5 + v.z * 20.0));
        tint = vec3(0.85, 0.75, 1.0) * 1.5;
        ambient = 0.05;
    `,
};
