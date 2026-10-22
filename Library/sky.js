import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { BEAM_COUNT, LIGHTING_DEFINES, LIGHTING_GLSL, mulberry32 } from './well.js';

const NOISE_GLSL = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
    return s;
}
`;

/*
 * Night: stars and a moon straight overhead. Day: a burning sun with clouds circling it.
 * Climbing makes the moon or sun grow, approaching but never reaching its full size.
 */
export function createSky(scene, U) {
    const geo = new THREE.SphereGeometry(150, 32, 16);
    const material = new THREE.ShaderMaterial({
        defines: { ...LIGHTING_DEFINES },
        uniforms: { ...U },
        vertexShader: /* glsl */ `
            varying vec3 vWorld;
            void main() {
                vec4 wp = modelMatrix * vec4(position, 1.0);
                vWorld = wp.xyz;
                gl_Position = projectionMatrix * viewMatrix * wp;
            }`,
        fragmentShader: /* glsl */ `
            ${LIGHTING_GLSL}
            ${NOISE_GLSL}
            varying vec3 vWorld;
            void main() {
                vec3 dir = normalize(vWorld - uCam);
                float up = dir.y;
                float zen = acos(clamp(up, -1.0, 1.0));
                float closeness = 1.0 - exp(-max(uCam.y + 40.0, 0.0) / 260.0);
                float bodyR = mix(0.05, 0.2, closeness);
                vec3 haze = hazeColor();
                float sky = smoothstep(-0.15, 0.6, up);

                vec3 night = haze * sky;
                vec2 g = vec2(atan(dir.z, dir.x), asin(clamp(up, -1.0, 1.0))) * 60.0;
                vec2 cell = floor(g);
                float h = hash(cell);
                if (h > 0.972) {
                    vec2 f = fract(g) - 0.5 - (vec2(hash(cell + 1.7), hash(cell + 3.1)) - 0.5) * 0.5;
                    float star = 1.0 - smoothstep(0.0, 0.32, length(f));
                    float twinkle = 0.55 + 0.45 * sin(uTime * (1.0 + h * 3.0) + h * 50.0);
                    night += vec3(0.9, 0.95, 1.0) * star * twinkle * smoothstep(0.0, 0.3, up) * (h - 0.972) * 36.0;
                }
                float moon = 1.0 - smoothstep(bodyR * 0.96, bodyR, zen);
                vec2 disc = dir.xz / max(sin(bodyR), 0.001);
                vec3 moonCol = vec3(0.85, 0.87, 0.92) * (0.7 + 0.4 * fbm(disc * 3.0 + 7.0));
                night = mix(night, moonCol, moon);
                night += vec3(0.55, 0.65, 0.9) * exp(-max(zen - bodyR, 0.0) * 8.0) * 0.4 * (1.0 - moon);

                vec3 day = mix(haze, vec3(0.35, 0.55, 0.85), smoothstep(0.1, 0.9, up)) * sky;
                float glow = exp(-max(zen - bodyR, 0.0) * 5.0);
                day += vec3(1.0, 0.85, 0.55) * glow * 0.9;
                float ang = atan(dir.z, dir.x) + uTime * 0.03 + zen * 1.5;
                vec2 swirl = vec2(cos(ang), sin(ang)) * zen * 6.0;
                float band = smoothstep(bodyR * 1.3, bodyR * 2.4, zen) * (1.0 - smoothstep(0.9, 1.4, zen));
                float cloud = smoothstep(0.45, 0.78, fbm(swirl + vec2(0.0, uTime * 0.01))) * band;
                day = mix(day, mix(vec3(0.95), vec3(1.0, 0.9, 0.75), glow), cloud * 0.85);
                float sun = 1.0 - smoothstep(bodyR * 0.9, bodyR, zen);
                day = mix(day, vec3(1.0, 0.97, 0.85) * 1.6, sun);

                gl_FragColor = vec4(mix(night, day, uDay) * uReveal, 1.0);
            }`,
        side: THREE.BackSide,
        depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, material);
    mesh.renderOrder = -1;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return {
        update(camPos) { mesh.position.copy(camPos); },
        dispose() { scene.remove(mesh); geo.dispose(); material.dispose(); },
    };
}

const BEAM_FRAG = /* glsl */ `
    uniform vec3 uCam;
    uniform float uReveal;
    uniform float uTime;
    uniform float uDay;
    uniform float uStrength;
    varying vec3 vWorld;
    varying vec3 vNormal;
    varying vec2 vUv;
    void main() {
        vec3 view = normalize(uCam - vWorld);
        float edge = pow(abs(dot(normalize(vNormal), view)), 2.0);
        float rel = vWorld.y - uCam.y;
        float depth = exp(-max(0.0, -rel) * 0.12);
        float dist = exp(-length(vWorld - uCam) * 0.025);
        float streaks = 0.55 + 0.45 * sin(vUv.x * 62.0 + sin(vUv.x * 13.0 + uTime * 0.15) * 3.0);
        float drift = 0.85 + 0.15 * sin(vUv.y * 180.0 - uTime * 1.5);
        vec3 tint = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.84, 0.58), uDay);
        float amount = edge * streaks * drift * depth * dist * uStrength * mix(0.75, 1.0, uDay) * uReveal;
        gl_FragColor = vec4(tint * amount, 1.0);
    }
`;

const BEAM_VERT = /* glsl */ `
    varying vec3 vWorld;
    varying vec3 vNormal;
    varying vec2 vUv;
    void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * wp;
    }
`;

function beamMaterial(U, strength, side = THREE.FrontSide) {
    return new THREE.ShaderMaterial({
        uniforms: { uCam: U.uCam, uReveal: U.uReveal, uTime: U.uTime, uDay: U.uDay, uStrength: { value: strength } },
        vertexShader: BEAM_VERT,
        fragmentShader: BEAM_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side,
    });
}

/*
 * Godrays: slanted streaked shafts that also light the shelves (via uBeams), plus one wide
 * shaft falling straight down the well from the moon or sun.
 */
export function createBeams(scene, U) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
    const material = beamMaterial(U, 0.12);
    const rng = mulberry32(1234);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), U.uBeamDir.value);
    const beams = Array.from({ length: BEAM_COUNT }, (_, i) => {
        const radius = 0.8 + rng() * 0.6;
        const mesh = new THREE.Mesh(geo, material);
        mesh.quaternion.copy(quat);
        mesh.scale.set(radius, 90, radius);
        mesh.frustumCulled = false;
        scene.add(mesh);
        return { mesh, radius, x: (rng() - 0.5) * 6, z: (rng() - 0.5) * 6, lift: 8 + i * 1.7, phase: rng() * 10 };
    });

    const shaftGeo = new THREE.CylinderGeometry(0.7, 3.2, 1, 40, 1, true);
    const shaftMaterial = beamMaterial(U, 0.07, THREE.DoubleSide);
    const shaft = new THREE.Mesh(shaftGeo, shaftMaterial);
    shaft.scale.set(1, 60, 1);
    shaft.frustumCulled = false;
    scene.add(shaft);

    return {
        update(t, camY) {
            beams.forEach((b, i) => {
                const x = b.x + Math.sin(t * 0.05 + b.phase) * 0.8;
                const z = b.z + Math.cos(t * 0.04 + b.phase) * 0.8;
                const y = camY + b.lift;
                b.mesh.position.set(x, y, z);
                U.uBeams.value[i].set(x, y, z, b.radius);
            });
            shaft.position.set(0, camY + 12, 0);
            shaft.rotation.y = t * 0.02;
        },
        dispose() {
            beams.forEach(b => scene.remove(b.mesh));
            scene.remove(shaft);
            geo.dispose();
            shaftGeo.dispose();
            material.dispose();
            shaftMaterial.dispose();
        },
    };
}

/* Dust motes that drift around the viewer and sparkle when they cross a beam. */
export function createDust(scene, U, count = 1400) {
    const geo = new THREE.BufferGeometry();
    const rng = mulberry32(4242);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = rng();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));

    const uPointSize = { value: 1.2 };
    const material = new THREE.ShaderMaterial({
        defines: { ...LIGHTING_DEFINES },
        uniforms: { ...U, uPointSize },
        vertexShader: /* glsl */ `
            attribute vec4 aSeed;
            uniform vec3 uCam;
            uniform float uTime;
            uniform float uPointSize;
            varying vec3 vWorld;
            const vec3 box = vec3(12.0, 24.0, 12.0);
            float wrapAround(float v, float centre, float size) {
                float low = centre - size * 0.5;
                return low + mod(v - low, size);
            }
            void main() {
                vec3 p = aSeed.xyz * box;
                p.x += sin(uTime * 0.13 + aSeed.w * 9.0) * 0.6;
                p.z += cos(uTime * 0.11 + aSeed.w * 7.0) * 0.6;
                p.y += sin(uTime * 0.1 + aSeed.x * 6.0) * 0.5 - uTime * 0.05;
                vec3 w = vec3(wrapAround(p.x, uCam.x, box.x), wrapAround(p.y, uCam.y, box.y), wrapAround(p.z, uCam.z, box.z));
                vWorld = w;
                vec4 mv = viewMatrix * vec4(w, 1.0);
                gl_PointSize = clamp(uPointSize * 6.0 / -mv.z, 0.0, uPointSize * 3.0);
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: /* glsl */ `
            ${LIGHTING_GLSL}
            varying vec3 vWorld;
            void main() {
                vec2 c = gl_PointCoord - 0.5;
                float soft = 1.0 - smoothstep(0.2, 0.5, length(c));
                float shaft = 1.0 - smoothstep(0.8, 3.0, length(vWorld.xz));
                float lit = 0.06 + beamLight(vWorld) * 1.3 + shaft * 0.35;
                float fade = exp(-length(vWorld - uCam) * 0.12);
                gl_FragColor = vec4(beamTint() * lit * fade * soft * uReveal, 1.0);
            }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const points = new THREE.Points(geo, material);
    points.frustumCulled = false;
    scene.add(points);

    return {
        setPointSize(size) { uPointSize.value = size; },
        dispose() { scene.remove(points); geo.dispose(); material.dispose(); },
    };
}
