import { THREE, WALL_H, litMaterial, makeRoom, asideSpot } from './kit.js';

/* A furnished parlour stuck to the ceiling; a single lamp stands on the floor, pointing up at it. */
function build(ctx) {
    const room = makeRoom();
    const wood = litMaterial(ctx, 0x6b3f22);
    const cloth = litMaterial(ctx, 0x7a1f2a);
    const brass = litMaterial(ctx, 0xc9a24a, { emissive: 0.1 });
    const shade = litMaterial(ctx, 0xffe0a0, { emissive: 1.4 });
    const box = new THREE.BoxGeometry(1, 1, 1);
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 10);
    const cone = new THREE.CylinderGeometry(0.1, 0.25, 0.3, 12, 1, true);
    room.track(wood, cloth, brass, shade, box, cyl, cone);
    const top = ctx.center.y + WALL_H;
    const at = asideSpot(ctx, 1.05);
    const out = at.clone().sub(ctx.center).setY(0).normalize();
    const tangent = new THREE.Vector3(-out.z, 0, out.x);
    const yaw = Math.atan2(out.x, out.z);
    /* x runs along the wall, y hangs down from the ceiling, z points toward the wall. */
    const put = (geo, mat, x, y, z, sx, sy, sz) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.copy(at).addScaledVector(tangent, x).addScaledVector(out, z).setY(top - y);
        m.rotation.y = yaw;
        m.scale.set(sx, sy, sz);
        room.group.add(m);
        return m;
    };
    put(cyl, cloth, 0, 0.01, 0, 1.0, 0.02, 1.0);
    put(box, wood, 0, 0.75, 0, 0.9, 0.05, 0.6);
    [[-0.4, -0.25], [0.4, -0.25], [-0.4, 0.25], [0.4, 0.25]].forEach(([x, z]) => put(box, wood, x, 0.37, z, 0.05, 0.72, 0.05));
    [[-0.75, 0], [0.75, 0]].forEach(([x, z]) => {
        put(box, wood, x, 0.45, z, 0.4, 0.05, 0.4);
        [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]].forEach(([lx, lz]) => put(box, wood, x + lx, 0.22, z + lz, 0.04, 0.45, 0.04));
        put(box, wood, x + (x < 0 ? -0.18 : 0.18), 0.8, z, 0.04, 0.7, 0.4);
    });
    put(cyl, brass, 0, 0.9, 0, 0.03, 0.3, 0.03);
    const cup = put(cyl, brass, 0, 1.08, 0, 0.12, 0.06, 0.12);
    cup.scale.y = 0.06;
    const lamp = new THREE.Mesh(cyl, brass);
    lamp.position.copy(ctx.center).lerp(at, 1.3).setY(ctx.center.y + 0.75);
    lamp.scale.set(0.03, 1.5, 0.03);
    room.group.add(lamp);
    const lampShade = new THREE.Mesh(cone, shade);
    lampShade.position.copy(lamp.position).setY(ctx.center.y + 1.55);
    room.group.add(lampShade);
    room.onUpdate((t) => { lampShade.rotation.y = Math.sin(t * 0.3) * 0.2; });
    return room.result();
}

export default { name: 'The upside-down parlour', build };
