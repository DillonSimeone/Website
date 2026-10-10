import { THREE, litMaterial, makeRoom } from '../rooms/kit.js';
import { makeClock } from '../critter.js';

/* Moths drawn to your lantern: they flutter just ahead of you while you are in their cell, and circle idly when you are not. */
function build(ctx) {
    const room = makeRoom();
    const clock = makeClock();
    const bodyGeo = new THREE.CapsuleGeometry(0.004, 0.018, 2, 6);
    const wingGeo = new THREE.PlaneGeometry(0.03, 0.022);
    wingGeo.translate(0.015, 0, 0);
    const bodyMat = litMaterial(ctx, 0x6b5a45);
    const wingMat = litMaterial(ctx, 0xd8cba8, { emissive: 0.15 });
    room.track(bodyGeo, wingGeo, bodyMat, wingMat);

    const moths = Array.from({ length: 3 }, () => {
        const g = new THREE.Group();
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.rotation.x = Math.PI / 2;
        const left = new THREE.Mesh(wingGeo, wingMat);
        const right = new THREE.Mesh(wingGeo, wingMat);
        right.scale.x = -1;
        left.rotation.x = right.rotation.x = -Math.PI / 2;
        const lw = new THREE.Group();
        const rw = new THREE.Group();
        lw.add(left);
        rw.add(right);
        g.add(body, lw, rw);
        const pos = ctx.center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 1.6 + Math.random(), (Math.random() - 0.5) * 2));
        g.position.copy(pos);
        room.group.add(g);
        return { g, lw, rw, pos, vel: new THREE.Vector3(), seed: Math.random() * 100 };
    });

    const target = new THREE.Vector3();
    const forward = new THREE.Vector3();
    room.onUpdate((t, camera) => {
        const dt = clock(t);
        const inCell = camera && Math.max(Math.abs(camera.position.x - ctx.center.x), Math.abs(camera.position.z - ctx.center.z)) < 2.1;
        moths.forEach((m, i) => {
            if (inCell) {
                camera.getWorldDirection(forward);
                target.copy(camera.position).addScaledVector(forward, 0.75).add(new THREE.Vector3(0, 0.25, 0));
            } else {
                const a = t * 0.6 + i * 2.1;
                target.set(ctx.center.x + Math.cos(a) * 0.6, ctx.floorY + 2.1, ctx.center.z + Math.sin(a) * 0.6);
            }
            const jitter = new THREE.Vector3(Math.sin(t * 7.3 + m.seed), Math.sin(t * 9.1 + m.seed * 2), Math.cos(t * 6.7 + m.seed)).multiplyScalar(1.6);
            m.vel.addScaledVector(target.clone().sub(m.pos), dt * 2.2).addScaledVector(jitter, dt);
            m.vel.multiplyScalar(Math.pow(0.35, dt));
            if (m.vel.length() > 0.9) m.vel.setLength(0.9);
            m.pos.addScaledVector(m.vel, dt);
            m.pos.x = ctx.center.x + Math.max(-1.6, Math.min(1.6, m.pos.x - ctx.center.x));
            m.pos.z = ctx.center.z + Math.max(-1.6, Math.min(1.6, m.pos.z - ctx.center.z));
            m.pos.y = Math.max(ctx.floorY + 0.3, Math.min(ctx.ceilingY - 0.15, m.pos.y));
            m.g.position.copy(m.pos);
            if (m.vel.lengthSq() > 1e-5) m.g.rotation.y = Math.atan2(m.vel.x, m.vel.z);
            const flap = Math.sin(t * 38 + m.seed) * 0.9;
            m.lw.rotation.z = flap;
            m.rw.rotation.z = -flap;
        });
    });
    return room.result();
}

export default {
    name: 'Moths',
    fits: () => true,
    build,
};
