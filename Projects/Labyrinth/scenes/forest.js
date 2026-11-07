/* A golden forest: raymarched trunks, leaf-strewn ground, light shafts, falling leaves. */
export default {
    name: 'Golden forest',
    pitch: 0.02,
    glsl: /* glsl */ `
float trunkDist(vec3 p) {
    vec2 cell = floor(p.xz / 3.4);
    vec2 local = mod(p.xz, 3.4) - 1.7;
    vec2 jitter = (vec2(hash1(cell), hash1(cell + 7.1)) - 0.5) * 1.8;
    float r = 0.2 + hash1(cell + 3.3) * 0.3;
    return length(local - jitter) - r * (1.0 + 0.25 * smoothstep(0.8, 0.0, p.y - uFloor + 0.3));
}
vec3 portalScene(vec3 ro, vec3 rd) {
    vec3 side = sideAxis();
    float ground = uFloor - 0.3;
    vec3 sun = normalize(uOut * 0.5 + side * 0.4 + vec3(0.0, 0.5, 0.0));
    vec3 haze = vec3(1.0, 0.7, 0.3);
    float tGround = rd.y < 0.0 ? (ground - ro.y) / rd.y : 1e5;
    float t = 0.2;
    float shafts = 0.0;
    int hitKind = 0;
    for (int i = 0; i < 64; i++) {
        vec3 p = ro + rd * t;
        if (t > tGround) { hitKind = 1; break; }
        if (t > 55.0 || p.y > ground + 16.0) break;
        float d = trunkDist(p);
        if (dot(p - ro, uOut) < 4.0) d = max(d, 0.35);
        if (d < 0.01) { hitKind = 2; break; }
        shafts += smoothstep(0.6, 1.0, sin(dot(p, side) * 0.9 + p.y * 0.5 + uTime * 0.15)) * 0.012;
        t += max(d * 0.9, 0.06);
    }
    vec3 col;
    if (hitKind == 1) {
        vec3 p = ro + rd * tGround;
        float leaves = fbm2(p.xz * 1.4);
        float dapple = smoothstep(0.35, 0.7, fbm2(p.xz * 0.35 + uTime * 0.03));
        col = mix(vec3(0.55, 0.25, 0.05), vec3(1.0, 0.65, 0.15), leaves) * (0.35 + 0.9 * dapple);
        t = tGround;
    } else if (hitKind == 2) {
        vec3 p = ro + rd * t;
        vec2 e = vec2(0.02, 0.0);
        vec3 n = normalize(vec3(trunkDist(p + e.xyy) - trunkDist(p - e.xyy), 0.0, trunkDist(p + e.yyx) - trunkDist(p - e.yyx)));
        float bark = 0.7 + 0.3 * noise2(vec2(atan(n.z, n.x) * 6.0, p.y * 5.0));
        col = vec3(0.16, 0.09, 0.05) * bark * (0.35 + 0.9 * max(dot(n, sun), 0.0)) + vec3(1.0, 0.7, 0.3) * pow(1.0 - abs(dot(n, -rd)), 3.0) * 0.4;
    } else {
        float canopy = smoothstep(0.35, 0.65, fbm2(rd.xz / (rd.y + 0.25) * 2.0 + uTime * 0.01));
        col = mix(haze * 1.1, vec3(0.8, 0.45, 0.08), canopy * smoothstep(0.05, 0.4, rd.y));
        col += vec3(1.0, 0.9, 0.6) * pow(max(dot(rd, sun), 0.0), 30.0);
    }
    col = mix(col, haze, 1.0 - exp(-t * 0.05));
    col += haze * shafts;
    vec2 fall = vec2(dot(rd, side), rd.y) * 22.0 + vec2(sin(uTime * 0.3) * 2.0, uTime * 1.5);
    float leaf = step(0.985, hash1(floor(fall))) * (1.0 - smoothstep(0.1, 0.35, length(fract(fall) - 0.5)));
    col += vec3(1.0, 0.6, 0.15) * leaf * 0.8;
    return col;
}
`,
};
