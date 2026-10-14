import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { R, SHADOW_CASTERS, LIGHTING_DEFINES, LIGHTING_GLSL, mulberry32 } from './well.js';

// Fixed spatial span completely decoupled from dynamic section loading
export const PAGE_TOTAL_SPAN = 200.0;
export const PAGE_HALF_SPAN = 100.0;

/* pageCenter() in vertex shader and CPU shadow updater match exactly. */
const PAGE_VERT = /* glsl */ `
attribute vec4 aSeed; // x: phase [0,1], y: fallSpeed, z: radius, w: angle0
uniform float uTime;
uniform vec3 uCam;
uniform vec4 uAstralPos; // x, y, z, active
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vCenter;
varying vec2 vUv;
varying float vBiomeY;

mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }

vec3 pageCenter() {
    // Constant span: zero phase jumps when sections load or quality adapts
    float low = uCam.y - 100.0;
    float along = mod(aSeed.x * 200.0 - uTime * aSeed.y - low, 200.0);
    float y = low + along;
    float ang = aSeed.w + uTime * 0.05 * (0.4 + aSeed.z * 0.12) + sin(uTime * 0.25 + aSeed.x * 20.0) * 0.3;
    vec3 c = vec3(cos(ang) * aSeed.z + sin(uTime * 0.6 + aSeed.x * 31.0) * 0.35, y, sin(ang) * aSeed.z);

    // Dynamic aerodynamic deflection from falling celestial green tome
    if (uAstralPos.w > 0.5) {
        vec3 dAstral = c - uAstralPos.xyz;
        float distSq = dot(dAstral, dAstral);
        if (distSq < 12.0 && distSq > 0.01) {
            float dist = sqrt(distSq);
            float push = pow(1.0 - dist / 3.46, 1.8) * 2.6;
            c.xz += normalize(dAstral.xz) * push;
            c.y += push * 0.5;
        }
    }
    return c;
}

void main() {
    vec3 c = pageCenter();
    float yWorld = c.y;

    // Aerodynamic flight angles:
    // pitch is tilted flat (averaging ~55 degrees) so the broad face catches the air and floats!
    float a1 = uTime * (0.65 + aSeed.y * 0.5) + aSeed.x * 40.0;
    float pitch = sin(a1) * 0.40 + 0.95;
    float roll = cos(a1 * 0.65) * 0.45;
    float yaw = uTime * 0.25 * (aSeed.y + 0.3) + aSeed.w;
    mat3 rot = rotY(yaw) * rotX(pitch) * rotZ(roll);

    // Biome weights for vertex deformation & shaders
    float celestialW = smoothstep(50.0, 58.0, yWorld);
    float canopyW = smoothstep(26.0, 32.0, yWorld) * (1.0 - smoothstep(48.0, 54.0, yWorld));
    float oceanW = smoothstep(-36.0, -30.0, yWorld) * (1.0 - smoothstep(-14.0, -8.0, yWorld));
    float caveW = smoothstep(-58.0, -52.0, yWorld) * (1.0 - smoothstep(-38.0, -32.0, yWorld));
    float hellW = 1.0 - smoothstep(-58.0, -50.0, yWorld);
    float defaultW = clamp(1.0 - (celestialW + canopyW + oceanW + caveW + hellW), 0.0, 1.0);

    vec2 p = uv - 0.5;

    // 1. Celestial: Silky arch + buoyant slow-breathing traveling wave
    float cBend = (p.x * p.x * 2.4 - 0.08) * 0.20 + sin(a1 * 0.8 + p.y * 4.5) * 0.05;

    // 2. Canopy: Folded V-leaf channel + diagonal leaf twist
    float leafBend = (abs(p.x) * 0.22 - 0.05) + p.x * p.y * sin(a1 * 1.1) * 0.55;

    // 3. Scriptorium / Nexus: Antique vellum manuscript roll along vertical axis + trailing edge flex
    float defBend = (p.x * p.x * 3.2 - 0.10) * 0.25 + sin(a1 * 1.2 + p.y * 6.0) * p.y * 0.07;

    // 4. Ocean: Limp, soggy waterlogged cloth undulation
    float oceanBend = sin(a1 * 0.9 + p.y * 8.0 + p.x * 4.0) * 0.08 + p.y * p.y * 0.05;

    // 5. Cave: Rigid mineral slab
    float caveBend = p.x * 0.015;

    // 6. Hell: Charred, curled scorched edges (curled upward toward camera)
    float rCorner = length(p * vec2(1.3, 1.0));
    float hellBend = pow(max(0.0, rCorner - 0.18) * 2.2, 2.0) * 0.22 + sin(a1 * 2.2 + p.x * 10.0) * 0.015;

    float zDisp = cBend * celestialW + leafBend * canopyW + oceanBend * oceanW + caveBend * caveW + hellBend * hellW + defBend * defaultW;

    // Natural page geometry with authentic aerofoil curvature
    vec3 lp = position;
    lp.z += zDisp;

    vec3 wp = c + rot * lp;
    vWorld = wp;

    // Accurate surface normal reflecting the curved paper
    vec3 norm = normalize(vec3(-p.x * zDisp * 8.0, -p.y * zDisp * 4.0, 1.0));
    vNormal = rot * norm;
    vCenter = c;
    vUv = uv;
    vBiomeY = yWorld;

    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const PAGE_FRAG = /* glsl */ `
${LIGHTING_GLSL}
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vCenter;
varying vec2 vUv;
varying float vBiomeY;

// Decoupled continuous boundary fade across +/- [75, 98] units from camera
float pageBandFade(float rel) {
    return smoothstep(98.0, 75.0, abs(rel));
}

void pageDissolve(float rel) {
    float pbf = pageBandFade(rel);
    if (uAsciiMode > 0.5) {
        float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        if (pbf < noise) discard;
    } else {
        if (pbf <= 0.001) discard;
    }
}

void main() {
    float rel = vWorld.y - uCam.y;
    pageDissolve(rel);

    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;

    // Base: antique cream parchment with ruling lines
    float inside = step(0.1, vUv.x) * step(vUv.x, 0.9) * step(0.12, vUv.y) * step(vUv.y, 0.88);
    vec3 base = vec3(0.88, 0.83, 0.72);
    base *= 1.0 - 0.20 * step(0.55, fract(vUv.y * 14.0)) * inside;

    // Biome weights based on page's vertical world position
    float celestialW = smoothstep(50.0, 58.0, vBiomeY);
    float canopyW = smoothstep(26.0, 32.0, vBiomeY) * (1.0 - smoothstep(48.0, 54.0, vBiomeY));
    float oceanW = smoothstep(-36.0, -30.0, vBiomeY) * (1.0 - smoothstep(-14.0, -8.0, vBiomeY));
    float caveW = smoothstep(-58.0, -52.0, vBiomeY) * (1.0 - smoothstep(-38.0, -32.0, vBiomeY));
    float hellW = 1.0 - smoothstep(-58.0, -50.0, vBiomeY);

    vec3 emission = vec3(0.0);

    // 1. Canopy: Botanical leaf tint
    if (canopyW > 0.001) {
        float vein = step(0.48, fract(vUv.x * 6.0 + sin(vUv.y * 12.0) * 0.3));
        vec3 leafCol = mix(vec3(0.35, 0.52, 0.28), vec3(0.78, 0.75, 0.58), vein * 0.55);
        base = mix(base, leafCol, canopyW * 0.85);
    }

    // 2. Celestial: Divine golden parchment
    if (celestialW > 0.001) {
        vec3 celCol = mix(vec3(0.96, 0.94, 0.88), vec3(1.0, 0.90, 0.55), 0.45);
        base = mix(base, celCol, celestialW);
        emission += vec3(1.0, 0.90, 0.60) * 0.4 * celestialW;
    }

    // 3. Ocean: Waterlogged wet vellum with specular gleam
    if (oceanW > 0.001) {
        vec3 wetCol = vec3(0.38, 0.54, 0.58);
        vec3 V = normalize(uCam - vWorld);
        vec3 H2 = normalize(-uBeamDir + V);
        float wetSpec = pow(max(dot(n, H2), 0.0), 32.0) * 1.5;
        base = mix(base, wetCol, oceanW * 0.8);
        emission += vec3(0.6, 0.85, 0.95) * wetSpec * oceanW;
    }

    // 4. Cave: Subterranean amethyst runes on dark slate vellum
    if (caveW > 0.001) {
        vec3 slateCol = vec3(0.20, 0.18, 0.24);
        float rune = step(0.70, fract(vUv.y * 10.0 + sin(vUv.x * 9.0))) * inside;
        vec3 runeCol = vec3(0.72, 0.35, 0.95);
        base = mix(base, slateCol, caveW * 0.9);
        emission += runeCol * rune * 1.0 * caveW;
    }

    // 5. Hell: Scorched charred parchment with smoldering flame edges
    // Charred paper body matches the dark shelves; only the flame perimeter glows!
    if (hellW > 0.001) {
        float dE = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
        float fire = 1.0 - smoothstep(0.0, 0.16, dE);
        float flk = sin(uTime * 14.0 + vWorld.x * 20.0 + vWorld.y * 18.0) * 0.5 + 0.5;
        vec3 flameCol = mix(vec3(1.0, 0.22, 0.02), vec3(1.0, 0.85, 0.12), flk);
        vec3 charred = vec3(0.12, 0.09, 0.07);
        base = mix(base, charred, hellW);
        emission += flameCol * fire * 2.0 * hellW;
    }

    // Base shading from the library's atmospheric lighting model
    vec3 col = shadeSurface(base, vWorld, n);

    // Emission is properly attenuated by depth darkness and distance fog
    // so glowing flame or runes dissolve into darkness/fog matching the shelves!
    float dCam = length(vWorld - uCam);
    float fogAmt = 1.0 - exp(-dCam * 0.038);
    float depthDark = exp(-max(0.0, -rel) * 0.085);
    float pbf = pageBandFade(rel);
    float totalFog = uAsciiMode > 0.5 ? fogAmt : clamp(fogAmt + (1.0 - pbf), 0.0, 1.0);

    col += emission * depthDark * (1.0 - totalFog) * uReveal;

    gl_FragColor = vec4(col, 1.0);
}
`;

export function createPages(scene, U, maxCount = 450) {
    // 6x4 subdivided plane geometry for authentic curved parchment flex
    const geo = new THREE.PlaneGeometry(0.26, 0.34, 6, 4);

    const rng = mulberry32(1013);
    const seeds = new Float32Array(maxCount * 4);
    for (let i = 0; i < maxCount; i++) {
        // Stratified uniform spacing across [0, 1] - guarantees 100% constant density everywhere!
        seeds[i * 4] = (i + rng() * 0.95) / maxCount;
        // Individual fall speeds with wide variance (0.40 to 0.90 u/s) so pages constantly drift past each other
        seeds[i * 4 + 1] = 0.40 + rng() * 0.50;
        // Radius distribution within hexagonal well
        seeds[i * 4 + 2] = 0.5 + Math.sqrt(rng()) * (R - 1.8);
        // Angle around the shaft
        seeds[i * 4 + 3] = rng() * Math.PI * 2;
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));

    const material = new THREE.ShaderMaterial({
        defines: { ...LIGHTING_DEFINES },
        uniforms: { ...U },
        vertexShader: PAGE_VERT,
        fragmentShader: PAGE_FRAG,
        side: THREE.DoubleSide,
    });

    const mesh = new THREE.InstancedMesh(geo, material, maxCount);
    mesh.frustumCulled = false;
    scene.add(mesh);

    let time = 0;

    return {
        mesh,
        get count() { return mesh.count; },
        setCount(n) {
            mesh.count = Math.max(1, Math.min(maxCount, Math.round(n)));
        },

        update(dt, camY) {
            time += dt;
            const casters = U.uShadows.value;
            let c = 0;

            const totalSpan = PAGE_TOTAL_SPAN;
            const halfSpan = PAGE_HALF_SPAN;
            const low = camY - halfSpan;

            // CPU shadow casters update for pages right above the camera
            for (let i = 0; i < mesh.count && c < SHADOW_CASTERS; i++) {
                const phase = seeds[i * 4];
                const speed = seeds[i * 4 + 1];
                const radius = seeds[i * 4 + 2];
                const angle0 = seeds[i * 4 + 3];

                const along = ((phase * totalSpan - time * speed - low) % totalSpan + totalSpan) % totalSpan;
                const y = low + along;
                if (y < camY - 3 || y > camY + 11) continue;

                const ang = angle0 + time * 0.05 * (0.4 + radius * 0.12) + Math.sin(time * 0.25 + phase * 20.0) * 0.3;
                const x = Math.cos(ang) * radius + Math.sin(time * 0.6 + phase * 31.0) * 0.35;
                const z = Math.sin(ang) * radius;
                casters[c++].set(x, y, z, 1);
            }

            while (c < SHADOW_CASTERS) casters[c++].set(0, -9999, 0, 0);
        },

        dispose() {
            scene.remove(mesh);
            geo.dispose();
            material.dispose();
            mesh.dispose();
        },
    };
}
