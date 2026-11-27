/**
 * three.js/js/trees.js — Batched Instanced Botanical Forests with Bayer Dither Fade
 *
 * Replaces individual per-tree scene graph LOD objects with 6 merged vertex-colored
 * InstancedPropPool draw calls (Spruce, Oak, Birch, Bush, Flowering Shrub, Wildflowers)
 * featuring smooth spawn/despawn fade-in and GPU vertex wind sway.
 */
import * as THREE from 'three';
import { getTerrainHeight } from './terrain.js';
import { mergeColoredGeometries, applyBayerDitherFade, InstancedPropPool } from './road/scenery_batcher.js';

export class TreeManager {
    constructor(scene, trackData, trackCenter) {
        this.scene = scene;
        this.trackData = trackData;
        this.trackCenter = trackCenter;

        this.sharedUniforms = {
            uFadeCameraPos: { value: new THREE.Vector3() },
            uFadeStart:     { value: 260.0 },
            uFadeEnd:       { value: 375.0 },
            uTime:          { value: 0.0 },
            uWindStrength:  { value: 0.85 }
        };

        this.foliageMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.86,
            metalness: 0.02
        });
        applyBayerDitherFade(this.foliageMat, this.sharedUniforms, { enableWind: true });

        this.archetypeGeoms = [];
        this.pools = [];
        this._dummyPos = new THREE.Vector3();
        this._dummyQuat = new THREE.Quaternion();
        this._dummyEuler = new THREE.Euler();
        this._dummyScale = new THREE.Vector3();
        this._dummyMat = new THREE.Matrix4();

        this._initArchetypes();
        this._initPools();
    }

    _createFoliagePuffGeometry(radius, seed = 0) {
        const geom = new THREE.IcosahedronGeometry(radius, 1);
        const pos = geom.attributes.position;
        const v = new THREE.Vector3();
        const n = new THREE.Vector3();

        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);
            n.copy(v).normalize();
            const disp = Math.sin(v.x * 2.2 + seed) * Math.cos(v.z * 2.2 + seed) * 0.22
                       + Math.sin(v.y * 3.1 + seed * 1.5) * 0.15;
            v.addScaledVector(n, disp * radius);
            pos.setXYZ(i, v.x, v.y, v.z);
        }
        geom.computeVertexNormals();
        return geom;
    }

    _initArchetypes() {
        const trunkCol = 0x3d2412;
        const m4 = (x, y, z, rz = 0) => {
            const mat = new THREE.Matrix4();
            if (rz !== 0) mat.makeRotationZ(rz);
            mat.setPosition(x, y, z);
            return mat;
        };

        // 0: Alpine Spruce
        const spruceParts = [
            { geometry: new THREE.CylinderGeometry(0.32, 0.72, 8.2, 7), color: trunkCol, matrix: m4(0, 1.3, 0) },
            { geometry: new THREE.ConeGeometry(3.2, 2.8, 7), color: 0x14381d, matrix: m4(0, 3.6, 0) },
            { geometry: new THREE.ConeGeometry(2.6, 2.6, 7), color: 0x1e4f29, matrix: m4(0, 5.4, 0) },
            { geometry: new THREE.ConeGeometry(2.0, 2.3, 7), color: 0x1e4f29, matrix: m4(0, 7.0, 0) },
            { geometry: new THREE.ConeGeometry(1.3, 2.0, 7), color: 0x2b6938, matrix: m4(0, 8.5, 0) }
        ];
        this.archetypeGeoms[0] = mergeColoredGeometries(spruceParts);

        // 1: Summer Oak
        const oakPuffs = [
            { x: 0,    y: 5.8, z: 0,    r: 2.6, c: 0x3b8040 },
            { x: 1.3,  y: 4.8, z: 0.7,  r: 2.0, c: 0x275e2c },
            { x: -1.2, y: 5.0, z: -0.6, r: 1.8, c: 0x275e2c },
            { x: 0.3,  y: 4.5, z: -1.3, r: 1.7, c: 0x275e2c },
            { x: -0.7, y: 4.6, z: 1.2,  r: 1.6, c: 0x3b8040 }
        ];
        const oakParts = [
            { geometry: new THREE.CylinderGeometry(0.35, 0.75, 6.8, 7), color: trunkCol, matrix: m4(0, 0.6, 0) }
        ];
        oakPuffs.forEach((p, idx) => {
            oakParts.push({
                geometry: this._createFoliagePuffGeometry(p.r, idx * 7.0),
                color: p.c,
                matrix: m4(p.x, p.y, p.z)
            });
        });
        this.archetypeGeoms[1] = mergeColoredGeometries(oakParts);

        // 2: Golden Birch
        const birchParts = [
            { geometry: new THREE.CylinderGeometry(0.28, 0.65, 7.0, 7), color: 0xd8d2c5, matrix: m4(0, 0.7, 0) }
        ];
        oakPuffs.forEach((p, idx) => {
            birchParts.push({
                geometry: this._createFoliagePuffGeometry(p.r * 0.9, idx * 11.0),
                color: idx % 2 === 0 ? 0x9b8928 : 0x7a6c22,
                matrix: m4(p.x, p.y, p.z)
            });
        });
        this.archetypeGeoms[2] = mergeColoredGeometries(birchParts);

        // 3: Lush Meadow Bush
        const bushPuffs = [
            { x: 0,    y: 0.7,  z: 0,     r: 1.15, c: 0x347c2c },
            { x: 0.65, y: 0.55, z: 0.35,  r: 0.85, c: 0x1f5c22 },
            { x: -0.6, y: 0.58, z: -0.25, r: 0.88, c: 0x1f5c22 },
            { x: 0.2,  y: 0.5,  z: -0.6,  r: 0.82, c: 0x1f5c22 }
        ];
        const bushParts = bushPuffs.map((p, i) => ({
            geometry: this._createFoliagePuffGeometry(p.r, i * 13.0),
            color: p.c,
            matrix: m4(p.x, p.y, p.z)
        }));
        this.archetypeGeoms[3] = mergeColoredGeometries(bushParts);

        // 4: Flowering Shrub
        const flColors = [0xe74c3c, 0xf1c40f, 0xfafafa, 0x3498db];
        const flGeo = new THREE.IcosahedronGeometry(0.16, 0);
        const flBushParts = bushPuffs.map((p, i) => ({
            geometry: this._createFoliagePuffGeometry(p.r, i * 13.0),
            color: p.c,
            matrix: m4(p.x, p.y, p.z)
        }));
        for (let i = 0; i < 14; i++) {
            const theta = (i / 14.0) * Math.PI * 2;
            const phi = 0.35 + ((i * 37) % 100) / 110.0;
            const rad = 1.05 + (i % 3) * 0.12;
            flBushParts.push({
                geometry: flGeo.clone(),
                color: flColors[i % flColors.length],
                matrix: m4(
                    Math.sin(phi) * Math.cos(theta) * rad,
                    Math.cos(phi) * 0.65 + 0.5,
                    Math.sin(phi) * Math.sin(theta) * rad
                )
            });
        }
        flGeo.dispose();
        this.archetypeGeoms[4] = mergeColoredGeometries(flBushParts);

        // 5: Wildflower Meadow Patch
        const bloomGeo = new THREE.DodecahedronGeometry(0.22, 0);
        const stemGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.65, 4);
        const flowerParts = [];
        for (let i = 0; i < 14; i++) {
            const angle = (i / 14.0) * Math.PI * 2 + (i % 2) * 0.25;
            const dist = 0.3 + (i % 4) * 0.35;
            const fx = Math.cos(angle) * dist;
            const fz = Math.sin(angle) * dist;
            const tilt = ((i % 5) - 2) * 0.05;
            flowerParts.push({
                geometry: stemGeo.clone(),
                color: 0x27ae60,
                matrix: m4(fx, 0.32, fz, tilt)
            });
            flowerParts.push({
                geometry: bloomGeo.clone(),
                color: flColors[i % flColors.length],
                matrix: m4(fx, 0.62 + (i % 3) * 0.08, fz)
            });
        }
        bloomGeo.dispose();
        stemGeo.dispose();
        this.archetypeGeoms[5] = mergeColoredGeometries(flowerParts);
    }

    _initPools() {
        const capacities = [700, 550, 350, 550, 500, 550];
        for (let i = 0; i < 6; i++) {
            const pool = new InstancedPropPool(
                this.scene,
                this.archetypeGeoms[i],
                this.foliageMat,
                capacities[i],
                { fadeInDuration: 1.0, fadeOutDuration: 0.85 }
            );
            this.pools[i] = pool;
        }
    }

    createVegetation(x, z, type = 0, baseScale = 1.0, _parentGroup = null, immediate = false) {
        const safeType = Math.min(Math.max(type | 0, 0), 5);
        const pool = this.pools[safeType];
        if (!pool) return null;

        const y = getTerrainHeight(x, z);
        const yaw = ((Math.sin(x * 0.17 + z * 0.31) + 1.0) * Math.PI);
        this._dummyPos.set(x, y, z);
        this._dummyEuler.set(0, yaw, 0);
        this._dummyQuat.setFromEuler(this._dummyEuler);
        this._dummyScale.setScalar(baseScale);
        this._dummyMat.compose(this._dummyPos, this._dummyQuat, this._dummyScale);

        const slotId = pool.allocate(this._dummyMat, immediate);
        if (slotId < 0) return null;
        return { isTree: true, type: safeType, slotId };
    }

    createTree(x, z, type = 0, baseScale = 1.0, parentGroup = null, immediate = false) {
        return this.createVegetation(x, z, type, baseScale, parentGroup, immediate);
    }

    createBush(x, z, baseScale = 1.0, parentGroup = null, immediate = false) {
        return this.createVegetation(x, z, 3, baseScale, parentGroup, immediate);
    }

    createFloweringBush(x, z, baseScale = 1.0, parentGroup = null, immediate = false) {
        return this.createVegetation(x, z, 4, baseScale, parentGroup, immediate);
    }

    createFlowers(x, z, baseScale = 1.0, parentGroup = null, immediate = false) {
        return this.createVegetation(x, z, 5, baseScale, parentGroup, immediate);
    }

    removeTree(handle, immediate = false) {
        if (!handle || handle.slotId === undefined) return;
        const pool = this.pools[handle.type];
        if (pool) pool.free(handle.slotId, immediate);
    }

    update(delta, time, cameraPos = null) {
        this.sharedUniforms.uTime.value = time;
        if (cameraPos) {
            this.sharedUniforms.uFadeCameraPos.value.copy(cameraPos);
        }
        for (let i = 0; i < this.pools.length; i++) {
            this.pools[i].update(delta);
        }
    }

    destroy() {
        for (const pool of this.pools) {
            pool.destroy();
        }
        this.pools = [];
        for (const g of this.archetypeGeoms) {
            if (g) g.dispose();
        }
        this.archetypeGeoms = [];
        if (this.foliageMat) this.foliageMat.dispose();
    }
}
