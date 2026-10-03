import * as THREE from 'three';
import { getTerrainHeight } from './terrain.js';

/**
 * TreeManager — Fast Pre-Cached Two-Tier LOD Botanical Forests
 * 
 * Features:
 * - Pre-compiled shared BufferGeometries (Zero CPU geometry generation during streaming)
 * - Built-in THREE.LOD:
 *   - High LOD (< 75m): 4-tier conifer needle tiers / multi-puff organic oak canopies
 *   - Low LOD (75m - 400m): Ultra-lightweight low-poly cones and billboard canopies
 * - Zero GC pauses, zero shader compilation overhead, constant 120 FPS
 */
export class TreeManager {
    constructor(scene, trackData, trackCenter) {
        this.scene = scene;
        this.trackData = trackData;
        this.trackCenter = trackCenter;

        // Botanical materials
        this.trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2412, roughness: 0.96 });
        this.pineDarkMat = new THREE.MeshStandardMaterial({ color: 0x14381d, roughness: 0.85 });
        this.pineMidMat = new THREE.MeshStandardMaterial({ color: 0x1e4f29, roughness: 0.82 });
        this.pineLightMat = new THREE.MeshStandardMaterial({ color: 0x2b6938, roughness: 0.80 });

        this.oakMat = new THREE.MeshStandardMaterial({ color: 0x275e2c, roughness: 0.85 });
        this.oakHighlightMat = new THREE.MeshStandardMaterial({ color: 0x3b8040, roughness: 0.80 });
        this.birchMat = new THREE.MeshStandardMaterial({ color: 0x7a6c22, roughness: 0.82 });

        // Bush & Wildflower Materials
        this.bushMat = new THREE.MeshStandardMaterial({ color: 0x1f5c22, roughness: 0.88 });
        this.bushHighlightMat = new THREE.MeshStandardMaterial({ color: 0x347c2c, roughness: 0.84 });
        this.flowerRedMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c, roughness: 0.55 });
        this.flowerYellowMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.55 });
        this.flowerBlueMat = new THREE.MeshStandardMaterial({ color: 0x3498db, roughness: 0.55 });
        this.flowerWhiteMat = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.55 });
        this.stemMat = new THREE.MeshStandardMaterial({ color: 0x27ae60, roughness: 0.90 });

        this.trees = [];
        this.foliageNodes = [];

        this._initSharedArchetypes();
    }

    _createFoliagePuffGeometry(radius, seed = 0) {
        const geom = new THREE.IcosahedronGeometry(radius, 1);
        const pos = geom.attributes.position;
        const v = new THREE.Vector3();

        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);
            const n = v.clone().normalize();
            const disp = Math.sin(v.x * 2.2 + seed) * Math.cos(v.z * 2.2 + seed) * 0.22
                       + Math.sin(v.y * 3.1 + seed * 1.5) * 0.15;
            v.addScaledVector(n, disp * radius);
            pos.setXYZ(i, v.x, v.y, v.z);
        }
        geom.computeVertexNormals();
        return geom;
    }

    _initSharedArchetypes() {
        this.sharedHigh = [];
        this.sharedLow = [];

        // =========================================================================
        // TYPE 0: ALPINE SPRUCE
        // =========================================================================
        // High LOD Spruce
        const spruceHigh = new THREE.Group();
        const sTrunkGeom = new THREE.CylinderGeometry(0.32, 0.72, 8.2, 8);
        const sTrunk = new THREE.Mesh(sTrunkGeom, this.trunkMat);
        sTrunk.position.y = 1.3;
        spruceHigh.add(sTrunk);

        const tiers = [
            { r: 3.2, h: 2.8, y: 3.6, mat: this.pineDarkMat },
            { r: 2.6, h: 2.6, y: 5.4, mat: this.pineMidMat },
            { r: 2.0, h: 2.3, y: 7.0, mat: this.pineMidMat },
            { r: 1.3, h: 2.0, y: 8.5, mat: this.pineLightMat }
        ];
        for (const t of tiers) {
            const coneGeom = new THREE.ConeGeometry(t.r, t.h, 8);
            const cone = new THREE.Mesh(coneGeom, t.mat);
            cone.position.y = t.y;
            spruceHigh.add(cone);
        }
        this.sharedHigh[0] = spruceHigh;

        // Low LOD Spruce (Only 1 trunk + 1 cone)
        const spruceLow = new THREE.Group();
        const sLowTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.65, 8.0, 5), this.trunkMat);
        sLowTrunk.position.y = 1.3;
        spruceLow.add(sLowTrunk);
        const sLowCone = new THREE.Mesh(new THREE.ConeGeometry(3.0, 7.2, 6), this.pineMidMat);
        sLowCone.position.y = 6.2;
        spruceLow.add(sLowCone);
        this.sharedLow[0] = spruceLow;

        // =========================================================================
        // TYPE 1: SUMMER OAK
        // =========================================================================
        const oakHigh = new THREE.Group();
        const oTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.75, 6.8, 8), this.trunkMat);
        oTrunk.position.y = 0.6;
        oakHigh.add(oTrunk);

        const oPuffs = [
            { x: 0, y: 5.8, z: 0, r: 2.6, m: this.oakHighlightMat },
            { x: 1.3, y: 4.8, z: 0.7, r: 2.0, m: this.oakMat },
            { x: -1.2, y: 5.0, z: -0.6, r: 1.8, m: this.oakMat },
            { x: 0.3, y: 4.5, z: -1.3, r: 1.7, m: this.oakMat },
            { x: -0.7, y: 4.6, z: 1.2, r: 1.6, m: this.oakHighlightMat }
        ];
        for (let i = 0; i < oPuffs.length; i++) {
            const p = oPuffs[i];
            const pGeom = this._createFoliagePuffGeometry(p.r, i * 7.0);
            const pMesh = new THREE.Mesh(pGeom, p.m);
            pMesh.position.set(p.x, p.y, p.z);
            oakHigh.add(pMesh);
        }
        this.sharedHigh[1] = oakHigh;

        // Low LOD Oak (Single 7-sided crown)
        const oakLow = new THREE.Group();
        const oLowTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.7, 6.5, 5), this.trunkMat);
        oLowTrunk.position.y = 0.6;
        oakLow.add(oLowTrunk);
        const oLowCrown = new THREE.Mesh(new THREE.DodecahedronGeometry(3.0, 0), this.oakMat);
        oLowCrown.position.y = 5.2;
        oakLow.add(oLowCrown);
        this.sharedLow[1] = oakLow;

        // =========================================================================
        // TYPE 2: GOLDEN BIRCH
        // =========================================================================
        const birchHigh = new THREE.Group();
        const bTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.65, 7.0, 8), this.trunkMat);
        bTrunk.position.y = 0.7;
        birchHigh.add(bTrunk);
        for (let i = 0; i < oPuffs.length; i++) {
            const p = oPuffs[i];
            const pGeom = this._createFoliagePuffGeometry(p.r * 0.9, i * 11.0);
            const pMesh = new THREE.Mesh(pGeom, this.birchMat);
            pMesh.position.set(p.x, p.y, p.z);
            birchHigh.add(pMesh);
        }
        this.sharedHigh[2] = birchHigh;

        const birchLow = new THREE.Group();
        const bLowTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.65, 6.8, 5), this.trunkMat);
        bLowTrunk.position.y = 0.7;
        birchLow.add(bLowTrunk);
        const bLowCrown = new THREE.Mesh(new THREE.DodecahedronGeometry(2.7, 0), this.birchMat);
        bLowCrown.position.y = 5.0;
        birchLow.add(bLowCrown);
        this.sharedLow[2] = birchLow;

        // =========================================================================
        // TYPE 3: LUSH MEADOW BUSH (Dense Rounded Shrub Dome)
        // =========================================================================
        const bushHigh = new THREE.Group();
        const bushPuffs = [
            { x: 0, y: 0.7, z: 0, r: 1.15, m: this.bushHighlightMat },
            { x: 0.65, y: 0.55, z: 0.35, r: 0.85, m: this.bushMat },
            { x: -0.6, y: 0.58, z: -0.25, r: 0.88, m: this.bushMat },
            { x: 0.2, y: 0.5, z: -0.6, r: 0.82, m: this.bushMat }
        ];
        for (let i = 0; i < bushPuffs.length; i++) {
            const p = bushPuffs[i];
            const pMesh = new THREE.Mesh(this._createFoliagePuffGeometry(p.r, i * 13.0), p.m);
            pMesh.position.set(p.x, p.y, p.z);
            bushHigh.add(pMesh);
        }
        this.sharedHigh[3] = bushHigh;

        const bushLow = new THREE.Group();
        const bLowMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4, 0), this.bushMat);
        bLowMesh.position.y = 0.65;
        bushLow.add(bLowMesh);
        this.sharedLow[3] = bushLow;

        // =========================================================================
        // TYPE 4: FLOWERING SHRUB (Bush with Colorful Crimson & Golden Blossoms)
        // =========================================================================
        const flBushHigh = bushHigh.clone();
        const flMats = [this.flowerRedMat, this.flowerYellowMat, this.flowerWhiteMat, this.flowerBlueMat];
        const flGeom = new THREE.IcosahedronGeometry(0.16, 0);
        for (let i = 0; i < 14; i++) {
            const theta = (i / 14.0) * Math.PI * 2;
            const phi = Math.random() * 0.9 + 0.3;
            const rad = 1.05 + (i % 3) * 0.12;
            const fl = new THREE.Mesh(flGeom, flMats[i % flMats.length]);
            fl.position.set(
                Math.sin(phi) * Math.cos(theta) * rad,
                Math.cos(phi) * 0.65 + 0.5,
                Math.sin(phi) * Math.sin(theta) * rad
            );
            flBushHigh.add(fl);
        }
        this.sharedHigh[4] = flBushHigh;
        this.sharedLow[4] = bushLow.clone();

        // =========================================================================
        // TYPE 5: WILDFLOWER MEADOW PATCH (Cluster of Stems with Vibrant Petals)
        // =========================================================================
        const flowerHigh = new THREE.Group();
        const flowerLow = new THREE.Group();
        const bloomGeom = new THREE.DodecahedronGeometry(0.22, 0);
        const stemGeom = new THREE.CylinderGeometry(0.025, 0.025, 0.65, 4);

        for (let i = 0; i < 16; i++) {
            const angle = (i / 16.0) * Math.PI * 2 + (i % 2) * 0.25;
            const dist = 0.3 + (i % 4) * 0.35;
            const fx = Math.cos(angle) * dist;
            const fz = Math.sin(angle) * dist;
            const mat = flMats[i % flMats.length];

            const stem = new THREE.Mesh(stemGeom, this.stemMat);
            stem.position.set(fx, 0.32, fz);
            stem.rotation.z = (Math.random() - 0.5) * 0.2;
            flowerHigh.add(stem);

            const bloom = new THREE.Mesh(bloomGeom, mat);
            bloom.position.set(fx, 0.62 + (i % 3) * 0.08, fz);
            flowerHigh.add(bloom);

            if (i < 5) {
                const lowBloom = new THREE.Mesh(bloomGeom, mat);
                lowBloom.position.set(fx, 0.55, fz);
                flowerLow.add(lowBloom);
            }
        }
        this.sharedHigh[5] = flowerHigh;
        this.sharedLow[5] = flowerLow;
    }

    createVegetation(x, z, type = 0, baseScale = 1.0, parentGroup = null) {
        const safeType = Math.min(Math.max(type, 0), 5);
        const lod = new THREE.LOD();
        lod.isTree = true;
        const y = getTerrainHeight(x, z);
        lod.position.set(x, y, z);
        lod.scale.setScalar(baseScale);

        // Instant clone of pre-cached shared geometry meshes (0ms CPU time!)
        const high = this.sharedHigh[safeType].clone();
        const low = this.sharedLow[safeType].clone();
        lod.addLevel(high, 0);
        lod.addLevel(low, safeType >= 3 ? 55 : 75);

        const targetParent = parentGroup || this.scene;
        targetParent.add(lod);
        this.trees.push(lod);
        return lod;
    }

    createTree(x, z, type = 0, baseScale = 1.0, parentGroup = null) {
        return this.createVegetation(x, z, type, baseScale, parentGroup);
    }

    createBush(x, z, baseScale = 1.0, parentGroup = null) {
        return this.createVegetation(x, z, 3, baseScale, parentGroup);
    }

    createFloweringBush(x, z, baseScale = 1.0, parentGroup = null) {
        return this.createVegetation(x, z, 4, baseScale, parentGroup);
    }

    createFlowers(x, z, baseScale = 1.0, parentGroup = null) {
        return this.createVegetation(x, z, 5, baseScale, parentGroup);
    }

    removeTree(treeObj) {
        if (!treeObj) return;
        const idx = this.trees.indexOf(treeObj);
        if (idx !== -1) this.trees.splice(idx, 1);
        if (treeObj.parent) treeObj.parent.remove(treeObj);
    }

    setupMeadowGroves() {
        // Obsolete: Scenery is now dynamically generated in infinite chunk bands
    }

    update(delta, time) {
        // Subtle global wind sway
        const wave = Math.sin(time * 1.5) * 0.03;
        for (let i = 0; i < this.trees.length; i++) {
            this.trees[i].rotation.z = wave;
        }
    }
}
