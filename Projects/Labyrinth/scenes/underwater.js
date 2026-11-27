/* Beneath the sea: caustic sand, the rippling surface overhead, swimming fish, bubbles. */
export default {
    name: 'Beneath the sea',
    pitch: -0.05,
    glsl: /* glsl */ `
float hitEllipsoid(vec3 ro, vec3 rd, vec3 c, vec3 fx, vec3 fy, vec3 fz, vec3 r, out vec3 local) {
    vec3 o = ro - c;
    vec3 lo = vec3(dot(o, fx), dot(o, fy), dot(o, fz)) / r;
    vec3 ld = vec3(dot(rd, fx), dot(rd, fy), dot(rd, fz)) / r;
    float a = dot(ld, ld);
    float b = dot(lo, ld);
    float cc = dot(lo, lo) - 1.0;
    float disc = b * b - a * cc;
    local = vec3(0.0);
    if (disc < 0.0) return -1.0;
    float t = (-b - sqrt(disc)) / a;
    local = lo + ld * t;
    return t;
}
vec3 portalScene(vec3 ro, vec3 rd) {
    vec3 side = sideAxis();
    vec3 deep = vec3(0.0, 0.07, 0.15);
    vec3 shallow = vec3(0.05, 0.42, 0.52);
    vec3 col = mix(deep, shallow, smoothstep(-0.6, 0.9, rd.y));
    float tMax = 90.0;
    float floorY = uFloor - 3.5;
    if (rd.y < 0.0) {
        float tg = (floorY - ro.y) / rd.y;
        vec3 p = ro + rd * tg;
        vec2 q = p.xz * 0.9;
        float caustic = pow(abs(sin(q.x + sin(q.y * 1.3 + uTime) + uTime * 0.7) * sin(q.y + sin(q.x * 1.1 - uTime * 0.8))), 0.5);
        vec3 sand = vec3(0.72, 0.64, 0.45) * (0.3 + 0.9 * caustic) * (0.8 + 0.3 * noise2(p.xz * 3.0));
        float weed = step(0.97, hash1(floor(p.xz * 0.8)));
        sand = mix(sand, vec3(0.1, 0.4, 0.15), weed * 0.7);
        col = mix(sand, col, 1.0 - exp(-tg * 0.06));
        tMax = tg;
    } else {
        float ts = (uFloor + 14.0 - ro.y) / rd.y;
        vec3 p = ro + rd * ts;
        float ripple = fbm2(p.xz * 0.3 + uTime * 0.1);
        col += vec3(0.6, 0.9, 1.0) * pow(ripple, 3.0) * exp(-ts * 0.03) * 1.5;
        col += vec3(0.8, 1.0, 1.0) * pow(max(rd.y, 0.0), 12.0) * 0.8;
    }
    col += shallow * 0.35 * pow(max(0.5 + 0.5 * sin(dot(rd.xz, vec2(11.0, 6.0)) + uTime * 0.25), 0.0), 8.0) * smoothstep(-0.3, 0.7, rd.y);
    for (int i = 0; i < 12; i++) {
        float fi = float(i);
        float speed = 0.18 + hash1(vec2(fi, 1.0)) * 0.25;
        float lane = 4.0 + hash1(vec2(fi, 2.0)) * 14.0;
        float phase = uTime * speed + fi * 1.7;
        float height = hash1(vec2(fi, 3.0)) * 5.0 - 2.5;
        vec3 c = ro + uOut * (lane + cos(phase) * 2.0) + side * sin(phase) * 9.0 + vec3(0.0, height + sin(phase * 1.3 + fi) * 1.2, 0.0);
        vec3 fx = normalize(side * cos(phase) * 9.0 - uOut * sin(phase) * 2.0 + vec3(0.0, cos(phase * 1.3 + fi) * 1.5, 0.0));
        vec3 fy = normalize(vec3(0.0, 1.0, 0.0) - fx * fx.y);
        vec3 fz = cross(fx, fy);
        float size = 0.35 + hash1(vec2(fi, 4.0)) * 0.4;
        vec3 local;
        float th = hitEllipsoid(ro, rd, c, fx, fy, fz, vec3(size, size * 0.38, size * 0.17), local);
        vec3 tailLocal;
        vec3 tailC = c - fx * size * 1.05 + fz * sin(uTime * 7.0 + fi) * size * 0.15;
        float tt = hitEllipsoid(ro, rd, tailC, fx, fy, fz, vec3(size * 0.32, size * 0.42, size * 0.04), tailLocal);
        vec3 bodyCol = mix(vec3(1.0, 0.45, 0.1), vec3(0.2, 0.55, 1.0), step(0.5, hash1(vec2(fi, 5.0))));
        if (th > 0.0 && th < tMax) {
            float stripe = step(0.55, fract(local.x * 2.2 + 0.3));
            vec3 fish = mix(bodyCol, vec3(0.95), stripe) * (0.35 + 0.65 * (local.y * 0.5 + 0.5));
            if (local.x > 0.6 && abs(local.z) > 0.3 && abs(local.y - 0.2) < 0.2) fish = vec3(0.02);
            col = mix(fish, deep, 1.0 - exp(-th * 0.07));
            tMax = th;
        } else if (tt > 0.0 && tt < tMax) {
            col = mix(bodyCol * 0.7, deep, 1.0 - exp(-tt * 0.07));
            tMax = tt;
        }
    }
    vec2 bub = vec2(dot(rd, side) * 30.0, rd.y * 30.0 - uTime * 2.0);
    float bubble = step(0.992, hash1(floor(bub))) * smoothstep(0.35, 0.25, length(fract(bub) - 0.5)) * smoothstep(0.1, 0.2, length(fract(bub) - 0.5));
    return col + vec3(0.7, 0.9, 1.0) * bubble * 0.7;
}
`,
};
