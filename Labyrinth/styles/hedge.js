import { MASK } from './common.js';

/* Hedge maze under an open sky (the ceiling draws the sky). */
export default {
    id: 'hedge',
    name: 'Hedge maze',
    mask: MASK.shaded,
    glsl: /* glsl */ `
        if (isFloor) {
            albedo = vec3(0.5, 0.45, 0.34) * (0.7 + 0.45 * noise2(uv * 28.0));
        } else if (isCeiling) {
            albedo = vec3(0.0);
            emissive = skyColor(normalize(p - uCam), normalize(vec3(0.2, 1.0, 0.1)));
        } else {
            float leaves = fbm2(uv * 7.0);
            float gaps = step(0.42, noise2(uv * 24.0 + 3.0));
            albedo = mix(vec3(0.04, 0.16, 0.035), vec3(0.2, 0.46, 0.12), leaves) * (0.45 + 0.7 * gaps);
        }
        tint = vec3(1.0, 0.95, 0.85) * 1.2;
        ambient = mix(0.07, 0.4, uDay);
    `,
};
