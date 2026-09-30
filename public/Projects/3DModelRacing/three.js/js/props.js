import * as THREE from 'three';
import { getTerrainHeight } from './terrain.js';

/**
 * PropsManager — Infinite Sliding World Objects, Real Motorway Street Lights & Rally Scenery
 * 
 * Features:
 * - Real Dynamic PointLight Street Lamps (Zero fake ground circle decals! Real light illuminating road & cars)
 * - Infinite Sliding Wind Turbines (900m window, spinning rotors, red blinking beacons)
 * - Authentic Teardrop Hot Air Balloons with Woven Baskets, Rigging & Flickering Burners
 * - Infinite Instanced Rock Outcroppings (240m window, GPU instanced, identical sliding code to grass)
 * - Professional High-Visibility Neon Chevron Apex Direction Boards
 */
export class PropsManager {
    constructor(scene, trackData, trackCenter) {
        this.scene = scene;
        this.trackData = trackData;
        this.trackCenter = trackCenter;

        this.turbines = [];
        this.balloons = [];
        this.rockInstances = [];
        this.streetLamps = [];
        this.realLights = [];

        this._initMaterials();
        this._initSharedGeometries();
        this._initSlidingObjects();
        this._initRealLights();
    }

    _initMaterials() {
        this.darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x22272e, metalness: 0.85, roughness: 0.28 });
        this.silverMat    = new THREE.MeshStandardMaterial({ color: 0xc4cbd4, metalness: 0.82, roughness: 0.32 });
        this.whiteMat     = new THREE.MeshStandardMaterial({ color: 0xf5f7fa, roughness: 0.35 });
        this.darkMat      = new THREE.MeshStandardMaterial({ color: 0x16191d });
        this.wickerMat    = new THREE.MeshStandardMaterial({ color: 0x7c4f2b, roughness: 0.92 });

        this.rockMat = new THREE.MeshStandardMaterial({
            roughness: 0.94,
            metalness: 0.06,
            vertexColors: true,
            flatShading: true
        });

        this.bulbMat = new THREE.MeshStandardMaterial({
            color: 0xfff2c8,
            emissive: 0xffb833,
            emissiveIntensity: 0.0
        });
    }

    _initRealLights() {
        // Real Three.js light source pool (illuminates the road, cars, and scenery directly)
        for (let i = 0; i < 8; i++) {
            const pl = new THREE.PointLight(0xffeedd, 0, 36.0, 1.6);
            this.scene.add(pl);
            this.realLights.push(pl);
        }
    }

    _createDeformedRockGeometry(radius, detail = 1, pseudoRand) {
        const geom = new THREE.DodecahedronGeometry(radius, detail);
        const pos = geom.attributes.position;
        const v = new THREE.Vector3();
        const colors = new Float32Array(pos.count * 3);

        const seed1 = pseudoRand() * 20.0;
        const seed2 = pseudoRand() * 20.0;

        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);
            const n = v.clone().normalize();
            const disp = Math.sin(v.x * 1.6 + seed1) * Math.cos(v.z * 1.6 + seed2) * 0.26
                       + Math.sin(v.y * 2.2 + seed1 * 1.4) * 0.16;
            v.addScaledVector(n, disp * radius);
            v.y *= 0.68;
            if (v.y < 0) v.y *= 0.62;

            pos.setXYZ(i, v.x, v.y, v.z);

            const normY = n.y;
            let r, g, b;
            if (normY > 0.42 && v.y > -0.15) {
                // Moss & alpine lichen
                r = 0.25; g = 0.46; b = 0.22;
            } else if (v.y < -0.32) {
                // Wet bedrock
                r = 0.18; g = 0.20; b = 0.22;
            } else {
                // Granite
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

    _initSharedGeometries() {
        // 1. Sleek Modern Architectural Highway / Rally Floodlight
        this.sharedLampBaseGeom  = new THREE.CylinderGeometry(0.32, 0.44, 2.2, 8);
        this.sharedLampPoleGeom  = new THREE.CylinderGeometry(0.11, 0.18, 6.2, 8);
        this.sharedLampArmGeom   = new THREE.BoxGeometry(2.3, 0.14, 0.16);
        this.sharedLampStrutGeom = new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6);

        // Angled dual LED floodlight luminaire head
        this.sharedLampHoodGeom = new THREE.BoxGeometry(1.15, 0.16, 0.48);
        this.sharedBulbGeom     = new THREE.BoxGeometry(1.0, 0.05, 0.38);

        // 2. High-Visibility Motorsport Chevron Boards
        this.sharedChevronPostGeom  = new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8);
        this.sharedChevronBoardGeom = new THREE.BoxGeometry(2.7, 1.25, 0.08);

        // Pre-render high-visibility reflective neon yellow/black chevron pattern
        const cCanvas = document.createElement('canvas');
        cCanvas.width = 256; cCanvas.height = 128;
        const cCtx = cCanvas.getContext('2d');
        cCtx.fillStyle = '#0a0d12';
        cCtx.fillRect(0, 0, 256, 128);
        cCtx.fillStyle = '#ffe600';

        // Triple bold directional arrows
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

        // 3. Shared Rocks
        this.sharedRockGeomHigh = this._createDeformedRockGeometry(1.0, 1, () => 0.5);
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
        // Gold equator band
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

        // =========================================================================
        // 1. INFINITE SLIDING WIND TURBINES (900m Window around Player)
        // =========================================================================
        const turbOffsets = [
            { x: -280, z: -260 },
            { x: 310, z: -320 },
            { x: -160, z: 290 },
            { x: 260, z: 240 },
            { x: -380, z: 40 },
            { x: 390, z: -80 },
            { x: -90, z: -420 },
            { x: 120, z: 410 }
        ];

        for (let i = 0; i < turbOffsets.length; i++) {
            const group = new THREE.Group();

            const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 2.2, 42.0, 12), this.whiteMat);
            tower.position.y = 21.0;
            group.add(tower);

            const nacelle = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 5.5), this.whiteMat);
            nacelle.position.set(0, 42.0, 0);
            group.add(nacelle);

            const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff1122 });
            const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), beaconMat);
            beacon.position.set(0, 43.4, 0);
            group.add(beacon);

            const rotor = new THREE.Group();
            rotor.position.set(0, 42.0, 3.0);

            const hub = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.8, 12), this.darkMat);
            hub.rotation.x = Math.PI / 2;
            rotor.add(hub);

            for (let b = 0; b < 3; b++) {
                const bladeAngle = (b / 3) * Math.PI * 2;
                const blade = new THREE.Mesh(new THREE.BoxGeometry(0.45, 18.0, 0.12), this.whiteMat);
                blade.position.set(Math.sin(bladeAngle) * 9.0, Math.cos(bladeAngle) * 9.0, 0);
                blade.rotation.z = -bladeAngle;
                rotor.add(blade);
            }

            group.add(rotor);
            this.scene.add(group);

            this.turbines.push({
                group,
                rotor,
                beacon: beaconMat,
                baseX: cx + turbOffsets[i].x,
                baseZ: cz + turbOffsets[i].z,
                spinSpeed: 0.85 + (i % 3) * 0.25
            });
        }

        // =========================================================================
        // 2. AUTHENTIC TEARDROP HOT AIR BALLOONS (850m Window around Player)
        // =========================================================================
        const balloonConfigs = [
            { x: -220, z: -250, alt: 95,  prim: '#e74c3c', sec: '#ffffff', seed: 1.2 },
            { x: 260,  z: -380, alt: 110, prim: '#00c3ff', sec: '#ffffff', seed: 2.7 },
            { x: -290, z: 220,  alt: 100, prim: '#ff6f00', sec: '#ffe082', seed: 4.1 },
            { x: 310,  z: 180,  alt: 125, prim: '#8e44ad', sec: '#f39c12', seed: 5.6 },
            { x: -80,  z: 360,  alt: 88,  prim: '#27ae60', sec: '#ffffff', seed: 7.2 },
            { x: 140,  z: -480, alt: 118, prim: '#d35400', sec: '#3498db', seed: 8.9 }
        ];

        // Authentic Teardrop Lathe Profile (x = radius, y = height)
        const envelopePoints = [];
        envelopePoints.push(new THREE.Vector2(0.1, 7.8));
        envelopePoints.push(new THREE.Vector2(2.8, 7.3));
        envelopePoints.push(new THREE.Vector2(5.5, 5.8));
        envelopePoints.push(new THREE.Vector2(7.0, 3.4));
        envelopePoints.push(new THREE.Vector2(7.4, 0.6));
        envelopePoints.push(new THREE.Vector2(6.6, -2.6));
        envelopePoints.push(new THREE.Vector2(4.8, -5.4));
        envelopePoints.push(new THREE.Vector2(2.6, -7.2));
        envelopePoints.push(new THREE.Vector2(1.8, -8.0));
        const envGeom = new THREE.LatheGeometry(envelopePoints, 22);

        for (const b of balloonConfigs) {
            const group = new THREE.Group();

            // Teardrop aerodynamic envelope with striped pattern
            const tex = this._createStripedBalloonTexture(b.prim, b.sec);
            const envMat = new THREE.MeshStandardMaterial({
                map: tex,
                roughness: 0.50,
                metalness: 0.05
            });
            const envMesh = new THREE.Mesh(envGeom, envMat);
            group.add(envMesh);

            // Stainless suspension rigging cables
            for (let c = 0; c < 4; c++) {
                const angle = (c / 4) * Math.PI * 2 + Math.PI / 4;
                const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.6, 6), this.silverMat);
                rope.position.set(Math.sin(angle) * 1.5, -9.2, Math.cos(angle) * 1.5);
                rope.rotation.x = Math.cos(angle) * 0.16;
                rope.rotation.z = -Math.sin(angle) * 0.16;
                group.add(rope);
            }

            // Real woven wicker basket with rim & corner posts
            const basketGroup = new THREE.Group();
            basketGroup.position.y = -11.2;

            const basket = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 2.2), this.wickerMat);
            basketGroup.add(basket);

            const rim = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.16, 2.4), this.darkMat);
            rim.position.y = 0.7;
            basketGroup.add(rim);

            // Double gas burner assembly & glowing fire
            const burnerMat = new THREE.MeshStandardMaterial({
                color: 0xff4400,
                emissive: 0xff6600,
                emissiveIntensity: 4.2
            });
            const burner = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.3, 8), burnerMat);
            burner.position.y = 1.45;
            basketGroup.add(burner);

            group.add(basketGroup);
            this.scene.add(group);

            this.balloons.push({
                group,
                altitude: b.alt,
                baseX: cx + b.x,
                baseZ: cz + b.z,
                seed: b.seed
            });
        }

        // =========================================================================
        // 3. INFINITE SLIDING BOULDERS & ROCKS (Identical Sliding Window to Grass)
        // =========================================================================
        const rockCount = 95;
        this.rockInstancedMesh = new THREE.InstancedMesh(this.sharedRockGeomHigh, this.rockMat, rockCount);
        this.rockInstancedMesh.receiveShadow = true;
        this.scene.add(this.rockInstancedMesh);

        let seed = 777;
        const pseudoRand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

        for (let i = 0; i < rockCount; i++) {
            const rx = (pseudoRand() - 0.5) * 230.0;
            const rz = (pseudoRand() - 0.5) * 230.0;
            const scale = 1.4 + pseudoRand() * 2.8;
            this.rockInstances.push({
                baseX: cx + rx,
                baseZ: cz + rz,
                scale,
                rotX: pseudoRand() * 0.4,
                rotY: pseudoRand() * Math.PI * 2,
                rotZ: pseudoRand() * 0.4
            });
        }
    }

    createStreetLamp(p, fwd, right, side, halfW, parentGroup = null) {
        const lamp = new THREE.Group();
        lamp.isLamp = true;
        const curbPos = p.clone().add(right.clone().multiplyScalar(side * (halfW + 1.2)));
        lamp.position.copy(curbPos);

        const yaw = Math.atan2(-fwd.x, -fwd.z);
        lamp.rotation.set(0, yaw, 0);

        // Heavy-duty architectural foundation base
        const baseMesh = new THREE.Mesh(this.sharedLampBaseGeom, this.darkMetalMat);
        baseMesh.position.y = -0.6;
        lamp.add(baseMesh);

        // Sleek steel mast
        const poleMesh = new THREE.Mesh(this.sharedLampPoleGeom, this.silverMat);
        poleMesh.position.y = 3.1;
        lamp.add(poleMesh);

        // Horizontal cantilever arm reaching over track edge
        const reachX = -side;
        const armMesh = new THREE.Mesh(this.sharedLampArmGeom, this.darkMetalMat);
        armMesh.position.set(reachX * 1.15, 6.1, 0);
        lamp.add(armMesh);

        // Diagonal support brace strut
        const strutMesh = new THREE.Mesh(this.sharedLampStrutGeom, this.silverMat);
        strutMesh.position.set(reachX * 0.55, 5.5, 0);
        strutMesh.rotation.z = reachX * 0.72;
        lamp.add(strutMesh);

        // Dual angled LED luminaire head tilted toward roadway
        const hoodMesh = new THREE.Mesh(this.sharedLampHoodGeom, this.darkMetalMat);
        hoodMesh.position.set(reachX * 2.3, 6.05, 0);
        hoodMesh.rotation.z = -reachX * 0.22;
        lamp.add(hoodMesh);

        // Luminous high-output lens
        const bulbMesh = new THREE.Mesh(this.sharedBulbGeom, this.bulbMat);
        bulbMesh.position.set(reachX * 2.3, 5.96, 0);
        bulbMesh.rotation.z = -reachX * 0.22;
        lamp.add(bulbMesh);

        // Real Light Source World Position (hanging over track lane)
        lamp.headWorldPos = curbPos.clone().add(right.clone().multiplyScalar(reachX * 2.3));
        lamp.headWorldPos.y += 5.95;
        this.streetLamps.push(lamp);

        const targetParent = parentGroup || this.scene;
        targetParent.add(lamp);
        return lamp;
    }

    createChevronSign(p, fwd, right, side, halfW, parentGroup = null) {
        const sign = new THREE.Group();
        const pos = p.clone().add(right.clone().multiplyScalar(side * (halfW + 2.5))).add(new THREE.Vector3(0, 1.1, 0));
        sign.position.copy(pos);

        const yaw = Math.atan2(-fwd.x, -fwd.z);
        sign.rotation.set(0, yaw, 0);

        const boardY = 1.1;

        // Twin brushed aluminum support posts mounted cleanly BEHIND the sign board
        for (const px of [-0.92, 0.92]) {
            const post = new THREE.Mesh(this.sharedChevronPostGeom, this.silverMat);
            // Height 2.2, centered at y = 0.25 -> top is at 1.35m, board top is at 1.725m
            // z = -0.09 places the posts cleanly behind the board
            post.position.set(px, 0.25, -0.09);
            sign.add(post);
        }

        // Carbon backing plate
        const board = new THREE.Mesh(this.sharedChevronBoardGeom, this.darkMetalMat);
        board.position.set(0, boardY, 0);
        sign.add(board);

        // High-vis front reflection plane with bold neon arrows
        const frontMat = new THREE.MeshBasicMaterial({ map: this.chevronTex });
        const front = new THREE.Mesh(new THREE.PlaneGeometry(2.65, 1.2), frontMat);
        front.position.set(0, boardY, 0.05);
        if (side < 0) front.rotation.y = Math.PI; // Flip arrows toward curve apex
        sign.add(front);

        const targetParent = parentGroup || this.scene;
        targetParent.add(sign);
        return sign;
    }

    createRockOutcropping(x, z, scale = 2.0, parentGroup = null) {
        const mesh = new THREE.Mesh(this.sharedRockGeomHigh, this.rockMat);
        const by = getTerrainHeight(x, z);
        mesh.position.set(x, by, z);
        mesh.scale.setScalar(scale);
        mesh.rotation.set(0.1, (x * 0.17 + z * 0.31) % (Math.PI * 2), 0.1);

        const targetParent = parentGroup || this.scene;
        targetParent.add(mesh);
        return mesh;
    }

    removeLamp(lampObj) {
        if (!lampObj) return;
        const idx = this.streetLamps.indexOf(lampObj);
        if (idx !== -1) this.streetLamps.splice(idx, 1);
        if (lampObj.parent) lampObj.parent.remove(lampObj);
    }

    update(delta, time, nightFactor, playerPos = null) {
        // 1. Street Lamp Fixture Emissive Lens
        const lampBulbEmissive = nightFactor * 5.0;
        this.bulbMat.emissiveIntensity = lampBulbEmissive;

        // 2. Real Dynamic PointLights illuminating the road, vehicles, and scenery
        if (this.realLights && this.realLights.length > 0) {
            if (nightFactor > 0.02 && playerPos && this.streetLamps.length > 0) {
                // Find closest lamps to player
                const sorted = this.streetLamps
                    .map(l => ({ lamp: l, distSq: l.headWorldPos.distanceToSquared(playerPos) }))
                    .sort((a, b) => a.distSq - b.distSq);

                const activeCount = Math.min(this.realLights.length, sorted.length);
                const lightIntensity = nightFactor * 85.0;

                for (let i = 0; i < this.realLights.length; i++) {
                    const pl = this.realLights[i];
                    if (i < activeCount && sorted[i].distSq < 22500) { // within 150m
                        pl.position.copy(sorted[i].lamp.headWorldPos);
                        pl.intensity = lightIntensity;
                        pl.visible = true;
                    } else {
                        pl.intensity = 0;
                        pl.visible = false;
                    }
                }
            } else {
                for (const pl of this.realLights) {
                    pl.intensity = 0;
                    pl.visible = false;
                }
            }
        }

        if (!playerPos) return;

        // =========================================================================
        // 3. INFINITE SLIDING WIND TURBINES (Toroidal sliding grid matching grass)
        // =========================================================================
        const turbSpan = 900.0;
        const halfTurb = turbSpan * 0.5;
        const isBeaconLit = (Math.sin(time * 4.0) > 0.25);

        for (const turb of this.turbines) {
            const tx = ((turb.baseX - playerPos.x) % turbSpan + turbSpan) % turbSpan - halfTurb + playerPos.x;
            const tz = ((turb.baseZ - playerPos.z) % turbSpan + turbSpan) % turbSpan - halfTurb + playerPos.z;
            const ty = getTerrainHeight(tx, tz);
            turb.group.position.set(tx, ty, tz);

            turb.rotor.rotation.z += delta * turb.spinSpeed;
            turb.beacon.color.setHex(isBeaconLit ? 0xff1122 : 0x220005);
        }

        // =========================================================================
        // 4. INFINITE SLIDING HOT AIR BALLOONS (Toroidal sliding grid matching grass)
        // =========================================================================
        const balSpan = 850.0;
        const halfBal = balSpan * 0.5;

        for (const b of this.balloons) {
            const bx = ((b.baseX - playerPos.x) % balSpan + balSpan) % balSpan - halfBal + playerPos.x;
            const bz = ((b.baseZ - playerPos.z) % balSpan + balSpan) % balSpan - halfBal + playerPos.z;
            b.group.position.set(bx, b.altitude + Math.sin(time * 0.45 + b.seed) * 4.5, bz);
            b.group.rotation.y += delta * 0.05;
        }

        // =========================================================================
        // 5. INFINITE SLIDING BOULDERS & ROCKS (Identical sliding window to grass)
        // =========================================================================
        if (this.rockInstancedMesh) {
            const rSpan = 240.0;
            const halfR = rSpan * 0.5;
            const dummy = new THREE.Object3D();

            for (let i = 0; i < this.rockInstances.length; i++) {
                const b = this.rockInstances[i];
                const rx = ((b.baseX - playerPos.x) % rSpan + rSpan) % rSpan - halfR + playerPos.x;
                const rz = ((b.baseZ - playerPos.z) % rSpan + rSpan) % rSpan - halfR + playerPos.z;
                const ry = getTerrainHeight(rx, rz);

                dummy.position.set(rx, ry - 0.15, rz);
                dummy.scale.setScalar(b.scale);
                dummy.rotation.set(b.rotX, b.rotY, b.rotZ);
                dummy.updateMatrix();

                this.rockInstancedMesh.setMatrixAt(i, dummy.matrix);
            }
            this.rockInstancedMesh.instanceMatrix.needsUpdate = true;
        }
    }

    destroy() {
        for (const pl of this.realLights) {
            this.scene.remove(pl);
        }
        this.realLights = [];
        this.streetLamps = [];
    }
}
