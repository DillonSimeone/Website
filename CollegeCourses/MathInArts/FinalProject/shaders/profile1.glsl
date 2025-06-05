precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_fft_low;
uniform float u_fft_high;
uniform float u_zoom;
uniform float u_speed;
uniform bool u_invert;
uniform bool u_rotate;
uniform vec2 u_offset;

#define PHI 1.61803398875
#define MAX_ITER 300

void main() {
  vec2 uv = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0;
  uv.x *= u_resolution.x / u_resolution.y;
  uv = (uv + u_offset) * u_zoom;

  float t = u_invert ? -u_time : u_time;

  float phiMod = PHI + u_fft_low * 0.1;
  float spiral = phiMod * t * 0.05 * u_speed;

  vec2 c = u_rotate
    ? vec2(cos(spiral), sin(spiral)) * 0.75
    : vec2(sin(t * 0.08 * u_speed), cos(t * 0.13 * u_speed)) * 0.75;

  float i = 0.0;
  vec2 z = uv;
  for (int n = 0; n < MAX_ITER; n++) {
    if (dot(z, z) > 4.0) break;
    z = vec2(
      z.x * z.x - z.y * z.y + c.x,
      2.0 * z.x * z.y + c.y
    );
    i += 1.0;
  }

  float mag = dot(z, z);
  float sval = i - log2(log2(max(mag, 1e-6))) + u_fft_high * 0.5;

  float phiCoord = fract(sval * phiMod);
  float band = abs(phiCoord - 0.5);

  // Wider, smoother banded transition to reduce flicker
  float edge = smoothstep(0.30, 0.28, band);

  vec3 color1 = vec3(1.0, 0.9, 0.5);
  vec3 color2 = vec3(0.1, 0.0, 0.2);
  vec3 baseColor = mix(color1, color2, edge);

  float brightness = 1.0 + u_fft_low * 0.4 + u_fft_high * 0.8;
  vec3 finalColor = baseColor * brightness;

  gl_FragColor = vec4(finalColor, 1.0);
}
