// rivals.js — Multi-Lane Autonomous AI Racers with Endless Traffic Respawning
import * as THREE from 'three';
import { Vehicle } from './vehicle.js';
import { VehicleStats } from './vehicle_stats.js';
import { ModelLoader, COLORS } from './model_loader.js';

export class RivalManager {
    constructor(scene, trackData, count = 6) {
        this.scene = scene;
        this.trackData = trackData;
        this.rivals = [];

        this._spawnRivals(count);
    }

    _spawnRivals(count) {
        const { points, tangents, binormals } = this.trackData;
        const lanes = [-3.0, 2.8, -1.5, 1.5, -2.4, 2.4];
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
            stats.top_speed *= (0.92 + (i % 3) * 0.06);

            const vehicle = new Vehicle(this.scene, geom, mat, stats, false, `Rival ${i + 1}`);

            // Spawn spaced out along the starting stretch
            const startIndex = Math.min(points.length - 2, 4 + i * 7);
            const spawnPos = points[startIndex].clone().add(binormals[startIndex].clone().multiplyScalar(lane));
            spawnPos.y += 0.9;
            vehicle.teleport(spawnPos, tangents[startIndex]);
            const cruiseSpeed = 20.0 + Math.random() * 14.0;
            vehicle.speed = cruiseSpeed * 0.7;

            this.rivals.push({
                vehicle,
                targetLane: lane,
                laneOffset: lane,
                laneTimer: 2.0 + Math.random() * 4.0,
                cruiseSpeed,
                pathIndex: startIndex,
                lookAheadDist: 18 + (i % 3) * 4,
                stuckTimer: 0.0,
                respawnCooldown: 0.0
            });
        }
    }

    _respawnRival(r, playerPos, playerPathIdx, points, tangents, binormals, n) {
        // Randomly pick lane
        const laneOptions = [-3.0, -1.8, 1.8, 3.0];
        const lane = laneOptions[Math.floor(Math.random() * laneOptions.length)];
        r.targetLane = lane;
        r.laneOffset = lane;
        r.cruiseSpeed = 22.0 + Math.random() * 14.0;
        r.stuckTimer = 0.0;
        r.respawnCooldown = 2.5;

        // In Endless Mode: 55% spawn ahead of player, 45% spawn behind player rushing forward
        const spawnAhead = Math.random() < 0.55;
        let targetIdx;

        if (spawnAhead) {
            // 70m to 140m ahead (approx 12 to 25 spline points ahead)
            const ptAheadOffset = 12 + Math.floor(Math.random() * 14);
            targetIdx = Math.min(n - 3, playerPathIdx + ptAheadOffset);
        } else {
            // 45m to 85m behind (approx 8 to 15 spline points behind)
            const ptBehindOffset = 8 + Math.floor(Math.random() * 8);
            targetIdx = Math.max(2, playerPathIdx - ptBehindOffset);
        }

        const spawnPos = points[targetIdx].clone().add(binormals[targetIdx].clone().multiplyScalar(lane));
        spawnPos.y += 0.9;
        r.vehicle.teleport(spawnPos, tangents[targetIdx]);
        r.vehicle.speed = r.cruiseSpeed * (spawnAhead ? 0.9 : 1.25);
        r.pathIndex = targetIdx;
    }

    update(delta, playerPos = null) {
        const { points, tangents, binormals } = this.trackData;
        const n = points.length;
        if (n < 6) return;

        // 1. Locate player along track spline for distance checks
        let playerPathIdx = 0;
        if (playerPos) {
            let minD = Infinity;
            for (let i = 0; i < n; i += 3) {
                const d = playerPos.distanceTo(points[i]);
                if (d < minD) {
                    minD = d;
                    playerPathIdx = i;
                }
            }
        }

        const playerFwd = (playerPathIdx < n - 1) ? tangents[playerPathIdx] : new THREE.Vector3(0, 0, -1);

        for (const r of this.rivals) {
            const veh = r.vehicle;
            r.respawnCooldown = Math.max(0, r.respawnCooldown - delta);

            // 2. Track stuck state
            if (Math.abs(veh.speed) < 2.5) {
                r.stuckTimer += delta;
            } else {
                r.stuckTimer = Math.max(0, r.stuckTimer - delta * 0.5);
            }

            // 3. Endless Mode Respawning Check (Behind / Forward recycling)
            if (playerPos && r.respawnCooldown <= 0) {
                const distToPlayer = veh.position.distanceTo(playerPos);
                const toRival = veh.position.clone().sub(playerPos);
                const isAhead = toRival.dot(playerFwd) > 0;

                const tooFarAhead = isAhead && distToPlayer > 185.0;
                const tooFarBehind = !isAhead && distToPlayer > 125.0;
                const fellBelowWorld = veh.position.y < -14.0;
                const isStuck = r.stuckTimer > 4.5;

                if (tooFarAhead || tooFarBehind || fellBelowWorld || isStuck) {
                    this._respawnRival(r, playerPos, playerPathIdx, points, tangents, binormals, n);
                    continue;
                }
            }

            // 4. Dynamic Lane Decision Logic & Wandering Traffic
            r.laneTimer -= delta;
            if (r.laneTimer <= 0) {
                r.laneTimer = 3.5 + Math.random() * 5.0;
                const laneOptions = [-3.0, -1.8, 1.8, 3.0];
                r.targetLane = laneOptions[Math.floor(Math.random() * laneOptions.length)];
                // Slightly vary cruise speed over time to mimic organic traffic
                r.cruiseSpeed = 22.0 + Math.random() * 14.0;
            }
            r.laneOffset = THREE.MathUtils.lerp(r.laneOffset, r.targetLane, delta * 2.2);

            // 5. Spline Waypoint Tracking (Forward-biased search window)
            let closestDist = Infinity;
            let closestIdx = r.pathIndex;
            const searchMin = Math.max(0, r.pathIndex - 3);
            const searchMax = Math.min(n - 1, r.pathIndex + 16);

            for (let i = searchMin; i <= searchMax; i++) {
                const d = veh.position.distanceTo(points[i]);
                if (d < closestDist) {
                    closestDist = d;
                    closestIdx = i;
                }
            }
            r.pathIndex = closestIdx;

            // Target lookahead waypoint along track spline
            const aheadIdx = Math.min(r.pathIndex + Math.max(3, Math.round(r.lookAheadDist / 5.8)), n - 1);
            const aheadPt = points[aheadIdx];
            const aheadRight = binormals[aheadIdx];
            const targetPos = aheadPt.clone().add(aheadRight.clone().multiplyScalar(r.laneOffset));

            // 6. AI Steering Controller
            const toTarget = targetPos.clone().sub(veh.position);
            toTarget.y = 0;
            const desiredHeading = Math.atan2(-toTarget.x, -toTarget.z);

            // Normalize angle difference to [-PI, PI]
            let angleDiff = desiredHeading - veh.heading;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            // Steer smoothly toward target waypoint
            veh.inputs.steer = THREE.MathUtils.clamp(angleDiff * 3.4, -1.0, 1.0);

            // 7. AI Throttle, Brake & Cruise Controller
            const isSharpTurn = Math.abs(angleDiff) > 0.45;
            if (veh.speed < 12.0) {
                // Initial torque out of slow spots
                veh.inputs.throttle = 1.0;
                veh.inputs.brake = 0.0;
                veh.inputs.drift = false;
            } else if (isSharpTurn && veh.speed > 24.0) {
                // Brake into apex
                veh.inputs.throttle = 0.3;
                veh.inputs.brake = 0.4;
                veh.inputs.drift = true;
            } else if (veh.speed > r.cruiseSpeed + 2.5) {
                // Cruising speed regulation
                veh.inputs.throttle = 0.1;
                veh.inputs.brake = 0.25;
                veh.inputs.drift = false;
            } else {
                // Accelerate toward cruising speed
                veh.inputs.throttle = 1.0;
                veh.inputs.brake = 0.0;
                veh.inputs.drift = false;
            }

            // Occasional burst of boost on open straights
            if (!isSharpTurn && veh.speed > 22.0 && Math.random() < 0.008 && veh.boostLeft <= 0) {
                veh.boostLeft = 2.0;
                veh.inputs.boost = true;
            }

            // 8. Run Unified Physics Engine
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
