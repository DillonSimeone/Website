import { THREE, COMMON_GLSL, glowBlending, cellUniforms, litMaterial, makeRoom } from '../rooms/kit.js';
import { makeClock } from '../critter.js';

const TRAIL = 220;

/* A snail climbing a wall at a snail's pace, eye stalks waving, leaving a glistening trail. */
function build(ctx) {
    const room = makeRoom();
    const clock = makeClock();
    const side = ctx.solidSides[Math.floor(Math.random() * ctx.solidSides.length)];
    const { out, tangent } = ctx.wallFrame(side);
    const round = ctx.shape === 'round';
    const wallPoint = (u, h, lift = 0) => {
        if (round) {
            const a = Math.atan2(out.z, out.x) + u / ctx.wall;
            const r = ctx.wall - lift;
            return new THREE.Vector3(ctx.center.x + Math.cos(a) * r, ctx.floorY + h, ctx.center.z + Math.sin(a) * r);
        }
        return ctx.center.clone().addScaledVector(out, ctx.wall - lift).addScaledVector(tangent, u).setY(ctx.floorY + h);
    };
    const normalAt = (u) => (round ? new THREE.Vector3(-Math.cos(Math.atan2(out.z, out.x) + u / ctx.wall), 0, -Math.sin(Math.atan2(out.z, out.x) + u / ctx.wall)) : out.clone().negate());

    const shellMat = litMaterial(ctx, 0x7a4a24, { emissive: 0.05 });
    const bandMat = litMaterial(ctx, 0xc9a06a);
    const skinMat = litMaterial(ctx, 0x9a9a82);
    const torus = new THREE.TorusGeometry(1, 0.42, 8, 16);
    const sphere = new THREE.SphereGeometry(1, 10, 8);
    const capsule = new THREE.CapsuleGeometry(1, 1, 3, 8);
    room.track(shellMat, bandMat, skinMat, torus, sphere, capsule);

    const snail = new THREE.Group();
    const body = new THREE.Mesh(capsule, skinMat);
    body.scale.set(0.011, 0.045, 0.009);
    body.rotation.x = Math.PI / 2;
    body.position.set(0, 0.008, 0.01);
    const shell = new THREE.Group();
    const coil1 = new THREE.Mesh(torus, shellMat);
    coil1.scale.setScalar(0.017);
    const coil2 = new THREE.Mesh(torus, bandMat);
    coil2.scale.setScalar(0.009);
    coil2.position.x = 0.004;
    const core = new THREE.Mesh(sphere, shellMat);
    core.scale.setScalar(0.009);
    shell.add(coil1, coil2, core);
    shell.rotation.y = Math.PI / 2;
    shell.position.set(0, 0.024, -0.008);
    snail.add(body, shell);
    const stalks = [-1, 1].map((s) => {
        const pivot = new THREE.Group();
        pivot.position.set(s * 0.004, 0.012, 0.038);
        const stalk = new THREE.Mesh(capsule, skinMat);
        stalk.scale.set(0.0015, 0.008, 0.0015);
        stalk.position.y = 0.01;
        const eye = new THREE.Mesh(sphere, shellMat);
        eye.scale.setScalar(0.0025);
        eye.position.y = 0.02;
        pivot.add(stalk, eye);
        snail.add(pivot);
        return pivot;
    });
    room.group.add(snail);

    const trailGeo = new THREE.BufferGeometry();
    const trailPos = new Float32Array(TRAIL * 3);
    const trailAge = new Float32Array(TRAIL);
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    trailGeo.setAttribute('aAge', new THREE.BufferAttribute(trailAge, 1));
    trailGeo.setDrawRange(0, 0);
    const trailMat = glowBlending(new THREE.ShaderMaterial({
        uniforms: cellUniforms(ctx),
        vertexShader: /* glsl */ `
            attribute float aAge;
            varying vec3 vWorld;
            varying float vAge;
            void main() {
                vec4 wp = modelMatrix * vec4(position, 1.0);
                vWorld = wp.xyz;
                vAge = aAge;
                gl_Position = projectionMatrix * viewMatrix * wp;
            }`,
        fragmentShader: /* glsl */ `
            ${COMMON_GLSL}
            varying vec3 vWorld;
            varying float vAge;
            void main() {
                float sheen = 0.5 + 0.5 * sin(vWorld.y * 60.0 + uTime * 0.5);
                gl_FragColor = vec4(vec3(0.7, 0.75, 0.8) * (0.08 + 0.12 * sheen) * (1.0 - vAge) * uFade * darkness(vWorld), 0.0);
            }`,
    }));
    const trail = new THREE.Line(trailGeo, trailMat);
    trail.frustumCulled = false;
    room.group.add(trail);
    room.track(trailGeo, trailMat);

    const limitU = (round ? ctx.wallSpan * ctx.wall : ctx.wallSpan) * 0.85;
    let u = (Math.random() - 0.5) * limitU;
    let h = 0.3 + Math.random() * 0.6;
    let heading = 0.2 + Math.random() * 0.4;
    const points = [];
    room.onUpdate((t) => {
        const dt = clock(t);
        const speed = 0.022 * (0.6 + 0.4 * Math.sin(t * 0.8));
        heading += Math.sin(t * 0.21 + u) * 0.25 * dt;
        const toward = (want) => { heading += Math.atan2(Math.sin(want - heading), Math.cos(want - heading)) * Math.min(1, dt * 0.8); };
        if (u > limitU) toward(Math.PI);
        else if (u < -limitU) toward(0);
        if (h > ctx.ceilingY - ctx.floorY - 0.35) toward(-Math.PI / 2);
        else if (h < 0.15) toward(Math.PI / 2);
        u += Math.cos(heading) * speed * dt;
        h += Math.sin(heading) * speed * dt;
        const p = wallPoint(u, h, 0.012);
        const n = normalAt(u);
        const dir = wallPoint(u + Math.cos(heading) * 0.01, h + Math.sin(heading) * 0.01, 0.012).sub(p).normalize();
        snail.position.copy(p);
        snail.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(n, dir), n, dir));
        stalks.forEach((s, i) => { s.rotation.x = 0.3 + Math.sin(t * 1.3 + i) * 0.25; s.rotation.z = (i ? -1 : 1) * (0.25 + Math.sin(t * 0.9 + i * 2) * 0.1); });
        const last = points[points.length - 1];
        if (!last || last.distanceTo(p) > 0.006) {
            points.push(wallPoint(u, h, 0.004));
            if (points.length > TRAIL) points.shift();
            points.forEach((q, i) => {
                trailPos.set([q.x, q.y, q.z], i * 3);
                trailAge[i] = 1 - i / points.length;
            });
            trailGeo.attributes.position.needsUpdate = true;
            trailGeo.attributes.aAge.needsUpdate = true;
            trailGeo.setDrawRange(0, points.length);
        }
    });
    return room.result();
}

export default {
    name: 'Snail',
    fits: (h) => h.walls,
    build,
};
