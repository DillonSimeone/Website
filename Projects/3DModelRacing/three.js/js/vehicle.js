// vehicle.js — Unified Hover Vehicle Class for Player & NPC Rivals
import * as THREE from 'three';
import { getTerrainHeight } from './terrain.js';

export class Vehicle {
    constructor(scene, geometry, material, stats, isPlayer = false, name = 'Racer', garageEuler = null, baseGeometry = null) {
        this.scene = scene;
        this.stats = { ...stats };
        this.isPlayer = isPlayer;
        this.name = name;

        // Vehicle Mesh & Root Hierarchy
        this.root = new THREE.Group();
        this.modelGroup = new THREE.Group();
        this.root.add(this.modelGroup);

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.modelGroup.add(this.mesh);

        // Compute reference bounds from unrotated base geometry if provided (matching garage!), otherwise from geometry
        const refGeom = baseGeometry || geometry;
        refGeom.computeBoundingBox();
        const box = refGeom.boundingBox || new THREE.Box3(new THREE.Vector3(-0.7, 0, -1.5), new THREE.Vector3(0.7, 0.8, 1.5));
        const frontZ = box.min.z;
        const rearZ = box.max.z;
        const halfW = Math.max(0.18, (box.max.x - box.min.x) * 0.24);
        const lightY = box.min.y + (box.max.y - box.min.y) * 0.38;

        // Dual Xenon Headlights (Front nose cone — integrated directly as child meshes of modelGroup)
        const hlMat = new THREE.MeshStandardMaterial({
            color: 0x00f2fe,
            emissive: 0x00f2fe,
            emissiveIntensity: 2.8
        });
        const hlL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.12), hlMat);
        hlL.position.set(-halfW, lightY, frontZ + 0.06);
        hlL.castShadow = true;
        this.modelGroup.add(hlL);

        const hlR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.12), hlMat);
        hlR.position.set(halfW, lightY, frontZ + 0.06);
        hlR.castShadow = true;
        this.modelGroup.add(hlR);

        // Dual Red Taillights / Brake Lights (Rear deck — integrated directly as child meshes of modelGroup)
        const tlMat = new THREE.MeshStandardMaterial({
            color: 0xff1122,
            emissive: 0xff1122,
            emissiveIntensity: 2.0
        });
        const tlL = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.08, 0.12), tlMat);
        tlL.position.set(-halfW * 1.25, lightY + 0.08, rearZ - 0.06);
        tlL.castShadow = true;
        this.modelGroup.add(tlL);

        const tlR = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.08, 0.12), tlMat);
        tlR.position.set(halfW * 1.25, lightY + 0.08, rearZ - 0.06);
        tlR.castShadow = true;
        this.modelGroup.add(tlR);

        this.brakeLights = [tlL, tlR];

        // Apply garage orientation to modelGroup so the vehicle and all lights rotate as one unified model!
        if (garageEuler) {
            this.modelGroup.rotation.copy(garageEuler);
        }

        this.scene.add(this.root);

        // Soft Ground Contact AO Shadow (guarantees a grounded vehicle look on both road & terrain)
        if (!Vehicle.sharedShadowTex) {
            const sc = document.createElement('canvas');
            sc.width = 128; sc.height = 128;
            const sctx = sc.getContext('2d');
            const radGrad = sctx.createRadialGradient(64, 64, 12, 64, 64, 60);
            radGrad.addColorStop(0.0, 'rgba(0, 0, 0, 0.85)');
            radGrad.addColorStop(0.45, 'rgba(0, 0, 0, 0.40)');
            radGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
            sctx.fillStyle = radGrad;
            sctx.fillRect(0, 0, 128, 128);
            Vehicle.sharedShadowTex = new THREE.CanvasTexture(sc);
            Vehicle.sharedShadowMat = new THREE.MeshBasicMaterial({
                map: Vehicle.sharedShadowTex,
                transparent: true,
                opacity: 0.75,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -4,
                polygonOffsetUnits: -4
            });
            Vehicle.sharedShadowGeom = new THREE.PlaneGeometry(2.4, 3.8);
            Vehicle.sharedShadowGeom.rotateX(-Math.PI / 2);
        }

        this.contactShadow = new THREE.Mesh(Vehicle.sharedShadowGeom, Vehicle.sharedShadowMat);
        this.contactShadow.renderOrder = 3;
        this.scene.add(this.contactShadow);

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
        this.maxBoost = 3.0;
        this.boostLeft = this.maxBoost;
        this.boostRechargeRate = 0.65; // Recovers 1s of boost every 1.5s
        this.airTime = 0;
        this.ascended = false;
        this.lastTrackIndex = null;

        // Input state (driven by Keyboard for Player, or AIController for Rivals)
        this.inputs = {
            throttle: 0,
            brake: 0,
            steer: 0,
            boost: false,
            drift: false
        };
    }

    onChunkShift(removedCount) {
        if (this.lastTrackIndex != null) {
            this.lastTrackIndex = Math.max(0, this.lastTrackIndex - removedCount);
        }
    }

    teleport(position, direction) {
        this.position.copy(position);
        this.velocity.set(0, 0, 0);
        this.speed = 0;
        this.lastTrackIndex = null;
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
            maxSpeed = Math.min(maxSpeed, 36.0); // Responsive off-road cruising across hills
            if (this.speed > maxSpeed && !this.inputs.boost) {
                this.speed = THREE.MathUtils.lerp(this.speed, maxSpeed, delta * 2.0);
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
        } else if (this.boostLeft < this.maxBoost) {
            const rechargeRate = this.boostRechargeRate || 0.65;
            const driftBonus = this.isDrifting ? 1.75 : 1.0;
            this.boostLeft = Math.min(this.maxBoost, this.boostLeft + delta * rechargeRate * driftBonus);
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

        // Robust Ramp & Ground Clamping: Cushion along surface normal prevents nose/tail road clipping on ramps
        const surfNorm = ground.normal || new THREE.Vector3(0, 1, 0);
        const cosSlope = Math.max(0.35, surfNorm.y);
        const minClearance = ground.y + (this.hoverHeight / cosSlope) * 0.88;
        if (this.position.y < minClearance) {
            this.position.y = minClearance;
            if (this.velocity.y < 0) this.velocity.y = 0;
            // Ramp upward velocity assist (positive pitch = ascending uphill)
            if (this.speed > 5.0 && this.pitch > 0.05) {
                const rampClimbVel = this.speed * Math.sin(this.pitch);
                if (this.velocity.y < rampClimbVel) {
                    this.velocity.y = rampClimbVel;
                }
            }
        }

        // Underpass Ceiling Collision: Prevent jumping through the underside of overhead bridges/loops
        if (ground.isOverhead && this.position.y > (ground.trackPt.y - 0.6)) {
            this.position.y = ground.trackPt.y - 0.6;
            if (this.velocity.y > 0) this.velocity.y = -2.0;
        }

        // 6. Distinct Ground-Aligned vs. Airborne Flight Attitude
        const vFwd = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
        const vRight = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));

        if (this.grounded) {
            // Surface normal: on-road uses exact 3D deck normal; off-road samples terrain height gradient
            let activeNormal = ground.normal;
            if (ground.isOffroad) {
                const hL = getTerrainHeight(this.position.x - 0.8, this.position.z);
                const hR = getTerrainHeight(this.position.x + 0.8, this.position.z);
                const hD = getTerrainHeight(this.position.x, this.position.z - 0.8);
                const hU = getTerrainHeight(this.position.x, this.position.z + 0.8);
                activeNormal = new THREE.Vector3(-(hR - hL) / 1.6, 1.0, -(hU - hD) / 1.6).normalize();
            }

            // Pitch: Positive tilts nose UP (ascend slopes), negative tilts nose DOWN (descend slopes)
            const slopeFwd = -activeNormal.dot(vFwd);
            const targetPitch = Math.atan2(slopeFwd, Math.max(0.05, activeNormal.y));

            // Cross-slope roll: Banks into curves and matches road camber
            const slopeRight = -activeNormal.dot(vRight);
            const steerLean = -this.inputs.steer * (this.isDrifting ? 0.38 : 0.18);
            const targetRoll = Math.atan2(slopeRight, Math.max(0.05, activeNormal.y)) * 0.85 + steerLean;

            // Fast, responsive tracking on steep ramps so front/back never penetrates the road
            const pitchRate = Math.abs(targetPitch) > 0.25 ? 24.0 : 15.0;
            this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch, delta * pitchRate);
            this.roll = THREE.MathUtils.lerp(this.roll, targetRoll, delta * 12.0);

            // Hill climbing assist: Maintain momentum when ascending steep hills (positive pitch is uphill)
            if (this.pitch > 0.10 && this.inputs.throttle > 0) {
                this.speed = Math.max(this.speed, 22.0);
            }
        } else {
            // Airborne Flight: Nose smoothly follows flight trajectory vector (positive flightPitch is climbing)
            const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
            const flightPitch = horizSpeed > 1.0 ? Math.atan2(this.velocity.y, horizSpeed) : 0.0;
            this.pitch = THREE.MathUtils.lerp(this.pitch, flightPitch, delta * 5.0);
            this.roll = THREE.MathUtils.lerp(this.roll, 0.0, delta * 3.5); // Self-level roll in air
        }

        this.root.position.copy(this.position);
        this.root.rotation.set(this.pitch, this.heading, this.roll, 'YXZ');

        // Boost Juiciness: Dynamic Mesh Stretch & Engine Shudder Vibration
        const isBoosting = this.inputs.boost && this.boostLeft > 0;
        if (isBoosting) {
            // Stretch along forward axis (Z), squash width & height (X, Y)
            const targetSx = THREE.MathUtils.lerp(this.mesh.scale.x, 0.88, delta * 14.0);
            const targetSy = THREE.MathUtils.lerp(this.mesh.scale.y, 0.88, delta * 14.0);
            const targetSz = THREE.MathUtils.lerp(this.mesh.scale.z, 1.20, delta * 14.0);
            this.mesh.scale.set(targetSx, targetSy, targetSz);

            // High-frequency engine vibration shudder
            const vibX = (Math.random() - 0.5) * 0.045;
            const vibY = (Math.random() - 0.5) * 0.045;
            const vibZ = (Math.random() - 0.5) * 0.030;
            this.mesh.position.set(vibX, vibY, vibZ);
        } else {
            // Smoothly restore normal scale and position
            this.mesh.scale.lerp(new THREE.Vector3(1, 1, 1), delta * 10.0);
            this.mesh.position.lerp(new THREE.Vector3(0, 0, 0), delta * 12.0);
        }

        // Update soft ground contact shadow directly beneath vehicle
        if (this.contactShadow) {
            const shadowY = ground.y + 0.04;
            this.contactShadow.position.set(this.position.x, shadowY, this.position.z);
            this.contactShadow.rotation.set(this.pitch, this.heading, this.roll, 'YXZ');
            this.contactShadow.visible = this.grounded && !this.ascended;
        }

        // Dynamic Brake Light Illumination
        const isBraking = (this.inputs.brake > 0.1) || (this.speed > 3.0 && this.inputs.throttle < -0.1);
        const targetIntensity = isBraking ? 6.5 : 2.0;
        if (this.brakeLights) {
            for (let i = 0; i < this.brakeLights.length; i++) {
                this.brakeLights[i].material.emissiveIntensity = THREE.MathUtils.lerp(
                    this.brakeLights[i].material.emissiveIntensity,
                    targetIntensity,
                    delta * 14.0
                );
            }
        }

        // 7. Check Star Ramp Launch (Player AND Rivals!)
        if (ground.tag && (ground.tag & 2) !== 0 && this.speed > 16.0) {
            this.startAscension();
        }

        return ground;
    }

    _sampleTrackGround(pos, trackData) {
        const { points, tangents, binormals, tags } = trackData;
        const n = points.length;
        if (n === 0) {
            return {
                y: getTerrainHeight(pos.x, pos.z),
                slope: 0,
                tag: 0,
                lateralDist: 0,
                isOffroad: true,
                trackPt: pos,
                fwd: new THREE.Vector3(0, 0, -1),
                right: new THREE.Vector3(1, 0, 0),
                normal: new THREE.Vector3(0, 1, 0),
                closestIndex: 0
            };
        }

        let closestDist = Infinity;
        let closestIndex = 0;

        // 1. Local Waypoint Tracking (Prevents jumping onto overhead bridges/loops when passing beneath!)
        if (this.lastTrackIndex != null && this.lastTrackIndex >= 0 && this.lastTrackIndex < n) {
            const minI = Math.max(0, this.lastTrackIndex - 6);
            const maxI = Math.min(n - 1, this.lastTrackIndex + 22);
            for (let i = minI; i <= maxI; i++) {
                const d = pos.distanceTo(points[i]);
                if (d < closestDist) {
                    closestDist = d;
                    closestIndex = i;
                }
            }
        }

        // 2. Global search fallback only if far away from tracked spline (e.g. after teleport or respawn)
        if (closestDist > 38.0 || this.lastTrackIndex == null) {
            closestDist = Infinity;
            for (let i = 0; i < n; i++) {
                const d = pos.distanceTo(points[i]);
                if (d < closestDist) {
                    closestDist = d;
                    closestIndex = i;
                }
            }
        }

        this.lastTrackIndex = closestIndex;

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
        const normal = new THREE.Vector3().crossVectors(right, fwd).normalize();
        const lateralDist = pos.clone().sub(trackPt).dot(right);
        const absLat = Math.abs(lateralDist);

        const naturalTerrainY = getTerrainHeight(pos.x, pos.z);
        let groundY = naturalTerrainY;
        let isOffroad = true;
        let activeNormal = normal;

        // UNDERPASS / OVERHEAD ROAD DETECTION:
        // A road is only an overhead structure (bridge/loop) if it is significantly elevated (>= +2.8m above terrain)
        // AND the vehicle is physically beneath it!
        const roadIsElevated = trackPt.y > (naturalTerrainY + 2.8);
        const vehicleIsBelowRoad = pos.y < (trackPt.y - 1.2);
        const isOverhead = roadIsElevated && vehicleIsBelowRoad;

        if (isOverhead) {
            groundY = naturalTerrainY;
            isOffroad = true;
            const hL = getTerrainHeight(pos.x - 0.8, pos.z);
            const hR = getTerrainHeight(pos.x + 0.8, pos.z);
            const hD = getTerrainHeight(pos.x, pos.z - 0.8);
            const hU = getTerrainHeight(pos.x, pos.z + 0.8);
            activeNormal = new THREE.Vector3(-(hR - hL) / 1.6, 1.0, -(hU - hD) / 1.6).normalize();
        } else if (absLat <= 5.5) {
            // Driving directly on the road deck surface
            groundY = trackPt.y;
            isOffroad = false;
            activeNormal = normal;
        } else if (absLat <= 12.0 && trackPt.y <= naturalTerrainY + 2.8) {
            // Smooth re-entry shoulder ramp: blends effortlessly from naturalTerrainY up to road deck height!
            const shoulderT = THREE.MathUtils.clamp((12.0 - absLat) / 6.5, 0, 1);
            const smoothT = shoulderT * shoulderT * (3.0 - 2.0 * shoulderT);
            groundY = THREE.MathUtils.lerp(naturalTerrainY, trackPt.y, smoothT);
            isOffroad = true;
            activeNormal = normal;
        } else {
            // Driving on off-road terrain
            groundY = naturalTerrainY;
            isOffroad = true;
            const hL = getTerrainHeight(pos.x - 0.8, pos.z);
            const hR = getTerrainHeight(pos.x + 0.8, pos.z);
            const hD = getTerrainHeight(pos.x, pos.z - 0.8);
            const hU = getTerrainHeight(pos.x, pos.z + 0.8);
            activeNormal = new THREE.Vector3(-(hR - hL) / 1.6, 1.0, -(hU - hD) / 1.6).normalize();
        }
        const slope = (pB.y - pA.y) / Math.max(pA.distanceTo(pB), 1.0);

        return {
            y: groundY,
            slope: isOverhead ? 0 : -slope * 0.8,
            tag: isOverhead ? 0 : tags[i0],
            lateralDist,
            isOffroad,
            isOverhead,
            trackPt,
            fwd,
            right,
            normal: activeNormal,
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
        if (this.contactShadow && this.contactShadow.parent) this.contactShadow.parent.remove(this.contactShadow);
        if (this.lightBeam && this.lightBeam.parent) this.lightBeam.parent.remove(this.lightBeam);
    }
}
