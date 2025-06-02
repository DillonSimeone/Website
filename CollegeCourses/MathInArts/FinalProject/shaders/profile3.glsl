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

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float lightning(vec2 uv, float time) {
  float strength = 0.0;
  for (int i = 0; i < 30; i++) {
    float t = float(i) * 0.1 + time * 0.2;
    vec2 seed = vec2(sin(t * 1.5), cos(t * 1.3)) * 0.5;
    vec2 disp = vec2(
      sin(t * 3.7 + uv.y * 20.0),
      cos(t * 4.1 + uv.x * 20.0)
    ) * 0.02;
    vec2 pos = seed + disp;
    float d = length(uv - pos);
    strength += smoothstep(0.09, 0.05, d);
  }
  return clamp(strength, 0.0, 1.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0;
  uv.x *= u_resolution.x / u_resolution.y;
  uv = (uv + u_offset) * u_zoom;

  float t = u_invert ? -u_time : u_time;
  float glow = lightning(uv, t * u_speed);

  vec3 baseColor = vec3(0.2, 0.8, 1.0);
  vec3 color = baseColor * glow * (1.0 + u_fft_low * 0.5 + u_fft_high * 0.7);

  gl_FragColor = vec4(color, 1.0);
}
