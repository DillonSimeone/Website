/* An animated sea far below, with the sun setting straight ahead. */
export default {
    name: 'Ocean at sunset',
    pitch: -0.05,
    glsl: /* glsl */ `
vec3 sunsetSky(vec3 rd) {
    vec3 sun = normalize(uOut + vec3(0.0, 0.045, 0.0));
    float up = rd.y;
    vec3 col = mix(vec3(1.0, 0.5, 0.22), vec3(0.28, 0.22, 0.45), smoothstep(0.0, 0.35, up));
    col = mix(col, vec3(0.04, 0.05, 0.14), smoothstep(0.3, 0.9, up));
    float s = max(dot(rd, sun), 0.0);
    col += vec3(1.0, 0.55, 0.25) * pow(s, 10.0) * 0.7;
    col = mix(col, vec3(1.9, 1.25, 0.7), smoothstep(0.9991, 0.9995, s));
    vec2 cq = rd.xz / (max(up, 0.0) + 0.12);
    float cl = fbm2(cq * 1.2 + vec2(uTime * 0.01, 0.0));
    col = mix(col, vec3(0.95, 0.45, 0.35) * (0.5 + 0.8 * pow(s, 2.0)), smoothstep(0.55, 0.8, cl) * smoothstep(0.01, 0.12, up) * (1.0 - smoothstep(0.4, 0.7, up)) * 0.8);
    return col;
}
vec3 portalScene(vec3 ro, vec3 rd) {
    if (rd.y > -0.003) return sunsetSky(rd);
    float t = (ro.y - (uFloor - 30.0)) / -rd.y;
    vec3 hit = ro + rd * t;
    vec2 q = hit.xz * 0.12 + vec2(uTime * 0.05, uTime * 0.03);
    float e = 0.08;
    float h0 = fbm2(q);
    vec3 n = normalize(vec3((h0 - fbm2(q + vec2(e, 0.0))) * 0.8, e, (h0 - fbm2(q + vec2(0.0, e))) * 0.8));
    vec3 refl = reflect(rd, n);
    refl.y = abs(refl.y);
    float fres = 0.1 + 0.9 * pow(1.0 - max(dot(-rd, n), 0.0), 4.0);
    vec3 water = mix(vec3(0.03, 0.05, 0.1), sunsetSky(refl), fres);
    return mix(water, sunsetSky(vec3(rd.x, 0.0, rd.z)), 1.0 - exp(-t * 0.004));
}
`,
};
