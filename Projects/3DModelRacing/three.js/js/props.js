/**
 * three.js/js/props.js — Batched Instanced Rally Scenery, Real 8-PointLight Pool & Skyline Landmarks
 *
 * - Granite boulders, street lamps, and chevron signs run on fixed-capacity InstancedPropPools
 *   with smooth Bayer dither fade-in/out (5 draw calls total for hundreds of props).
 * - All 8 dynamic PointLights remain permanently visible = true (modulating intensity & position)
 *   to prevent WebGL shader recompilation stalls.
 * - Wind turbines & hot air balloons use Bayer distance fade so toroidal wraps never pop.
 */
import * as THREE from 'three';
import { getTerrainHeight } from './terrain.js';
import { mergeColoredGeometries, applyBayerDitherFade, InstancedPropPool } from './road/scenery_batcher.js';

export class PropsManager {
    constructor(scene, trackData, trackCenter) {
        this.scene = scene;
        this.trackData = trackData;
        this.trackCenter = trackCenter;

        this.turbines = [];
        this.balloons = [];
        this.streetLamps = [];
        this.realLights = [];

        this.sharedUniforms = {
            uFadeCameraPos: { value: new THREE.Vector3() },
            uFadeStart:     { value: 265.0 },
            uFadeEnd:       { value: 380.0 },
            uTime:          { value: 0.0 },
            uWindStrength:  { value: 0.0 }
        };

        this.skyLandmarkUniforms = {
            uFadeCameraPos: { value: new THREE.Vector3() },
            uFadeStart:     { value: 320.0 },
            uFadeEnd:       { value: 445.0 },
            uTime:          { value: 0.0 },
            uWindStrength:  { value: 0.0 }
        };

        this._dummyPos = new THREE.Vector3();
        this._dummyQuat = new THREE.Quaternion();
        this._dummyEuler = new THREE.Euler();
        this._dummyScale = new THREE.Vector3(1, 1, 1);
        this._dummyMat = new THREE.Matrix4();
        this._sortTmp = [];

        this._initMaterials();
        this._initSharedGeometriesAndPools();
        this._initSlidingObjects();
        this._initRealLights();
    }

    _initMaterials() {
        this.whiteMat = new THREE.MeshStandardMaterial({ color: 0xf5f7fa, roughness: 0.35 });
        applyBayerDitherFade(this.whiteMat, this.skyLandmarkUniforms);

        this.darkMat = new THREE.MeshStandardMaterial({ color: 0x16191d, roughness: 0.5 });
        applyBayerDitherFade(this.darkMat, this.skyLandmarkUniforms);

        this.wickerMat = new THREE.MeshStandardMaterial({ color: 0x7c4f2b, roughness: 0.92 });
        applyBayerDitherFade(this.wickerMat, this.skyLandmarkUniforms);

        this.silverMat = new THREE.MeshStandardMaterial({ color: 0xc4cbd4, metalness: 0.82, roughness: 0.32 });
        applyBayerDitherFade(this.silverMat, this.skyLandmarkUniforms);

        this.batchedMetalMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            metalness: 0.65,
            roughness: 0.35
        });
        applyBayerDitherFade(this.batchedMetalMat, this.sharedUniforms);

        this.rockMat = new THREE.MeshStandardMaterial({
            roughness: 0.94,
            metalness: 0.06,
            vertexColors: true,
            flatShading: true
        });
        applyBayerDitherFade(this.rockMat, this.sharedUniforms);

        this.bulbMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            color: 0xfff2c8,
            emissive: 0xffb833,
            emissiveIntensity: 0.0
        });
        applyBayerDitherFade(this.bulbMat, this.sharedUniforms);
    }

    _initRealLights() {
        // CRITICAL: Keep visible = true permanently! Toggling visible triggers WebGL shader recompiles.
        for (let i = 0; i < 8; i++) {
            const pl = new THREE.PointLight(0xffeedd, 0.0, 36.0, 1.6);
            pl.position.set(0, -999, 0);
            pl.visible = true;
            this.scene.add(pl);
            this.realLights.push(pl);
        }
    }

    _createDeformedRockGeometry(radius, detail = 1) {
        const geom = new THREE.DodecahedronGeometry(radius, detail);
        const pos = geom.attributes.position;
        const v = new THREE.Vector3();
        const n = new THREE.Vector3();
        const colors = new Float32Array(pos.count * 3);

        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);
            n.copy(v).normalize();
            const disp = Math.sin(v.x * 1.6 + 6.4) * Math.cos(v.z * 1.6 + 11.2) * 0.26
                       + Math.sin(v.y * 2.2 + 9.0) * 0.16;
            v.addScaledVector(n, disp * radius);
            v.y *= 0.68;
            if (v.y < 0) v.y *= 0.62;
            pos.setXYZ(i, v.x, v.y, v.z);

            let r, g, b;
            if (n.y > 0.42 && v.y > -0.15) {
                r = 0.25; g = 0.46; b = 0.22;
            } else if (v.y < -0.32) {
                r = 0.18; g = 0.20; b = 0.22;
            } else {
                r = 0.42; g = 0.44; b = 0.46;
            }
            colors[i * 3] = r;
            colors[i * 3 + 1] = g;
            colors[i * 3 + 2] = b;
        }

        geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geom.computeVertexNormals();
        return geom;
    }

    _initSharedGeometriesAndPools() {
        const m4 = (x, y, z, rz = 0) => {
            const mat = new THREE.Matrix4();
            if (rz !== 0) mat.makeRotationZ(rz);
            mat.setPosition(x, y, z);
            return mat;
        };

        // 1. Batched Street Lamp Frame (arm faces -X in local space; rotated by side at placement)
        const darkMetalCol = 0x22272e;
        const silverCol = 0xc4cbd4;
        const lampFrameGeom = mergeColoredGeometries([
            { geometry: new THREE.CylinderGeometry(0.32, 0.44, 2.2, 8), color: darkMetalCol, matrix: m4(0, -0.6, 0) },
            { geometry: new THREE.CylinderGeometry(0.12, 0.18, 5.8, 8), color: silverCol, matrix: m4(0, 2.9, 0) },
            { geometry: new THREE.BoxGeometry(2.3, 0.16, 0.16), color: darkMetalCol, matrix: m4(1.15, 5.88, 0) },
            { geometry: new THREE.BoxGeometry(0.28, 0.26, 0.26), color: darkMetalCol, matrix: m4(0, 5.88, 0) },
            { geometry: new THREE.BoxGeometry(1.15, 0.16, 0.48), color: darkMetalCol, matrix: m4(2.3, 5.83, 0, -0.22) }
        ]);
        const lampBulbGeom = mergeColoredGeometries([
            { geometry: new THREE.BoxGeometry(1.0, 0.05, 0.38), color: 0xfff2c8, matrix: m4(2.3, 5.74, 0, -0.22) }
        ]);

        // 2. Batched Chevron Sign Frame + Face
        const signFrameGeom = mergeColoredGeometries([
            { geometry: new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), color: silverCol, matrix: m4(-0.92, 0.25, -0.09) },
            { geometry: new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), color: silverCol, matrix: m4(0.92, 0.25, -0.09) },
            { geometry: new THREE.BoxGeometry(2.7, 1.25, 0.08), color: darkMetalCol, matrix: m4(0, 1.1, 0) }
        ]);

        const cCanvas = document.createElement('canvas');
        cCanvas.width = 256; cCanvas.height = 128;
        const cCtx = cCanvas.getContext('2d');
        cCtx.fillStyle = '#0a0d12';
        cCtx.fillRect(0, 0, 256, 128);
        cCtx.fillStyle = '#ffe600';
        for (const cx of [55, 128, 201]) {
            cCtx.beginPath();
            cCtx.moveTo(cx - 28, 18);
            cCtx.lineTo(cx + 20, 64);
            cCtx.lineTo(cx - 28, 110);
            cCtx.lineTo(cx - 5, 110);
            cCtx.lineTo(cx + 43, 64);
            cCtx.lineTo(cx - 5, 18);
            cCtx.closePath();
            cCtx.fill();
        }
        cCtx.strokeStyle = '#ffe600';
        cCtx.lineWidth = 8;
        cCtx.strokeRect(4, 4, 248, 120);
        this.chevronTex = new THREE.CanvasTexture(cCanvas);

        this.chevronFaceMat = new THREE.MeshBasicMaterial({ map: this.chevronTex, side: THREE.DoubleSide });
        applyBayerDitherFade(this.chevronFaceMat, this.sharedUniforms);

        const signFaceGeom = new THREE.PlaneGeometry(2.65, 1.2);
        signFaceGeom.translate(0, 1.1, 0.055);

        // 3. Granite Rock Geometry
        const rockGeom = this._createDeformedRockGeometry(1.0, 1);

        // Create 5 batched InstancedPropPools
        this.rockPool      = new InstancedPropPool(this.scene, rockGeom, this.rockMat, 500);
        this.lampFramePool = new InstancedPropPool(this.scene, lampFrameGeom, this.batchedMetalMat, 320);
        this.lampBulbPool  = new InstancedPropPool(this.scene, lampBulbGeom, this.bulbMat, 320);
        this.signFramePool = new InstancedPropPool(this.scene, signFrameGeom, this.batchedMetalMat, 200);
        this.signFacePool  = new InstancedPropPool(this.scene, signFaceGeom, this.chevronFaceMat, 200);

        rockGeom.dispose();
        lampFrameGeom.dispose();
        lampBulbGeom.dispose();
        signFrameGeom.dispose();
        signFaceGeom.dispose();
    }

    _createStripedBalloonTexture(primaryHex, secondaryHex = '#ffffff') {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const numStripes = 16;
        const stripeW = 256 / numStripes;

        for (let i = 0; i < numStripes; i++) {
            ctx.fillStyle = (i % 2 === 0) ? primaryHex : secondaryHex;
            ctx.fillRect(i * stripeW, 0, stripeW, 128);
        }
        ctx.fillStyle = '#f1c40f';
        ctx.fillRect(0, 52, 256, 24);

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.repeat.set(2, 1);
        return tex;
    }

    _initSlidingObjects() {
        const cx = this.trackCenter.x;
        const cz = this.trackCenter.z;

        const turbOffsets = [
            { x: -280, z: -260 }, { x: 310, z: -320 },
            { x: -160, z: 290 },  { x: 260, z: 240 },
            { x: -380, z: 40 },   { x: 390, z: -80 },
            { x: -90,  z: -420 }, { x: 120, z: 410 }
        ];

        const towerGeom = new THREE.CylinderGeometry(0.8, 2.2, 42.0, 10);
        const nacelleGeom = new THREE.BoxGeometry(2.6, 2.2, 5.5);
        const bladeGeom = new THREE.BoxGeometry(0.45, 18.0, 0.12);
        const hubGeom = new THREE.ConeGeometry(0.9, 1.8, 10);
        hubGeom.rotateX(Math.PI / 2);

        // Merge rotor hub + 3 blades into a single draw call per turbine!
        const m4Rotor = (x, y, z, rz = 0) => {
            const mat = new THREE.Matrix4();
            if (rz !== 0) mat.makeRotationZ(rz);
            mat.setPosition(x, y, z);
            return mat;
        };
        const rotorParts = [{ geometry: hubGeom, color: 0x16191d, matrix: m4Rotor(0, 0, 0) }];
        for (let b = 0; b < 3; b++) {
            const ang = (b / 3) * Math.PI * 2;
            rotorParts.push({
                geometry: bladeGeom.clone(),
                color: 0xf5f7fa,
                matrix: m4Rotor(Math.sin(ang) * 9.0, Math.cos(ang) * 9.0, 0, -ang)
            });
        }
        const attachOpaqueFade = (geom, count) => {
            geom.setAttribute('aInstanceFade', new THREE.InstancedBufferAttribute(new Float32Array(count).fill(1.0), 1));
            return geom;
        };

        const mergedRotorGeom = attachOpaqueFade(mergeColoredGeometries(rotorParts), turbOffsets.length);
        this.rotorMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 });
        applyBayerDitherFade(this.rotorMat, this.skyLandmarkUniforms);

        // Merge tower + nacelle into 1 instanced geometry (all 8 turbines = 1 draw call!)
        const turbBodyGeom = attachOpaqueFade(mergeColoredGeometries([
            { geometry: towerGeom, color: 0xf5f7fa, matrix: m4Rotor(0, 21.0, 0) },
            { geometry: nacelleGeom, color: 0xf5f7fa, matrix: m4Rotor(0, 42.0, 0) }
        ]), turbOffsets.length);
        towerGeom.dispose();
        nacelleGeom.dispose();
        hubGeom.dispose();
        bladeGeom.dispose();

        const beaconGeom = attachOpaqueFade(new THREE.SphereGeometry(0.4, 8, 8), turbOffsets.length);
        this.beaconMat = new THREE.MeshBasicMaterial({ color: 0xff1122 });
        applyBayerDitherFade(this.beaconMat, this.skyLandmarkUniforms);

        this.turbBodyInst = new THREE.InstancedMesh(turbBodyGeom, this.rotorMat, turbOffsets.length);
        this.turbRotorInst = new THREE.InstancedMesh(mergedRotorGeom, this.rotorMat, turbOffsets.length);
        this.turbBeaconInst = new THREE.InstancedMesh(beaconGeom, this.beaconMat, turbOffsets.length);
        this.turbBodyInst.frustumCulled = false;
        this.turbRotorInst.frustumCulled = false;
        this.turbBeaconInst.frustumCulled = false;
        this.scene.add(this.turbBodyInst);
        this.scene.add(this.turbRotorInst);
        this.scene.add(this.turbBeaconInst);

        this._dummyQuat.identity();
        this._dummyScale.set(1, 1, 1);
        for (let i = 0; i < turbOffsets.length; i++) {
            const tx = cx + turbOffsets[i].x;
            const tz = cz + turbOffsets[i].z;
            const ty = getTerrainHeight(tx, tz);
            const rotZ = (i * 1.1) % (Math.PI * 2);

            this._dummyPos.set(tx, ty, tz);
            this._dummyMat.compose(this._dummyPos, this._dummyQuat, this._dummyScale);
            this.turbBodyInst.setMatrixAt(i, this._dummyMat);

            this._dummyPos.set(tx, ty + 43.4, tz);
            this._dummyMat.compose(this._dummyPos, this._dummyQuat, this._dummyScale);
            this.turbBeaconInst.setMatrixAt(i, this._dummyMat);

            this._dummyPos.set(tx, ty + 42.0, tz + 3.0);
            this._dummyEuler.set(0, 0, rotZ);
            this._dummyQuat.setFromEuler(this._dummyEuler);
            this._dummyMat.compose(this._dummyPos, this._dummyQuat, this._dummyScale);
            this.turbRotorInst.setMatrixAt(i, this._dummyMat);
            this._dummyQuat.identity();

            this.turbines.push({
                idx: i,
                baseX: tx,
                baseZ: tz,
                rotZ,
                spinSpeed: 0.85 + (i % 3) * 0.25
            });
        }
        this.turbBodyInst.instanceMatrix.needsUpdate = true;
        this.turbRotorInst.instanceMatrix.needsUpdate = true;
        this.turbBeaconInst.instanceMatrix.needsUpdate = true;

        // Hot Air Balloons
        const balloonConfigs = [
            { x: -220, z: -250, alt: 95,  prim: '#e74c3c', sec: '#ffffff', seed: 1.2 },
            { x: 260,  z: -380, alt: 110, prim: '#00c3ff', sec: '#ffffff', seed: 2.7 },
            { x: -290, z: 220,  alt: 100, prim: '#ff6f00', sec: '#ffe082', seed: 4.1 },
            { x: 310,  z: 180,  alt: 125, prim: '#8e44ad', sec: '#f39c12', seed: 5.6 },
            { x: -80,  z: 360,  alt: 88,  prim: '#27ae60', sec: '#ffffff', seed: 7.2 },
            { x: 140,  z: -480, alt: 118, prim: '#d35400', sec: '#3498db', seed: 8.9 }
        ];

        const envelopePoints = [
            new THREE.Vector2(0.1, 7.8),  new THREE.Vector2(2.8, 7.3),
            new THREE.Vector2(5.5, 5.8),  new THREE.Vector2(7.0, 3.4),
            new THREE.Vector2(7.4, 0.6),  new THREE.Vector2(6.6, -2.6),
            new THREE.Vector2(4.8, -5.4), new THREE.Vector2(2.6, -7.2),
            new THREE.Vector2(1.8, -8.0)
        ];
        const envGeom = new THREE.LatheGeometry(envelopePoints, 20);

        // Pre-merge basket + rim + rigging cables into 1 instanced geometry!
        const basketParts = [
            { geometry: new THREE.BoxGeometry(2.2, 1.4, 2.2), color: 0x7c4f2b, matrix: m4Rotor(0, -11.2, 0) },
            { geometry: new THREE.BoxGeometry(2.4, 0.16, 2.4), color: 0x16191d, matrix: m4Rotor(0, -10.5, 0) },
            { geometry: new THREE.ConeGeometry(0.42, 1.3, 8), color: 0xff6600, matrix: m4Rotor(0, -9.75, 0) }
        ];
        const ropeGeo = new THREE.CylinderGeometry(0.03, 0.03, 3.6, 5);
        for (let c = 0; c < 4; c++) {
            const angle = (c / 4) * Math.PI * 2 + Math.PI / 4;
            const rm = new THREE.Matrix4().makeRotationFromEuler(
                new THREE.Euler(Math.cos(angle) * 0.16, 0, -Math.sin(angle) * 0.16)
            );
            rm.setPosition(Math.sin(angle) * 1.5, -9.2, Math.cos(angle) * 1.5);
            basketParts.push({ geometry: ropeGeo.clone(), color: 0xc4cbd4, matrix: rm });
        }
        ropeGeo.dispose();
        const mergedBasketGeom = attachOpaqueFade(mergeColoredGeometries(basketParts), balloonConfigs.length);
        attachOpaqueFade(envGeom, balloonConfigs.length);

        const balloonTex = this._createStripedBalloonTexture('#ffffff', '#64748b');
        this.balloonEnvMat = new THREE.MeshStandardMaterial({ map: balloonTex, roughness: 0.50, metalness: 0.05 });
        applyBayerDitherFade(this.balloonEnvMat, this.skyLandmarkUniforms);

        this.balloonEnvInst = new THREE.InstancedMesh(envGeom, this.balloonEnvMat, balloonConfigs.length);
        this.balloonBasketInst = new THREE.InstancedMesh(mergedBasketGeom, this.rotorMat, balloonConfigs.length);
        this.balloonEnvInst.frustumCulled = false;
        this.balloonBasketInst.frustumCulled = false;
        this.scene.add(this.balloonEnvInst);
        this.scene.add(this.balloonBasketInst);

        const colorTmp = new THREE.Color();
        this._dummyQuat.identity();
        for (let i = 0; i < balloonConfigs.length; i++) {
            const b = balloonConfigs[i];
            const bx = cx + b.x;
            const bz = cz + b.z;
            this._dummyPos.set(bx, b.alt, bz);
            this._dummyMat.compose(this._dummyPos, this._dummyQuat, this._dummyScale);
            this.balloonEnvInst.setMatrixAt(i, this._dummyMat);
            this.balloonBasketInst.setMatrixAt(i, this._dummyMat);
            colorTmp.set(b.prim);
            this.balloonEnvInst.setColorAt(i, colorTmp);

            this.balloons.push({
                idx: i,
                altitude: b.alt,
                baseX: bx,
                baseZ: bz,
                seed: b.seed,
                yaw: 0
            });
        }
        this.balloonEnvInst.instanceMatrix.needsUpdate = true;
        if (this.balloonEnvInst.instanceColor) this.balloonEnvInst.instanceColor.needsUpdate = true;
        this.balloonBasketInst.instanceMatrix.needsUpdate = true;
    }

    createStreetLamp(p, fwd, right, side, halfW, _parentGroup = null, immediate = false) {
        const curbPos = this._dummyPos.copy(p).addScaledVector(right, side * (halfW + 1.2));
        // Local lamp arm extends along +X. Point +X toward road center (-side * right):
        // When side = +1 (right curb), arm needs -right => yaw + PI; when side = -1, arm needs +right => yaw.
        const baseYaw = Math.atan2(-fwd.x, -fwd.z);
        const yaw = side > 0 ? baseYaw + Math.PI : baseYaw;

        this._dummyEuler.set(0, yaw, 0);
        this._dummyQuat.setFromEuler(this._dummyEuler);
        this._dummyScale.set(1, 1, 1);
        this._dummyMat.compose(curbPos, this._dummyQuat, this._dummyScale);

        const frameSlot = this.lampFramePool.allocate(this._dummyMat, immediate);
        if (frameSlot < 0) return null;
        const bulbSlot = this.lampBulbPool.allocate(this._dummyMat, immediate);
        const headWorldPos = curbPos.clone().addScaledVector(right, -side * 2.3);
        headWorldPos.y += 5.73;

        const lampObj = { isLamp: true, frameSlot, bulbSlot, headWorldPos };
        this.streetLamps.push(lampObj);
        return lampObj;
    }

    createChevronSign(p, fwd, right, side, halfW, _parentGroup = null, immediate = false) {
        const pos = this._dummyPos.copy(p).addScaledVector(right, side * (halfW + 2.5));
        pos.y += 1.1;

        const baseYaw = Math.atan2(-fwd.x, -fwd.z);
        const yaw = side < 0 ? baseYaw + Math.PI : baseYaw;

        this._dummyEuler.set(0, yaw, 0);
        this._dummyQuat.setFromEuler(this._dummyEuler);
        this._dummyScale.set(1, 1, 1);
        this._dummyMat.compose(pos, this._dummyQuat, this._dummyScale);

        const frameSlot = this.signFramePool.allocate(this._dummyMat, immediate);
        if (frameSlot < 0) return null;
        const faceSlot = this.signFacePool.allocate(this._dummyMat, immediate);
        return { isSign: true, frameSlot, faceSlot };
    }

    createRockOutcropping(x, z, scale = 2.0, _parentGroup = null, immediate = false) {
        const by = getTerrainHeight(x, z);
        this._dummyPos.set(x, by, z);
        this._dummyEuler.set(0.1, (x * 0.17 + z * 0.31) % (Math.PI * 2), 0.1);
        this._dummyQuat.setFromEuler(this._dummyEuler);
        this._dummyScale.setScalar(scale);
        this._dummyMat.compose(this._dummyPos, this._dummyQuat, this._dummyScale);

        const slotId = this.rockPool.allocate(this._dummyMat, immediate);
        if (slotId < 0) return null;
        return { isRock: true, slotId };
    }

    removeLamp(lampObj, immediate = false) {
        if (!lampObj) return;
        const idx = this.streetLamps.indexOf(lampObj);
        if (idx !== -1) this.streetLamps.splice(idx, 1);
        if (lampObj.frameSlot !== undefined) this.lampFramePool.free(lampObj.frameSlot, immediate);
        if (lampObj.bulbSlot !== undefined) this.lampBulbPool.free(lampObj.bulbSlot, immediate);
    }

    removeSign(signObj, immediate = false) {
        if (!signObj) return;
        if (signObj.frameSlot !== undefined) this.signFramePool.free(signObj.frameSlot, immediate);
        if (signObj.faceSlot !== undefined) this.signFacePool.free(signObj.faceSlot, immediate);
    }

    removeRock(rockObj, immediate = false) {
        if (!rockObj || rockObj.slotId === undefined) return;
        this.rockPool.free(rockObj.slotId, immediate);
    }

    update(delta, time, nightFactor, playerPos = null) {
        this.bulbMat.emissiveIntensity = nightFactor * 5.0;

        if (playerPos) {
            this.sharedUniforms.uFadeCameraPos.value.copy(playerPos);
            this.skyLandmarkUniforms.uFadeCameraPos.value.copy(playerPos);
        }
        this.sharedUniforms.uTime.value = time;
        this.skyLandmarkUniforms.uTime.value = time;

        this.rockPool.update(delta);
        this.lampFramePool.update(delta);
        this.lampBulbPool.update(delta);
        this.signFramePool.update(delta);
        this.signFacePool.update(delta);

        // 8 Dynamic PointLights (visible stays true permanently)
        if (this.realLights.length > 0) {
            if (nightFactor > 0.02 && playerPos && this.streetLamps.length > 0) {
                this._sortTmp.length = 0;
                for (let i = 0; i < this.streetLamps.length; i++) {
                    const l = this.streetLamps[i];
                    const dSq = l.headWorldPos.distanceToSquared(playerPos);
                    if (dSq < 22500) {
                        this._sortTmp.push({ lamp: l, distSq: dSq });
                    }
                }
                this._sortTmp.sort((a, b) => a.distSq - b.distSq);

                const activeCount = Math.min(this.realLights.length, this._sortTmp.length);
                const lightIntensity = nightFactor * 85.0;
                for (let i = 0; i < this.realLights.length; i++) {
                    const pl = this.realLights[i];
                    if (i < activeCount) {
                        pl.position.copy(this._sortTmp[i].lamp.headWorldPos);
                        pl.intensity = lightIntensity;
                    } else {
                        pl.position.set(0, -999, 0);
                        pl.intensity = 0.0;
                    }
                }
            } else {
                for (let i = 0; i < this.realLights.length; i++) {
                    this.realLights[i].position.set(0, -999, 0);
                    this.realLights[i].intensity = 0.0;
                }
            }
        }

        if (!playerPos) return;

        // Infinite sliding Wind Turbines (900m toroidal window)
        const turbSpan = 900.0;
        const halfTurb = turbSpan * 0.5;
        const isBeaconLit = (Math.sin(time * 4.0) > 0.25);
        if (this.beaconMat) {
            this.beaconMat.color.setHex(isBeaconLit ? 0xff1122 : 0x220005);
        }

        this._dummyScale.set(1, 1, 1);
        for (let i = 0; i < this.turbines.length; i++) {
            const turb = this.turbines[i];
            const tx = ((turb.baseX - playerPos.x) % turbSpan + turbSpan) % turbSpan - halfTurb + playerPos.x;
            const tz = ((turb.baseZ - playerPos.z) % turbSpan + turbSpan) % turbSpan - halfTurb + playerPos.z;
            const ty = getTerrainHeight(tx, tz);
            turb.rotZ += delta * turb.spinSpeed;

            this._dummyQuat.identity();
            this._dummyPos.set(tx, ty, tz);
            this._dummyMat.compose(this._dummyPos, this._dummyQuat, this._dummyScale);
            this.turbBodyInst.setMatrixAt(turb.idx, this._dummyMat);

            this._dummyPos.set(tx, ty + 43.4, tz);
            this._dummyMat.compose(this._dummyPos, this._dummyQuat, this._dummyScale);
            this.turbBeaconInst.setMatrixAt(turb.idx, this._dummyMat);

            this._dummyPos.set(tx, ty + 42.0, tz + 3.0);
            this._dummyEuler.set(0, 0, turb.rotZ);
            this._dummyQuat.setFromEuler(this._dummyEuler);
            this._dummyMat.compose(this._dummyPos, this._dummyQuat, this._dummyScale);
            this.turbRotorInst.setMatrixAt(turb.idx, this._dummyMat);
        }
        if (this.turbines.length > 0) {
            this.turbBodyInst.instanceMatrix.needsUpdate = true;
            this.turbRotorInst.instanceMatrix.needsUpdate = true;
            this.turbBeaconInst.instanceMatrix.needsUpdate = true;
        }

        // Infinite sliding Hot Air Balloons (850m toroidal window)
        const balSpan = 850.0;
        const halfBal = balSpan * 0.5;

        for (let i = 0; i < this.balloons.length; i++) {
            const b = this.balloons[i];
            const bx = ((b.baseX - playerPos.x) % balSpan + balSpan) % balSpan - halfBal + playerPos.x;
            const bz = ((b.baseZ - playerPos.z) % balSpan + balSpan) % balSpan - halfBal + playerPos.z;
            const by = b.altitude + Math.sin(time * 0.45 + b.seed) * 4.5;
            b.yaw += delta * 0.05;

            this._dummyPos.set(bx, by, bz);
            this._dummyEuler.set(0, b.yaw, 0);
            this._dummyQuat.setFromEuler(this._dummyEuler);
            this._dummyMat.compose(this._dummyPos, this._dummyQuat, this._dummyScale);
            this.balloonEnvInst.setMatrixAt(b.idx, this._dummyMat);
            this.balloonBasketInst.setMatrixAt(b.idx, this._dummyMat);
        }
        if (this.balloons.length > 0) {
            this.balloonEnvInst.instanceMatrix.needsUpdate = true;
            this.balloonBasketInst.instanceMatrix.needsUpdate = true;
        }
    }

    destroy() {
        for (const pl of this.realLights) this.scene.remove(pl);
        this.realLights = [];
        this.streetLamps = [];

        this.rockPool?.destroy();
        this.lampFramePool?.destroy();
        this.lampBulbPool?.destroy();
        this.signFramePool?.destroy();
        this.signFacePool?.destroy();

        const skyInsts = [this.turbBodyInst, this.turbRotorInst, this.turbBeaconInst, this.balloonEnvInst, this.balloonBasketInst];
        for (const inst of skyInsts) {
            if (!inst) continue;
            this.scene.remove(inst);
            inst.geometry?.dispose();
            inst.dispose?.();
        }
        this.balloonEnvMat?.map?.dispose();
        this.balloonEnvMat?.dispose();
        this.turbBodyInst = null;
        this.turbRotorInst = null;
        this.turbBeaconInst = null;
        this.balloonEnvInst = null;
        this.balloonBasketInst = null;
        this.balloonEnvMat = null;
        this.turbines = [];
        this.balloons = [];
    }
}
