import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { R, SHADOW_CASTERS, LIGHTING_DEFINES, LIGHTING_GLSL, mulberry32 } from './well.js';

const SPAN = 46;

/* pageCenter() in the vertex shader and centerOf() below must stay identical: the CPU copy feeds the shadow casters. */
const PAGE_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform float uSpan;
uniform vec3 uCam;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vCenter;
varying vec2 vUv;
varying float vFade;

mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }

float edgeFade;

vec3 pageCenter() {
    float low = uCam.y - uSpan * 0.5;
    float along = mod(aSeed.x * uSpan - uTime * aSeed.y - low, uSpan);
    edgeFade = smoothstep(0.0, 6.0, along) * smoothstep(0.0, 6.0, uSpan - along);
    float y = low + along;
    float ang = aSeed.w + uTime * 0.06 * (0.4 + aSeed.z * 0.12) + sin(uTime * 0.3 + aSeed.x * 20.0) * 0.3;
    return vec3(cos(ang) * aSeed.z + sin(uTime * 0.7 + aSeed.x * 31.0) * 0.4, y, sin(ang) * aSeed.z);
}

void main() {
    vec3 c = pageCenter();
    float a1 = uTime * (0.5 + aSeed.y) + aSeed.x * 40.0;
    mat3 rot = rotY(uTime * 0.35 * (aSeed.y + 0.3) + aSeed.w) * rotX(sin(a1) * 1.1 + 0.5) * rotZ(cos(a1 * 0.7) * 0.7);
    vec3 lp = position * edgeFade;
    vFade = edgeFade;
    lp.z += (uv.x - 0.5) * (uv.x - 0.5) * 0.25 * sin(a1 * 1.3);
    vec3 wp = c + rot * lp;
    vWorld = wp;
    vNormal = rot * vec3(0.0, 0.0, 1.0);
    vCenter = c;
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const PAGE_FRAG = /* glsl */ `
${LIGHTING_GLSL}
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vCenter;
varying vec2 vUv;
varying float vFade;
void main() {
    float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (vFade < noise) discard;
    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;
    vec3 base = vec3(0.86, 0.81, 0.7);
    float inside = step(0.1, vUv.x) * step(vUv.x, 0.9) * step(0.12, vUv.y) * step(vUv.y, 0.88);
    base *= 1.0 - 0.18 * step(0.55, fract(vUv.y * 14.0)) * inside;
    vec3 col = shadeSurface(base, vWorld, n);
    float glow = beamLight(vCenter) * (1.0 - smoothstep(20.0, 40.0, length(vCenter - uCam)));
    col += vec3(1.0, 0.82, 0.55) * glow * 0.9 * uReveal;
    gl_FragColor = vec4(col, 1.0);
}
`;

export function createPages(scene, U, maxCount = 360) {
    const geo = new THREE.PlaneGeometry(0.26, 0.34, 4, 1);
    const rng = mulberry32(99);
    const seeds = new Float32Array(maxCount * 4);
    for (let i = 0; i < maxCount; i++) {
        seeds[i * 4] = rng();
        seeds[i * 4 + 1] = 0.25 + rng() * 0.35;
        seeds[i * 4 + 2] = 0.3 + Math.sqrt(rng()) * (R - 1.9);
        seeds[i * 4 + 3] = rng() * Math.PI * 2;
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));

    const uSpan = { value: SPAN };
    const material = new THREE.ShaderMaterial({
        defines: { ...LIGHTING_DEFINES },
        uniforms: { ...U, uSpan },
        vertexShader: PAGE_VERT,
        fragmentShader: PAGE_FRAG,
        side: THREE.DoubleSide,
    });

    const mesh = new THREE.InstancedMesh(geo, material, maxCount);
    mesh.frustumCulled = false;
    scene.add(mesh);

    const center = new THREE.Vector3();
    const mod = (a, b) => ((a % b) + b) % b;

    function centerOf(i, t, camY, out) {
        const phase = seeds[i * 4], speed = seeds[i * 4 + 1], radius = seeds[i * 4 + 2], angle0 = seeds[i * 4 + 3];
        const low = camY - SPAN * 0.5;
        const y = low + mod(phase * SPAN - t * speed - low, SPAN);
        const ang = angle0 + t * 0.06 * (0.4 + radius * 0.12) + Math.sin(t * 0.3 + phase * 20) * 0.3;
        return out.set(Math.cos(ang) * radius + Math.sin(t * 0.7 + phase * 31) * 0.4, y, Math.sin(ang) * radius);
    }

    return {
        mesh,
        get count() { return mesh.count; },
        setCount(n) { mesh.count = Math.max(1, Math.min(maxCount, Math.round(n))); },
        /* Pages just above the viewer cast the shadows. */
        update(t, camY) {
            const casters = U.uShadows.value;
            let c = 0;
            for (let i = 0; i < mesh.count && c < SHADOW_CASTERS; i++) {
                centerOf(i, t, camY, center);
                if (center.y < camY - 4 || center.y > camY + 10) continue;
                casters[c++].set(center.x, center.y, center.z, 1);
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
