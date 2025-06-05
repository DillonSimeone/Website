precision mediump float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_fft_low;
uniform float u_fft_high;
uniform float u_zoom;
uniform float u_speed;
uniform bool u_invert;
uniform bool u_rotate;
uniform vec2 u_offset;

#define PHI 1.61803398875
#define MAX_ITER 25

float fractSmooth(float zmag, float iter) {
  return fract(log2(zmag) * 0.5 + iter);
}

vec3 hsv2rgb(in vec3 c) {
  vec3 p = abs(fract(vec3(c.x, c.x + 2.0/3.0, c.x + 1.0/3.0)) * 6.0 - 3.0);
  vec3 rgb = c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
  return rgb;
}

void main() {
  vec2 uv = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0;
  uv.x *= u_resolution.x / u_resolution.y;

  uv = (uv + u_offset) * u_zoom;

  float t = u_invert ? -u_time : u_time;

  float wave = sin((uv.x + uv.y) * 10.0 + t * u_speed * 0.5) * (u_fft_low * 0.02);

  float phiMod = PHI + u_fft_low * 0.05; // slight PHI tweak by bass
  float spiral = phiMod * t * 0.04 * u_speed;
  vec2 c = u_rotate
    ? vec2(cos(spiral), sin(spiral)) * 0.7
    : vec2(sin(t * 0.1 * u_speed), cos(t * 0.14 * u_speed)) * 0.7;

  vec2 z = uv + vec2(wave);
  float iterCount = 0.0;
  float zmag = 0.0;

  for (int i = 0; i < MAX_ITER; i++) {
    zmag = dot(z, z);
    if (zmag > 4.0) break;
    // z = z^2 + c
    z = vec2(
      z.x * z.x - z.y * z.y + c.x,
      2.0 * z.x * z.y + c.y
    );
    iterCount += 1.0;
  }

  float smoothIter = (iterCount < float(MAX_ITER))
    ? fractSmooth(zmag, iterCount)
    : 0.0;

  float norm = (iterCount + smoothIter) / float(MAX_ITER);


  float bands = abs(fract(norm * 10.0 + u_fft_high * 0.5) - 0.5) * 2.0;
  float contrast = mix(0.8, 2.0, clamp(u_fft_high * 1.5, 0.0, 1.0));
  bands = pow(bands, contrast);

  float hue = fract(norm + u_fft_low * 0.3 + t * 0.02);
  float sat = 0.7 + 0.3 * bands;    // more saturated at edge lines
  float val = 0.5 + 0.5 * bands;    // brighter at edge lines
  vec3 baseColor = hsv2rgb(vec3(hue, sat, val));

  float depth = norm;
  float dx = dFdx(depth);
  float dy = dFdy(depth);
  vec3 normal = normalize(vec3(dx, dy, 0.05));
  vec3 lightDir = normalize(vec3(0.5, 0.6, 1.0));
  float lighting = dot(normal, lightDir) * 0.5 + 0.5;

  vec3 finalColor = baseColor * lighting * (1.0 + u_fft_low * 0.2 + u_fft_high * 0.9);

  gl_FragColor = vec4(finalColor, 1.0);
}
