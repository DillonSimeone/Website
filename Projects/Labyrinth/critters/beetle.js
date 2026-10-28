import { THREE, litMaterial, makeRoom } from '../rooms/kit.js';
import { makeClock } from '../critter.js';

/* Iridescent beetles that wander the floor, pause, twitch their antennae, and scatter when you come close. */
function build(ctx) {
    const room = makeRoom();
    const sphere = new THREE.SphereGeometry(1, 12, 8);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const legMat = litMaterial(ctx, 0x15110d);
    room.track(sphere, box, legMat);
    const clock = makeClock();

    const beetles = Array.from({ length: 3 }, () => {
        const shell = litMaterial(ctx, new THREE.Color().setHSL([0.33, 0.55, 0.08][Math.floor(Math.random() * 3)], 0.7, 0.22), { emissive: 0.08 });
        room.track(shell);
        const g = new THREE.Group();
        const body = new THREE.Mesh(sphere, shell);
        body.scale.set(0.028, 0.018, 0.04);
        body.position.y = 0.02;
        const head = new THREE.Mesh(sphere, legMat);
        head.scale.set(0.014, 0.011, 0.012);
        head.position.set(0, 0.016, 0.043);
        g.add(body, head);
        const legs = [];
        for (let i = 0; i < 6; i++) {
            const side = i < 3 ? -1 : 1;
            const pivot = new THREE.Group();
            pivot.position.set(side * 0.018, 0.014, (i % 3 - 1) * 0.02);
            const leg = new THREE.Mesh(box, legMat);
            leg.scale.set(0.035, 0.003, 0.003);
            leg.position.set(side * 0.016, -0.007, 0);
            leg.rotation.z = side * 0.45;
            pivot.add(leg);
            g.add(pivot);
            legs.push({ pivot, side, tripod: (i + (i < 3 ? 0 : 1)) % 2 });
        }
        const antennae = [-1, 1].map((side) => {
            const pivot = new THREE.Group();
            pivot.position.set(side * 0.006, 0.02, 0.052);
            const a = new THREE.Mesh(box, legMat);
            a.scale.set(0.002, 0.002, 0.03);
            a.position.z = 0.015;
            pivot.add(a);
            pivot.rotation.y = side * 0.4;
            pivot.rotation.x = -0.3;
            g.add(pivot);
            return pivot;
        });
        const pos = ctx.randomFloorPoint();
        g.position.copy(pos);
        room.group.add(g);
        return { g, legs, antennae, pos, heading: Math.random() * 6.28, target: ctx.randomFloorPoint(), pause: Math.random() * 2, gait: 0, seed: Math.random() * 50 };
    });

    const cam = new THREE.Vector3();
    room.onUpdate((t, camera) => {
        const dt = clock(t);
        if (camera) cam.copy(camera.position);
        for (const b of beetles) {
            const dCam = Math.hypot(cam.x - b.pos.x, cam.z - b.pos.z);
            const fleeing = camera && dCam < 1.0;
            if (fleeing) {
                const away = new THREE.Vector3(b.pos.x - cam.x, 0, b.pos.z - cam.z).normalize().multiplyScalar(1.2);
                b.target.copy(b.pos).add(away);
                b.target.x = ctx.center.x + Math.max(-ctx.roam, Math.min(ctx.roam, b.target.x - ctx.center.x));
                b.target.z = ctx.center.z + Math.max(-ctx.roam, Math.min(ctx.roam, b.target.z - ctx.center.z));
                b.pause = 0;
            }
            let speed = 0;
            if (b.pause > 0) {
                b.pause -= dt;
            } else {
                const to = new THREE.Vector3(b.target.x - b.pos.x, 0, b.target.z - b.pos.z);
                const dist = to.length();
                if (dist < 0.03) {
                    b.pause = 0.4 + Math.random() * 2.2;
                    b.target.copy(ctx.randomFloorPoint());
                } else {
                    const want = Math.atan2(to.x, to.z);
                    b.heading += Math.atan2(Math.sin(want - b.heading), Math.cos(want - b.heading)) * Math.min(1, dt * 6);
                    speed = fleeing ? 0.55 : 0.18;
                    b.pos.x += Math.sin(b.heading) * speed * dt;
                    b.pos.z += Math.cos(b.heading) * speed * dt;
                }
            }
            b.g.position.set(b.pos.x, ctx.floorY, b.pos.z);
            b.g.rotation.y = b.heading;
            b.gait += speed * dt * 90;
            for (const l of b.legs) {
                const swing = Math.sin(b.gait + (l.tripod ? Math.PI : 0));
                l.pivot.rotation.y = swing * 0.45 * Math.min(1, speed * 8);
                l.pivot.position.y = 0.014 + Math.max(0, swing) * 0.004 * Math.min(1, speed * 8);
            }
            b.antennae.forEach((a, i) => { a.rotation.x = -0.3 + Math.sin(t * (b.pause > 0 ? 6 : 2) + b.seed + i) * 0.25; });
        }
    });
    return room.result();
}

export default {
    name: 'Beetles',
    fits: (h) => h.floor,
    build,
};
