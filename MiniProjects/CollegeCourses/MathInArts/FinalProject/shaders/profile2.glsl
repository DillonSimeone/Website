precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_fft_low;
uniform float u_fft_high;
uniform float u_zoom;
uniform float u_speed;
uniform bool u_invert;
uniform vec2 u_offset;

void main() {
  vec2 uv = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0;
  uv.x *= u_resolution.x / u_resolution.y;

  float t = u_invert ? -u_time : u_time;
  float zoom = u_zoom * (1.0 + 0.5 * sin(t * 0.1 * u_speed + u_fft_low * 5.0));

  vec2 c = (uv + u_offset) * zoom;
  vec2 z = vec2(0.0);

  float i = 0.0;
  for (int n = 0; n < 500; n++) {
    if (dot(z, z) > 4.0) break;
    z = vec2(
      z.x * z.x - z.y * z.y + c.x,
      2.0 * z.x * z.y + c.y
    );
    i += 1.0;
  }

  float mag = dot(z, z);
  float sval = i - log2(log2(mag + 1.00001));
  float band = sin(sval * 2.5 + t * 0.1);

  vec3 color = vec3(
    0.5 + 0.5 * sin(band * 10.0 + 0.0),
    0.5 + 0.5 * sin(band * 10.0 + 2.0),
    0.5 + 0.5 * sin(band * 10.0 + 4.0)
  );

  color *= 1.0 + u_fft_low * 0.5 + u_fft_high * 0.5;

  gl_FragColor = vec4(color, 1.0);
}
