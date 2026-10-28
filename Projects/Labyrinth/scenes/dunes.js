/* Rolling dunes under two suns. */
export default {
    name: 'Twin-sun dunes',
    pitch: -0.08,
    glsl: /* glsl */ `
vec3 duneSky(vec3 rd) {
    float up = max(rd.y, 0.0);
    vec3 col = mix(vec3(0.98, 0.7, 0.55), vec3(0.45, 0.35, 0.6), smoothstep(0.0, 0.6, up));
    vec3 sunA = normalize(uOut + vec3(0.35, 0.22, 0.0));
    vec3 sunB = normalize(uOut + vec3(-0.3, 0.12, 0.2));
    float a = max(dot(rd, sunA), 0.0);
    float b = max(dot(rd, sunB), 0.0);
    col += vec3(1.0, 0.8, 0.5) * pow(a, 14.0) * 0.6 + vec3(1.0, 0.5, 0.6) * pow(b, 14.0) * 0.5;
    col = mix(col, vec3(1.8, 1.6, 1.2), smoothstep(0.9986, 0.9991, a));
    col = mix(col, vec3(1.7, 1.0, 1.1), smoothstep(0.9992, 0.9995, b));
    return col;
}
float dune(vec2 p) {
    return sin(p.x * 0.09 + sin(p.y * 0.05) * 2.2) * 2.2 + sin(p.y * 0.13 + p.x * 0.03) * 1.1 + fbm2(p * 0.08) * 2.0;
}
vec3 portalScene(vec3 ro, vec3 rd) {
    if (rd.y > -0.004) return duneSky(rd);
    float t = (ro.y - (uFloor - 7.0)) / -rd.y;
    vec3 hit = ro + rd * t;
    float e = 0.6;
    float h0 = dune(hit.xz);
    vec3 n = normalize(vec3(h0 - dune(hit.xz + vec2(e, 0.0)), e * 1.3, h0 - dune(hit.xz + vec2(0.0, e))));
    vec3 sunA = normalize(uOut + vec3(0.35, 0.22, 0.0));
    vec3 sunB = normalize(uOut + vec3(-0.3, 0.12, 0.2));
    vec3 sand = vec3(0.85, 0.52, 0.3) * (0.25 + 0.75 * max(dot(n, sunA), 0.0)) + vec3(0.5, 0.2, 0.3) * max(dot(n, sunB), 0.0) * 0.6;
    sand *= 0.9 + 0.1 * sin(hit.x * 2.5 + h0 * 4.0);
    return mix(sand, duneSky(vec3(rd.x, 0.0, rd.z)), 1.0 - exp(-t * 0.006));
}
`,
};
