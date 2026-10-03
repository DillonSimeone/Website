import { THREE, WALL_H, litMaterial, makeRoom, asideSpot, sideVec } from './kit.js';

/* Brass gears turning on the walls and a pendulum swinging along a wall. */
function build(ctx) {
    const room = makeRoom();
    const brass = litMaterial(ctx, 0xb8862e, { emissive: 0.05 });
    const dark = litMaterial(ctx, 0x6a4a1a);
    const toothGeo = new THREE.BoxGeometry(1, 1, 1);
    const discGeo = new THREE.CylinderGeometry(1, 1, 0.06, 28);
    room.track(brass, dark, toothGeo, discGeo);
    const gears = [];
    ctx.solidSides.forEach((side, si) => {
        const out = sideVec(side);
        const tangent = new THREE.Vector3(-out.z, 0, out.x);
        const specs = [[-0.8, 1.7, 0.7, 1], [0.55, 2.3, 0.45, -1.55], [0.7, 1.05, 0.35, 2]];
        specs.forEach(([u, y, r, rate], gi) => {
            const gear = new THREE.Group();
            gear.position.copy(ctx.center).addScaledVector(out, 1.76 - gi * 0.02).addScaledVector(tangent, u).setY(ctx.center.y + y);
            gear.lookAt(ctx.center.x, gear.position.y, ctx.center.z);
            const spin = new THREE.Group();
            gear.add(spin);
            const disc = new THREE.Mesh(discGeo, gi % 2 ? dark : brass);
            disc.rotation.x = Math.PI / 2;
            disc.scale.set(r, 1, r);
            spin.add(disc);
            const teeth = Math.round(r * 22);
            for (let k = 0; k < teeth; k++) {
                const a = (k / teeth) * Math.PI * 2;
                const tooth = new THREE.Mesh(toothGeo, brass);
                tooth.position.set(Math.cos(a) * (r + 0.05), Math.sin(a) * (r + 0.05), 0);
                tooth.rotation.z = a;
                tooth.scale.set(0.1, 0.08, 0.07);
                spin.add(tooth);
            }
            room.group.add(gear);
            gears.push({ spin, rate: rate * (si % 2 ? -1 : 1) / r * 0.15 });
        });
    });
    const pivot = new THREE.Group();
    pivot.position.copy(asideSpot(ctx, 1.2)).setY(ctx.center.y + WALL_H - 0.1);
    pivot.rotation.y = Math.atan2(pivot.position.x - ctx.center.x, pivot.position.z - ctx.center.z);
    const rod = new THREE.Mesh(toothGeo, brass);
    rod.scale.set(0.03, 2.2, 0.03);
    rod.position.y = -1.1;
    const bob = new THREE.Mesh(discGeo, brass);
    bob.rotation.x = Math.PI / 2;
    bob.scale.set(0.22, 1, 0.22);
    bob.position.y = -2.25;
    pivot.add(rod, bob);
    room.group.add(pivot);
    room.onUpdate((t) => {
        gears.forEach(g => { g.spin.rotation.z = t * g.rate; });
        pivot.rotation.z = Math.sin(t * 2.2) * 0.35;
    });
    return room.result();
}

export default { name: 'Clockwork', square: true, build };
