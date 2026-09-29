import * as THREE from 'three';
import { getTerrainHeight } from './terrain.js';

/**
 * TreeManager — Procedural Forest Groves & Hillside Plantings
 * 
 * Rich, organic conifers and broadleaf trees featuring:
 * - Flared root bases and tapering cedar/oak trunks with branch nodes
 * - Cascading 4-tier conifer needle canopies with scalloped boughs
 * - Multi-cluster organic cloud canopies for deciduous oaks and golden birches
 * - Deformed leafy volumes with natural vertex displacement
 * - Two-tier hierarchical wind swaying (trunk sway + fluttering canopy boughs)
 */
export class TreeManager {
    constructor(scene, trackData, trackCenter) {
        this.scene = scene;
        this.trackData = trackData;
        this.trackCenter = trackCenter;

        // Rich botanical materials
        this.trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2412, roughness: 0.96 });
        this.pineDarkMat = new THREE.MeshStandardMaterial({ color: 0x14381d, roughness: 0.85 });
        this.pineMidMat = new THREE.MeshStandardMaterial({ color: 0x1e4f29, roughness: 0.82 });
        this.pineLightMat = new THREE.MeshStandardMaterial({ color: 0x2b6938, roughness: 0.80 });

        this.oakMat = new THREE.MeshStandardMaterial({ color: 0x275e2c, roughness: 0.85 });
        this.oakHighlightMat = new THREE.MeshStandardMaterial({ color: 0x3b8040, roughness: 0.80 });
        this.birchMat = new THREE.MeshStandardMaterial({ color: 0x7a6c22, roughness: 0.82 });

        this.foliageNodes = [];
        this.trees = [];
    }

    /**
     * Creates a deformed cloud puff geometry for organic leafy clusters
     */
    _createFoliagePuffGeometry(radius, seed = 0) {
        const geom = new THREE.IcosahedronGeometry(radius, 1);
        const pos = geom.attributes.position;
        const v = new THREE.Vector3();

        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);
            const n = v.clone().normalize();
            // Organic radial displacement
            const disp = Math.sin(v.x * 2.2 + seed) * Math.cos(v.z * 2.2 + seed) * 0.22
                       + Math.sin(v.y * 3.1 + seed * 1.5) * 0.15;
            v.addScaledVector(n, disp * radius);
            pos.setXYZ(i, v.x, v.y, v.z);
        }

        geom.computeVertexNormals();
        return geom;
    }

    createTree(x, z, type = 0, baseScale = 1.0) {
        // type: 0 = Alpine Spruce, 1 = Summer Oak, 2 = Golden Birch
        const tree = new THREE.Group();
        const y = getTerrainHeight(x, z);
        tree.position.set(x, y, z);

        const treeSeed = Math.abs(Math.sin(x * 12.9898 + z * 78.233)) * 100.0;

        // 1. Tapered Trunk with flaring root base
        const trunkHeight = (type === 0 ? 8.2 : 6.8) * baseScale;
        const trunkGeom = new THREE.CylinderGeometry(0.32 * baseScale, 0.72 * baseScale, trunkHeight, 8);
        const trunk = new THREE.Mesh(trunkGeom, this.trunkMat);
        trunk.position.set(0, (trunkHeight * 0.5 - 2.8 * baseScale), 0); // Sunk 2.8m deep into ground
        tree.add(trunk);

        // Flaring root anchors
        for (let r = 0; r < 3; r++) {
            const rootAngle = (r / 3) * Math.PI * 2 + (treeSeed * 0.1);
            const rootGeom = new THREE.CylinderGeometry(0.18 * baseScale, 0.45 * baseScale, 2.2 * baseScale, 6);
            const root = new THREE.Mesh(rootGeom, this.trunkMat);
            root.position.set(
                Math.sin(rootAngle) * 0.45 * baseScale,
                -0.4 * baseScale,
                Math.cos(rootAngle) * 0.45 * baseScale
            );
            root.rotation.x = 0.35 * Math.cos(rootAngle);
            root.rotation.z = -0.35 * Math.sin(rootAngle);
            tree.add(root);
        }

        const foliageGroup = new THREE.Group();

        if (type === 0) {
            // =========================================================================
            // ALPINE SPRUCE / SCOTS PINE: 4 Cascading Staggered Needle Tiers
            // =========================================================================
            const tiers = [
                { r: 3.2, h: 2.8, y: 3.6, mat: this.pineDarkMat, rot: 0.1 },
                { r: 2.6, h: 2.6, y: 5.4, mat: this.pineMidMat, rot: 0.35 },
                { r: 2.0, h: 2.3, y: 7.0, mat: this.pineMidMat, rot: 0.65 },
                { r: 1.3, h: 2.0, y: 8.5, mat: this.pineLightMat, rot: 0.95 }
            ];

            for (let i = 0; i < tiers.length; i++) {
                const t = tiers[i];
                const coneGeom = new THREE.ConeGeometry(t.r * baseScale, t.h * baseScale, 9);
                // Perturb bottom rim for scalloped needle look
                const cPos = coneGeom.attributes.position;
                for (let v = 0; v < cPos.count; v++) {
                    const py = cPos.getY(v);
                    if (py < -0.1) {
                        const px = cPos.getX(v);
                        const pz = cPos.getZ(v);
                        const rimWiggle = Math.sin(Math.atan2(pz, px) * 5.0 + i) * 0.14 * baseScale;
                        cPos.setY(v, py + rimWiggle);
                    }
                }
                coneGeom.computeVertexNormals();

                const cone = new THREE.Mesh(coneGeom, t.mat);
                cone.position.set(0, t.y * baseScale, 0);
                cone.rotation.y = t.rot + (treeSeed * 0.2);
                foliageGroup.add(cone);
            }
        } else {
            // =========================================================================
            // BROADLEAF CANOPY (Oak or Golden Birch): Multi-cluster Organic Cloud Puffs
            // =========================================================================
            const mat = type === 2 ? this.birchMat : this.oakMat;
            const highMat = type === 2 ? this.birchMat : this.oakHighlightMat;

            // Side branches
            const branch1 = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * baseScale, 0.28 * baseScale, 2.5 * baseScale, 6), this.trunkMat);
            branch1.position.set(0.6 * baseScale, 3.8 * baseScale, 0.4 * baseScale);
            branch1.rotation.set(0.4, 0.2, -0.65);
            tree.add(branch1);

            const branch2 = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * baseScale, 0.25 * baseScale, 2.3 * baseScale, 6), this.trunkMat);
            branch2.position.set(-0.5 * baseScale, 4.2 * baseScale, -0.3 * baseScale);
            branch2.rotation.set(-0.35, -0.3, 0.6);
            tree.add(branch2);

            // 7 Multi-tier foliage clusters
            const clusters = [
                // Main Crown
                { x: 0, y: 6.2, z: 0, r: 2.5, m: highMat },
                // Radial boughs
                { x: 1.4, y: 5.2, z: 0.8, r: 2.1, m: mat },
                { x: -1.3, y: 5.4, z: -0.7, r: 1.9, m: mat },
                { x: 0.4, y: 4.8, z: -1.4, r: 1.8, m: mat },
                { x: -0.8, y: 4.9, z: 1.3, r: 1.7, m: highMat },
                // Lower skirt puffs
                { x: 1.8, y: 4.1, z: -0.3, r: 1.4, m: mat },
                { x: -1.5, y: 4.3, z: 0.6, r: 1.5, m: highMat }
            ];

            for (let c = 0; c < clusters.length; c++) {
                const cl = clusters[c];
                const puffGeom = this._createFoliagePuffGeometry(cl.r * baseScale, treeSeed + c * 13.0);
                const puff = new THREE.Mesh(puffGeom, cl.m);
                puff.position.set(cl.x * baseScale, cl.y * baseScale, cl.z * baseScale);
                foliageGroup.add(puff);
            }
        }

        tree.add(foliageGroup);
        this.foliageNodes.push({
            group: foliageGroup,
            worldX: x,
            worldZ: z,
            scale: baseScale,
            speedOffset: treeSeed * 0.05
        });

        this.scene.add(tree);
        this.trees.push(tree);
        return tree;
    }

    setupMeadowGroves() {
        const { points } = this.trackData;
        const cx = this.trackCenter.x;
        const cz = this.trackCenter.z;

        // Concentric grove rings across rolling hills and plains
        const groveCenters = [];
        const ringRadii = [60, 110, 160, 220, 290, 360];
        let seed = 42;
        const pseudoRand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

        for (const r of ringRadii) {
            const count = Math.floor(r / 30);
            for (let k = 0; k < count; k++) {
                const angle = (k / count) * Math.PI * 2 + pseudoRand() * 0.45;
                const dist = r + (pseudoRand() - 0.5) * 45;
                const gx = cx + Math.cos(angle) * dist;
                const gz = cz + Math.sin(angle) * dist;

                // Check distance to road
                let minDist = Infinity;
                for (let i = 0; i < points.length; i += 3) {
                    const dx = gx - points[i].x;
                    const dz = gz - points[i].z;
                    const d = Math.sqrt(dx * dx + dz * dz);
                    if (d < minDist) minDist = d;
                }

                if (minDist > 16.0) {
                    groveCenters.push({ x: gx, z: gz });
                }
            }
        }

        // Spawn natural tree clusters in each grove
        for (const g of groveCenters) {
            const treeCount = 2 + Math.floor(pseudoRand() * 4);
            for (let t = 0; t < treeCount; t++) {
                const ox = (pseudoRand() - 0.5) * 16.0;
                const oz = (pseudoRand() - 0.5) * 16.0;
                const tx = g.x + ox;
                const tz = g.z + oz;

                // Extra clearance check
                let minDist = Infinity;
                for (let i = 0; i < points.length; i += 4) {
                    const d = Math.hypot(tx - points[i].x, tz - points[i].z);
                    if (d < minDist) minDist = d;
                }

                if (minDist > 12.0) {
                    // Tree variety: 50% Alpine Spruce, 35% Summer Oak, 15% Golden Birch
                    const rType = pseudoRand();
                    const treeType = rType < 0.50 ? 0 : rType < 0.85 ? 1 : 2;
                    const scale = 0.85 + pseudoRand() * 0.50;
                    this.createTree(tx, tz, treeType, scale);
                }
            }
        }
    }

    update(delta, time) {
        // Natural multi-phase wind sway in the treetops
        for (let i = 0; i < this.foliageNodes.length; i++) {
            const node = this.foliageNodes[i];
            const waveX = Math.sin(time * 1.6 + node.worldX * 0.04 + node.speedOffset);
            const waveZ = Math.cos(time * 1.3 + node.worldZ * 0.05 + node.speedOffset);
            node.group.rotation.z = waveX * 0.055;
            node.group.rotation.x = waveZ * 0.040;
        }
    }
}

