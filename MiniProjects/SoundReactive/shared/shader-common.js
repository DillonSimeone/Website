/**
 * ShaderCommon - Shared GLSL utilities and math helpers
 */

export const CommonGLSL = `
  #define PI 3.14159265359
  #define TWO_PI 6.28318530718

  // Standard HSV to RGB
  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  // Frequency-to-Color Synesthesia Palette (20Hz Crimson Red to 20kHz Violet/White)
  // freqRatio: 0.0 (sub-bass 20Hz) -> 1.0 (air treble 20kHz)
  vec3 freqToColor(float freqRatio, float brightness, float hueOffset) {
    float hue = fract(clamp(freqRatio * 0.85, 0.0, 0.85) + hueOffset);
    float sat = mix(0.95, 0.6, smoothstep(0.7, 1.0, freqRatio));
    float val = brightness * mix(1.0, 1.4, smoothstep(0.8, 1.0, freqRatio));
    return hsv2rgb(vec3(hue, sat, min(1.0, val)));
  }

  vec3 freqToColor(float freqRatio, float brightness) {
    return freqToColor(freqRatio, brightness, 0.0);
  }

  // 2D Rotation Matrix
  mat2 rot2D(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c);
  }

  // Pseudo-random hash
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  // 2D Simplex-like Value Noise
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // 2D FBM (Fractal Brownian Motion)
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = rot2D(0.5);
    for (int i = 0; i < 5; i++) {
      v += a * vnoise(p);
      p = rot * p * 2.0 + vec2(100.0);
      a *= 0.5;
    }
    return v;
  }

  // Raymarching SDF Primitives
  float sdSphere(vec3 p, float r) {
    return length(p) - r;
  }

  float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
  }

  float sdTorus(vec3 p, vec2 t) {
    vec2 q = vec2(length(p.xz) - t.x, p.y);
    return length(q) - t.y;
  }

  // Smooth minimum for organic metaball blending
  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }
`;
