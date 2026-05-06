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
  float zoom = u_zoom * 1.5;
  vec2 coord = vec2(
    uv.x * zoom + u_offset.x,
    uv.y * zoom + u_offset.y
  );
  
  vec2 z = vec2(0.0);
  const int maxIter = 300;
  float iterCount = 0.0;
  for (int n = 0; n < maxIter; n++) {
    z = vec2(abs(z.x), abs(z.y));
    vec2 z2 = vec2(
      z.x*z.x - z.y*z.y + coord.x,
      2.0*z.x*z.y + coord.y
    );
    z = z2;
    if (dot(z, z) > 4.0) break;
    iterCount += 1.0;
  }

  // Smooth coloring
  float mag = dot(z, z);
  float smoothedIter = iterCount + 1.0 - log(log(mag)) / log(2.0);
  float norm = smoothedIter / float(maxIter);
  norm = pow(norm, 0.6);

  // Map combined FFT to hue between red and purple
  float freqNorm = clamp((u_fft_low + u_fft_high) * 0.5, 0.0, 1.0);
  float hue = freqNorm; // 0 = red, 1 = purple

  // Color by HSV: hue from FFT, saturation = 1, value = norm
  vec3 color = hsv2rgb(vec3(hue, 1.0, norm));

  gl_FragColor = vec4(color, 1.0);
}
