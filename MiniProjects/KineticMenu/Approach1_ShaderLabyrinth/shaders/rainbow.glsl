precision highp float;
varying vec2 vUv;
varying vec3 vWorldPos;

uniform float uTime;
uniform vec2 uResolution;
uniform float uCameraSpeed;
uniform float uScroll;
uniform vec3 uMoodColor;
uniform float uMoodIntensity;
uniform float uFontSize;

// https://iquilezles.org/articles/palettes/
vec3 palette( float t ) {
    vec3 a = vec3(0.5, 0.5, 0.5);
    vec3 b = vec3(0.5, 0.5, 0.5);
    vec3 c = vec3(1.0, 1.0, 1.0);
    vec3 d = vec3(0.263,0.416,0.557);
    return a + b*cos( 6.28318*(c*t+d) );
}

void main() {
    // Map to the interior of the cube
    vec3 p3d = vWorldPos * 0.02; 
    vec3 absPos = abs(p3d);
    vec2 uv;
    
    if (absPos.x > absPos.y && absPos.x > absPos.z) {
        uv = p3d.zy;
    } else if (absPos.y > absPos.x && absPos.y > absPos.z) {
        uv = p3d.xz;
    } else {
        uv = p3d.xy;
    }

    // Parallax hook using uScroll
    uv += vec2(uScroll * 0.005, uScroll * 0.002);
    
    vec2 uv0 = uv;
    vec3 finalColor = vec3(0.0);
    
    // Use uScroll for movement. 
    // We divide by a large number to ensure the fractal doesn't "mud out" too quickly
    float time = uScroll * 0.15;
    float zoom = 1.0 + (uFontSize * 0.3);

    for (float i = 0.0; i < 3.0; i++) { // Reduced iterations to keep colors distinct (prevents mud)
        uv = fract(uv * 1.6 * zoom) - 0.5;

        float d = length(uv) * exp(-length(uv0));

        vec3 col = palette(length(uv0) + i*.4 + time);

        // High frequency pulsing with narrowed dark intervals
        d = sin(d * 12.0 + time);
        d = abs(d * 0.8 + 0.2); // Shift sine up to reduce darkness duration

        // Maintain the delicate glow intensity
        d = pow(0.003 / max(d, 0.0005), 1.1); 

        finalColor += col * d;
    }
    
    // Lower global intensity to prevent saturation drowning
    finalColor *= 0.4;
    finalColor += uMoodColor * uMoodIntensity * 0.1;
        
    gl_FragColor = vec4(finalColor, 1.0);
}