import { MASK } from './common.js';

/* Mossy ruins: big weathered blocks, moss creeping up from the floor. */
export default {
    id: 'ruins',
    name: 'Mossy ruins',
    mask: MASK.shaded,
    glsl: /* glsl */ `
        float row = floor(uv.y / 0.55);
        vec2 block = vec2(fract((uv.x + mod(row, 2.0) * 0.5) / 1.1), fract(uv.y / 0.55));
        float joint = clamp(step(block.x, 0.03) + step(block.y, 0.05), 0.0, 1.0);
        vec3 stone = vec3(0.45, 0.45, 0.42) * (0.7 + 0.35 * hash1(vec2(floor((uv.x + mod(row, 2.0) * 0.5) / 1.1), row))) * (0.8 + 0.3 * fbm2(uv * 4.0));
        float ly = mod(p.y, LEVEL);
        float moss = smoothstep(0.35, 0.75, fbm2(uv * 2.5) + (isFloor ? 0.25 : 0.0) + (1.0 - smoothstep(0.0, 1.4, ly)) * 0.35);
        albedo = mix(mix(stone, vec3(0.18, 0.17, 0.15), joint), vec3(0.16, 0.32, 0.08) * (0.7 + 0.5 * noise2(uv * 30.0)), moss);
        tint = vec3(1.0, 0.92, 0.75) * 1.4;
        ambient = 0.07;
    `,
};
