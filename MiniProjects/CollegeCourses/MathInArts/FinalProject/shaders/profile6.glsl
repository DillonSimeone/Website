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

float blockPattern(vec2 uv, float spacing) {
  vec2 cell = floor(uv / spacing);
  vec2 local = fract(uv / spacing);
  float edge = step(0.05, min(min(local.x, local.y), min(1.0 - local.x, 1.0 - local.y)));
  return edge;
}

void main() {
  vec2 uv = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0;
  uv.x *= u_resolution.x / u_resolution.y;
  uv = (uv + u_offset) * u_zoom * 5.0;

  float t = u_invert ? -u_time : u_time;
  float spacing = 0.2 + 0.02 * sin(t * u_speed);

  float pattern = blockPattern(uv, spacing);

  vec3 baseColor = vec3(0.15, 0.15, 0.15);
  vec3 edgeColor = vec3(1.0, 1.0, 0.9);
  vec3 color = mix(baseColor, edgeColor, pattern);

  color *= 1.0 + u_fft_low * 0.4 + u_fft_high * 0.6;

  gl_FragColor = vec4(color, 1.0);
}
    