import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

/*
 * Alpha is not transparency here: it tells the ASCII composite how to draw the pixel.
 *   0.0 shaded, 0.5 ASCII glyphs (light on dark), 1.0 inverted ASCII (ink on paper).
 */
export const MASK = { shaded: 0, ascii: 0.5, ink: 1 };

export function createSharedUniforms(day = 0) {
    return {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uDay: { value: day },
        uTome: { value: new THREE.Vector4(0, -999, 0, 0) },
        uTomeColor: { value: new THREE.Color(1, 0.8, 0.5) },
        /* 1 turns off fog and the dark past the cell edge (editor overview). */
        uClarity: { value: 0 },
    };
}

/* Shared by every labyrinth material: noise, fog, dissolve, lantern and tome light, sky. */
export const COMMON_GLSL = /* glsl */ `
uniform vec3 uCam;
uniform float uTime;
uniform float uDay;
uniform float uFade;
uniform float uClarity;
uniform vec3 uCellCenter;
uniform vec4 uTome;
uniform vec3 uTomeColor;

float hash1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash1(i), hash1(i + vec2(1.0, 0.0)), f.x), mix(hash1(i + vec2(0.0, 1.0)), hash1(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm2(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * noise2(p); p *= 2.07; a *= 0.5; }
    return s;
}

/* Screen-door dissolve for cells fading in out of the dark and back out behind. */
void dissolve() {
    float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (uFade <= n) discard;
}

/* Distance fog to black, plus the dark that swallows side passages past the cell edge. */
float darkness(vec3 p) {
    float d = length(p - uCam);
    float fog = exp(-max(0.0, d - 2.5) * 0.16);
    vec2 off = abs(p.xz - uCellCenter.xz);
    float beyond = 1.0 - smoothstep(1.9, 3.5, max(off.x, off.y));
    return mix(fog * beyond, 1.0, uClarity);
}

vec3 lantern(vec3 p, vec3 n, vec3 tint) {
    vec3 L = uCam + vec3(0.0, 0.2, 0.0) - p;
    float d = length(L);
    float diff = max(dot(n, L / d), 0.0) * 0.75 + 0.25;
    return tint * diff / (1.0 + d * d * 0.07);
}

vec3 tomeLight(vec3 p, vec3 n) {
    vec3 L = uTome.xyz - p;
    float d = length(L);
    return uTomeColor * uTome.w * (max(dot(n, L / d), 0.0) * 0.7 + 0.3) / (1.0 + d * d * 0.9);
}

/* Night: stars and a moon along bodyDir. Day: blue with a burning sun. */
vec3 skyColor(vec3 dir, vec3 bodyDir) {
    float up = clamp(dir.y, -1.0, 1.0);
    vec3 night = mix(vec3(0.01, 0.015, 0.04), vec3(0.03, 0.05, 0.12), smoothstep(-0.2, 0.8, up));
    vec2 g = vec2(atan(dir.z, dir.x), asin(up)) * 55.0;
    vec2 cell = floor(g);
    float h = hash1(cell);
    if (h > 0.965) {
        float star = 1.0 - smoothstep(0.0, 0.3, length(fract(g) - 0.5));
        night += vec3(0.9, 0.95, 1.0) * star * (0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 40.0));
    }
    float b = dot(dir, bodyDir);
    night = mix(night, vec3(0.88, 0.9, 0.95), smoothstep(0.9975, 0.9985, b));
    night += vec3(0.4, 0.5, 0.8) * pow(max(b, 0.0), 60.0) * 0.5;
    vec3 day = mix(vec3(0.75, 0.82, 0.9), vec3(0.25, 0.5, 0.9), smoothstep(0.0, 0.7, up));
    day += vec3(1.0, 0.85, 0.5) * pow(max(b, 0.0), 12.0) * 0.8;
    day = mix(day, vec3(1.6, 1.5, 1.2), smoothstep(0.9965, 0.998, b));
    return mix(night, day, uDay);
}

/* x: distance to nearest feature, y: distance to the cell edge, z: cell id. */
vec3 voronoi(vec2 p) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    float id = 0.0;
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = vec2(hash1(n + g), hash1(n + g + 17.3));
            float d = length(g + o - f);
            if (d < d1) { d2 = d1; d1 = d; id = hash1(n + g + 5.1); }
            else if (d < d2) { d2 = d; }
        }
    }
    return vec3(d1, d2 - d1, id);
}

vec3 hue(float h) {
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

vec2 faceUV(vec3 p, vec3 n) {
    vec3 a = abs(n);
    if (a.y > 0.5) return p.xz;
    if (a.x > 0.5) return p.zy;
    return p.xy;
}
`;

/*
 * Additive glow that leaves the alpha (the ASCII mask) untouched.
 */
export function glowBlending(material) {
    material.transparent = true;
    material.depthWrite = false;
    material.blending = THREE.CustomBlending;
    material.blendEquation = THREE.AddEquation;
    material.blendSrc = THREE.OneFactor;
    material.blendDst = THREE.OneFactor;
    material.blendSrcAlpha = THREE.ZeroFactor;
    material.blendDstAlpha = THREE.OneFactor;
    return material;
}
