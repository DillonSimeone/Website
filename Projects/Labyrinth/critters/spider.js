import { THREE, COMMON_GLSL, glowBlending, cellUniforms, litMaterial, makeRoom } from '../rooms/kit.js';
import { makeClock } from '../critter.js';

/* A web strung across the edge between a wall and the ceiling; its spider lowers itself on a thread, dangles, and climbs back. */
function build(ctx) {
    const room = makeRoom();
    const clock = makeClock();
    const side = ctx.solidSides[Math.floor(Math.random() * ctx.solidSides.length)];
    const { out, tangent } = ctx.wallFrame(side);
    const up = new THREE.Vector3(0, 1, 0);
    const edge = ctx.center.clone().addScaledVector(out, ctx.wall).setY(ctx.ceilingY);
    const along = (Math.random() - 0.5) * Math.max(0, (ctx.shape === 'round' ? 0.6 : ctx.wallSpan) - 0.75) * 2;
    const hub = edge.clone().addScaledVector(tangent, along).addScaledVector(out, -0.3).addScaledVector(up, -0.3);
    const v = up.clone().sub(out).normalize();

    /* Web: radial threads and a spiral, drawn as faint glowing lines. */
    const webPts = [];
    const RADIALS = 14;
    const reachOf = (a) => {
        const c = Math.cos(a), s = Math.sin(a);
        return Math.min(0.75 / Math.max(Math.abs(c), 0.01), 0.42 / Math.max(Math.abs(s), 0.01), 0.75);
    };
    const pointAt = (a, r) => hub.clone().addScaledVector(tangent, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r);
    for (let i = 0; i < RADIALS; i++) {
        const a = (i / RADIALS) * Math.PI * 2;
        webPts.push(hub, pointAt(a, reachOf(a)));
    }
    let prev = null;
    for (let k = 0; k <= RADIALS * 7; k++) {
        const a = (k / RADIALS) * Math.PI * 2;
        const r = 0.05 + (k / (RADIALS * 7)) * 0.95 * reachOf(a);
        const p = pointAt(a, Math.min(r, reachOf(a) * 0.96));
        if (prev) webPts.push(prev, p);
        prev = p;
    }
    const webGeo = new THREE.BufferGeometry().setFromPoints(webPts);
    const threadMat = glowBlending(new THREE.ShaderMaterial({
        uniforms: cellUniforms(ctx),
        vertexShader: /* glsl */ `
            varying vec3 vWorld;
            void main() {
                vec4 wp = modelMatrix * vec4(position, 1.0);
                vWorld = wp.xyz;
                gl_Position = projectionMatrix * viewMatrix * wp;
            }`,
        fragmentShader: /* glsl */ `
            ${COMMON_GLSL}
            varying vec3 vWorld;
            void main() {
                float d = length(vWorld - uCam);
                float glint = 0.6 + 0.4 * sin(vWorld.x * 40.0 + vWorld.y * 30.0 + uTime * 0.8);
                gl_FragColor = vec4(vec3(0.75, 0.78, 0.85) * glint * 0.35 / (1.0 + d * d * 0.25) * uFade * darkness(vWorld), 0.0);
            }`,
    }));
    const web = new THREE.LineSegments(webGeo, threadMat);
    web.frustumCulled = false;
    room.group.add(web);
    room.track(webGeo, threadMat);

    /* The spider: two body parts and eight jointed legs. */
    const sphere = new THREE.SphereGeometry(1, 10, 8);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const black = litMaterial(ctx, 0x0d0b0a);
    const mark = litMaterial(ctx, 0x8a1a12, { emissive: 0.2 });
    room.track(sphere, box, black, mark);
    const spider = new THREE.Group();
    const body = new THREE.Mesh(sphere, black);
    body.scale.set(0.016, 0.013, 0.018);
    const abdomen = new THREE.Mesh(sphere, black);
    abdomen.scale.set(0.024, 0.022, 0.03);
    abdomen.position.set(0, 0.012, -0.035);
    const spot = new THREE.Mesh(sphere, mark);
    spot.scale.set(0.008, 0.004, 0.012);
    spot.position.set(0, 0.033, -0.036);
    spider.add(body, abdomen, spot);
    const legs = [];
    for (let i = 0; i < 8; i++) {
        const sideSign = i < 4 ? -1 : 1;
        const hip = new THREE.Group();
        hip.position.set(sideSign * 0.01, 0, (i % 4 - 1.5) * 0.008);
        hip.rotation.y = sideSign * ((i % 4 - 1.5) * 0.45);
        const upper = new THREE.Mesh(box, black);
        upper.scale.set(0.028, 0.0025, 0.0025);
        upper.position.set(sideSign * 0.013, 0.008, 0);
        upper.rotation.z = sideSign * 0.6;
        const knee = new THREE.Group();
        knee.position.set(sideSign * 0.024, 0.016, 0);
        const lower = new THREE.Mesh(box, black);
        lower.scale.set(0.034, 0.002, 0.002);
        lower.position.set(sideSign * 0.012, -0.012, 0);
        lower.rotation.z = -sideSign * 0.9;
        knee.add(lower);
        hip.add(upper, knee);
        spider.add(hip);
        legs.push({ hip, knee, sideSign, seed: Math.random() * 10 });
    }
    room.group.add(spider);

    const threadGeo = new THREE.BufferGeometry().setFromPoints([hub, hub]);
    const thread = new THREE.Line(threadGeo, threadMat);
    thread.frustumCulled = false;
    room.group.add(thread);
    room.track(threadGeo);

    const low = Math.max(ctx.floorY + 0.9, hub.y - 1.8);
    let phase = 'rest';
    let timer = 3 + Math.random() * 5;
    let drop = 0;
    let goal = 0;
    room.onUpdate((t, camera) => {
        const dt = clock(t);
        timer -= dt;
        const near = camera && Math.hypot(camera.position.x - hub.x, camera.position.z - hub.z) < 0.7;
        if (near && phase !== 'rest') phase = 'climb';
        if (phase === 'rest' && timer <= 0) { phase = 'descend'; goal = (hub.y - low) * (0.5 + Math.random() * 0.5); }
        if (phase === 'descend') {
            drop += (0.12 + 0.1 * Math.max(0, Math.sin(t * 2.3))) * dt;
            if (drop >= goal) { drop = goal; phase = 'dangle'; timer = 4 + Math.random() * 6; }
        } else if (phase === 'dangle' && timer <= 0) {
            phase = 'climb';
        } else if (phase === 'climb') {
            drop -= (near ? 0.5 : 0.15) * dt;
            if (drop <= 0) { drop = 0; phase = 'rest'; timer = 5 + Math.random() * 10; }
        }
        const sway = phase === 'rest' ? 0 : Math.min(1, drop * 2);
        const p = hub.clone().setY(hub.y - drop);
        p.addScaledVector(tangent, Math.sin(t * 0.9) * 0.02 * sway);
        spider.position.copy(p);
        if (phase === 'rest') {
            spider.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), out.clone().negate().add(v).normalize());
        } else {
            spider.rotation.set(-Math.PI / 2, t * 0.3 * sway, 0);
        }
        const pos = threadGeo.attributes.position;
        pos.setXYZ(1, p.x, p.y + 0.01, p.z);
        pos.needsUpdate = true;
        thread.visible = drop > 0.01;
        const twitch = phase === 'dangle' ? 1 : phase === 'rest' ? 0.15 : 0.5;
        legs.forEach((l) => {
            l.knee.rotation.z = l.sideSign * Math.sin(t * 9 + l.seed) * 0.25 * twitch;
        });
    });
    return room.result();
}

export default {
    name: 'Spider',
    fits: (h) => h.ceiling && h.walls,
    build,
};
