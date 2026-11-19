// vehicle.js — Unified Hover Vehicle Class with 4-Corner Wheelbase Ramp Physics
import * as THREE from 'three';
import { getTerrainHeight, getTerrainNormal } from './terrain.js';
import { mergeColoredGeometries } from './road/scenery_batcher.js';

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

        const refGeom = baseGeometry || geometry;
        refGeom.computeBoundingBox();
        const box = refGeom.boundingBox || new THREE.Box3(new THREE.Vector3(-0.7, 0, -1.5), new THREE.Vector3(0.7, 0.8, 1.5));
        const frontZ = box.min.z;
        const rearZ = box.max.z;
        const halfW = Math.max(0.18, (box.max.x - box.min.x) * 0.24);
        const lightY = box.min.y + (box.max.y - box.min.y) * 0.38;

        // Merged Dual Xenon Headlights (1 draw call instead of 2)
        const hlMat = new THREE.MeshStandardMaterial({
            color: 0x00f2fe,
            emissive: 0x00f2fe,
            emissiveIntensity: 2.8
        });
        const hlBox = new THREE.BoxGeometry(0.14, 0.08, 0.12);
        const hlGeom = mergeColoredGeometries([
            { geometry: hlBox, color: 0xffffff, matrix: new THREE.Matrix4().makeTranslation(-halfW, lightY, frontZ + 0.06) },
            { geometry: hlBox, color: 0xffffff, matrix: new THREE.Matrix4().makeTranslation(halfW, lightY, frontZ + 0.06) }
        ]);
        hlBox.dispose();
        const hlMesh = new THREE.Mesh(hlGeom, hlMat);
        this.modelGroup.add(hlMesh);

        // Merged Dual Red Taillights / Brake Lights (1 draw call instead of 2)
        const tlMat = new THREE.MeshStandardMaterial({
            color: 0xff1122,
            emissive: 0xff1122,
            emissiveIntensity: 2.0
        });
        const tlBox = new THREE.BoxGeometry(0.20, 0.08, 0.12);
        const tlGeom = mergeColoredGeometries([
            { geometry: tlBox, color: 0xffffff, matrix: new THREE.Matrix4().makeTranslation(-halfW * 1.25, lightY + 0.08, rearZ - 0.06) },
            { geometry: tlBox, color: 0xffffff, matrix: new THREE.Matrix4().makeTranslation(halfW * 1.25, lightY + 0.08, rearZ - 0.06) }
        ]);
        tlBox.dispose();
        const tlMesh = new THREE.Mesh(tlGeom, tlMat);
        this.modelGroup.add(tlMesh);
        this.brakeLights = [tlMesh];

        if (garageEuler) {
            this.modelGroup.rotation.copy(garageEuler);
        }
        this.scene.add(this.root);

        // Soft Ground Contact Shadow
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

        // Motion & Attitude State
        this.position = new THREE.Vector3();
        this.velocity = new THREE.Vector3();
        this.heading = 0;
        this.pitch = 0;
        this.roll = 0;

        this.hoverHeight = 0.65;
        this.speed = 0;
        this.grounded = true;
        this.isDrifting = false;
        this.driftScore = 0;
        this.maxBoost = 3.0;
        this.boostLeft = this.maxBoost;
        this.boostRechargeRate = 0.65;
        this.airTime = 0;
        this.ascended = false;
        this.lastTrackIndex = null;

        this.inputs = {
            throttle: 0,
            brake: 0,
            steer: 0,
            boost: false,
            drift: false
        };

        // Pre-allocated scratch objects (zero per-frame heap churn)
        this._groundOut = {};
        this._cFL = {};
        this._cFR = {};
        this._cRL = {};
        this._cRR = {};
        this._fallbackNorm = new THREE.Vector3(0, 1, 0);
        this._vOne = new THREE.Vector3(1, 1, 1);
        this._vZero = new THREE.Vector3(0, 0, 0);
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
        this.pitch = 0;
        this.roll = 0;
        this.grounded = true;
        this.airTime = 0;
        this.lastTrackIndex = null;
        if (direction) {
            this.heading = Math.atan2(-direction.x, -direction.z);
        }
        this.root.position.copy(this.position);
        this.root.rotation.set(0, this.heading, 0, 'YXZ');
    }

    _samplePointSurface(x, z, refY, trackData, out) {
        if (trackData && typeof trackData.sampleSurface === 'function') {
            return trackData.sampleSurface(x, z, refY, out);
        }
        out.y = getTerrainHeight(x, z);
        out.isOffroad = true;
        out.isElevated = false;
        out.isOverhead = false;
        out.overheadY = Infinity;
        out.lateralDist = 0;
        out.halfWidth = 6.2;
        out.tag = 0;
        out.normal = getTerrainNormal(x, z, 1.0, this._fallbackNorm);
        return out;
    }

    update(delta, trackData) {
        if (this.ascended) {
            this._updateAscension(delta);
            return null;
        }

        const fwdX = -Math.sin(this.heading);
        const fwdZ = -Math.cos(this.heading);
        const rightX = Math.cos(this.heading);
        const rightZ = -Math.sin(this.heading);

        // 1. 4-Corner Wheelbase + Center Surface Sampling
        const ground = this._samplePointSurface(this.position.x, this.position.z, this.position.y, trackData, this._groundOut);
        const hl = 1.35;
        const hw = 0.75;
        const sFL = this._samplePointSurface(this.position.x + fwdX * hl - rightX * hw, this.position.z + fwdZ * hl - rightZ * hw, this.position.y, trackData, this._cFL);
        const sFR = this._samplePointSurface(this.position.x + fwdX * hl + rightX * hw, this.position.z + fwdZ * hl + rightZ * hw, this.position.y, trackData, this._cFR);
        const sRL = this._samplePointSurface(this.position.x - fwdX * hl - rightX * hw, this.position.z - fwdZ * hl - rightZ * hw, this.position.y, trackData, this._cRL);
        const sRR = this._samplePointSurface(this.position.x - fwdX * hl + rightX * hw, this.position.z - fwdZ * hl + rightZ * hw, this.position.y, trackData, this._cRR);

        const frontAvgY = (sFL.y + sFR.y) * 0.5;
        const rearAvgY  = (sRL.y + sRR.y) * 0.5;
        const leftAvgY  = (sFL.y + sRL.y) * 0.5;
        const rightAvgY = (sFR.y + sRR.y) * 0.5;
        const cornerAvgY = (frontAvgY + rearAvgY) * 0.5;

        // Anticipate uphill ramp transitions cleanly with 4-corner average
        const effectiveGroundY = Math.max(ground.y, cornerAvgY - 0.04);
        const altitude = this.position.y - effectiveGroundY;

        // Hysteresis grounding (never ungrounds on deep compression!)
        if (this.grounded) {
            this.grounded = altitude <= (this.hoverHeight + 0.65);
        } else {
            this.grounded = altitude <= (this.hoverHeight + 0.25) && this.velocity.y <= 5.0;
        }

        if (this.grounded) {
            const compression = this.hoverHeight - altitude;
            let springForce = 0;
            if (compression > 0) {
                const compRatio = compression / this.hoverHeight;
                springForce = Math.pow(compRatio, 1.6) * 145.0 + compression * 65.0;
            } else {
                springForce = compression * 28.0;
            }
            const dampForce = -this.velocity.y * 10.5;
            this.velocity.y += (springForce + dampForce) * delta;
            this.airTime = 0;
        } else {
            this.velocity.y -= 26.0 * delta;
            this.airTime += delta;
        }

        // 2. Drive Acceleration, Slope Gravity & Off-Road Drag
        const isOffroad = ground.isOffroad;
        const accelPower = this.stats.accel * (this.isPlayer ? 1.0 : 0.88);
        let maxSpeed = this.stats.top_speed;

        if (isOffroad) {
            maxSpeed = Math.min(maxSpeed, 38.0);
            if (this.speed > maxSpeed && !this.inputs.boost) {
                this.speed = THREE.MathUtils.lerp(this.speed, maxSpeed, delta * 2.0);
            }
        }

        let targetAccel = 0;
        if (this.inputs.throttle > 0) {
            targetAccel = this.inputs.throttle * (isOffroad ? accelPower * 0.55 : accelPower);
        } else if (this.inputs.brake > 0) {
            targetAccel = -this.inputs.brake * (accelPower * 1.35);
        }

        // Gentle slope dynamics: exhilarating speed downhill, steady torque uphill
        if (this.grounded) {
            targetAccel -= Math.sin(this.pitch) * 12.0;
            if (this.pitch > 0.08 && this.inputs.throttle > 0) {
                targetAccel += Math.sin(this.pitch) * 18.0; // Uphill assist
            }
        }

        if (this.inputs.boost && this.boostLeft > 0) {
            targetAccel += 55.0;
            this.boostLeft = Math.max(0, this.boostLeft - delta);
        } else if (this.boostLeft < this.maxBoost) {
            const rechargeRate = this.boostRechargeRate || 0.65;
            const driftBonus = this.isDrifting ? 1.75 : 1.0;
            this.boostLeft = Math.min(this.maxBoost, this.boostLeft + delta * rechargeRate * driftBonus);
        }

        this.speed += targetAccel * delta;

        const topLimit = (this.inputs.boost && this.boostLeft > 0) ? maxSpeed * 1.45 : maxSpeed;
        if (this.speed > topLimit) {
            this.speed = THREE.MathUtils.lerp(this.speed, topLimit, delta * 3.0);
        }
        if (this.inputs.throttle === 0 && this.inputs.brake === 0) {
            this.speed = THREE.MathUtils.lerp(this.speed, 0, delta * (isOffroad ? 2.6 : 1.4));
        }

        // 3. Steering & Drift
        this.isDrifting = this.inputs.drift && Math.abs(this.speed) > 10.0 && Math.abs(this.inputs.steer) > 0.1;
        const turnMult = this.isDrifting ? 1.45 : (isOffroad ? 0.78 : 1.0);
        const steerSpeed = (this.stats.yaw * 1.1) * turnMult;
        const speedNorm = THREE.MathUtils.clamp(this.speed / Math.max(1.0, maxSpeed), -0.6, 1.4);
        this.heading += this.inputs.steer * steerSpeed * speedNorm * delta;

        if (this.isDrifting && this.isPlayer) {
            this.driftScore += Math.abs(this.speed) * delta * 12.0;
        }

        // 4. 3D Tangential Velocity Projection along Active Slope
        const slopeCos = this.grounded ? Math.max(0.45, Math.cos(this.pitch)) : 1.0;
        this.velocity.x = -Math.sin(this.heading) * this.speed * slopeCos;
        this.velocity.z = -Math.cos(this.heading) * this.speed * slopeCos;

        this.position.x += this.velocity.x * delta;
        this.position.y += this.velocity.y * delta;
        this.position.z += this.velocity.z * delta;

        // 5. Elevated Ramp Guardrail Barrier Deflection (impossible to drop off tall ramps)
        if (ground.isElevated && !ground.isOffroad && !ground.inJunction && ground.right && ground.fwd) {
            const halfW = ground.halfWidth || 6.2;
            const barrierLimit = halfW - 1.15;
            const absLat = Math.abs(ground.lateralDist || 0);
            if (absLat > barrierLimit) {
                const sign = ground.lateralDist >= 0 ? 1.0 : -1.0;
                const pushIn = (absLat - barrierLimit);
                this.position.x -= ground.right.x * sign * pushIn;
                this.position.z -= ground.right.z * sign * pushIn;

                // Gently steer heading back parallel to road tangent
                const roadHeading = Math.atan2(-ground.fwd.x, -ground.fwd.z);
                const oppHeading = roadHeading + Math.PI;
                let dA = roadHeading - this.heading;
                while (dA > Math.PI) dA -= Math.PI * 2;
                while (dA < -Math.PI) dA += Math.PI * 2;
                let dB = oppHeading - this.heading;
                while (dB > Math.PI) dB -= Math.PI * 2;
                while (dB < -Math.PI) dB += Math.PI * 2;
                const targetRoadHeading = Math.abs(dA) <= Math.abs(dB) ? roadHeading : oppHeading;
                let dH = targetRoadHeading - this.heading;
                while (dH > Math.PI) dH -= Math.PI * 2;
                while (dH < -Math.PI) dH += Math.PI * 2;
                this.heading += dH * Math.min(1.0, delta * 8.0);
                this.speed *= 0.96;
            }
        }

        // 6. Smooth Ramp Floor Clamping & Tangential Climb Projection
        const surfNorm = ground.normal || this._fallbackNorm;
        const cosSlope = Math.max(0.42, surfNorm.y);
        const minClearance = effectiveGroundY + (this.hoverHeight / cosSlope) * 0.62;
        if (this.position.y < minClearance) {
            this.position.y = minClearance;
            const tangentVelY = this.speed * Math.sin(this.pitch);
            if (this.velocity.y < tangentVelY) {
                this.velocity.y = tangentVelY;
            }
            this.grounded = true;
        }

        // Underpass Ceiling Collision
        if (ground.isOverhead && ground.overheadY !== undefined && this.position.y > ground.overheadY - 1.2) {
            this.position.y = ground.overheadY - 1.2;
            if (this.velocity.y > 0) this.velocity.y = -2.0;
        }

        // 7. 4-Corner Attitude Alignment vs Airborne Trajectory
        if (this.grounded) {
            const targetPitch = Math.atan2(frontAvgY - rearAvgY, 2.7);
            const slopeRoll = Math.atan2(rightAvgY - leftAvgY, 1.5) * 0.85;
            const steerLean = this.inputs.steer * (this.isDrifting ? 0.30 : 0.16);
            const targetRoll = slopeRoll + steerLean;

            const pitchRate = Math.abs(targetPitch - this.pitch) > 0.15 ? 20.0 : 14.0;
            this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch, Math.min(1.0, delta * pitchRate));
            this.roll = THREE.MathUtils.lerp(this.roll, targetRoll, Math.min(1.0, delta * 12.0));
        } else {
            const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
            const flightPitch = horizSpeed > 1.0 ? Math.atan2(this.velocity.y, horizSpeed) : 0.0;
            this.pitch = THREE.MathUtils.lerp(this.pitch, flightPitch, Math.min(1.0, delta * 5.0));
            this.roll = THREE.MathUtils.lerp(this.roll, 0.0, Math.min(1.0, delta * 3.5));
        }

        this.root.position.copy(this.position);
        this.root.rotation.set(this.pitch, this.heading, this.roll, 'YXZ');

        // 8. Boost Squash & Stretch Juice
        const isBoosting = this.inputs.boost && this.boostLeft > 0;
        if (isBoosting) {
            this.mesh.scale.set(
                THREE.MathUtils.lerp(this.mesh.scale.x, 0.88, delta * 14.0),
                THREE.MathUtils.lerp(this.mesh.scale.y, 0.88, delta * 14.0),
                THREE.MathUtils.lerp(this.mesh.scale.z, 1.20, delta * 14.0)
            );
            this.mesh.position.set(
                (Math.random() - 0.5) * 0.045,
                (Math.random() - 0.5) * 0.045,
                (Math.random() - 0.5) * 0.030
            );
        } else {
            this.mesh.scale.lerp(this._vOne, Math.min(1.0, delta * 10.0));
            this.mesh.position.lerp(this._vZero, Math.min(1.0, delta * 12.0));
        }

        if (this.contactShadow) {
            this.contactShadow.position.set(this.position.x, effectiveGroundY + 0.04, this.position.z);
            this.contactShadow.rotation.set(this.pitch, this.heading, this.roll, 'YXZ');
            this.contactShadow.visible = this.grounded && !this.ascended;
        }

        const isBraking = (this.inputs.brake > 0.1) || (this.speed > 3.0 && this.inputs.throttle < -0.1);
        const targetIntensity = isBraking ? 6.5 : 2.0;
        for (let i = 0; i < this.brakeLights.length; i++) {
            this.brakeLights[i].material.emissiveIntensity = THREE.MathUtils.lerp(
                this.brakeLights[i].material.emissiveIntensity,
                targetIntensity,
                Math.min(1.0, delta * 14.0)
            );
        }

        if (ground.tag && (ground.tag & 2) !== 0 && this.speed > 16.0) {
            this.startAscension();
        }

        return ground;
    }

    _sampleTrackGround(pos, trackData) {
        return this._samplePointSurface(pos.x, pos.z, pos.y, trackData, this._groundOut);
    }

    startAscension() {
        if (this.ascended) return;
        this.ascended = true;
        this.velocity.set(0, 32.0, -48.0);
        if (this.contactShadow) this.contactShadow.visible = false;

        const whiteMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveIntensity: 4.5,
            roughness: 0.1
        });
        this.mesh.material = whiteMat;

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
        this.lightBeam.add(new THREE.Mesh(coreGeom, coreMat));
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
