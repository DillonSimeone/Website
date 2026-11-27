/*
 * Shared by every scene. A scene defines vec3 portalScene(vec3 ro, vec3 rd): ro is the camera,
 * rd the camera ray through the window pixel. Uniforms: uOut (horizontal direction out of the
 * window) and uFloor (the room's floor height). Helpers also come from COMMON_GLSL.
 */
export const FRAME = /* glsl */ `
uniform vec3 uOut;
uniform float uFloor;
vec3 sideAxis() { return normalize(cross(vec3(0.0, 1.0, 0.0), uOut)); }
float sdCapsule(vec2 p, vec2 a, vec2 b, float r) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - r;
}
vec3 starField(vec3 rd, float density, float scale) {
    vec2 g = vec2(atan(rd.z, rd.x), asin(clamp(rd.y, -1.0, 1.0))) * scale;
    vec2 cell = floor(g);
    float h = hash1(cell);
    if (h < density) return vec3(0.0);
    float star = 1.0 - smoothstep(0.0, 0.35, length(fract(g) - 0.5));
    return vec3(0.85, 0.9, 1.0) * star * (0.5 + 0.5 * sin(uTime * (0.6 + h * 3.0) + h * 30.0));
}
`;
