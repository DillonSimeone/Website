import {
    THREE, COMMON_GLSL, MASK, glowBlending, INNER, WALL_H, PLAIN_VERT,
    cellUniforms, portalMaterial, litMaterial, glowSprite, makeRoom, asideSpot, ceilingPortal, sideVec,
} from './kit.js';

const POOL_SKY = /* glsl */ `
vec3 portalScene(vec3 ro, vec3 rd) { return skyColor(rd, vec3(0.0, 1.0, 0.0)); }
`;

/* A great old tree: flared roots, a heavy trunk, branches reaching over the path, fireflies. */
function bigTree(room, ctx, base) {
    const bark = litMaterial(ctx, 0x4a3222, { sky: 0.8 });
    room.track(bark);
    const limb = (geo, from, to) => {
        const mesh = new THREE.Mesh(geo, bark);
        const dir = to.clone().sub(from);
        mesh.position.copy(from).addScaledVector(dir, 0.5);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        mesh.scale.set(1, dir.length(), 1);
        room.group.add(mesh);
    };
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.36, 1, 10);
    const rootGeo = new THREE.CylinderGeometry(0.05, 0.14, 1, 6);
    const branchGeo = new THREE.CylinderGeometry(0.04, 0.12, 1, 6);
    room.track(trunkGeo, rootGeo, branchGeo);
    const top = base.clone().setY(ctx.center.y + 2.2);
    limb(trunkGeo, base.clone().setY(ctx.center.y), top);
    for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.3;
        limb(rootGeo, base.clone().setY(ctx.center.y + 0.5), base.clone().add(new THREE.Vector3(Math.cos(a) * 0.75, 0.02, Math.sin(a) * 0.75)));
    }
    const leafMat = litMaterial(ctx, 0x3f7a2a, { sky: 1, sway: 0.025, emissive: 0.08 });
    const leafGeo = new THREE.IcosahedronGeometry(0.5, 1);
    room.track(leafMat, leafGeo);
    const towardCenter = ctx.center.clone().sub(base).setY(0);
    const baseAngle = Math.atan2(towardCenter.z, towardCenter.x);
    for (let k = 0; k < 7; k++) {
        const a = baseAngle + (k - 3) * 0.55;
        const reach = 1.1 + (k % 3) * 0.35;
        const tip = top.clone().add(new THREE.Vector3(Math.cos(a) * reach, 0.35 + (k % 2) * 0.25, Math.sin(a) * reach));
        limb(branchGeo, top, tip);
        for (let c = 0; c < 2; c++) {
            const leaf = new THREE.Mesh(leafGeo, leafMat);
            leaf.position.copy(tip).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.3) * 0.25, (Math.random() - 0.5) * 0.5));
            leaf.position.y = Math.min(leaf.position.y, ctx.center.y + WALL_H - 0.45);
            leaf.scale.setScalar(0.7 + Math.random() * 0.5);
            leaf.rotation.set(Math.random() * 3, Math.random() * 3, 0);
            room.group.add(leaf);
        }
    }
    const crown = new THREE.Mesh(leafGeo, leafMat);
    crown.position.copy(top).setY(ctx.center.y + 2.6);
    crown.scale.setScalar(1.25);
    room.group.add(crown);

    const FLIES = 70;
    const flyGeo = new THREE.BufferGeometry();
    const seeds = new Float32Array(FLIES * 4);
    const points = new Float32Array(FLIES * 3);
    for (let i = 0; i < FLIES; i++) {
        for (let s = 0; s < 4; s++) seeds[i * 4 + s] = Math.random();
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 1.6;
        points.set([base.x + Math.cos(a) * r, ctx.center.y + 0.6 + Math.random() * 2.2, base.z + Math.sin(a) * r], i * 3);
    }
    flyGeo.setAttribute('position', new THREE.BufferAttribute(points, 3));
    flyGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    const flies = new THREE.Points(flyGeo, glowSprite(ctx, 0xd8ff7a, 1.6));
    flies.frustumCulled = false;
    room.group.add(flies);
    room.track(flyGeo, flies.material);
}

/* Sky ceiling, reflective water crossed by stepping stones, grass, a light shaft, and the tree. */
function build(ctx) {
    const room = makeRoom();
    const { center } = ctx;
    ceilingPortal(room, ctx, portalMaterial(ctx, POOL_SKY, MASK.shaded));

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
        uniforms: cellUniforms(ctx),
        vertexShader: PLAIN_VERT,
        fragmentShader: /* glsl */ `
            ${COMMON_GLSL}
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
                vec3 col = mix(deep, skyColor(refl, vec3(0.0, 1.0, 0.0)), fres);
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

    bigTree(room, ctx, asideSpot(ctx, 1.3));

    const shaftMat = glowBlending(new THREE.ShaderMaterial({
        uniforms: cellUniforms(ctx),
        vertexShader: /* glsl */ `
            varying vec3 vWorld;
            varying float vY;
            void main() {
                vec4 wp = modelMatrix * vec4(position, 1.0);
                vWorld = wp.xyz;
                vY = uv.y;
                gl_Position = projectionMatrix * viewMatrix * wp;
            }`,
        fragmentShader: /* glsl */ `
            ${COMMON_GLSL}
            varying vec3 vWorld;
            varying float vY;
            void main() {
                if (uFade < 0.5) discard;
                vec3 tint = mix(vec3(0.55, 0.65, 0.95), vec3(1.0, 0.85, 0.55), uDay);
                float streak = 0.6 + 0.4 * sin(vWorld.x * 9.0 + vWorld.z * 7.0 + uTime * 0.4);
                gl_FragColor = vec4(tint * 0.08 * vY * streak * darkness(vWorld), 0.0);
            }`,
        side: THREE.DoubleSide,
    }));
    room.add(new THREE.CylinderGeometry(1.3, 0.95, WALL_H, 24, 1, true), shaftMat, (m) => {
        m.position.copy(center).setY(center.y + WALL_H / 2);
    });

    return room.result();
}

export default { name: 'Moon pool', skyCeiling: true, build };
