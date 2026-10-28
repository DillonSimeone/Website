import { MASK } from './common.js';

/* Blueprint: navy with a white drafting grid and outlined box edges. */
export default {
    id: 'blueprint',
    name: 'Blueprint',
    mask: MASK.shaded,
    glsl: /* glsl */ `
        albedo = vec3(0.05, 0.12, 0.3);
        vec2 minorG = abs(fract(uv * 4.0) - 0.5);
        vec2 majorG = abs(fract(uv) - 0.5);
        vec2 local = mod(p.xz + CELL * 0.5, CELL);
        float ly = mod(p.y + 0.001, LEVEL);
        float edge = 0.0;
        edge = max(edge, 1.0 - smoothstep(0.0, 0.035, min(abs(local.x - 0.2), abs(local.x - 3.8))));
        edge = max(edge, 1.0 - smoothstep(0.0, 0.035, min(abs(local.y - 0.2), abs(local.y - 3.8))));
        edge = max(edge, 1.0 - smoothstep(0.0, 0.035, min(ly, abs(ly - WALL_H))));
        float grid = max(0.25 * (1.0 - smoothstep(0.0, 0.02, 0.5 - max(minorG.x, minorG.y))), 0.6 * (1.0 - smoothstep(0.0, 0.015, 0.5 - max(majorG.x, majorG.y))));
        emissive = vec3(0.75, 0.88, 1.0) * max(grid, edge * 0.9) * 0.9;
        tint = vec3(0.7, 0.8, 1.0) * 0.6;
        ambient = 0.35;
    `,
};
