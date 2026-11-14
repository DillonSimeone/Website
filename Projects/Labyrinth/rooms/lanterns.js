import { THREE, WALL_H, litMaterial, glowSprite, makeRoom } from './kit.js';

/* Paper lanterns drifting up through the room and vanishing into the ceiling. */
function build(ctx) {
    const room = makeRoom();
    const geo = new THREE.CylinderGeometry(0.13, 0.11, 0.3, 8);
    const mat = litMaterial(ctx, 0xffa24a, { emissive: 1.3 });
    room.track(geo, mat);
    const COUNT = 34;
    const lanterns = new THREE.InstancedMesh(geo, mat, COUNT);
    lanterns.frustumCulled = false;
    const seeds = Array.from({ length: COUNT }, () => {
        let x, z;
        do { x = (Math.random() * 2 - 1) * 1.6; z = (Math.random() * 2 - 1) * 1.6; } while (Math.abs(x) < 0.5 && Math.abs(z) < 0.5);
        return { x, z, speed: 0.12 + Math.random() * 0.15, phase: Math.random(), wobble: Math.random() * 6 };
    });
    const color = new THREE.Color();
    seeds.forEach((s, i) => lanterns.setColorAt(i, color.setHSL(0.03 + Math.random() * 0.1, 0.9, 0.55)));
    room.group.add(lanterns);
    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    const glowSeeds = new Float32Array(COUNT * 4).map(() => Math.random());
    glowGeo.setAttribute('aSeed', new THREE.BufferAttribute(glowSeeds, 4));
    const halos = new THREE.Points(glowGeo, glowSprite(ctx, 0xffb060, 2.2, 0));
    halos.frustumCulled = false;
    room.group.add(halos);
    room.track(glowGeo, halos.material);
    const dummy = new THREE.Object3D();
    room.onUpdate((t) => {
        const pos = glowGeo.attributes.position;
        seeds.forEach((s, i) => {
            const life = (s.phase + t * s.speed * 0.3) % 1;
            const y = ctx.center.y + 0.2 + life * (WALL_H - 0.2);
            const x = ctx.center.x + s.x + Math.sin(t * 0.5 + s.wobble) * 0.1;
            const z = ctx.center.z + s.z + Math.cos(t * 0.4 + s.wobble) * 0.1;
            dummy.position.set(x, y, z);
            dummy.rotation.set(Math.sin(t + s.wobble) * 0.1, t * 0.2 + s.wobble, 0);
            dummy.scale.setScalar(Math.sin(life * Math.PI) * 1.1);
            dummy.updateMatrix();
            lanterns.setMatrixAt(i, dummy.matrix);
            pos.setXYZ(i, x, y, z);
        });
        lanterns.instanceMatrix.needsUpdate = true;
        pos.needsUpdate = true;
    });
    return room.result();
}

export default { name: 'Lantern ascent', build };
