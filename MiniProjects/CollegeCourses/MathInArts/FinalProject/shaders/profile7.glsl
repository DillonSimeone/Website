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

// Convert HSV to RGB
vec3 hsv2rgb(in vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// Compute signed distance to a circle (center and radius)
float distCircle(vec2 p, vec3 c) {
  return length(p - c.xy) - c.z;
}

// Apollonian gasket distance with animated base circles
float apollonianDist(vec2 p) {
  float t = u_time * 0.2;
  vec3 c1 = vec3(-0.5 + 0.2 * sin(t), 0.0 + 0.2 * cos(t), 0.5 + 0.1 * sin(t * 1.3));
  vec3 c2 = vec3( 0.5 + 0.2 * cos(t * 1.1), 0.0 + 0.2 * sin(t * 1.1), 0.5 + 0.1 * cos(t * 1.3));
  vec3 c3 = vec3( 0.0, 0.8660254 + 0.2 * sin(t * 1.5), 0.5 + 0.1 * sin(t * 1.7));
  float d = 1e5;
  for(int i = 0; i < 50; i++) {
    float d1 = distCircle(p, c1);
    float d2 = distCircle(p, c2);
    float d3 = distCircle(p, c3);
    if(d1 < d2 && d1 < d3) {
      vec2 v = p - c1.xy;
      float m2 = dot(v, v);
      p = c1.xy + (v * (c1.z * c1.z) / m2);
      d = min(d, d1);
    } else if(d2 < d3) {
      vec2 v = p - c2.xy;
      float m2 = dot(v, v);
      p = c2.xy + (v * (c2.z * c2.z) / m2);
      d = min(d, d2);
    } else {
      vec2 v = p - c3.xy;
      float m2 = dot(v, v);
      p = c3.xy + (v * (c3.z * c3.z) / m2);
      d = min(d, d3);
    }
  }
  return d;
}

void main() {
  vec2 uv = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0;
  uv.x *= u_resolution.x / u_resolution.y;
  vec2 p = uv * u_zoom + u_offset;

  // Rotate UV slowly
  float ang = u_time * 0.1;
  float ca = cos(ang);
  float sa = sin(ang);
  p = vec2(ca * p.x - sa * p.y, sa * p.x + ca * p.y);

  float d = apollonianDist(p);
  float intensity = exp(-10.0 * d * d);

  float freqNorm = clamp((u_fft_low + u_fft_high) * 0.5, 0.0, 1.0);
  float hue = fract(freqNorm + u_time * 0.05);
  float val = intensity * (0.5 + 0.5 * u_fft_high);
  vec3 color = hsv2rgb(vec3(hue, intensity, val));

  gl_FragColor = vec4(color, 1.0);
}
