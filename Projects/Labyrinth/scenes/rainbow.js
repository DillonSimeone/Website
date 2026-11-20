/* Above a coiling sea of clouds, with a cloud spire and a double rainbow. */
export default {
    name: 'Above the rainbow',
    pitch: -0.12,
    glsl: /* glsl */ `
vec3 portalScene(vec3 ro, vec3 rd) {
    vec3 sun = normalize(-uOut + vec3(0.0, 0.55, 0.0));
    vec3 anti = -sun;
    vec3 col = mix(vec3(0.98, 0.88, 0.78), vec3(0.3, 0.52, 0.95), smoothstep(-0.05, 0.6, rd.y));
    float t = 1e5;
    if (rd.y < 0.0) {
        t = (uFloor - 9.0 - ro.y) / rd.y;
        vec3 p = ro + rd * t;
        vec2 v = p.xz - (ro.xz + uOut.xz * 80.0);
        float r = length(v);
        float a = atan(v.y, v.x) + uTime * 0.04 + r * 0.03;
        vec2 q = vec2(cos(a), sin(a)) * r * 0.05;
        float dens = fbm2(q + fbm2(q * 0.6 + uTime * 0.02) * 1.6);
        vec3 cloud = mix(vec3(0.72, 0.7, 0.82), vec3(1.0, 0.98, 0.95), smoothstep(0.3, 0.8, dens));
        cloud += vec3(1.0, 0.8, 0.6) * pow(dens, 4.0) * 0.4;
        col = mix(cloud, col, 1.0 - exp(-t * 0.005));
    }
    float spire = exp(-pow(abs(dot(rd, sideAxis())) * 9.0, 2.0)) * smoothstep(-0.05, 0.0, rd.y) * (1.0 - smoothstep(0.05, 0.4, rd.y));
    float coil = smoothstep(0.45, 0.8, fbm2(vec2(atan(dot(rd, sideAxis()), 0.2) * 6.0 + rd.y * 20.0 - uTime * 0.3, rd.y * 14.0)));
    col = mix(col, vec3(1.0, 0.97, 0.94), spire * coil * 0.85);
    float deg = degrees(acos(clamp(dot(rd, anti), -1.0, 1.0)));
    float band = (deg - 40.0) / 2.6;
    if (band > 0.0 && band < 1.0) col = mix(col, col + hue(0.78 - band * 0.8) * 0.6, sin(band * 3.14159));
    float band2 = (deg - 50.5) / 3.0;
    if (band2 > 0.0 && band2 < 1.0) col = mix(col, col + hue(band2 * 0.8) * 0.3, sin(band2 * 3.14159));
    return col;
}
`,
};
