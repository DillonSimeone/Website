import { THREE, litMaterial, makeRoom } from '../rooms/kit.js';
import { makeClock } from '../critter.js';

const SEGMENTS = 16;
const SPACING = 0.026;
const STEP = 0.008;

/* Earthworms that crawl across the floor in wavering lines, then dive through it and surface elsewhere. */
function build(ctx) {
    const room = makeRoom();
    const geo = new THREE.SphereGeometry(1, 8, 6);
    const mat = litMaterial(ctx, 0xffffff);
    room.track(geo, mat);
    const clock = makeClock();
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    const worms = Array.from({ length: 2 }, () => {
        const mesh = new THREE.InstancedMesh(geo, mat, SEGMENTS);
        mesh.frustumCulled = false;
        for (let i = 0; i < SEGMENTS; i++) mesh.setColorAt(i, color.setHSL(0.99, 0.35, (i % 3 === 0 ? 0.38 : 0.45) - i * 0.006));
        room.group.add(mesh);
        const head = ctx.randomFloorPoint();
        const heading = Math.random() * Math.PI * 2;
        const trail = [];
        for (let i = SEGMENTS * SPACING / STEP + 2; i >= 0; i--) {
            trail.push(head.clone().add(new THREE.Vector3(-Math.cos(heading), 0, -Math.sin(heading)).multiplyScalar(i * STEP)));
        }
        return { mesh, head, heading, trail, phase: 'crawl', timer: 6 + Math.random() * 10, seed: Math.random() * 100, depth: 0 };
    });

    room.onUpdate((t) => {
        const dt = clock(t);
        for (const w of worms) {
            w.timer -= dt;
            if (w.phase === 'crawl' && w.timer <= 0) { w.phase = 'dive'; w.timer = 2.5; }
            else if (w.phase === 'dive' && w.timer <= 0) {
                w.phase = 'hidden';
                w.timer = 2 + Math.random() * 4;
            } else if (w.phase === 'hidden' && w.timer <= 0) {
                w.head.copy(ctx.randomFloorPoint()).setY(ctx.floorY - 0.08);
                w.heading = Math.random() * Math.PI * 2;
                w.trail.length = 0;
                for (let i = SEGMENTS * SPACING / STEP + 2; i >= 0; i--) w.trail.push(w.head.clone().setY(ctx.floorY - 0.08 - i * 0.002));
                w.phase = 'emerge';
                w.timer = 2.5;
            } else if (w.phase === 'emerge' && w.timer <= 0) { w.phase = 'crawl'; w.timer = 10 + Math.random() * 12; }

            if (w.phase === 'hidden') { w.mesh.visible = false; continue; }
            w.mesh.visible = true;
            const speed = 0.05 * (0.6 + 0.4 * Math.sin(t * 3.1 + w.seed));
            w.heading += (Math.sin(t * 0.7 + w.seed) * 0.9 + Math.sin(t * 1.9 + w.seed * 2.0) * 0.5) * dt;
            const dx = w.head.x - ctx.center.x;
            const dz = w.head.z - ctx.center.z;
            if (Math.max(Math.abs(dx), Math.abs(dz)) > ctx.roam) {
                const toward = Math.atan2(-dz, -dx);
                w.heading += Math.atan2(Math.sin(toward - w.heading), Math.cos(toward - w.heading)) * Math.min(1, dt * 2);
            }
            w.head.x += Math.cos(w.heading) * speed * dt;
            w.head.z += Math.sin(w.heading) * speed * dt;
            const target = w.phase === 'dive' ? ctx.floorY - 0.08 : w.phase === 'emerge' ? ctx.floorY + 0.012 : ctx.floorY + 0.012;
            w.head.y += (target - w.head.y) * Math.min(1, dt * (w.phase === 'crawl' ? 4 : 1.2));
            if (w.head.distanceTo(w.trail[w.trail.length - 1]) > STEP) {
                w.trail.push(w.head.clone());
                if (w.trail.length > SEGMENTS * SPACING / STEP + 4) w.trail.shift();
            }
            for (let i = 0; i < SEGMENTS; i++) {
                const idx = Math.max(0, w.trail.length - 1 - Math.round(i * SPACING / STEP));
                const p = w.trail[idx];
                const squeeze = 1 + 0.25 * Math.sin(t * 7 - i * 0.7 + w.seed);
                const r = 0.013 * (1 - i / (SEGMENTS * 1.6)) * (i === 0 ? 0.85 : 1);
                dummy.position.copy(p);
                dummy.scale.set(r / squeeze, r / squeeze, r / squeeze);
                dummy.scale.x = r * squeeze;
                dummy.updateMatrix();
                w.mesh.setMatrixAt(i, dummy.matrix);
            }
            w.mesh.instanceMatrix.needsUpdate = true;
        }
    });
    return room.result();
}

export default {
    name: 'Earthworms',
    fits: (h) => h.floor,
    build,
};
