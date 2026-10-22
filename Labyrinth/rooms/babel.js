import { THREE, MASK, litMaterial, makeRoom, sideVec } from './kit.js';

/* Bookshelves on every solid wall, drawn in the library's amber glyphs. */
function build(ctx) {
    const room = makeRoom();
    const boardMat = litMaterial(ctx, 0x5a3a1c, { mask: MASK.ascii });
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const bookMat = litMaterial(ctx, 0xffffff, { mask: MASK.ascii });
    room.track(boardMat, boxGeo, bookMat);
    const books = new THREE.InstancedMesh(boxGeo, bookMat, 400);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let count = 0;
    for (const side of ctx.solidSides) {
        const out = sideVec(side);
        const tangent = new THREE.Vector3(-out.z, 0, out.x);
        const yaw = Math.atan2(out.x, out.z);
        for (let s = 0; s < 5; s++) {
            const y = ctx.center.y + 0.3 + s * 0.6;
            const board = new THREE.Mesh(boxGeo, boardMat);
            board.position.copy(ctx.center).addScaledVector(out, 1.62).setY(y - 0.02);
            board.rotation.y = yaw;
            board.scale.set(3.5, 0.04, 0.36);
            room.group.add(board);
            let u = -1.7;
            while (u < 1.65 && count < 400) {
                const t = 0.06 + Math.random() * 0.08;
                const h = 0.34 + Math.random() * 0.18;
                dummy.position.copy(ctx.center).addScaledVector(out, 1.64).addScaledVector(tangent, u + t / 2).setY(y + h / 2);
                dummy.rotation.set(0, yaw, 0);
                dummy.scale.set(t, h, 0.3);
                dummy.updateMatrix();
                books.setMatrixAt(count, dummy.matrix);
                books.setColorAt(count, color.setHSL(Math.random() < 0.5 ? 0.07 : Math.random(), 0.45, 0.2 + Math.random() * 0.25));
                count++;
                u += t + 0.005;
            }
        }
    }
    books.count = count;
    books.frustumCulled = false;
    room.group.add(books);
    return room.result();
}

export default { name: 'Babel fragment', square: true, build };
