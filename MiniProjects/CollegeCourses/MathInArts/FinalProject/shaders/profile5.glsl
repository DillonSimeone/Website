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

// Draw sharp grid lines at a given spacing and thickness
float gridLines(vec2 uv, float spacing, float thickness) {
  vec2 grid = abs(fract(uv / spacing - 0.5) - 0.5) / fwidth(uv);
  float line = min(grid.x, grid.y);
  return 1.0 - smoothstep(thickness - 1.0, thickness + 6.0, line);
}

void main() {
  // Normalize to –1..1 and preserve aspect ratio
  vec2 uv = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0;
  uv.x *= u_resolution.x / u_resolution.y;
  uv = (uv + u_offset) * u_zoom;

  // Base time (invert if needed)
  float t = u_invert ? -u_time : u_time;

  // Create a speed factor that increases with high‐frequency FFT
  float speedFactor = u_speed + u_fft_high * 5.0;

  // Make grid spacing oscillate faster when audio is loud in highs
  float dynamicSpacing = 0.1 + 0.5 * sin(t * speedFactor);

  // Also let low‐frequency FFT push the grid density (finer grid when bass is strong)
  float gridScale = 5.0 + u_fft_low * 20.0;

  // Draw the grid lines
  float lines = gridLines(uv * gridScale, dynamicSpacing, 0.02);

  // Create an angular pulse whose frequency is driven by speedFactor
  float pulse = sin(dot(uv * gridScale, vec2(5.0, 5.0)) + t * speedFactor);

  // Build a sharp mask where pulse is near ±1 and grid lines intersect
  float sharpMask = step(0.9, abs(pulse)) * lines;

  // Base color: dark gray→pink
  vec3 base = vec3(0.05);
  vec3 highlight = vec3(1.0, 0.1, 0.6);

  // Mix according to the mask
  vec3 color = mix(base, highlight, sharpMask);

  // Finally, amplify brightness by FFT:
  // low frequencies give a subtle glow, highs give a flashy surge
  color *= 1.0 + u_fft_low * 0.2 + u_fft_high * 1.0;

  gl_FragColor = vec4(color, 1.0);
}
