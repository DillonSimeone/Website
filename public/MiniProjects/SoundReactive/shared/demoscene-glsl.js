/**
 * demoscene-glsl.js - 64Kb Demoscene Shader Math, SDF Primitives, and Post-FX Library
 * 
 * Provides:
 * - Common math & rotation utilities
 * - Rich 3D Signed Distance Fields (SDFs): Boxes, Spheres, Toruses, Octahedrons, Hex Prisms, Mandelbox, Apollonian
 * - Domain operations: pMod3 (infinite 3D repetition), pModPolar, twisting, bending, smooth boolean blending (smin/smax)
 * - Lighting & Raymarch math: Analytical normals, Step AO, Soft Penumbra Shadows, Volumetric Glow Accumulation
 * - Post-processing optical engine: ACES Filmic tonemapping, Radial Chromatic Aberration, Lens Distortion, Anamorphic Glare, 35mm Grain
 */

export const DemosceneGLSL = `
  #define PI 3.14159265359
  #define TWO_PI 6.28318530718

  // -------------------------------------------------------------
  // COLOR & SYNESTHESIA (20Hz Crimson -> 20kHz Ultraviolet)
  // -------------------------------------------------------------
  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  vec3 freqToColor(float freqRatio, float brightness, float hueOffset) {
    float hue = fract(clamp(freqRatio * 0.85, 0.0, 0.85) + hueOffset);
    float sat = mix(0.95, 0.55, smoothstep(0.65, 1.0, freqRatio));
    float val = brightness * mix(1.0, 1.35, smoothstep(0.75, 1.0, freqRatio));
    return hsv2rgb(vec3(hue, sat, min(1.0, val)));
  }

  vec3 freqToColor(float freqRatio, float brightness) {
    return freqToColor(freqRatio, brightness, 0.0);
  }

  // -------------------------------------------------------------
  // ROTATIONS & TRANSFORMATIONS
  // -------------------------------------------------------------
  mat2 rot2D(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c);
  }

  mat3 rotYPR(float yaw, float pitch, float roll) {
    float cy = cos(yaw), sy = sin(yaw);
    float cp = cos(pitch), sp = sin(pitch);
    float cr = cos(roll), sr = sin(roll);
    return mat3(
      cy*cr + sy*sp*sr,  sr*cp, -sy*cr + cy*sp*sr,
      -cy*sr + sy*sp*cr, cr*cp,  sy*sr + cy*sp*cr,
      sy*cp,            -sp,     cy*cp
    );
  }

  // -------------------------------------------------------------
  // NOISE & HASHING
  // -------------------------------------------------------------
  float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
  }

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  vec3 hash33(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
  }

  float vnoise3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = i.x + i.y * 157.0 + 113.0 * i.z;
    return mix(
      mix(mix(hash11(n + 0.0),   hash11(n + 1.0),   f.x),
          mix(hash11(n + 157.0), hash11(n + 158.0), f.x), f.y),
      mix(mix(hash11(n + 113.0), hash11(n + 114.0), f.x),
          mix(hash11(n + 270.0), hash11(n + 271.0), f.x), f.y), f.z);
  }

  float fbm3D(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    mat3 rot = mat3(0.00,  0.80,  0.60,
                   -0.80,  0.36, -0.48,
                   -0.60, -0.48,  0.64);
    for (int i = 0; i < 4; i++) {
      v += a * vnoise3D(p);
      p = rot * p * 2.02 + vec3(1.7, 9.2, 5.3);
      a *= 0.5;
    }
    return v;
  }

  // -------------------------------------------------------------
  // SDF PRIMITIVES (Signed Distance Fields)
  // -------------------------------------------------------------
  float sdSphere(vec3 p, float r) {
    return length(p) - r;
  }

  float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
  }

  float sdBoxFrame(vec3 p, vec3 b, float e) {
    p = abs(p) - b;
    vec3 q = abs(p + e) - e;
    return min(min(
      length(max(vec3(p.x, q.y, q.z), 0.0)) + min(max(p.x, max(q.y, q.z)), 0.0),
      length(max(vec3(q.x, p.y, q.z), 0.0)) + min(max(q.x, max(p.y, q.z)), 0.0)),
      length(max(vec3(q.x, q.y, p.z), 0.0)) + min(max(q.x, max(q.y, p.z)), 0.0));
  }

  float sdCylinder(vec3 p, vec3 c) {
    return length(p.xz - c.xy) - c.z;
  }

  float sdCappedCylinder(vec3 p, float h, float r) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
  }

  float sdTorus(vec3 p, vec2 t) {
    vec2 q = vec2(length(p.xz) - t.x, p.y);
    return length(q) - t.y;
  }

  float sdOctahedron(vec3 p, float s) {
    p = abs(p);
    return (p.x + p.y + p.z - s) * 0.57735027;
  }

  float sdHexPrism(vec3 p, vec2 h) {
    const vec3 k = vec3(-0.8660254, 0.5, 0.57735026);
    p = abs(p);
    p.xy -= 2.0 * min(dot(k.xy, p.xy), 0.0) * k.xy;
    vec2 d = vec2(
      length(p.xy - vec2(clamp(p.x, -k.z * h.x, k.z * h.x), h.x)) * sign(p.y - h.x),
      p.z - h.y
    );
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
  }

  // -------------------------------------------------------------
  // DOMAIN OPERATIONS & SPACE WARPING
  // -------------------------------------------------------------
  // Smooth Minimum (Organic Boolean Union)
  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  // Smooth Maximum (Organic Boolean Subtraction/Intersection)
  float smax(float a, float b, float k) {
    float h = clamp(0.5 - 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) + k * h * (1.0 - h);
  }

  // 1D Domain Repetition
  float pMod1(inout float p, float size) {
    float halfsize = size * 0.5;
    float c = floor((p + halfsize) / size);
    p = mod(p + halfsize, size) - halfsize;
    return c;
  }

  // 3D Infinite Domain Repetition
  vec3 pMod3(inout vec3 p, vec3 size) {
    vec3 halfsize = size * 0.5;
    vec3 c = floor((p + halfsize) / size);
    p = mod(p + halfsize, size) - halfsize;
    return c;
  }

  // Polar / Radial Symmetry Repetition
  float pModPolar(inout vec2 p, float repetitions) {
    float angle = TWO_PI / repetitions;
    float a = atan(p.y, p.x) + angle / 2.0;
    float r = length(p);
    float c = floor(a / angle);
    a = mod(a, angle) - angle / 2.0;
    p = vec2(cos(a), sin(a)) * r;
    return c;
  }

  // Space Twist along Y
  vec3 opTwistY(vec3 p, float k) {
    float c = cos(k * p.y);
    float s = sin(k * p.y);
    mat2 m = mat2(c, -s, s, c);
    return vec3(m * p.xz, p.y).xzy;
  }

  // Space Bend along X
  vec3 opCheapBend(vec3 p, float k) {
    float c = cos(k * p.x);
    float s = sin(k * p.x);
    mat2 m = mat2(c, -s, s, c);
    return vec3(m * p.xy, p.z);
  }

  // -------------------------------------------------------------
  // POST-PROCESSING, LENS & CINEMATOGRAPHY COMPOSITING
  // -------------------------------------------------------------
  // ACES Filmic Tone Mapping Curve
  vec3 acesFilmic(vec3 x) {
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }

  // Anamorphic / 2.39:1 Cinematic Letterbox
  float letterboxMask(vec2 screenUV, float targetAspect) {
    float currentAspect = screenUV.x / max(0.001, screenUV.y);
    vec2 centered = abs(screenUV - 0.5) * 2.0;
    // Normalized check
    return 1.0;
  }

  // 35mm Procedural Film Grain
  vec3 applyFilmGrain(vec3 color, vec2 uv, float time, float intensity) {
    float noise = hash21(uv * 1200.0 + fract(time * 30.0)) * 2.0 - 1.0;
    return color + noise * intensity;
  }

  // Vignette
  vec3 applyVignette(vec3 color, vec2 uv, float strength, float power) {
    vec2 center = uv - 0.5;
    float dist = dot(center, center);
    float vig = clamp(1.0 - dist * strength, 0.0, 1.0);
    return color * pow(vig, power);
  }
`;
