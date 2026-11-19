// rivals.js — Multi-Directional Graph AI Traffic across Crossroads, Overpasses & Roundabouts
import * as THREE from 'three';
import { Vehicle } from './vehicle.js';
import { VehicleStats } from './vehicle_stats.js';
import { ModelLoader, COLORS } from './model_loader.js';

export class RivalManager {
    constructor(scene, trackData, count = 6) {
        this.scene = scene;
        this.trackData = trackData;
        this.rivals = [];

        this._frustum = new THREE.Frustum();
        this._projScreenMatrix = new THREE.Matrix4();
        this._sphere = new THREE.Sphere(new THREE.Vector3(), 4.5);
        this._targetPos = new THREE.Vector3();
        this._spawnPos = new THREE.Vector3();
        this._spawnDir = new THREE.Vector3();

        this._spawnRivals(count);
    }

    _getActiveEdges() {
        if (this.trackData?.graph?.edges) {
            return Array.from(this.trackData.graph.edges.values());
        }
        return [];
    }

    _placeRivalOnEdge(r, edge, segIdx, dir, speedScale = 0.85) {
        const pts = edge.points;
        const binorms = edge.binormals;
        const tangents = edge.tangents;
        const safeIdx = Math.max(2, Math.min(pts.length - 3, segIdx));

        const p = pts[safeIdx];
        const b = binorms[safeIdx];
        const t = tangents[safeIdx];

        this._spawnPos.copy(p).addScaledVector(b, r.laneOffset * dir);
        this._spawnPos.y += 0.9;
        this._spawnDir.copy(t).multiplyScalar(dir);

        r.edge = edge;
        r.segIdx = safeIdx;
        r.dir = dir;
        r.vehicle.teleport(this._spawnPos, this._spawnDir);
        r.vehicle.speed = r.cruiseSpeed * speedScale;
    }

    _spawnRivals(count) {
        const edges = this._getActiveEdges();
        const lanes = [-3.0, 2.8, -1.6, 1.6, -2.5, 2.5];
        const baseGeom = VehicleStats.createDefaultRacer();

        for (let i = 0; i < count; i++) {
            const lane = lanes[i % lanes.length];
            const colorHex = COLORS[(i + 1) % COLORS.length];
            const mat = ModelLoader.createMaterial(colorHex, (i + 2) % 6);

            const geom = baseGeom.clone();
            const sx = 0.95 + (i % 3) * 0.1;
            const sy = 0.85 + (i % 2) * 0.15;
            const sz = 0.95 + ((i + 1) % 3) * 0.1;
            geom.scale(sx, sy, sz);

            const stats = VehicleStats.compute(new THREE.Vector3(1.4 * sx, 0.65 * sy, 3.0 * sz));
            stats.top_speed *= (0.92 + (i % 3) * 0.06);

            const vehicle = new Vehicle(this.scene, geom, mat, stats, false, `Rival ${i + 1}`);
            const cruiseSpeed = 22.0 + Math.random() * 14.0;

            const rivalObj = {
                vehicle,
                edge: null,
                segIdx: 4,
                dir: (i % 3 === 0) ? -1 : 1, // Mix forward + oncoming + cross-street traffic!
                targetLane: lane,
                laneOffset: lane,
                laneTimer: 2.5 + Math.random() * 4.0,
                cruiseSpeed,
                stuckTimer: 0.0,
                respawnCooldown: 0.0
            };

            if (edges.length > 0) {
                const spawnEdge = i < 2 && this.trackData.graph.getEdgeBetween('0,0', '0,-1')
                    ? this.trackData.graph.getEdgeBetween('0,0', '0,-1')
                    : edges[(i * 3) % edges.length];
                const seg = i < 2 ? 10 + i * 6 : Math.floor(spawnEdge.points.length * (0.25 + (i % 3) * 0.25));
                const dir = i < 2 ? 1 : (i % 2 === 0 ? 1 : -1);
                this._placeRivalOnEdge(rivalObj, spawnEdge, seg, dir, 0.8);
            }

            this.rivals.push(rivalObj);
        }
    }

    _respawnRival(r, playerPos) {
        const edges = this._getActiveEdges();
        if (edges.length === 0) return;

        const laneOptions = [-3.0, -1.8, 1.8, 3.0];
        const lane = laneOptions[Math.floor(Math.random() * laneOptions.length)];
        r.targetLane = lane;
        r.laneOffset = lane;
        r.cruiseSpeed = 22.0 + Math.random() * 14.0;
        r.stuckTimer = 0.0;
        r.respawnCooldown = 2.5;

        // Pick an edge within 70m..240m from the player
        const candidates = [];
        for (const e of edges) {
            const mid = e.points[Math.floor(e.points.length * 0.5)];
            const d = playerPos ? mid.distanceTo(playerPos) : 120.0;
            if (d >= 55.0 && d <= 260.0) candidates.push(e);
        }
        const pool = candidates.length > 0 ? candidates : edges;
        const nextEdge = pool[Math.floor(Math.random() * pool.length)];
        const dir = Math.random() < 0.5 ? 1 : -1;
        const segIdx = Math.floor(nextEdge.points.length * (0.25 + Math.random() * 0.5));
        this._placeRivalOnEdge(r, nextEdge, segIdx, dir, 0.9);
    }

    _advanceEdgeOrJunction(r) {
        const graph = this.trackData?.graph;
        if (!graph || !r.edge) return;

        // Verify edge is still active in graph; if retired, respawn cleanly
        if (!graph.edges.has(r.edge.id)) {
            r.edge = null;
            return;
        }

        const pts = r.edge.points;
        const n = pts.length;
        const vx = r.vehicle.position.x;
        const vz = r.vehicle.position.z;

        // Advance along edge in current direction (1 or -1)
        const start = Math.max(0, Math.min(n - 1, r.segIdx - r.dir * 2));
        let bestIdx = r.segIdx;
        let bestDistSq = Infinity;
        for (let k = 0; k < 8; k++) {
            const idx = r.segIdx + (k - 1) * r.dir;
            if (idx < 0 || idx >= n) continue;
            const dx = vx - pts[idx].x;
            const dz = vz - pts[idx].z;
            const dSq = dx * dx + dz * dz;
            if (dSq < bestDistSq) {
                bestDistSq = dSq;
                bestIdx = idx;
            }
        }
        r.segIdx = r.dir === 1 ? Math.max(r.segIdx, bestIdx) : Math.min(r.segIdx, bestIdx);
        void start;

        // Check junction arrival
        const reachedEnd = (r.dir === 1 && r.segIdx >= n - 3) || (r.dir === -1 && r.segIdx <= 2);
        if (reachedEnd) {
            const arrivedNodeKey = r.dir === 1 ? r.edge.nodeBKey : r.edge.nodeAKey;
            const outgoing = graph.getOutgoingEdges(arrivedNodeKey, r.edge.id);
            if (outgoing.length > 0) {
                // Pick random outgoing branch, preferring non-U-turn directions
                const curFwdX = r.edge.tangents[r.segIdx].x * r.dir;
                const curFwdZ = r.edge.tangents[r.segIdx].z * r.dir;

                const goodChoices = [];
                for (const cand of outgoing) {
                    const candDir = cand.nodeAKey === arrivedNodeKey ? 1 : -1;
                    const entryIdx = candDir === 1 ? 2 : cand.points.length - 3;
                    const cFwd = cand.tangents[entryIdx];
                    const dot = (cFwd.x * candDir) * curFwdX + (cFwd.z * candDir) * curFwdZ;
                    if (dot > -0.65) goodChoices.push({ edge: cand, dir: candDir });
                }
                const list = goodChoices.length > 0
                    ? goodChoices
                    : outgoing.map(e => ({ edge: e, dir: e.nodeAKey === arrivedNodeKey ? 1 : -1 }));
                const chosen = list[Math.floor(Math.random() * list.length)];
                r.edge = chosen.edge;
                r.dir = chosen.dir;
                r.segIdx = r.dir === 1 ? 2 : r.edge.points.length - 3;
            } else {
                r.dir = -r.dir;
            }
        }
    }

    update(delta, playerPos = null, camera = null) {
        if (!this.trackData?.graph) return;

        let frustum = null;
        if (camera) {
            this._projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
            this._frustum.setFromProjectionMatrix(this._projScreenMatrix);
            frustum = this._frustum;
        }

        for (let i = 0; i < this.rivals.length; i++) {
            const r = this.rivals[i];
            const veh = r.vehicle;
            r.respawnCooldown = Math.max(0, r.respawnCooldown - delta);

            if (Math.abs(veh.speed) < 2.5) {
                r.stuckTimer += delta;
            } else {
                r.stuckTimer = Math.max(0, r.stuckTimer - delta * 0.5);
            }

            this._sphere.center.copy(veh.position);
            const inView = frustum ? frustum.intersectsSphere(this._sphere) : false;

            if (playerPos && r.respawnCooldown <= 0) {
                const distToPlayer = veh.position.distanceTo(playerPos);
                const shouldRecycle = !r.edge || (!inView && (distToPlayer > 270.0 || r.stuckTimer > 5.0));
                if (shouldRecycle) {
                    this._respawnRival(r, playerPos);
                    continue;
                }
            }

            if (!r.edge) {
                this._respawnRival(r, playerPos);
                continue;
            }

            r.laneTimer -= delta;
            if (r.laneTimer <= 0) {
                r.laneTimer = 3.5 + Math.random() * 5.0;
                const laneOptions = [-3.0, -1.8, 1.8, 3.0];
                r.targetLane = laneOptions[Math.floor(Math.random() * laneOptions.length)];
                r.cruiseSpeed = 22.0 + Math.random() * 14.0;
            }
            r.laneOffset = THREE.MathUtils.lerp(r.laneOffset, r.targetLane, delta * 2.2);

            this._advanceEdgeOrJunction(r);
            if (!r.edge) continue;

            const n = r.edge.points.length;
            const lookSteps = 4;
            const aheadIdx = Math.max(0, Math.min(n - 1, r.segIdx + r.dir * lookSteps));
            const aheadPt = r.edge.points[aheadIdx];
            const aheadRight = r.edge.binormals[aheadIdx];

            this._targetPos.copy(aheadPt).addScaledVector(aheadRight, r.laneOffset * r.dir);

            const toX = this._targetPos.x - veh.position.x;
            const toZ = this._targetPos.z - veh.position.z;
            const desiredHeading = Math.atan2(-toX, -toZ);

            let angleDiff = desiredHeading - veh.heading;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            const inAir = veh.airTime > 0.05 || !veh.grounded;
            if (inAir) {
                veh.inputs.steer = THREE.MathUtils.clamp(angleDiff * 1.2, -0.35, 0.35);
                veh.inputs.throttle = 1.0;
                veh.inputs.brake = 0.0;
                veh.inputs.drift = false;
            } else {
                veh.inputs.steer = THREE.MathUtils.clamp(angleDiff * 3.2, -1.0, 1.0);
                const isSharpTurn = Math.abs(angleDiff) > 0.45;
                if (veh.speed < 12.0) {
                    veh.inputs.throttle = 1.0;
                    veh.inputs.brake = 0.0;
                    veh.inputs.drift = false;
                } else if (isSharpTurn && veh.speed > 24.0) {
                    veh.inputs.throttle = 0.3;
                    veh.inputs.brake = 0.4;
                    veh.inputs.drift = true;
                } else if (veh.speed > r.cruiseSpeed + 2.5) {
                    veh.inputs.throttle = 0.1;
                    veh.inputs.brake = 0.25;
                    veh.inputs.drift = false;
                } else {
                    veh.inputs.throttle = 1.0;
                    veh.inputs.brake = 0.0;
                    veh.inputs.drift = false;
                }

                if (!isSharpTurn && veh.speed > 22.0 && Math.random() < 0.008 && veh.boostLeft <= 0) {
                    veh.boostLeft = 2.0;
                    veh.inputs.boost = true;
                } else if (veh.boostLeft <= 0) {
                    veh.inputs.boost = false;
                }
            }

            veh.update(delta, this.trackData);
        }
    }

    onChunkShift() {}

    destroy() {
        for (const r of this.rivals) {
            r.vehicle.destroy();
        }
        this.rivals = [];
    }
}
