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

void main() {
  vec2 uv = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0;
  uv.x *= u_resolution.x / u_resolution.y;

  float t = u_invert ? -u_time : u_time;

  vec2 z = (uv + u_offset) * u_zoom;

  vec2 c = u_rotate
    ? vec2(cos(t * u_speed), sin(t * u_speed)) * 0.7
    : vec2(sin(t * 0.1 * u_speed), cos(t * 0.15 * u_speed)) * 0.7;

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
  float norm = sval / 500.0;
  float bands = abs(fract(norm * 12.0) - 0.5) * 2.0;  

  float contrast = mix(0.6, 1.8, u_fft_high);  
  bands = pow(bands, contrast);

  float depth = pow(norm, 0.6);
  vec3 normal = normalize(vec3(dFdx(depth), dFdy(depth), 0.02));
  vec3 lightDir = normalize(vec3(0.5, 0.8, 1.0));
  float lighting = dot(normal, lightDir) * 0.5 + 0.5;

  vec3 baseColor = vec3(
    0.3 + 0.7 * sin(depth * 16.0 + 0.0),
    0.3 + 0.7 * sin(depth * 16.0 + 2.0),
    0.3 + 0.7 * sin(depth * 16.0 + 4.0)
  );

  vec3 color = baseColor * bands * (lighting * (1.0 + u_fft_low * 0.3));

  gl_FragColor = vec4(color, 1.0);
}
