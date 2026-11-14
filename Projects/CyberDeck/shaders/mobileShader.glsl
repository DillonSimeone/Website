precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uVoltage;
uniform float uSourceType; // 0: Solar, 1: Wind, 2: Grid
uniform vec2 uResolution;

// ── Lightweight Noise ──
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(in vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    p.x *= uResolution.x / uResolution.y;
    float t = uTime * 0.5;

    vec3 finalColor = vec3(0.0);

    // Optimized Solar
    float solarWeight = 1.0 - smoothstep(0.0, 1.0, uSourceType);
    if (solarWeight > 0.01) {
        float d = length(p - vec2(0.8, 0.5));
        float g = 0.1 / (d + 0.1);
        vec3 solar = vec3(1.0, 0.6, 0.1) * g;
        solar += vec3(1.0, 0.3, 0.0) * noise(p * 2.0 + t) * 0.2;
        finalColor += solar * solarWeight;
    }

    // Optimized Wind
    float windWeight = 1.0 - abs(uSourceType - 1.0);
    windWeight = clamp(windWeight, 0.0, 1.0);
    if (windWeight > 0.01) {
        float f = noise(p * 1.5 + vec2(t, t * 0.5));
        vec3 wind = mix(vec3(0.2, 0.8, 0.7), vec3(0.1, 0.4, 0.6), f);
        finalColor += wind * windWeight;
    }

    // Optimized Grid
    float gridWeight = smoothstep(1.0, 2.0, uSourceType);
    if (gridWeight > 0.01) {
        float beam = abs(p.y - sin(p.x * 3.0 + t * 5.0) * 0.2);
        vec3 grid = vec3(0.2, 0.4, 1.0) * (0.05 / (beam + 0.05));
        finalColor += grid * gridWeight;
    }

    finalColor *= (0.7 + uVoltage * 0.3);
    gl_FragColor = vec4(finalColor, 1.0);
}
