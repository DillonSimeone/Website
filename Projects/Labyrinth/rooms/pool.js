import {
    THREE, COMMON_GLSL, MASK, glowBlending, INNER, WALL_H, PLAIN_VERT,
    cellUniforms, portalMaterial, litMaterial, glowSprite, makeRoom, asideSpot, ceilingPortal, sideVec,
} from './kit.js';
import { createTree } from './tree.js';

const POOL_SKY = /* glsl */ `
uniform vec3 uBody;
vec3 portalScene(vec3 ro, vec3 rd) { return skyColor(rd, uBody); }
`;

/*
 * Light falling from the moon or sun, in the library's style: soft-edged streaked beams
 * (bright where they face you, fading at their silhouettes), with dust sparkling inside.
 */
function lightBeams(room, ctx, bodyDir, avoid) {
    const beamMat = glowBlending(new THREE.ShaderMaterial({
        uniforms: cellUniforms(ctx),
        vertexShader: /* glsl */ `
            varying vec3 vWorld;
            varying vec3 vNormal;
            varying vec2 vUv;
            void main() {
                vec4 wp = modelMatrix * vec4(position, 1.0);
                vWorld = wp.xyz;
                vNormal = normalize(mat3(modelMatrix) * normal);
                vUv = uv;
                gl_Position = projectionMatrix * viewMatrix * wp;
            }`,
        fragmentShader: /* glsl */ `
            ${COMMON_GLSL}
            varying vec3 vWorld;
            varying vec3 vNormal;
            varying vec2 vUv;
            void main() {
                vec3 view = normalize(uCam - vWorld);
                float edge = pow(abs(dot(normalize(vNormal), view)), 2.0);
                float streaks = 0.55 + 0.45 * sin(vUv.x * 62.0 + sin(vUv.x * 13.0 + uTime * 0.15) * 3.0);
                float drift = 0.85 + 0.15 * sin(vUv.y * 90.0 - uTime * 1.2);
                float ends = smoothstep(0.0, 0.3, vUv.y) * mix(0.55, 1.0, vUv.y);
                vec3 tint = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.84, 0.58), uDay);
                float amount = edge * streaks * drift * ends * 0.075 * mix(0.8, 1.0, uDay) * uFade;
                gl_FragColor = vec4(tint * amount * darkness(vWorld), 0.0);
            }`,
        side: THREE.DoubleSide,
    }));
    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
    room.track(beamMat, beamGeo);

    const floorY = ctx.center.y;
    const length = (WALL_H + 0.1) / bodyDir.y;
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), bodyDir);
    const spots = [];
    for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.random();
        const r = 0.15 + Math.random() * 0.45;
        const hit = ctx.center.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)).addScaledVector(avoid, -0.25).setY(floorY);
        const radius = 0.22 + Math.random() * 0.2;
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.quaternion.copy(quat);
        beam.scale.set(radius, length, radius);
        beam.position.copy(hit).addScaledVector(bodyDir, length / 2);
        beam.frustumCulled = false;
        room.group.add(beam);
        spots.push({ hit, radius });
    }

    /* A soft pool of light where the beams land. */
    const glowMat = glowBlending(new THREE.ShaderMaterial({
        uniforms: cellUniforms(ctx),
        vertexShader: /* glsl */ `
            varying vec3 vWorld;
            varying vec2 vUv;
            void main() {
                vec4 wp = modelMatrix * vec4(position, 1.0);
                vWorld = wp.xyz;
                vUv = uv;
                gl_Position = projectionMatrix * viewMatrix * wp;
            }`,
        fragmentShader: /* glsl */ `
            ${COMMON_GLSL}
            varying vec3 vWorld;
            varying vec2 vUv;
            void main() {
                float d = length(vUv - 0.5) * 2.0;
                float glow = pow(max(1.0 - d, 0.0), 2.0) * (0.85 + 0.15 * sin(uTime * 0.7 + vWorld.x * 3.0));
                vec3 tint = mix(vec3(0.6, 0.7, 1.0), vec3(1.0, 0.85, 0.6), uDay);
                gl_FragColor = vec4(tint * glow * 0.12 * uFade * darkness(vWorld), 0.0);
            }`,
    }));
    const glowGeo = new THREE.PlaneGeometry(1, 1);
    room.track(glowMat, glowGeo);
    for (const s of spots) {
        const patch = new THREE.Mesh(glowGeo, glowMat);
        patch.rotation.x = -Math.PI / 2;
        patch.position.copy(s.hit).setY(floorY + 0.14);
        patch.scale.setScalar(s.radius * 3.2);
        room.group.add(patch);
    }

    /* Dust drifting inside the beams. */
    const DUST = 110;
    const dustGeo = new THREE.BufferGeometry();
    const pts = new Float32Array(DUST * 3);
    const seeds = new Float32Array(DUST * 4).map(() => Math.random());
    for (let i = 0; i < DUST; i++) {
        const s = spots[i % spots.length];
        const along = Math.random() * length;
        const off = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).multiplyScalar(s.radius * 1.4);
        const p = s.hit.clone().add(off).addScaledVector(bodyDir, along);
        pts.set([p.x, p.y, p.z], i * 3);
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    const dust = new THREE.Points(dustGeo, glowSprite(ctx, 0xdfe6ff, 0.9, 0.12));
    dust.frustumCulled = false;
    room.group.add(dust);
    room.track(dustGeo, dust.material);
}

function fireflies(room, ctx, around) {
    const FLIES = 60;
    const geo = new THREE.BufferGeometry();
    const seeds = new Float32Array(FLIES * 4).map(() => Math.random());
    const points = new Float32Array(FLIES * 3);
    for (let i = 0; i < FLIES; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 1.3;
        points.set([around.x + Math.cos(a) * r, ctx.center.y + 0.4 + Math.random() * 2.2, around.z + Math.sin(a) * r], i * 3);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(points, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    const flies = new THREE.Points(geo, glowSprite(ctx, 0xd8ff7a, 1.4));
    flies.frustumCulled = false;
    room.group.add(flies);
    room.track(geo, flies.material);
}

/* Sky ceiling, reflective water crossed by stepping stones, grass, moonbeams, and a great tree. */
function build(ctx) {
    const room = makeRoom();
    const { center } = ctx;

    /* The tree stands in a corner (on turns) or against a wall; the moon hangs on the far side. */
    const [a, b] = ctx.solidSides;
    const corner = a !== undefined && b !== undefined && (a + 2) % 4 !== b;
    const treeBase = asideSpot(ctx, corner ? 1.85 : 1.45);
    const avoid = treeBase.clone().sub(center).setY(0);
    if (avoid.lengthSq() < 1e-4) avoid.set(0, 0, 1);
    avoid.normalize();
    const bodyDir = new THREE.Vector3(0, 1, 0).addScaledVector(avoid, -0.32).normalize();

    ceilingPortal(room, ctx, portalMaterial(ctx, POOL_SKY, MASK.shaded, { uBody: { value: bodyDir } }));

    room.add(new THREE.PlaneGeometry(INNER * 2, INNER * 2), litMaterial(ctx, 0x2c4a1c, { sky: 1 }), (m) => {
        m.position.copy(center).setY(center.y + 0.004);
        m.rotation.x = -Math.PI / 2;
    });

    const rimMat = litMaterial(ctx, 0x8a8478, { sky: 1 });
    const rimGeo = new THREE.BoxGeometry(1, 1, 1);
    room.track(rimMat, rimGeo);
    [[0, -1.05, 2.3, 0.2], [0, 1.05, 2.3, 0.2], [-1.05, 0, 0.2, 2.3], [1.05, 0, 0.2, 2.3]].forEach(([x, z, sx, sz]) => {
        const rim = new THREE.Mesh(rimGeo, rimMat);
        rim.position.set(center.x + x, center.y + 0.1, center.z + z);
        rim.scale.set(sx, 0.2, sz);
        room.group.add(rim);
    });

    /* Stepping stones along the walking line, so crossing the water is intended. */
    const stoneGeo = new THREE.CylinderGeometry(0.28, 0.32, 0.12, 9);
    room.track(stoneGeo);
    const pathPoints = [sideVec(ctx.entrySide).multiplyScalar(0.55), new THREE.Vector3(), sideVec(ctx.exitSide).multiplyScalar(0.55)];
    pathPoints.forEach((p) => {
        const stone = new THREE.Mesh(stoneGeo, rimMat);
        stone.position.set(center.x + p.x, center.y + 0.16, center.z + p.z);
        room.group.add(stone);
    });

    const water = new THREE.ShaderMaterial({
        uniforms: cellUniforms(ctx, { uBody: { value: bodyDir } }),
        vertexShader: PLAIN_VERT,
        fragmentShader: /* glsl */ `
            ${COMMON_GLSL}
            uniform vec3 uBody;
            varying vec3 vWorld;
            void main() {
                dissolve();
                vec2 q = vWorld.xz * 3.0;
                float e = 0.05;
                float h0 = fbm2(q + uTime * 0.4);
                float hx = fbm2(q + vec2(e, 0.0) + uTime * 0.4);
                float hz = fbm2(q + vec2(0.0, e) + uTime * 0.4);
                vec3 n = normalize(vec3((h0 - hx) * 0.6, e, (h0 - hz) * 0.6));
                vec3 rd = normalize(vWorld - uCam);
                vec3 refl = reflect(rd, n);
                float fres = 0.15 + 0.85 * pow(1.0 - max(dot(-rd, n), 0.0), 3.0);
                vec3 deep = mix(vec3(0.01, 0.04, 0.06), vec3(0.05, 0.25, 0.3), uDay);
                vec3 col = mix(deep, skyColor(refl, uBody), fres);
                gl_FragColor = vec4(col * darkness(vWorld), 0.0);
            }`,
    });
    room.add(new THREE.PlaneGeometry(1.9, 1.9), water, (m) => {
        m.position.copy(center).setY(center.y + 0.12);
        m.rotation.x = -Math.PI / 2;
    });

    const bladeGeo = new THREE.PlaneGeometry(0.035, 0.32, 1, 3);
    bladeGeo.translate(0, 0.16, 0);
    const grassMat = new THREE.ShaderMaterial({
        uniforms: cellUniforms(ctx),
        vertexShader: /* glsl */ `
            uniform float uTime;
            varying vec3 vWorld;
            varying float vTip;
            void main() {
                vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
                float bend = uv.y * uv.y;
                wp.x += sin(uTime * 1.6 + wp.x * 3.0 + wp.z * 2.0) * 0.07 * bend;
                wp.z += cos(uTime * 1.3 + wp.x * 2.0) * 0.05 * bend;
                vWorld = wp.xyz;
                vTip = uv.y;
                gl_Position = projectionMatrix * viewMatrix * wp;
            }`,
        fragmentShader: /* glsl */ `
            ${COMMON_GLSL}
            varying vec3 vWorld;
            varying float vTip;
            void main() {
                dissolve();
                vec3 base = mix(vec3(0.05, 0.16, 0.04), vec3(0.3, 0.6, 0.18), vTip);
                vec3 col = base * (0.1 + mix(0.2, 0.8, uDay) + lantern(vWorld, vec3(0.0, 1.0, 0.0), vec3(1.0, 0.85, 0.6)));
                gl_FragColor = vec4(col * darkness(vWorld), 0.0);
            }`,
        side: THREE.DoubleSide,
    });
    const blades = new THREE.InstancedMesh(bladeGeo, grassMat, 700);
    const dummy = new THREE.Object3D();
    let placed = 0;
    while (placed < 700) {
        const x = (Math.random() * 2 - 1) * 1.75;
        const z = (Math.random() * 2 - 1) * 1.75;
        if (Math.abs(x) < 1.2 && Math.abs(z) < 1.2) continue;
        dummy.position.set(center.x + x, center.y, center.z + z);
        dummy.rotation.set(0, Math.random() * Math.PI, 0);
        dummy.scale.setScalar(0.6 + Math.random() * 0.8);
        dummy.updateMatrix();
        blades.setMatrixAt(placed++, dummy.matrix);
    }
    blades.frustumCulled = false;
    room.group.add(blades);
    room.track(bladeGeo, grassMat);

    createTree(room, ctx, treeBase, { bodyDir });
    fireflies(room, ctx, treeBase);
    lightBeams(room, ctx, bodyDir, avoid);

    return room.result();
}

export default { name: 'Moon pool', skyCeiling: true, build };
