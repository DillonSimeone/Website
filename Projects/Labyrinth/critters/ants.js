import { THREE, litMaterial, makeRoom } from '../rooms/kit.js';

const ANTS = 22;

/* A column of ants marching both ways along the foot of a wall, between two cracks. */
function build(ctx) {
    const room = makeRoom();
    const side = ctx.solidSides[Math.floor(Math.random() * ctx.solidSides.length)];
    const { out, tangent } = ctx.wallFrame(side);
    const round = ctx.shape === 'round';
    const span = ctx.wallSpan;
    const lane = ctx.wall - 0.035;

    /* Position along the track (s from -1 to 1) and the direction of travel there. */
    const track = (s, offset) => {
        if (round) {
            const base = Math.atan2(out.z, out.x);
            const a = base + s * span;
            const r = lane - offset;
            return {
                p: new THREE.Vector3(ctx.center.x + Math.cos(a) * r, ctx.floorY, ctx.center.z + Math.sin(a) * r),
                dir: new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)),
            };
        }
        return {
            p: ctx.center.clone().addScaledVector(out, lane - offset).addScaledVector(tangent, s * span).setY(ctx.floorY),
            dir: tangent.clone(),
        };
    };

    const sphere = new THREE.SphereGeometry(1, 6, 5);
    const mat = litMaterial(ctx, 0x2a120a, { emissive: 0.05 });
    const holeMat = litMaterial(ctx, 0x000000);
    const holeGeo = new THREE.CircleGeometry(0.025, 10);
    room.track(sphere, mat, holeMat, holeGeo);
    for (const s of [-1.05, 1.05]) {
        const { p } = track(s, -0.03);
        const hole = new THREE.Mesh(holeGeo, holeMat);
        hole.position.copy(p).setY(ctx.floorY + 0.012);
        hole.lookAt(ctx.center.x, ctx.floorY + 0.012, ctx.center.z);
        room.group.add(hole);
    }

    const parts = new THREE.InstancedMesh(sphere, mat, ANTS * 3);
    parts.frustumCulled = false;
    room.group.add(parts);
    const ants = Array.from({ length: ANTS }, (_, i) => ({
        s0: Math.random(),
        dir: i % 2 ? 1 : -1,
        speed: 0.05 + Math.random() * 0.02,
        seed: Math.random() * 20,
    }));
    const dummy = new THREE.Object3D();
    const shapes = [[0.006, 0.005, 0.007, 0.011], [0.004, 0.004, 0.006, 0.0], [0.007, 0.006, 0.009, -0.013]];
    room.onUpdate((t) => {
        ants.forEach((a, i) => {
            const u = (a.s0 + t * a.speed / (span * 2)) % 1;
            const s = a.dir > 0 ? u * 2.1 - 1.05 : 1.05 - u * 2.1;
            const offset = (a.dir > 0 ? 0.0 : 0.025) + Math.sin(t * 5 + a.seed) * 0.004;
            const { p, dir } = track(s, offset);
            const heading = Math.atan2(dir.x, dir.z) + (a.dir > 0 ? 0 : Math.PI) + Math.sin(t * 8 + a.seed) * 0.15;
            const visible = Math.abs(s) < 1.0;
            shapes.forEach(([sx, sy, sz, along], k) => {
                dummy.position.set(p.x + Math.sin(heading) * along, ctx.floorY + 0.006, p.z + Math.cos(heading) * along);
                dummy.rotation.set(0, heading, 0);
                dummy.scale.set(sx, sy, sz).multiplyScalar(visible ? 1 : 0);
                dummy.updateMatrix();
                parts.setMatrixAt(i * 3 + k, dummy.matrix);
            });
        });
        parts.instanceMatrix.needsUpdate = true;
    });
    return room.result();
}

export default {
    name: 'Ant trail',
    fits: (h) => h.floor && h.walls,
    build,
};
