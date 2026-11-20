import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { COMMON_GLSL } from './common.js';
import sandstone from './sandstone.js';
import obsidian from './obsidian.js';
import hedge from './hedge.js';
import blueprint from './blueprint.js';
import ink from './ink.js';
import phosphor from './phosphor.js';
import amber from './amber.js';
import crystal from './crystal.js';
import ruins from './ruins.js';
import vapor from './vapor.js';
import glass from './glass.js';
import rain from './rain.js';
import ice from './ice.js';

export { MASK, COMMON_GLSL, createSharedUniforms, glowBlending } from './common.js';

/*
 * Each style file is one branch of styleSurface(). Its GLSL sees p (world position), n (normal),
 * uv (face coordinates), isFloor, isCeiling, and writes albedo, emissive, tint, ambient, mask.
 */
export const STYLES = [sandstone, obsidian, hedge, blueprint, ink, phosphor, amber, crystal, ruins, vapor, glass, rain, ice];
export const STYLE_INDEX = Object.fromEntries(STYLES.map((s, i) => [s.id, i]));

const STYLE_GLSL = /* glsl */ `
#define CELL 4.0
#define LEVEL 3.4
#define WALL_H 3.2

void styleSurface(int s, vec3 p, vec3 n, out vec3 albedo, out vec3 emissive, out vec3 tint, out float ambient, out float mask) {
    vec2 uv = faceUV(p, n);
    bool isFloor = n.y > 0.5;
    bool isCeiling = n.y < -0.5;
    albedo = vec3(0.5);
    emissive = vec3(0.0);
    mask = 0.0;
    ambient = 0.05;
    tint = vec3(1.0);
    ${STYLES.map((style, i) => `${i ? 'else ' : ''}if (s == ${i}) {\n${style.glsl}\n}`).join('\n    ')}
}
`;

const CELL_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
    mat4 m = modelMatrix * instanceMatrix;
    vec4 wp = m * vec4(position, 1.0);
    vWorld = wp.xyz;
    vNormal = normalize(mat3(m) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const CELL_FRAG = /* glsl */ `
${COMMON_GLSL}
${STYLE_GLSL}
uniform int uStyleA;
uniform int uStyleB;
uniform vec3 uBlendOrigin;
uniform vec3 uBlendDir;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
    dissolve();
    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;
    vec3 albedo, emissive, tint;
    float ambient, mask;
    styleSurface(uStyleA, vWorld, n, albedo, emissive, tint, ambient, mask);
    if (uStyleB != uStyleA) {
        vec3 albedoB, emissiveB, tintB;
        float ambientB, maskB;
        styleSurface(uStyleB, vWorld, n, albedoB, emissiveB, tintB, ambientB, maskB);
        float b = smoothstep(0.3, 0.7, clamp(dot(vWorld - uBlendOrigin, uBlendDir) / CELL, 0.0, 1.0));
        albedo = mix(albedo, albedoB, b);
        emissive = mix(emissive, emissiveB, b);
        tint = mix(tint, tintB, b);
        ambient = mix(ambient, ambientB, b);
        mask = b < 0.5 ? mask : maskB;
    }
    vec3 col = albedo * (ambient + lantern(vWorld, n, tint) + tomeLight(vWorld, n)) + emissive;
    gl_FragColor = vec4(col * darkness(vWorld), mask);
}
`;

/* One material per cell (they share a compiled program); per-cell uniforms drive style and fade. */
export function createCellMaterial(U, { styleA, styleB = styleA, blendOrigin, blendDir, center, fade }) {
    return new THREE.ShaderMaterial({
        uniforms: {
            ...U,
            uFade: fade,
            uCellCenter: { value: center.clone() },
            uStyleA: { value: styleA },
            uStyleB: { value: styleB },
            uBlendOrigin: { value: (blendOrigin || center).clone() },
            uBlendDir: { value: (blendDir || new THREE.Vector3(0, 0, -1)).clone() },
        },
        vertexShader: CELL_VERT,
        fragmentShader: CELL_FRAG,
        side: THREE.DoubleSide,
    });
}
