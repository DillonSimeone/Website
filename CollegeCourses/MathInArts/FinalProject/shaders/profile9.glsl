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

vec3 hsv2rgb(in vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec2 uv = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0;
  uv.x *= u_resolution.x / u_resolution.y;
  // Apply pan/zoom
  uv = (uv + u_offset) * u_zoom;

  float ang = u_time * 0.2;
  float ca = cos(ang);
  float sa = sin(ang);
  uv = vec2(ca * uv.x - sa * uv.y, sa * uv.x + ca * uv.y);

  float t = u_time * u_speed;
  float v1 = sin(uv.x * 10.0 + t);
  float v2 = sin(uv.y * 10.0 + t * 1.3);
  float v3 = sin((uv.x + uv.y) * 10.0 + t * 0.7);
  float plasma = (v1 + v2 + v3) * 0.333 + 0.5;

  // Radial ripple modulated by FFT
  float r = length(uv);
  float ripple = sin(r * 20.0 - t * 2.0) * 0.5 + 0.5;
  ripple *= 1.0 + u_fft_low * 2.0;

  float pattern = fract(plasma + ripple * 0.5);

  float hue = fract(pattern + u_fft_high * 0.5 + 0.5 * sin(t * 0.3));
  float sat = 0.7 + 0.3 * sin(pattern * 6.2831 + t);
  float val = pattern;

  vec3 color = hsv2rgb(vec3(hue, sat, val));
  gl_FragColor = vec4(color, 1.0);
}
