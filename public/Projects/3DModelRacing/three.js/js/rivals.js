// rivals.js — Multi-Lane AI Racers using Unified Vehicle Physics
import * as THREE from 'three';
import { Vehicle } from './vehicle.js';
import { VehicleStats } from './vehicle_stats.js';
import { ModelLoader, COLORS } from './model_loader.js';

export class RivalManager {
    constructor(scene, trackData, count = 5) {
        this.scene = scene;
        this.trackData = trackData;
        this.rivals = [];

        this._spawnRivals(count);
    }

    _spawnRivals(count) {
        const { points, tangents, binormals } = this.trackData;
        const lanes = [-3.0, 2.8, -1.5, 1.5, -2.2, 2.2];
        const baseGeom = VehicleStats.createDefaultRacer();

        for (let i = 0; i < count; i++) {
            const lane = lanes[i % lanes.length];
            const colorHex = COLORS[(i + 1) % COLORS.length];
            const mat = ModelLoader.createMaterial(colorHex, (i + 2) % 6);

            // Varied aerodynamic profiles
            const geom = baseGeom.clone();
            const sx = 0.95 + (i % 3) * 0.1;
            const sy = 0.85 + (i % 2) * 0.15;
            const sz = 0.95 + ((i + 1) % 3) * 0.1;
            geom.scale(sx, sy, sz);

            const stats = VehicleStats.compute(new THREE.Vector3(1.4 * sx, 0.65 * sy, 3.0 * sz));
            stats.top_speed *= (0.88 + (i % 3) * 0.05); // slight AI speed variation

            const vehicle = new Vehicle(this.scene, geom, mat, stats, false, `Rival ${i + 1}`);

            // Spawn spaced out along the starting stretch
            const startIndex = 4 + i * 8;
            const spawnPos = points[startIndex].clone().add(binormals[startIndex].clone().multiplyScalar(lane));
            spawnPos.y += 0.8;
            vehicle.teleport(spawnPos, tangents[startIndex]);
            vehicle.speed = 10.0 + Math.random() * 5.0; // Ready with rolling start speed

            this.rivals.push({
                vehicle,
                targetLane: lane,
                laneOffset: lane,
                laneTimer: 3.0 + Math.random() * 4.0,
                pathIndex: startIndex,
                lookAheadDist: 18 + (i % 3) * 3
            });
        }
    }

    update(delta) {
        const { points, tangents, binormals } = this.trackData;
        const n = points.length;

        for (const r of this.rivals) {
            const veh = r.vehicle;

            // 1. Dynamic Lane Decision Logic
            r.laneTimer -= delta;
            if (r.laneTimer <= 0) {
                r.laneTimer = 4.0 + Math.random() * 5.0;
                const laneOptions = [-3.0, -1.5, 1.5, 3.0];
                r.targetLane = laneOptions[Math.floor(Math.random() * laneOptions.length)];
            }
            r.laneOffset = THREE.MathUtils.lerp(r.laneOffset, r.targetLane, delta * 2.5);

            // 2. Spline Waypoint Tracking (Forward-biased search window)
            let closestDist = Infinity;
            let closestIdx = r.pathIndex;
            const searchMin = Math.max(0, r.pathIndex - 2);
            const searchMax = Math.min(n - 1, r.pathIndex + 14);

            for (let i = searchMin; i <= searchMax; i++) {
                const d = veh.position.distanceTo(points[i]);
                if (d < closestDist) {
                    closestDist = d;
                    closestIdx = i;
                }
            }
            r.pathIndex = closestIdx;

            // Target lookahead waypoint along track spline (always at least 3 points ahead)
            const aheadIdx = Math.min(r.pathIndex + Math.max(3, Math.round(r.lookAheadDist / 6.2)), n - 1);
            const aheadPt = points[aheadIdx];
            const aheadRight = binormals[aheadIdx];
            const targetPos = aheadPt.clone().add(aheadRight.clone().multiplyScalar(r.laneOffset));

            // 3. AI Steering Controller
            const toTarget = targetPos.clone().sub(veh.position);
            toTarget.y = 0;
            const desiredHeading = Math.atan2(-toTarget.x, -toTarget.z);

            // Normalize angle difference to [-PI, PI]
            let angleDiff = desiredHeading - veh.heading;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            // Steer toward target
            veh.inputs.steer = THREE.MathUtils.clamp(angleDiff * 3.2, -1.0, 1.0);

            // 4. AI Throttle & Brake Controller
            // Never brake when starting or moving slowly
            const isSharpTurn = Math.abs(angleDiff) > 0.45;
            if (veh.speed < 12.0) {
                veh.inputs.throttle = 1.0;
                veh.inputs.brake = 0.0;
                veh.inputs.drift = false;
            } else if (isSharpTurn && veh.speed > 22.0) {
                veh.inputs.throttle = 0.35;
                veh.inputs.brake = 0.35;
                veh.inputs.drift = true;
            } else {
                veh.inputs.throttle = 1.0;
                veh.inputs.brake = 0.0;
                veh.inputs.drift = false;
            }

            // Occasional nitro boost on straightaways
            if (!isSharpTurn && veh.speed > 24.0 && Math.random() < 0.005 && veh.boostLeft <= 0) {
                veh.boostLeft = 1.8;
                veh.inputs.boost = true;
            }

            // 5. Run Unified Physics Engine
            veh.update(delta, this.trackData);
        }
    }

    destroy() {
        for (const r of this.rivals) {
            r.vehicle.destroy();
        }
        this.rivals = [];
    }
}
