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

float gridLines(vec2 uv, float spacing, float thickness) {
  vec2 grid = abs(fract(uv / spacing - 0.5) - 0.5) / fwidth(uv);
  float line = min(grid.x, grid.y);
  return 1.0 - smoothstep(thickness - 1.0, thickness + 6.0, line);
}

void main() {
  vec2 uv = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0;
  uv.x *= u_resolution.x / u_resolution.y;
  uv = (uv + u_offset) * u_zoom;

  float t = u_invert ? -u_time : u_time;

  // Add grid pattern with sharp lines
  float spacing = 0.1 + 0.5 * sin(t * u_speed);
  float lines = gridLines(uv * 5.0, spacing, 0.02);

  // Create angular pulse using FFT
  float pulse = sin(dot(uv, vec2(5.0, 5.0)) + t * u_speed);
  float sharpMask = step(0.9, abs(pulse)) * lines;

  vec3 color = mix(vec3(0.05), vec3(1.0, 0.1, 0.6), sharpMask);
  color *= 1.0 + u_fft_low * 0.1 + u_fft_high * 0.7;

  gl_FragColor = vec4(color, 1.0);
}
