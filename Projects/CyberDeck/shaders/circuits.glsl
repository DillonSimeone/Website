precision highp float;
varying vec2 vUv;

uniform float uTime;
uniform vec2 uResolution;
uniform float uCameraSpeed;
uniform float uScroll;
uniform vec3 uMoodColor;
uniform float uMoodIntensity;
uniform float uFontSize;

#define time uTime * .02
#define width .005
// uFontSize will act as the zoom parameter here


float shape = 0.;
vec3 color = vec3(0.);

void formula(vec2 z, float c) {
    float minit = 0.;
    float o, ot2, ot = 1000.0;
    ot2 = 1000.0;
    for (int i = 0; i < 9; i++) {
        z = abs(z) / clamp(dot(z, z), .1, .5) - c;
        float l = length(z);
        o = min(max(abs(min(z.x, z.y)), -l + .25), abs(l - .25));
        ot = min(ot, o);
        ot2 = min(l * .1, ot2);
        minit = max(minit, float(i) * (1. - abs(sign(ot - o))));
    }
    minit += 1.;
    float w = width * minit * 2.;
    float circ = pow(max(0., w - ot2) / w, 6.);
    shape += max(pow(max(0., w - ot) / w, .25), circ);
    
    // Procedural color instead of texture
    vec3 col = normalize(vec3(sin(minit * 0.1), cos(minit * 0.2), sin(minit * 0.3)) * 0.5 + 0.5);
    color += col * (.4 + mod(minit / 9. - time * 10. + ot2 * 2., 1.) * 1.6);
    color += vec3(1., .7, .3) * circ * (10. - minit) * 0.5;
}

void main() {
    vec2 pos = vUv - 0.5;
    pos.x *= uResolution.x / uResolution.y;
    vec2 uv = pos;
    
    float sph = length(uv); 
    sph = sqrt(max(0.0, 1. - sph * sph)) * 1.5; 
    
    // Rotate the 3D ray instead of translating 2D UVs to prevent drift breakdown
    vec3 ray = normalize(vec3(uv, sph));
    float rs = uScroll * 0.1;
    mat2 rotY = mat2(cos(rs), sin(rs), -sin(rs), cos(rs));
    ray.xz *= rotY;
    mat2 rotX = mat2(cos(rs*0.5), sin(rs*0.5), -sin(rs*0.5), cos(rs*0.5));
    ray.yz *= rotX;
    
    uv = ray.xy;
    uv *= uFontSize;
    
    float pix = .5 / uResolution.x * uFontSize / max(0.1, sph);
    float c = 1.5; // Constant complexity instead of time-pulsing
    
    for (int aa = 0; aa < 16; aa++) { // Reduced samples for performance
        vec2 aauv = vec2(float(aa / 4), mod(float(aa), 4.0)) / 4.0;
        formula(uv + aauv * pix, c);
    }
    
    shape /= 16.; 
    color /= 16.;
    
    vec3 colo = mix(vec3(0.02), color, shape) * (1. - length(pos));
    colo += uMoodColor * uMoodIntensity * 0.2; // Integrate mood
    
    colo *= vec3(1.2, 1.1, 1.0);
    gl_FragColor = vec4(colo, 1.0);
}
