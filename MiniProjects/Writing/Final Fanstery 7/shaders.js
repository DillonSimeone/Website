/* ==========================================================================
   GLSL SHADERS FOR MATERIA VISUALIZATION
   ========================================================================== */

// 1. Shaders: Background swirl (Mako energy flow)
export const BackgroundVertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
    }
`;

export const BackgroundFragmentShader = `
    uniform float uTime;
    uniform float uTheme; // 0.0: Green, 1.0: Blue, 2.0: Red, 3.0: Yellow
    varying vec2 vUv;

    // Fast pseudo-random noise
    float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    // Simple value noise
    float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
                   mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
    }

    // Fractal Brownian Motion
    float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < 4; i++) {
            value += amplitude * noise(p);
            p *= 2.0;
            amplitude *= 0.5;
        }
        return value;
    }

    void main() {
        vec2 p = vUv - 0.5;
        
        // Calculate length and angles
        float r = length(p);
        float theta = atan(p.y, p.x);
        
        // Use periodic inputs to avoid atan jump seam (discontinuity going left from center)
        float angleNoise = sin(theta * 2.0 - uTime * 0.5) * 0.2 + cos(theta - uTime * 0.3) * 0.15;
        vec2 flowUv = vec2(r * 3.0 - uTime * 0.05, angleNoise + r * 1.5);
        float n = fbm(flowUv * 6.0);
        
        // Refine flow logic
        float intensity = smoothstep(0.1, 0.7, n) * (1.0 - r * 1.3);
        
        // Color palettes corresponding to Sephiroth's Materia types:
        // Theme 0: Green (Mako/Life)
        vec3 colGreen = mix(vec3(0.01, 0.03, 0.06), vec3(0.1, 0.45, 0.28), intensity);
        // Theme 1: Blue (Magic/Aether)
        vec3 colBlue = mix(vec3(0.01, 0.02, 0.07), vec3(0.15, 0.35, 0.75), intensity);
        // Theme 2: Red (Summon/Core)
        vec3 colRed = mix(vec3(0.04, 0.01, 0.03), vec3(0.7, 0.15, 0.15), intensity);
        // Theme 3: Yellow (Support/Time)
        vec3 colYellow = mix(vec3(0.04, 0.03, 0.01), vec3(0.65, 0.48, 0.15), intensity);
        
        // Interpolate palettes based on the uTheme float
        vec3 color;
        if (uTheme < 1.0) {
            color = mix(colGreen, colBlue, uTheme);
        } else if (uTheme < 2.0) {
            color = mix(colBlue, colRed, uTheme - 1.0);
        } else {
            color = mix(colRed, colYellow, clamp(uTheme - 2.0, 0.0, 1.0));
        }
        
        // Add vignette shadow around screen edges
        float vignette = smoothstep(0.9, 0.4, length(vUv - 0.5));
        color *= vignette;
        
        gl_FragColor = vec4(color, 1.0);
    }
`;

// 2. Shaders: Glowing Refractive Materia Gems
export const MateriaVertexShader = `
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vPosition;
    void main() {
        vPosition = position;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
    }
`;

export const MateriaFragmentShader = `
    uniform vec3 uColor;
    uniform float uTime;
    uniform float uHover;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vPosition;

    void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        
        // Fresnel reflection factor (rim light glow)
        float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
        
        // Simulating internal Mako crystal patterns via sine combinations
        float swirl = sin(vPosition.x * 6.0 + uTime * 2.0) * 
                      cos(vPosition.y * 6.0 - uTime * 1.5) * 
                      sin(vPosition.z * 6.0 + uTime * 0.7);
        swirl = swirl * 0.5 + 0.5;
        
        // Expand core colors when hovered
        float scale = mix(0.4, 0.75, uHover);
        vec3 coreColor = mix(uColor * scale, uColor * (scale + 0.3), swirl);
        
        // Edge glowing ring
        vec3 edgeGlow = (rim * uColor * 1.8) * (1.0 + uHover * 0.5);
        
        // Specular highlight dot (simulated light reflection)
        vec3 lightDirection = normalize(vec3(1.0, 1.5, 0.8));
        vec3 halfDir = normalize(lightDirection + viewDir);
        float spec = pow(max(dot(normal, halfDir), 0.0), 32.0);
        vec3 specular = vec3(spec * 0.85);

        vec3 finalColor = coreColor + edgeGlow + specular;
        gl_FragColor = vec4(finalColor, 0.9);
    }
`;

// 3. Shaders: Glowing energy beam for Chapter 2
export const BeamVertexShader = `
    varying vec2 vUv;
    varying float vHeight;
    void main() {
        vUv = uv;
        vHeight = position.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

export const BeamFragmentShader = `
    uniform float uTime;
    uniform vec3 uColor;
    varying vec2 vUv;
    varying float vHeight;
    void main() {
        // Vertical scanning line texture
        float beamGlow = sin(vUv.x * 3.14159); // Rounded shape
        float pulses = sin(vHeight * 3.0 - uTime * 10.0) * 0.5 + 0.5;
        
        vec3 color = uColor * (0.8 + 0.4 * pulses) * beamGlow;
        float alpha = beamGlow * 0.45 * (1.0 - abs(vHeight) / 5.0); // Fades toward ends
        
        gl_FragColor = vec4(color, alpha);
    }
`;
