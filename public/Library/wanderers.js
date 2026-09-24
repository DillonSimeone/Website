import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { R, H, WALLS } from './well.js';

const MAX = 8;
const UP = new THREE.Vector3(0, 1, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const RAIL_R = R - 1.2;
const RAIL_HALF = RAIL_R * Math.tan(Math.PI / 6) * 0.8;
const FLY_SPEED = 1.9;

const ease = (t) => t * t * (3 - 2 * t);
const rand = (a, b) => a + Math.random() * (b - a);
const zAxisOf = (q) => new THREE.Vector3(0, 0, 1).applyQuaternion(q);

/*
 * A book is two hinged halves. Body frame: origin on the spine, +Y along the spine (hinge),
 * +Z out of the spine, pages toward -Z. On a shelf +Z faces the shaft; in flight +Y points
 * forward and +Z up, so the covers become wings.
 */
function flightQuat(dir, out, bank = 0) {
    const f = dir.clone();
    if (f.lengthSq() < 1e-6) f.set(1, 0, 0);
    f.normalize();
    if (Math.abs(f.y) > 0.9) {
        f.y = Math.sign(f.y) * 0.9;
        f.normalize();
    }
    const z = UP.clone().addScaledVector(f, -UP.dot(f)).normalize();
    if (bank) z.applyAxisAngle(f, bank);
    const x = new THREE.Vector3().crossVectors(f, z);
    return out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, f, z));
}

export function createWanderers(scene, well, material, { enabled = true } = {}) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(box, material, MAX * 2);
    mesh.frustumCulled = false;
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX * 2; i++) {
        mesh.setMatrixAt(i, hidden);
        mesh.setColorAt(i, new THREE.Color(0, 0, 0));
    }
    scene.add(mesh);

    const freeSlots = [];
    const birds = [];
    const freeIndices = Array.from({ length: MAX }, (_, i) => i);
    let spawnIn = 1.2;
    let time = 0;
    let camY = 0;

    const bodyM = new THREE.Matrix4();
    const localM = new THREE.Matrix4();
    const worldM = new THREE.Matrix4();
    const hingeQ = new THREE.Quaternion();
    const offset = new THREE.Vector3();
    const halfScale = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const tmpQ = new THREE.Quaternion();

    const slotValid = (s) => s && well.isRingFloor(s.k, s.floor);

    function seatOrigin(slot, bird) {
        return slot.pos.clone()
            .addScaledVector(UP, (bird.h - slot.h) / 2)
            .addScaledVector(zAxisOf(slot.quat), slot.d / 2);
    }

    function freeSlot(slot) {
        if (slotValid(slot) && !freeSlots.includes(slot)) freeSlots.push(slot);
    }

    function takeSlot(bird) {
        const floor = Math.round(bird.origin.y / H);
        const candidates = freeSlots.filter(s => s !== bird.leftSeat && slotValid(s) && Math.abs(s.floor - floor) <= 2);
        if (!candidates.length) return null;
        const fitting = candidates.filter(s => s.t >= bird.t * 0.8 && s.t <= bird.t * 1.4);
        const pool = fitting.length ? fitting : candidates;
        const slot = pool[Math.floor(Math.random() * pool.length)];
        freeSlots.splice(freeSlots.indexOf(slot), 1);
        return slot;
    }

    function perchSpot(bird) {
        const fc = Math.floor(camY / H);
        const own = Math.round(bird.origin.y / H);
        const floor = Math.max(fc - 1, Math.min(fc + 3, own + Math.floor(rand(-1, 2))));
        const F = WALLS[Math.floor(Math.random() * 6)];
        const u = rand(-RAIL_HALF, RAIL_HALF);
        const pos = F.dir.clone().multiplyScalar(RAIL_R).addScaledVector(F.tangent, u);
        pos.y = floor * H + 1.0 + 0.055;
        const along = F.tangent.clone().multiplyScalar(Math.random() < 0.5 ? 1 : -1);
        return { pos, quat: flightQuat(along, new THREE.Quaternion()) };
    }

    /* Choose where to go next and set up the flight path. */
    function plan(bird) {
        let dest;
        bird.target = null;
        bird.perch = null;
        const wantsPerch = !bird.perched && Math.random() < 0.6;
        if (!wantsPerch) bird.target = takeSlot(bird);
        if (!bird.target && bird.perched && slotValid(bird.leftSeat) && freeSlots.includes(bird.leftSeat)) {
            bird.target = bird.leftSeat;
            freeSlots.splice(freeSlots.indexOf(bird.target), 1);
        }
        if (bird.target) {
            bird.seatAt = seatOrigin(bird.target, bird);
            bird.approach = bird.seatAt.clone().addScaledVector(zAxisOf(bird.target.quat), 0.75);
            bird.approach.y += 0.08;
            dest = bird.approach;
        } else {
            bird.perch = perchSpot(bird);
            dest = bird.perch.pos;
        }
        const p0 = bird.origin.clone();
        const p2 = dest.clone();
        const p1 = p0.clone().lerp(p2, 0.5);
        p1.x *= 0.3;
        p1.z *= 0.3;
        p1.y += 1.0 + p0.distanceTo(p2) * 0.12;
        const length = p0.distanceTo(p1) + p1.distanceTo(p2);
        bird.path = { p0, p1, p2, duration: Math.max(1.6, length / FLY_SPEED) };
    }

    function bezier(path, u, out) {
        const a = 1 - u;
        return out.set(0, 0, 0)
            .addScaledVector(path.p0, a * a)
            .addScaledVector(path.p1, 2 * a * u)
            .addScaledVector(path.p2, u * u);
    }

    function bezierTangent(path, u, out) {
        return out.copy(path.p1).sub(path.p0).multiplyScalar(2 * (1 - u))
            .addScaledVector(path.p2.clone().sub(path.p1), 2 * u);
    }

    function setState(bird, state, duration) {
        bird.state = state;
        bird.clock = 0;
        bird.duration = duration;
    }

    function beginTurn(bird) {
        plan(bird);
        bird.turnFromQuat = bird.quat.clone();
        bird.turnFromTheta = bird.theta;
        bird.turnFromPos = bird.origin.clone();
        bezierTangent(bird.path, 0, tangent);
        bird.turnToQuat = flightQuat(tangent, new THREE.Quaternion());
        setState(bird, 'turn', bird.perched ? 0.4 : 0.55);
    }

    function takeOff(bird) {
        freeSlot(bird.seat);
        bird.leftSeat = bird.seat;
        bird.seat = null;
        bird.perched = false;
        bird.pullFrom = bird.origin.clone();
        bird.pullTo = bird.origin.clone().addScaledVector(zAxisOf(bird.quat), bird.d + 0.3);
        setState(bird, 'pull', rand(0.7, 1.1));
    }

    function spawn() {
        const fc = Math.floor(camY / H);
        const floor = fc + Math.floor(rand(-1, 3));
        const adopted = well.adoptBook(floor);
        if (!adopted) return;
        const index = freeIndices.pop();
        const seat = { k: adopted.k, floor: adopted.floor, pos: adopted.pos, quat: adopted.quat, t: adopted.t, h: adopted.h, d: adopted.d };
        const bird = {
            index,
            t: adopted.t, h: adopted.h, d: adopted.d,
            originK: adopted.k,
            originFloor: adopted.floor,
            seat,
            leftSeat: null,
            target: null,
            quat: adopted.quat.clone(),
            theta: 0,
            phase: Math.random() * Math.PI * 2,
            flapRate: rand(9, 12),
        };
        bird.origin = seatOrigin(seat, bird);
        mesh.setColorAt(index * 2, adopted.color);
        mesh.setColorAt(index * 2 + 1, adopted.color);
        mesh.instanceColor.needsUpdate = true;
        birds.push(bird);
        takeOff(bird);
    }

    function despawn(bird, releaseSlots = true) {
        if (releaseSlots) {
            if (bird.seat) freeSlot(bird.seat);
            if (bird.target) freeSlot(bird.target);
        }
        mesh.setMatrixAt(bird.index * 2, hidden);
        mesh.setMatrixAt(bird.index * 2 + 1, hidden);
        mesh.instanceMatrix.needsUpdate = true;
        freeIndices.push(bird.index);
        birds.splice(birds.indexOf(bird), 1);
    }

    well.onRebuild((k) => {
        for (let i = freeSlots.length - 1; i >= 0; i--) {
            if (freeSlots[i].k === k) freeSlots.splice(i, 1);
        }
        birds.filter(b => b.originK === k || (b.seat && b.seat.k === k) || (b.target && b.target.k === k))
            .forEach(b => despawn(b));
    });

    function step(bird, dt) {
        bird.clock += dt;
        const u = Math.min(1, bird.clock / bird.duration);
        const flap = Math.sin(time * bird.flapRate + bird.phase);

        switch (bird.state) {
            case 'pull': {
                bird.origin.lerpVectors(bird.pullFrom, bird.pullTo, ease(u));
                bird.theta = 0.08 * u;
                if (u >= 1) beginTurn(bird);
                break;
            }
            case 'turn': {
                const e = ease(u);
                bird.quat.slerpQuaternions(bird.turnFromQuat, bird.turnToQuat, e);
                bird.theta = bird.turnFromTheta + (1.0 + 0.4 * flap - bird.turnFromTheta) * e;
                bird.origin.copy(bird.turnFromPos);
                bird.origin.y += 0.15 * e;
                if (u >= 1) {
                    bird.path.p0.copy(bird.origin);
                    setState(bird, 'fly', bird.path.duration);
                }
                break;
            }
            case 'fly': {
                const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
                bezier(bird.path, e, bird.origin);
                bird.origin.y += Math.cos(time * bird.flapRate + bird.phase) * 0.035;
                bezierTangent(bird.path, Math.min(e, 0.98), tangent);
                const turnRate = tangent.x * bird.path.p2.z - tangent.z * bird.path.p2.x;
                flightQuat(tangent, tmpQ, Math.max(-0.4, Math.min(0.4, turnRate * 0.03)));
                bird.quat.slerp(tmpQ, Math.min(1, dt * 8));
                bird.theta = 1.05 + 0.55 * flap;
                if (u >= 1) {
                    bird.landFromQuat = bird.quat.clone();
                    bird.landFromTheta = bird.theta;
                    if (bird.target) {
                        bird.seat = bird.target;
                        bird.target = null;
                        setState(bird, 'tuck', 1.1);
                    } else {
                        setState(bird, 'alight', 0.45);
                    }
                }
                break;
            }
            case 'alight': {
                const e = ease(u);
                bird.quat.slerpQuaternions(bird.landFromQuat, bird.perch.quat, e);
                bird.theta = bird.landFromTheta + (0.55 - bird.landFromTheta) * e;
                bird.origin.copy(bird.perch.pos);
                if (u >= 1) {
                    bird.flapIn = rand(0.8, 2.5);
                    bird.burst = 0;
                    setState(bird, 'perch', rand(3.5, 9));
                }
                break;
            }
            case 'perch': {
                bird.flapIn -= dt;
                if (bird.flapIn <= 0 && bird.burst <= 0) {
                    bird.burst = rand(0.5, 0.9);
                    bird.flapIn = rand(1.5, 3.5);
                }
                bird.origin.copy(bird.perch.pos);
                if (bird.burst > 0) {
                    bird.burst -= dt;
                    const beat = Math.abs(Math.sin(time * 13 + bird.phase));
                    bird.theta = 0.55 + 0.75 * beat;
                    bird.origin.y += 0.04 * beat;
                } else {
                    bird.theta += (0.55 - bird.theta) * Math.min(1, dt * 6);
                }
                if (u >= 1) {
                    bird.perched = true;
                    beginTurn(bird);
                }
                break;
            }
            case 'tuck': {
                const orient = ease(Math.min(1, u / 0.55));
                const slide = ease(Math.max(0, (u - 0.45) / 0.55));
                bird.quat.slerpQuaternions(bird.landFromQuat, bird.seat.quat, orient);
                bird.theta = bird.landFromTheta * (1 - orient) + (orient < 1 ? 0.25 * flap * (1 - orient) : 0);
                bird.origin.lerpVectors(bird.approach, bird.seatAt, slide);
                if (u >= 1) {
                    bird.origin.copy(bird.seatAt);
                    bird.quat.copy(bird.seat.quat);
                    bird.theta = 0;
                    setState(bird, 'rest', rand(8, 25));
                }
                break;
            }
            case 'rest': {
                if (u >= 1) {
                    if (Math.random() < 0.5) takeOff(bird);
                    else setState(bird, 'rest', rand(8, 20));
                }
                break;
            }
        }
    }

    function write(bird) {
        bodyM.compose(bird.origin, bird.quat, ONE);
        for (const side of [-1, 1]) {
            hingeQ.setFromAxisAngle(Y_AXIS, -side * bird.theta);
            offset.set(side * bird.t / 4, 0, -bird.d / 2).applyQuaternion(hingeQ);
            halfScale.set(bird.t / 2, bird.h, bird.d);
            localM.compose(offset, hingeQ, halfScale);
            worldM.multiplyMatrices(bodyM, localM);
            mesh.setMatrixAt(bird.index * 2 + (side > 0 ? 1 : 0), worldM);
        }
    }

    return {
        update(dt, cameraY) {
            if (!enabled) return;
            time += dt;
            camY = cameraY;
            spawnIn -= dt;
            if (spawnIn <= 0) {
                spawnIn = birds.length < 3 ? rand(1, 2.5) : rand(3, 7);
                if (birds.length < MAX) spawn();
            }
            for (const bird of birds.slice()) {
                if (Math.abs(bird.origin.y - camY) > 3.5 * H) { despawn(bird); continue; }
                step(bird, dt);
            }
            birds.forEach(write);
            if (birds.length) mesh.instanceMatrix.needsUpdate = true;
        },
        dispose() {
            scene.remove(mesh);
            box.dispose();
            mesh.dispose();
        },
    };
}
