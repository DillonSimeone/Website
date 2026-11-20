import { THREE, COMMON_GLSL, WALL_H, cellUniforms } from './kit.js';

/*
 * Procedural tree: recursive tapered branches (one merged mesh with bark shading) and instanced
 * leaf cards with a leaf-shaped cutout, translucency and sway. Growth leans away from `avoid`
 * (the room centre) and is kept inside the cell and out of the column under the moon.
 *
 * createTree(room, ctx, base, { bodyDir, trunkHeight, trunkRadius, depth })
 *   room:    makeRoom() collector, ctx: room ctx, base: trunk foot on the floor
 *   bodyDir: direction to the moon or sun (lights the bark and leaves)
 */

const RADIAL = 8;
const LIMIT = 1.66;

const BARK_VERT = /* glsl */ `
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

const BARK_FRAG = /* glsl */ `
${COMMON_GLSL}
uniform vec3 uBody;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
void main() {
    dissolve();
    vec3 n = normalize(vNormal);
    float ridges = noise2(vec2(vUv.x * 14.0, vUv.y * 1.6)) * 0.7 + noise2(vec2(vUv.x * 40.0, vUv.y * 5.0)) * 0.3;
    vec3 bark = mix(vec3(0.09, 0.06, 0.045), vec3(0.3, 0.22, 0.16), smoothstep(0.25, 0.8, ridges));
    float moss = smoothstep(0.55, 0.9, n.y + fbm2(vWorld.xz * 6.0 + vUv.y) * 0.6);
    bark = mix(bark, vec3(0.12, 0.2, 0.07), moss * 0.7);
    vec3 skyTint = mix(vec3(0.3, 0.36, 0.55), vec3(1.0, 0.9, 0.72), uDay);
    float sun = max(dot(n, uBody), 0.0);
    vec3 col = bark * (0.06 + skyTint * (0.25 + 0.75 * sun) * mix(0.5, 1.1, uDay) + lantern(vWorld, n, vec3(1.0, 0.85, 0.6) * 1.3) + tomeLight(vWorld, n));
    gl_FragColor = vec4(col * darkness(vWorld), 0.0);
}
`;

const LEAF_VERT = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vColor;
void main() {
    mat4 m = modelMatrix * instanceMatrix;
    vec4 wp = m * vec4(position, 1.0);
    vec4 origin = m * vec4(0.0, 0.0, 0.0, 1.0);
    float flutter = sin(uTime * 2.3 + origin.x * 7.0 + origin.z * 5.0) * 0.5 + sin(uTime * 0.9 + origin.y * 3.0) * 0.5;
    wp.xyz += vec3(0.012, 0.006, 0.01) * flutter * uv.y;
    vWorld = wp.xyz;
    vNormal = normalize(mat3(m) * normal);
    vUv = uv;
    vColor = vec3(0.2, 0.4, 0.15);
    #ifdef USE_INSTANCING_COLOR
        vColor = instanceColor;
    #endif
    gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const LEAF_FRAG = /* glsl */ `
${COMMON_GLSL}
uniform vec3 uBody;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vColor;
void main() {
    float x = (vUv.x - 0.5) * 2.0;
    float y = vUv.y;
    float width = pow(sin(3.14159 * y), 0.75) * (1.0 - 0.35 * y);
    if (abs(x) > width) discard;
    dissolve();
    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;
    float rib = 1.0 - smoothstep(0.0, 0.06, abs(x)) * 1.0;
    float veins = smoothstep(0.85, 1.0, sin((y - abs(x) * 0.6) * 40.0)) * 0.15;
    vec3 base = vColor * (0.85 + 0.25 * y) * (1.0 - rib * 0.25 - veins);
    vec3 skyTint = mix(vec3(0.3, 0.36, 0.55), vec3(1.0, 0.92, 0.7), uDay);
    float front = max(dot(n, uBody), 0.0);
    float back = max(dot(-n, uBody), 0.0);
    vec3 light = skyTint * (0.2 + 0.7 * front + 0.55 * back) * mix(0.45, 1.1, uDay);
    vec3 col = base * (0.05 + light + lantern(vWorld, n, vec3(1.0, 0.85, 0.6) * 1.2) + tomeLight(vWorld, n));
    gl_FragColor = vec4(col * darkness(vWorld), 0.0);
}
`;

export function createTree(room, ctx, base, { bodyDir = new THREE.Vector3(0, 1, 0), trunkHeight = 1.35, trunkRadius = 0.22, depth = 3 } = {}) {
    const rand = Math.random;
    const up = new THREE.Vector3(0, 1, 0);
    const cx = ctx.center.x;
    const cz = ctx.center.z;
    const floor = ctx.center.y;
    const top = floor + WALL_H - 0.28;
    const away = base.clone().sub(ctx.center).setY(0);
    if (away.lengthSq() < 1e-4) away.set(0, 0, 1);
    away.normalize();

    const branches = [];
    const leafSpots = [];

    /* Keep growth inside the cell, under the ceiling, and out of the column where the moon shows. */
    function confine(p) {
        p.x = cx + Math.max(-LIMIT, Math.min(LIMIT, p.x - cx));
        p.z = cz + Math.max(-LIMIT, Math.min(LIMIT, p.z - cz));
        p.y = Math.min(p.y, top);
        const dx = p.x - cx;
        const dz = p.z - cz;
        const r = Math.hypot(dx, dz);
        const clear = p.y > floor + 1.9 ? 1.0 : 0;
        if (r < clear) {
            const k = r > 1e-4 ? clear / r : 1;
            p.x = cx + (r > 1e-4 ? dx * k : away.x * clear);
            p.z = cz + (r > 1e-4 ? dz * k : away.z * clear);
        }
        return p;
    }

    function randomPerp(d) {
        const ref = Math.abs(d.y) < 0.9 ? up : new THREE.Vector3(1, 0, 0);
        return new THREE.Vector3().crossVectors(d, ref).normalize().applyAxisAngle(d, rand() * Math.PI * 2);
    }

    function grow(start, dir, length, radius, level, { tip = null, noChildren = false } = {}) {
        const segs = Math.max(3, Math.round(length / 0.11));
        const pts = [start.clone()];
        const radii = [radius];
        const end = tip ?? (level >= depth ? 0.006 : radius * 0.55);
        const d = dir.clone();
        let p = start.clone();
        for (let i = 1; i <= segs; i++) {
            d.add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.18))
                .addScaledVector(up, 0.035)
                .addScaledVector(away, 0.03)
                .normalize();
            p = confine(p.clone().addScaledVector(d, length / segs));
            pts.push(p);
            radii.push(radius + (end - radius) * (i / segs));
        }
        branches.push({ pts, radii });
        if (noChildren) return;
        if (level >= depth) {
            for (let i = Math.floor(segs * 0.3); i <= segs; i++) leafSpots.push({ p: pts[i], d: d.clone() });
            return;
        }
        if (level >= depth - 1) {
            for (let i = Math.floor(segs * 0.6); i <= segs; i++) leafSpots.push({ p: pts[i], d: d.clone() });
        }
        const count = level === 0 ? 5 : 3;
        for (let c = 0; c < count; c++) {
            const t = level === 0 ? 0.5 + 0.5 * (c / (count - 1)) : 0.35 + rand() * 0.6;
            const i = Math.min(segs, Math.round(t * segs));
            const spread = (level === 0 ? 0.75 : 0.6) + rand() * 0.35;
            const childDir = dir.clone().applyAxisAngle(randomPerp(dir), spread)
                .addScaledVector(away, 0.35).addScaledVector(up, 0.25).normalize();
            grow(pts[i], childDir, length * (0.58 + rand() * 0.18), radii[i] * 0.72, level + 1);
        }
    }

    const foot = base.clone().setY(floor - 0.05);
    grow(foot, up.clone().addScaledVector(away, 0.12).normalize(), trunkHeight, trunkRadius, 0);
    for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + rand() * 0.6;
        const out = new THREE.Vector3(Math.cos(a), -0.55, Math.sin(a)).normalize();
        grow(base.clone().setY(floor + 0.32), out, 0.5 + rand() * 0.25, trunkRadius * 0.55, depth, { tip: 0.015, noChildren: true });
    }

    /* Branch rings merged into one mesh. */
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    const N = new THREE.Vector3();
    const B = new THREE.Vector3();
    const T = new THREE.Vector3();
    for (const { pts, radii } of branches) {
        const first = positions.length / 3;
        let v = 0;
        for (let i = 0; i < pts.length; i++) {
            T.subVectors(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
            const ref = Math.abs(T.y) < 0.95 ? up : new THREE.Vector3(1, 0, 0);
            N.crossVectors(T, ref).normalize();
            B.crossVectors(T, N);
            if (i > 0) v += pts[i].distanceTo(pts[i - 1]);
            for (let j = 0; j <= RADIAL; j++) {
                const a = (j / RADIAL) * Math.PI * 2;
                const nx = N.x * Math.cos(a) + B.x * Math.sin(a);
                const ny = N.y * Math.cos(a) + B.y * Math.sin(a);
                const nz = N.z * Math.cos(a) + B.z * Math.sin(a);
                positions.push(pts[i].x + nx * radii[i], pts[i].y + ny * radii[i], pts[i].z + nz * radii[i]);
                normals.push(nx, ny, nz);
                uvs.push(j / RADIAL, v * 2);
            }
        }
        for (let i = 0; i < pts.length - 1; i++) {
            for (let j = 0; j < RADIAL; j++) {
                const a = first + i * (RADIAL + 1) + j;
                const b = a + RADIAL + 1;
                indices.push(a, b, a + 1, b, b + 1, a + 1);
            }
        }
    }
    const barkGeo = new THREE.BufferGeometry();
    barkGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    barkGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    barkGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    barkGeo.setIndex(indices);
    const barkMat = new THREE.ShaderMaterial({
        uniforms: cellUniforms(ctx, { uBody: { value: bodyDir.clone() } }),
        vertexShader: BARK_VERT,
        fragmentShader: BARK_FRAG,
    });
    room.add(barkGeo, barkMat);

    /* Leaves: several cards per spot, facing outward and up with random twist. */
    const PER_SPOT = 4;
    const leafGeo = new THREE.PlaneGeometry(1, 1);
    leafGeo.translate(0, 0.5, 0);
    const leafMat = new THREE.ShaderMaterial({
        uniforms: cellUniforms(ctx, { uBody: { value: bodyDir.clone() } }),
        vertexShader: LEAF_VERT,
        fragmentShader: LEAF_FRAG,
        side: THREE.DoubleSide,
    });
    const count = leafSpots.length * PER_SPOT;
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, count);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const hueBase = 0.23 + rand() * 0.08;
    let n = 0;
    for (const spot of leafSpots) {
        for (let k = 0; k < PER_SPOT; k++) {
            dummy.position.copy(spot.p).add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.12));
            confine(dummy.position);
            const outward = spot.d.clone().add(randomPerp(spot.d).multiplyScalar(1.2)).addScaledVector(up, 0.4).normalize();
            dummy.quaternion.setFromUnitVectors(up, outward);
            dummy.rotateY(rand() * Math.PI * 2);
            const s = 0.06 + rand() * 0.05;
            dummy.scale.set(s * 0.75, s * 1.35, s);
            dummy.updateMatrix();
            leaves.setMatrixAt(n, dummy.matrix);
            leaves.setColorAt(n, color.setHSL(hueBase + (rand() - 0.5) * 0.08, 0.45 + rand() * 0.25, 0.16 + rand() * 0.14));
            n++;
        }
    }
    leaves.frustumCulled = false;
    room.group.add(leaves);
    room.track(leafGeo, leafMat);
    return { leafCount: count, branchCount: branches.length };
}
