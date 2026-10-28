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

// Distance estimator for Mandelbulb
float mandelbulbDE(vec3 p) {
  vec3 z = p;
  float dr = 1.0;
  float r = 0.0;
  const int iterations = 100;
  const float power = 20.0;
  for(int i = 0; i < iterations; i++) {
    r = length(z);
    if(r > 2.0) break;
    float theta = acos(z.z / r);
    float phi = atan(z.y, z.x);
    dr = pow(r, power - 1.0) * power * dr + 1.0;
    float zr = pow(r, power);
    theta *= power;
    phi *= power;
    z = zr * vec3(sin(theta) * cos(phi), sin(phi) * sin(theta), cos(theta));
    z += p;
  }
  return 0.5 * log(r) * r / dr;
}

float rayMarch(vec3 ro, vec3 rd) {
  float totalDist = 0.0;
  for(int i = 0; i < 100; i++) {
    vec3 pos = ro + rd * totalDist;
    float distEst = mandelbulbDE(pos);
    if(distEst < 0.001) return float(i);
    totalDist += distEst;
    if(totalDist > 50.0) break;
  }
  return 100.0;
}

void main() {
  vec2 uv = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0;
  uv.x *= u_resolution.x / u_resolution.y;
  // Camera setup
  vec3 ro = vec3(0.5, 0.0, -3.0);
  vec3 rd = normalize(vec3(uv * u_zoom, 1.0));

  // Always apply slow rotation around the Y-axis
  float angle = u_time * 0.1;
  float ca = cos(angle);
  float sa = sin(angle);
  ro.xz = mat2(ca, -sa, sa, ca) * ro.xz;
  rd.xz = mat2(ca, -sa, sa, ca) * rd.xz;

  float steps = rayMarch(ro + vec3(u_offset.x, u_offset.y, 0.0), rd);
  float t = steps / 100.0;
  
  // FFT‐based hue
  float freqNorm = clamp((u_fft_low + u_fft_high) * 0.5, 0.0, 1.0);
  float hue = freqNorm;
  // brightness by steps
  float brightness = 1.0 - t;
  vec3 color = hsv2rgb(vec3(hue, 1.0, brightness));

  gl_FragColor = vec4(color, 1.0);
}
