import { MASK } from './common.js';

/* Obsidian with pulsing cyan circuit veins. */
export default {
    id: 'obsidian',
    name: 'Obsidian circuit',
    mask: MASK.shaded,
    glsl: /* glsl */ `
        albedo = vec3(0.035, 0.035, 0.05) * (0.8 + 0.4 * noise2(uv * 5.0));
        vec2 g = uv * 3.0;
        vec2 c = floor(g);
        vec2 f = fract(g);
        float h = hash1(c + 3.7);
        float line = h < 0.5 ? smoothstep(0.07, 0.0, abs(f.y - 0.5)) : smoothstep(0.07, 0.0, abs(f.x - 0.5));
        if (h > 0.82) line = max(line, smoothstep(0.16, 0.08, length(f - 0.5)));
        if (h > 0.35 && h < 0.45) line = 0.0;
        float pulse = 0.5 + 0.5 * sin(uTime * 2.2 - (c.x + c.y) * 0.8);
        emissive = vec3(0.1, 0.85, 1.0) * line * (0.25 + 0.75 * pulse);
        tint = vec3(0.6, 0.72, 1.0) * 1.4;
        ambient = 0.03;
    `,
};
