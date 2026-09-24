import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { CELL, LEVEL, WALL_H, WALL_T, DOOR_W, DOOR_H, STUB_DEPTH, DIRS, opposite, dirVec } from './grid.js';
import { createCellMaterial } from './styles/index.js';
import { ROOM_TYPES, createRoom } from './rooms/index.js';
import { SHAPES, RAISE } from './shapes.js';
import { createTome } from './tomes.js';
import { CRITTERS, createCritter } from './critter.js';

/* Geometry shared by every cell; dispose once when the labyrinth closes. */
export function createBuildKit() {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const dome = new THREE.SphereGeometry(1, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const vault = new THREE.CylinderGeometry(CELL / 2, CELL / 2, CELL, 16, 1, true, -Math.PI / 2, Math.PI);
    vault.rotateX(-Math.PI / 2);
    return {
        box, dome, vault,
        dispose() { box.dispose(); dome.dispose(); vault.dispose(); },
    };
}

/* The shape a cell actually gets once its kind and room are known. */
export function effectiveShape(cell) {
    const spec = cell.room ? ROOM_TYPES[cell.room] : {};
    const shape = SHAPES[cell.shape] ? cell.shape : 'square';
    if (cell.kind === 'stairs' || spec.square) return 'square';
    if (SHAPES[shape].plainOnly && cell.room) return 'square';
    if (SHAPES[shape].needsRoof && spec.skyCeiling) return 'square';
    return shape;
}

/**
 * Builds one cell: slabs, walls with doorways, side passages, stairs, its shape, room and tome.
 * cell: { gx, gz, lvl, exitLvl, inDir, outDir, kind, rise, stubs, room, shape, style, styleFrom,
 *         fade (uniform), tomeSide, tomeBook, critter }. Sets cell.windowSide.
 * Returns { group, update(t, camera), dispose() }.
 */
export function buildCell(cell, { U, kit, hideCeiling = false }) {
    const X = cell.gx * CELL;
    const Z = cell.gz * CELL;
    const y0 = Math.min(cell.lvl, cell.exitLvl) * LEVEL;
    const center = new THREE.Vector3(X, y0, Z);
    const entrySide = opposite(cell.inDir);
    const spec = cell.room ? ROOM_TYPES[cell.room] : {};
    const isDoor = (s) => s === entrySide || s === cell.outDir || cell.stubs.includes(s);
    const solidSides = [0, 1, 2, 3].filter(s => !isDoor(s));
    const windowSide = spec.window ? solidSides[Math.floor(Math.random() * solidSides.length)] : null;
    cell.windowSide = windowSide;
    const cellCenter = { value: center.clone() };

    const shapeKey = effectiveShape(cell);
    const shape = SHAPES[shapeKey];
    cell.builtShape = shapeKey;
    const raised = !!shape.raised && !spec.skyCeiling;
    const total = cell.kind === 'stairs' ? LEVEL + WALL_H : WALL_H + (raised ? RAISE : 0);

    const material = createCellMaterial(U, {
        styleA: cell.styleFrom,
        styleB: cell.style,
        blendOrigin: center.clone().addScaledVector(dirVec(entrySide), CELL / 2),
        blendDir: dirVec(cell.inDir),
        center,
        fade: cell.fade,
    });

    const parts = [];
    const put = (x, y, z, sx, sy, sz, rotY = 0) => parts.push([x, y, z, sx, sy, sz, rotY]);

    if (!spec.noFloor) put(X, y0 - 0.1, Z, CELL, 0.2, CELL);
    if (!spec.skyCeiling && !hideCeiling) put(X, y0 + total + 0.1, Z, CELL, 0.2, CELL);

    const doorFloor = (side) => {
        if (cell.kind !== 'stairs') return 0;
        const atTop = side === entrySide ? cell.rise < 0 : cell.rise > 0;
        return atTop ? LEVEL : 0;
    };

    for (let s = 0; s < 4; s++) {
        const [dx, dz] = DIRS[s];
        const off = CELL / 2 - WALL_T / 2;
        const cx = X + dx * off;
        const cz = Z + dz * off;
        const alongX = dz !== 0;
        const seg = (t0, t1, yb, yt) => {
            if (t1 - t0 < 0.001 || yt - yb < 0.001) return;
            const tm = (t0 + t1) / 2;
            const ym = y0 + (yb + yt) / 2;
            if (alongX) put(cx + tm, ym, cz, t1 - t0, yt - yb, WALL_T);
            else put(cx, ym, cz + tm, WALL_T, yt - yb, t1 - t0);
        };
        let opening = null;
        if (isDoor(s)) {
            const yb = doorFloor(s);
            opening = { w: DOOR_W, yb, yt: yb + DOOR_H };
        } else if (s === windowSide) {
            opening = { w: 3.2, yb: 0.9, yt: 2.9 };
        }
        const half = CELL / 2;
        if (!opening) {
            seg(-half, half, 0, total);
        } else {
            const w = opening.w / 2;
            seg(-half, -w, 0, total);
            seg(w, half, 0, total);
            seg(-w, w, 0, opening.yb);
            seg(-w, w, opening.yt, total);
        }
    }

    /* Side passages: a short tunnel that the darkness swallows. */
    for (const s of cell.stubs) {
        const v = dirVec(s);
        const t = new THREE.Vector3(-v.z, 0, v.x);
        const mid = CELL / 2 + STUB_DEPTH / 2;
        const alongX = v.x !== 0;
        const size = (along, h, across) => (alongX ? [along, h, across] : [across, h, along]);
        put(X + v.x * mid, y0 - 0.1, Z + v.z * mid, ...size(STUB_DEPTH, 0.2, DOOR_W + 0.4));
        put(X + v.x * mid, y0 + DOOR_H + 0.1, Z + v.z * mid, ...size(STUB_DEPTH, 0.2, DOOR_W + 0.4));
        for (const side of [-1, 1]) {
            const o = DOOR_W / 2 + 0.1;
            put(X + v.x * mid + t.x * o * side, y0 + DOOR_H / 2, Z + v.z * mid + t.z * o * side, ...size(STUB_DEPTH, DOOR_H, 0.2));
        }
        const end = CELL / 2 + STUB_DEPTH;
        put(X + v.x * end, y0 + DOOR_H / 2, Z + v.z * end, ...size(0.2, DOOR_H, DOOR_W + 0.4));
    }

    if (cell.kind === 'stairs') {
        const v = dirVec(cell.inDir);
        const steps = 10;
        const depth = CELL / steps;
        for (let k = 0; k < steps; k++) {
            const h = cell.rise > 0 ? (k + 1) * LEVEL / steps : LEVEL - k * LEVEL / steps;
            const a = -CELL / 2 + (k + 0.5) * depth;
            const alongX = v.x !== 0;
            const sx = alongX ? depth : CELL - 0.4;
            const sz = alongX ? CELL - 0.4 : depth;
            put(X + v.x * a, y0 + h / 2, Z + v.z * a, sx, h, sz);
        }
    }

    const group = new THREE.Group();
    const meshes = [];
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const m = new THREE.Matrix4();
    const instanced = (geo, list) => {
        const mesh = new THREE.InstancedMesh(geo, material, list.length);
        list.forEach(([x, y, z, sx, sy, sz, rotY], i) => {
            mesh.setMatrixAt(i, m.compose(pos.set(x, y, z), q.setFromAxisAngle(up, rotY), scl.set(sx, sy, sz)));
        });
        mesh.frustumCulled = false;
        group.add(mesh);
        meshes.push(mesh);
    };

    const shapeParts = [];
    shape.build({
        X, Z, y0, total, raised: raised && !hideCeiling, isDoor,
        geos: kit,
        put: (x, y, z, sx, sy, sz, rotY = 0) => shapeParts.push([x, y, z, sx, sy, sz, rotY]),
        instanced,
    });
    instanced(kit.box, parts.concat(shapeParts));

    const ctx = { U, fade: cell.fade, cellCenter, center, entrySide, exitSide: cell.outDir, solidSides, windowSide, shape: shapeKey };
    const roomObj = cell.room ? createRoom(cell.room, ctx) : null;
    if (roomObj) group.add(roomObj.group);
    const critter = cell.critter && CRITTERS[cell.critter] ? createCritter(cell.critter, ctx) : null;
    if (critter) group.add(critter.group);
    let tome = null;
    if (cell.tomeBook) {
        const inset = cell.room === 'babel' ? 1.0 : (shape.tomeInset || 1.2);
        tome = createTome(ctx, cell.tomeBook, center.clone().addScaledVector(dirVec(cell.tomeSide), inset));
        group.add(tome.group);
    }

    return {
        group,
        tome,
        update(t, camera) {
            if (roomObj) roomObj.update(t, camera);
            if (critter) critter.update(t, camera);
            if (tome) tome.update(t, camera);
        },
        dispose() {
            meshes.forEach(mesh => mesh.dispose());
            material.dispose();
            if (roomObj) roomObj.dispose();
            if (critter) critter.dispose();
            if (tome) tome.dispose();
        },
    };
}
