import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { COMMON_GLSL, MASK, glowBlending } from '../styles/index.js';
import { DIRS, INNER, WALL_H } from '../grid.js';

/*
 * Shared building blocks for room files. Every material here uses the cell's fade and centre
 * (from ctx) so it dissolves with its cell.
 */

export { THREE, COMMON_GLSL, MASK, glowBlending, INNER, WALL_H };

export const sideVec = (s) => new THREE.Vector3(DIRS[s][0], 0, DIRS[s][1]);

export const PLAIN_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

/* Uniforms every room material needs. */
export const cellUniforms = (ctx, extra = {}) => ({ ...ctx.U, uFade: ctx.fade, uCellCenter: ctx.cellCenter, ...extra });

/* A flat quad that shows an endless scene: the colour comes from the camera ray, not the surface. */
export function portalMaterial(ctx, sceneGLSL, mask, extra = {}) {
    return new THREE.ShaderMaterial({
        uniforms: cellUniforms(ctx, extra),
        vertexShader: PLAIN_VERT,
        fragmentShader: /* glsl */ `
            ${COMMON_GLSL}
            varying vec3 vWorld;
            ${sceneGLSL}
            void main() {
                dissolve();
                vec3 rd = normalize(vWorld - uCam);
                gl_FragColor = vec4(portalScene(uCam, rd) * darkness(vWorld), ${mask.toFixed(2)});
            }`,
    });
}

const LIT_VERT = /* glsl */ `
uniform float uTime;
uniform float uSway;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
void main() {
    mat4 m = modelMatrix;
    #ifdef USE_INSTANCING
        m = m * instanceMatrix;
    #endif
    vec4 wp = m * vec4(position, 1.0);
    wp.x += sin(uTime * 1.3 + wp.y * 2.0 + wp.z) * uSway;
    wp.z += cos(uTime * 1.1 + wp.y * 1.7 + wp.x) * uSway;
    vWorld = wp.xyz;
    vNormal = normalize(mat3(m) * normal);
    vColor = vec3(1.0);
    #ifdef USE_INSTANCING_COLOR
        vColor = instanceColor;
    #endif
    gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

/* Solid colour lit by the lantern, the tome, and optionally the sky. Works on instanced meshes. */
export function litMaterial(ctx, color, { mask = MASK.shaded, sky = 0, emissive = 0, sway = 0 } = {}) {
    return new THREE.ShaderMaterial({
        uniforms: cellUniforms(ctx, {
            uColor: { value: new THREE.Color(color) },
            uSky: { value: sky },
            uEmissive: { value: emissive },
            uSway: { value: sway },
        }),
        vertexShader: LIT_VERT,
        fragmentShader: /* glsl */ `
            ${COMMON_GLSL}
            uniform vec3 uColor;
            uniform float uSky;
            uniform float uEmissive;
            varying vec3 vWorld;
            varying vec3 vNormal;
            varying vec3 vColor;
            void main() {
                dissolve();
                vec3 n = normalize(vNormal);
                if (!gl_FrontFacing) n = -n;
                vec3 base = uColor * vColor;
                float skyLight = uSky * mix(0.18, 0.75, uDay) * (0.6 + 0.4 * max(n.y, 0.0));
                vec3 col = base * (0.05 + skyLight + lantern(vWorld, n, vec3(1.0, 0.85, 0.6) * 1.4) + tomeLight(vWorld, n)) + base * uEmissive;
                gl_FragColor = vec4(col * darkness(vWorld), ${mask.toFixed(2)});
            }`,
        side: THREE.DoubleSide,
    });
}

/* Soft glowing points (fireflies, halos). Needs an aSeed vec4 attribute; wander is the drift radius. */
export function glowSprite(ctx, color, strength, wander = 0.25) {
    return glowBlending(new THREE.ShaderMaterial({
        uniforms: cellUniforms(ctx, { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength }, uWander: { value: wander } }),
        vertexShader: /* glsl */ `
            attribute vec4 aSeed;
            uniform float uTime;
            uniform float uWander;
            varying vec3 vWorld;
            varying float vTwinkle;
            void main() {
                vec3 p = position;
                p += vec3(sin(uTime * 0.7 + aSeed.x * 20.0), sin(uTime * 0.9 + aSeed.y * 20.0) * 0.6, cos(uTime * 0.6 + aSeed.z * 20.0)) * uWander;
                vec4 wp = modelMatrix * vec4(p, 1.0);
                vWorld = wp.xyz;
                vTwinkle = 0.5 + 0.5 * sin(uTime * (2.0 + aSeed.w * 3.0) + aSeed.w * 40.0);
                vec4 mv = viewMatrix * wp;
                gl_PointSize = 7.0 / -mv.z;
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: /* glsl */ `
            ${COMMON_GLSL}
            uniform vec3 uColor;
            uniform float uStrength;
            varying vec3 vWorld;
            varying float vTwinkle;
            void main() {
                float soft = 1.0 - smoothstep(0.1, 0.5, length(gl_PointCoord - 0.5));
                gl_FragColor = vec4(uColor * soft * vTwinkle * uStrength * uFade * darkness(vWorld), 0.0);
            }`,
    }));
}

/* Collects a room's meshes, disposables and animation callbacks. */
export function makeRoom() {
    const group = new THREE.Group();
    const disposables = [];
    const updaters = [];
    const add = (geo, material, setup) => {
        const mesh = new THREE.Mesh(geo, material);
        if (setup) setup(mesh);
        group.add(mesh);
        disposables.push(geo, material);
        return mesh;
    };
    return {
        group,
        add,
        track: (...items) => disposables.push(...items),
        onUpdate: (fn) => updaters.push(fn),
        result: () => ({
            group,
            update: (t, camera) => updaters.forEach(fn => fn(t, camera)),
            dispose: () => disposables.forEach(d => d.dispose()),
        }),
    };
}

/* A spot beside the walking line: against a solid wall, or in the corner between two. */
export function asideSpot(ctx, distance) {
    const [a, b] = ctx.solidSides;
    if (a === undefined) return ctx.center.clone();
    const v = b !== undefined && (a + 2) % 4 !== b ? sideVec(a).add(sideVec(b)).normalize() : sideVec(a);
    return ctx.center.clone().addScaledVector(v, distance);
}

export function ceilingPortal(room, ctx, material) {
    room.add(new THREE.PlaneGeometry(INNER * 2, INNER * 2), material, (m) => {
        m.position.copy(ctx.center).setY(ctx.center.y + WALL_H);
        m.rotation.x = Math.PI / 2;
    });
}

export function floorPortal(room, ctx, material) {
    room.add(new THREE.PlaneGeometry(INNER * 2, INNER * 2), material, (m) => {
        m.position.copy(ctx.center).setY(ctx.center.y - 0.01);
        m.rotation.x = -Math.PI / 2;
    });
}

export function windowPortal(room, ctx, material) {
    const out = sideVec(ctx.windowSide);
    room.add(new THREE.PlaneGeometry(3.2, 2.0), material, (m) => {
        m.position.copy(ctx.center).addScaledVector(out, 1.99).setY(ctx.center.y + 1.9);
        m.lookAt(ctx.center.x, ctx.center.y + 1.9, ctx.center.z);
    });
}

export function balcony(room, ctx) {
    const out = sideVec(ctx.windowSide);
    const tangent = new THREE.Vector3(-out.z, 0, out.x);
    room.add(new THREE.BoxGeometry(3.3, 0.08, 0.3), litMaterial(ctx, 0xd8cbb0, { sky: 0.4 }), (m) => {
        m.position.copy(ctx.center).addScaledVector(out, 1.75).setY(ctx.center.y + 0.95);
        m.lookAt(m.position.clone().add(out));
    });
    const postMat = litMaterial(ctx, 0xc8baa0, { sky: 0.4 });
    const postGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.9, 6);
    room.track(postMat, postGeo);
    for (let i = -3; i <= 3; i++) {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.copy(ctx.center).addScaledVector(out, 1.75).addScaledVector(tangent, i * 0.5).setY(ctx.center.y + 0.45);
        room.group.add(post);
    }
}
