/* A night waterfall, and a tall dark creature with shifting outlines watching you. */
export default {
    name: 'The watcher at the falls',
    pitch: 0.12,
    glsl: /* glsl */ `
float creature(vec2 p, float sway) {
    float d = length((p - vec2(0.0, 5.3)) / vec2(0.5, 0.85)) - 1.0;
    d = min(d * 0.5, sdCapsule(p, vec2(0.0, 2.2), vec2(0.0, 4.5), 0.42));
    d = min(d, sdCapsule(p, vec2(-0.4, 4.2), vec2(-1.2 + sway, 0.7), 0.1));
    d = min(d, sdCapsule(p, vec2(0.4, 4.2), vec2(1.15 - sway, 0.8), 0.1));
    d = min(d, sdCapsule(p, vec2(-0.2, 2.3), vec2(-0.35, 0.0), 0.13));
    d = min(d, sdCapsule(p, vec2(0.2, 2.3), vec2(0.35, 0.0), 0.13));
    d = min(d, sdCapsule(p, vec2(-0.2, 5.9), vec2(-0.55, 7.0), 0.05));
    d = min(d, sdCapsule(p, vec2(0.2, 5.9), vec2(0.6, 6.9), 0.05));
    return d;
}
vec3 portalScene(vec3 ro, vec3 rd) {
    vec3 side = sideAxis();
    float outward = dot(rd, uOut);
    vec3 col = mix(vec3(0.02, 0.05, 0.07), vec3(0.05, 0.12, 0.16), smoothstep(0.0, 0.7, rd.y));
    col += starField(rd, 0.97, 50.0) * 0.6;
    col = mix(col, vec3(0.85, 0.9, 0.85), smoothstep(0.9985, 0.999, dot(rd, normalize(uOut + side * 0.5 + vec3(0.0, 0.8, 0.0)))));
    if (outward <= 0.0) return col;
    float tc = 16.0 / outward;
    vec3 pc = ro + rd * tc;
    float u = dot(pc - ro, side);
    float v = pc.y - uFloor;
    if (v < 14.0 + fbm2(vec2(u * 0.3, 0.0)) * 3.0) {
        float rock = fbm2(vec2(u, v) * 0.6);
        col = vec3(0.05, 0.07, 0.07) * (0.5 + rock);
        float fallEdge = 2.2 + (noise2(vec2(v * 0.4, uTime * 0.5)) - 0.5) * 0.6;
        if (abs(u) < fallEdge) {
            float streak = noise2(vec2(u * 5.0, v * 0.5 + uTime * 5.0)) * 0.6 + noise2(vec2(u * 11.0, v * 0.3 + uTime * 7.0)) * 0.4;
            col = mix(col, vec3(0.65, 0.8, 0.85), smoothstep(0.3, 0.75, streak) * smoothstep(fallEdge, fallEdge - 0.5, abs(u)));
        }
        float mist = smoothstep(2.5, -1.0, v) * fbm2(vec2(u * 0.4 + uTime * 0.1, v * 0.6 - uTime * 0.2));
        col += vec3(0.5, 0.65, 0.7) * mist * 0.8;
        col = mix(col, vec3(0.03, 0.06, 0.08), 1.0 - exp(-tc * 0.03));
    }
    float tw = 9.0 / outward;
    vec3 pw = ro + rd * tw;
    vec2 cp = vec2(dot(pw - ro, side) - 3.2, pw.y - (uFloor - 1.2));
    float sway = sin(uTime * 0.6) * 0.15;
    cp.x += sin(cp.y * 0.8 + uTime * 0.9) * 0.05 * cp.y / 6.0;
    float d = creature(cp, sway);
    if (d < 0.0) col = vec3(0.005, 0.005, 0.01);
    for (int k = 0; k < 4; k++) {
        float fk = float(k);
        float ring = 0.07 + fk * 0.17 + 0.04 * sin(uTime * 1.7 + fk * 2.0);
        float line = smoothstep(0.035, 0.0, abs(d - ring));
        col += hue(fract(uTime * 0.07 + fk * 0.23 + cp.y * 0.05)) * line * (0.9 / (1.0 + fk)) * (0.6 + 0.4 * sin(uTime * 5.0 + fk * 3.0 + cp.y * 2.0));
    }
    vec3 eyeWorld = ro + uOut * 9.0 + side * 3.2 + vec3(0.0, uFloor - 1.2 + 5.35 - ro.y, 0.0);
    vec2 toViewer = normalize(vec2(dot(ro - eyeWorld, side), ro.y - eyeWorld.y) + vec2(0.0001));
    for (int e = 0; e < 2; e++) {
        vec2 eye = vec2(e == 0 ? -0.2 : 0.2, 5.35);
        float blink = step(0.06, fract(uTime * 0.13));
        float white = smoothstep(0.1, 0.06, length((cp - eye) / vec2(1.0, blink + 0.05)));
        float pupil = smoothstep(0.045, 0.02, length(cp - eye - toViewer * 0.04));
        col = mix(col, vec3(0.95, 0.9, 0.55) * 1.4, white);
        col = mix(col, vec3(0.0), pupil * white);
    }
    return col;
}
`,
};
