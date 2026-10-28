/* A star going nova on an 18-second cycle: swelling, a flash, an expanding shell, a remnant. */
export default {
    name: 'A star going nova',
    pitch: 0.06,
    glsl: /* glsl */ `
vec3 portalScene(vec3 ro, vec3 rd) {
    vec3 starDir = normalize(uOut + vec3(0.0, 0.12, 0.0));
    vec3 a = normalize(cross(starDir, vec3(0.0, 1.0, 0.0)));
    vec3 b = cross(a, starDir);
    vec3 col = starField(rd, 0.95, 60.0);
    float neb = fbm2(vec2(atan(rd.z, rd.x), rd.y) * 3.0 + 11.0);
    col += mix(vec3(0.15, 0.03, 0.25), vec3(0.02, 0.12, 0.3), neb) * smoothstep(0.4, 0.8, neb);
    float cycle = mod(uTime + 6.0, 18.0);
    float ang = acos(clamp(dot(rd, starDir), -1.0, 1.0));
    float phi = atan(dot(rd, b), dot(rd, a));
    if (cycle < 10.0) {
        float swell = 0.01 + cycle * 0.0016 + 0.002 * sin(uTime * 4.0) * (cycle / 10.0);
        float core = smoothstep(swell, swell * 0.7, ang);
        col += mix(vec3(1.0, 0.85, 0.6), vec3(1.0, 0.4, 0.2), cycle / 10.0) * core * 2.0;
        float corona = exp(-ang * (60.0 - cycle * 3.0)) * (0.5 + 0.2 * fbm2(vec2(phi * 3.0, uTime)));
        col += vec3(1.0, 0.55, 0.25) * corona;
    } else {
        float age = cycle - 10.0;
        float flash = exp(-age * 2.2);
        col += vec3(1.0, 0.95, 0.9) * flash * (0.6 + exp(-ang * 6.0) * 4.0);
        float radius = age * 0.055;
        float width = 0.012 + radius * 0.2;
        float shell = exp(-pow((ang - radius) / width, 2.0));
        float fil = fbm2(vec2(phi * 4.0, ang * 30.0 - age));
        vec3 shellCol = mix(vec3(1.0, 0.35, 0.25), vec3(0.3, 0.6, 1.0), fil);
        col += shellCol * shell * (1.0 - age / 8.0) * 1.8 * (0.5 + fil);
        col += vec3(0.6, 0.8, 1.0) * smoothstep(0.004, 0.002, ang) * 2.0;
    }
    return col;
}
`,
};
