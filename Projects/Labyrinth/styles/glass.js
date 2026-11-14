import { MASK } from './common.js';

/* Stained glass: light pours through coloured panes set in lead. */
export default {
    id: 'glass',
    name: 'Stained glass',
    mask: MASK.shaded,
    glsl: /* glsl */ `
        vec3 v = voronoi(uv * 1.6);
        float lead = 1.0 - smoothstep(0.02, 0.07, v.y);
        if (isFloor) {
            vec3 w = voronoi(uv * 0.9 + 0.3);
            albedo = vec3(0.2, 0.19, 0.18);
            emissive = hue(w.z) * 0.12 * (1.0 - smoothstep(0.0, 0.1, 0.1 - w.y));
        } else {
            albedo = vec3(0.02);
            emissive = hue(v.z) * (1.0 - lead) * (0.75 + 0.25 * sin(uTime * 0.7 + v.z * 30.0)) * 0.9;
        }
        tint = vec3(1.0);
        ambient = 0.04;
    `,
};
