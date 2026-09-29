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
        this.root.add(this.mesh);

        // Dual Xenon Headlights (Front nose cone)
        const hlMat = new THREE.MeshStandardMaterial({
            color: 0x00f2fe,
            emissive: 0x00f2fe,
            emissiveIntensity: 2.8
        });
        const hlL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.15), hlMat);
        hlL.position.set(-0.25, 0.22, -1.25);
        this.root.add(hlL);
        const hlR = hlL.clone();
        hlR.position.x = 0.25;
        this.root.add(hlR);

        // Dual Red Taillights (Rear deck)
        const tlMat = new THREE.MeshStandardMaterial({
            color: 0xff1122,
            emissive: 0xff1122,
            emissiveIntensity: 2.8
        });
        const tlL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.12), tlMat);
        tlL.position.set(-0.55, 0.35, 1.35);
        this.root.add(tlL);
        const tlR = tlL.clone();
        tlR.position.x = 0.55;
        this.root.add(tlR);

        this.scene.add(this.root);

        // Projected 2D Silhouette Shadow with polygonOffset for zero z-fighting
        const shadowMat = new THREE.MeshBasicMaterial({
            color: 0x05060a,
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -6,
            polygonOffsetUnits: -12
        });
        this.shadow = new THREE.Mesh(geometry.clone(), shadowMat);
        this.shadow.renderOrder = 4;
        this.scene.add(this.shadow);

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
        this._updateShadow(this.position.y);
    }

    update(delta, trackData) {
        if (this.ascended) {
            this._updateAscension(delta);
            return;
        }

        // 1. Continuous Spline Ground Projection
        const ground = this._sampleTrackGround(this.position, trackData);
        const altitude = this.position.y - ground.y;
        this.grounded = altitude < 1.5 && altitude > -0.5;

        if (this.grounded) {
            const springForce = (this.hoverHeight - altitude) * 42.0;
            const dampForce = -this.velocity.y * 9.0;
            this.velocity.y += (springForce + dampForce) * delta;
            this.airTime = 0;
        } else {
            // Free-fall in air
            this.velocity.y -= 24.0 * delta;
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

        // Boost thrust
        if (this.inputs.boost && this.boostLeft > 0) {
            targetAccel += 45.0;
            this.boostLeft = Math.max(0, this.boostLeft - delta);
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

        // Ground Clamping
        if (this.position.y < ground.y + 0.1) {
            this.position.y = ground.y + 0.1;
            if (this.velocity.y < 0) this.velocity.y = 0;
        }

        // 6. Visual Banking & Pitching
        const leanTarget = -this.inputs.steer * (this.isDrifting ? 0.42 : 0.22);
        this.roll = THREE.MathUtils.lerp(this.roll, leanTarget, delta * 8.0);
        this.pitch = THREE.MathUtils.lerp(this.pitch, ground.slope, delta * 6.0);

        this.root.position.copy(this.position);
        this.root.rotation.set(this.pitch, this.heading, this.roll, 'YXZ');

        // 7. Update True 3D Silhouette Shadow (Aligned strictly to road slope to eliminate clipping)
        this._updateShadow(ground.y, ground.slope);

        // 8. Check Star Ramp Launch (Player AND Rivals!)
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

    _updateShadow(groundY, groundSlope = 0) {
        if (!this.shadow) return;

        // Position shadow slightly elevated above road to eliminate curve clipping
        this.shadow.position.set(this.position.x, groundY + 0.08, this.position.z);
        // Align strictly with road surface slope so body bounce doesn't clip shadow
        this.shadow.rotation.set(groundSlope, this.heading, 0, 'YXZ');
        this.shadow.scale.set(this.mesh.scale.x, 0.001, this.mesh.scale.z);

        const height = this.position.y - groundY;
        this.shadow.material.opacity = THREE.MathUtils.clamp(1.0 - height / 14.0, 0.15, 0.58);
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
        if (this.shadow && this.shadow.parent) this.shadow.parent.remove(this.shadow);
        if (this.lightBeam && this.lightBeam.parent) this.lightBeam.parent.remove(this.lightBeam);
    }
}
