// vehicle.js — Unified Hover Vehicle Class for Player & NPC Rivals
import * as THREE from 'three';
import { getTerrainHeight } from './terrain.js';

export class Vehicle {
    constructor(scene, geometry, material, stats, isPlayer = false, name = 'Racer') {
        this.scene = scene;
        this.stats = { ...stats };
        this.isPlayer = isPlayer;
        this.name = name;

        // Vehicle Mesh & Root Hierarchy
        this.root = new THREE.Group();
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.root.add(this.mesh);

        // Dual Xenon Headlights (Front nose cone)
        const hlMat = new THREE.MeshStandardMaterial({
            color: 0x00f2fe,
            emissive: 0x00f2fe,
            emissiveIntensity: 2.8
        });
        const hlL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.15), hlMat);
        hlL.position.set(-0.25, 0.22, -1.25);
        hlL.castShadow = true;
        this.root.add(hlL);
        const hlR = hlL.clone();
        hlR.position.x = 0.25;
        hlR.castShadow = true;
        this.root.add(hlR);

        // Dual Red Taillights (Rear deck)
        const tlMat = new THREE.MeshStandardMaterial({
            color: 0xff1122,
            emissive: 0xff1122,
            emissiveIntensity: 2.8
        });
        const tlL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.12), tlMat);
        tlL.position.set(-0.55, 0.35, 1.35);
        tlL.castShadow = true;
        this.root.add(tlL);
        const tlR = tlL.clone();
        tlR.position.x = 0.55;
        tlR.castShadow = true;
        this.root.add(tlR);

        this.scene.add(this.root);

        // Motion Variables
        this.position = new THREE.Vector3();
        this.velocity = new THREE.Vector3();
        this.heading = 0; // Yaw angle (radians)
        this.pitch = 0;
        this.roll = 0;
        this.steerAngle = 0;

        // Dynamic State
        this.hoverHeight = 0.65;
        this.speed = 0;
        this.grounded = true;
        this.isDrifting = false;
        this.driftScore = 0;
        this.boostLeft = 0;
        this.airTime = 0;
        this.ascended = false;

        // Input state (driven by Keyboard for Player, or AIController for Rivals)
        this.inputs = {
            throttle: 0,
            brake: 0,
            steer: 0,
            boost: false,
            drift: false
        };
    }

    teleport(position, direction) {
        this.position.copy(position);
        this.velocity.set(0, 0, 0);
        this.speed = 0;
        if (direction) {
            this.heading = Math.atan2(-direction.x, -direction.z);
        }
        this.root.position.copy(this.position);
        this.root.rotation.set(0, this.heading, 0);
    }

    update(delta, trackData) {
        if (this.ascended) {
            this._updateAscension(delta);
            return;
        }

        // 1. Continuous Spline Ground Projection
        const ground = this._sampleTrackGround(this.position, trackData);
        const altitude = this.position.y - ground.y;
        this.grounded = altitude < (this.hoverHeight + 0.85) && altitude > -0.6;

        if (this.grounded) {
            // Progressive spring suspension: non-linear force prevents bottoming out on steep ramps
            const compression = this.hoverHeight - altitude;
            let springForce = 0;
            if (compression > 0) {
                const compRatio = compression / this.hoverHeight;
                springForce = Math.pow(compRatio, 1.8) * 160.0 + compression * 60.0;
            } else {
                springForce = compression * 35.0; // gentle pull down when hovering slightly high
            }
            const dampForce = -this.velocity.y * 11.0;
            this.velocity.y += (springForce + dampForce) * delta;
            this.airTime = 0;
        } else {
            // Free-fall in air with gravity
            this.velocity.y -= 26.0 * delta;
            this.airTime += delta;
        }

        // 2. Off-Road Drag & Road Clamping
        const isOffroad = ground.isOffroad;
        const accelPower = this.stats.accel * (this.isPlayer ? 1.0 : 0.88);
        let maxSpeed = this.stats.top_speed;

        if (isOffroad) {
            maxSpeed = Math.min(maxSpeed, 26.0); // Allow fun off-road cruising across hills
            if (this.speed > maxSpeed && !this.inputs.boost) {
                this.speed = THREE.MathUtils.lerp(this.speed, maxSpeed, delta * 2.0);
            }
            // Inward cushion steering towards track only if very far out
            if (Math.abs(ground.lateralDist) > 25.0) {
                const pushDir = ground.lateralDist > 0 ? -1 : 1;
                this.velocity.addScaledVector(ground.right, pushDir * 3.5 * delta);
            }

            // Auto-respawn only if driven deep into outer wilderness (> 120m off track)
            if (Math.abs(ground.lateralDist) > 120.0) {
                const respawnPt = ground.trackPt.clone().add(new THREE.Vector3(0, 1.2, 0));
                this.teleport(respawnPt, ground.fwd);
                return;
            }
        }

        // 3. Drive Acceleration & Braking
        let targetAccel = 0;
        if (this.inputs.throttle > 0) {
            targetAccel = this.inputs.throttle * (isOffroad ? accelPower * 0.45 : accelPower);
        } else if (this.inputs.brake > 0) {
            targetAccel = -this.inputs.brake * (accelPower * 1.3);
        }

        // Boost thrust & automatic recharge over time
        if (this.inputs.boost && this.boostLeft > 0) {
            targetAccel += 55.0;
            this.boostLeft = Math.max(0, this.boostLeft - delta);
        } else if (!this.inputs.boost && this.boostLeft < this.maxBoost) {
            this.boostLeft = Math.min(this.maxBoost, this.boostLeft + delta * 0.50);
        }

        this.speed += targetAccel * delta;

        // Top speed limits
        const topLimit = this.inputs.boost && this.boostLeft > 0 ? maxSpeed * 1.45 : maxSpeed;
        if (this.speed > topLimit) {
            this.speed = THREE.MathUtils.lerp(this.speed, topLimit, delta * 3.0);
        }
        if (this.inputs.throttle === 0 && this.inputs.brake === 0) {
            this.speed = THREE.MathUtils.lerp(this.speed, 0, delta * (isOffroad ? 3.0 : 1.5));
        }

        // 4. Steering & Drift
        this.isDrifting = this.inputs.drift && Math.abs(this.speed) > 10.0 && Math.abs(this.inputs.steer) > 0.1;
        const turnMult = this.isDrifting ? 1.45 : (isOffroad ? 0.75 : 1.0);
        const steerSpeed = (this.stats.yaw * 1.1) * turnMult;

        this.heading += this.inputs.steer * steerSpeed * (this.speed / maxSpeed) * delta;

        if (this.isDrifting && this.isPlayer) {
            this.driftScore += Math.abs(this.speed) * delta * 12.0;
        }

        // 5. Velocity Integration
        const fwdX = -Math.sin(this.heading);
        const fwdZ = -Math.cos(this.heading);

        this.velocity.x = fwdX * this.speed;
        this.velocity.z = fwdZ * this.speed;

        this.position.x += this.velocity.x * delta;
        this.position.y += this.velocity.y * delta;
        this.position.z += this.velocity.z * delta;

        // Robust Ramp & Ground Clamping: Hull never penetrates into road or ramps
        const minClearance = ground.y + this.hoverHeight * 0.90;
        if (this.position.y < minClearance) {
            this.position.y = minClearance;
            if (this.velocity.y < 0) this.velocity.y = 0;
            // Ramp upward velocity assist
            if (this.speed > 5.0 && this.pitch < -0.05) {
                const rampClimbVel = this.speed * Math.sin(-this.pitch);
                if (this.velocity.y < rampClimbVel) {
                    this.velocity.y = rampClimbVel;
                }
            }
        }

        // 6. Distinct Ground-Aligned vs. Airborne Flight Attitude
        const rightX = Math.cos(this.heading);
        const rightZ = -Math.sin(this.heading);

        if (this.grounded) {
            // Grounded: Sample terrain ahead and behind along vehicle heading
            const frontPos = new THREE.Vector3(this.position.x + fwdX * 1.6, this.position.y, this.position.z + fwdZ * 1.6);
            const rearPos = new THREE.Vector3(this.position.x - fwdX * 1.6, this.position.y, this.position.z - fwdZ * 1.6);
            const frontGround = this._sampleTrackGround(frontPos, trackData);
            const rearGround = this._sampleTrackGround(rearPos, trackData);

            // Pitch angle: Negative rotates nose UP and rear DOWN to ascend hill cleanly!
            const targetPitch = -Math.atan2(frontGround.y - rearGround.y, 3.2);

            // Cross-slope roll: sample ground to left and right
            const rPos = new THREE.Vector3(this.position.x + rightX * 0.9, this.position.y, this.position.z + rightZ * 0.9);
            const lPos = new THREE.Vector3(this.position.x - rightX * 0.9, this.position.y, this.position.z - rightZ * 0.9);
            const rGround = this._sampleTrackGround(rPos, trackData);
            const lGround = this._sampleTrackGround(lPos, trackData);
            const crossSlope = Math.atan2(rGround.y - lGround.y, 1.8);

            const steerLean = -this.inputs.steer * (this.isDrifting ? 0.38 : 0.18);
            const targetRoll = steerLean + crossSlope * 0.70;

            this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch, delta * 12.0);
            this.roll = THREE.MathUtils.lerp(this.roll, targetRoll, delta * 10.0);

            // Hill climbing assist: Maintain momentum when ascending steep hills
            if (this.pitch < -0.10 && this.inputs.throttle > 0) {
                this.speed = Math.max(this.speed, 22.0);
            }
        } else {
            // Airborne Flight: Nose smoothly follows flight trajectory vector
            const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
            const flightPitch = horizSpeed > 1.0 ? -Math.atan2(this.velocity.y, horizSpeed) : 0.0;
            this.pitch = THREE.MathUtils.lerp(this.pitch, flightPitch, delta * 4.5);
            this.roll = THREE.MathUtils.lerp(this.roll, 0.0, delta * 3.0); // Self-level roll in air
        }

        this.root.position.copy(this.position);
        this.root.rotation.set(this.pitch, this.heading, this.roll, 'YXZ');

        // 7. Check Star Ramp Launch (Player AND Rivals!)
        if (ground.tag && (ground.tag & 2) !== 0 && this.speed > 16.0) {
            this.startAscension();
        }

        return ground;
    }

    _sampleTrackGround(pos, trackData) {
        const { points, tangents, binormals, tags } = trackData;
        const n = points.length;
        let closestDist = Infinity;
        let closestIndex = 0;

        for (let i = 0; i < n; i++) {
            const d = pos.distanceTo(points[i]);
            if (d < closestDist) {
                closestDist = d;
                closestIndex = i;
            }
        }

        let i0 = closestIndex;
        let i1 = closestIndex + 1;
        if (i1 >= n) {
            i0 = n - 2;
            i1 = n - 1;
        } else if (closestIndex > 0) {
            const pPrev = points[closestIndex - 1];
            const pCur = points[closestIndex];
            const pNext = points[closestIndex + 1];
            const toPrev = pPrev.clone().sub(pCur);
            const toNext = pNext.clone().sub(pCur);
            const v = pos.clone().sub(pCur);
            if (v.dot(toPrev) > v.dot(toNext)) {
                i0 = closestIndex - 1;
                i1 = closestIndex;
            }
        }

        const pA = points[i0];
        const pB = points[i1];
        const seg = pB.clone().sub(pA);
        const segLenSq = seg.lengthSq();
        let t = 0;
        if (segLenSq > 0.0001) {
            t = THREE.MathUtils.clamp(pos.clone().sub(pA).dot(seg) / segLenSq, 0, 1);
        }

        const trackPt = pA.clone().lerp(pB, t);
        const fwd = tangents[i0].clone().lerp(tangents[i1], t).normalize();
        const right = binormals[i0].clone().lerp(binormals[i1], t).normalize();

        const toVehicle = pos.clone().sub(trackPt);
        toVehicle.y = 0;
        const lateralDist = toVehicle.dot(right);
        const absLat = Math.abs(lateralDist);
        let groundY = trackPt.y;
        if (absLat > 5.5) {
            const curbBlend = THREE.MathUtils.clamp((absLat - 5.5) / 2.5, 0, 1);
            const naturalTerrainY = getTerrainHeight(pos.x, pos.z);
            groundY = THREE.MathUtils.lerp(trackPt.y, naturalTerrainY, curbBlend);
        }
        const isOffroad = absLat > 5.8;
        const slope = (pB.y - pA.y) / Math.max(pA.distanceTo(pB), 1.0);

        return {
            y: groundY,
            slope: -slope * 0.8,
            tag: tags[i0],
            lateralDist,
            isOffroad,
            trackPt,
            fwd,
            right,
            closestIndex
        };
    }

    startAscension() {
        if (this.ascended) return;
        this.ascended = true;
        this.velocity.set(0, 32.0, -48.0);
        if (this.shadow) {
            this.shadow.visible = false;
        }

        // 1. Turn vehicle mesh into brilliant glowing pure white
        const whiteMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveIntensity: 4.5,
            roughness: 0.1
        });
        this.mesh.material = whiteMat;

        // 2. Spawn a vertical column of light ascending into the skies
        const beamGeom = new THREE.CylinderGeometry(1.4, 2.5, 600, 24, 1, true);
        const beamMat = new THREE.MeshBasicMaterial({
            color: 0x00f2fe,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this.lightBeam = new THREE.Mesh(beamGeom, beamMat);
        this.lightBeam.position.set(this.position.x, this.position.y + 300, this.position.z);
        this.scene.add(this.lightBeam);

        const coreGeom = new THREE.CylinderGeometry(0.45, 0.8, 600, 16, 1, true);
        const coreMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const core = new THREE.Mesh(coreGeom, coreMat);
        this.lightBeam.add(core);
    }

    _updateAscension(delta) {
        this.position.addScaledVector(this.velocity, delta);
        this.velocity.y += 6.0 * delta;
        this.root.position.copy(this.position);
        this.root.rotation.x = THREE.MathUtils.lerp(this.root.rotation.x, -0.65, delta * 3.0);

        if (this.lightBeam) {
            this.lightBeam.position.x = this.position.x;
            this.lightBeam.position.z = this.position.z;
            this.lightBeam.material.opacity = THREE.MathUtils.lerp(this.lightBeam.material.opacity, 0.45, delta * 1.5);
        }
    }

    destroy() {
        if (this.root.parent) this.root.parent.remove(this.root);
        if (this.lightBeam && this.lightBeam.parent) this.lightBeam.parent.remove(this.lightBeam);
    }
}
