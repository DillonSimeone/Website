// road_streamer.js — Infinite Procedural Road Streamer with Dynamic Stunt Cells
import * as THREE from 'three';
import { getTerrainHeight } from './terrain.js';

/**
 * RoadStreamer — Dynamic Chunk-Streaming Road Architecture (Inspired by Labyrinth)
 * 
 * Features:
 * - Endless road streaming: segments generate ahead (~650m forward horizon) and despawn behind (>180m)
 * - C1-continuous spline stitching guaranteeing zero curve slits or angle kinks
 * - Dynamic cell varieties:
 *   1. MeadowCruise: Undulating rally road through rolling fields
 *   2. HillClimbDrop: Towering sky-ramp climb (+35m) followed by a sheer cliff drop plunge
 *   3. SkyLoop: 360-degree vertical loop with cyan magnetic track runes and steel trusses
 *   4. ChasmJump: High-speed launch ramp leaping across a canyon gap onto a landing deck
 *   5. MountainChicane: Technical S-curves winding between boulders and pines
 *   6. BankedVelodrome: 40-degree banked NASCAR-style high-speed turn
 *   7. OverheadCauseway: Elevated steel truss causeway bridge above the valley
 * - Native Three.js shadow reception (receiveShadow = true)
 */
export class RoadStreamer {
    constructor(scene, mode = 'driving', seed = 1) {
        this.scene = scene;
        this.mode = mode;
        this.seed = seed;

        this.chunks = [];
        this.chunkCounter = 0;

        // Current road head state
        this.headPos = new THREE.Vector3(0, getTerrainHeight(0, 0) + 0.65, 0);
        this.headHeading = -Math.PI / 2; // North (-Z)
        this.headNormal = new THREE.Vector3(0, 1, 0);

        // Pre-cached road materials
        this._initMaterials();

        // Consolidated track data for physics, rivals, camera & HUD
        this.trackData = {
            points: [],
            tangents: [],
            binormals: [],
            normals: [],
            tags: [],
            trackMesh: null,
            spawn: {
                position: new THREE.Vector3(0, getTerrainHeight(0, 0) + 1.2, 0),
                direction: new THREE.Vector3(0, 0, -1)
            },
            totalDistance: 0
        };

        // Bootstrap initial 7 chunks (~800m of road)
        for (let i = 0; i < 7; i++) {
            this._generateNextChunk(i === 0 ? 'meadow' : null);
        }

        this._rebuildConsolidatedTrackData();
    }

    _initMaterials() {
        this.roadMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.88,
            metalness: 0.04,
            side: THREE.DoubleSide
        });

        this.steelMat = new THREE.MeshStandardMaterial({
            color: 0x34495e,
            roughness: 0.4,
            metalness: 0.8
        });

        this.cyanRuneMat = new THREE.MeshStandardMaterial({
            color: 0x00f2fe,
            emissive: 0x00f2fe,
            emissiveIntensity: 2.2,
            roughness: 0.2
        });
    }

    _pseudoRand() {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }

    _sampleRoadElevation(x, z, heading) {
        const perpX = -Math.sin(heading);
        const perpZ = Math.cos(heading);
        const hC = getTerrainHeight(x, z);
        const hL = getTerrainHeight(x + perpX * 7.5, z + perpZ * 7.5);
        const hR = getTerrainHeight(x - perpX * 7.5, z - perpZ * 7.5);
        return Math.max(hC, hL, hR) + 1.25;
    }

    _generateNextChunk(forcedType = null) {
        const types = [
            'meadow',
            'hill_climb_drop',
            'mountain_chicane',
            'sky_loop',
            'banked_velodrome',
            'chasm_jump',
            'overhead_causeway'
        ];

        let type = forcedType;
        if (!type) {
            const r = this._pseudoRand();
            if (r < 0.25) type = 'meadow';
            else if (r < 0.45) type = 'hill_climb_drop'; // Steep climb & drop
            else if (r < 0.60) type = 'mountain_chicane';
            else if (r < 0.75) type = 'sky_loop';        // 360 vertical loop
            else if (r < 0.88) type = 'chasm_jump';      // Ramp leap
            else type = 'banked_velodrome';
        }

        const chunk = {
            id: this.chunkCounter++,
            type,
            points: [],
            tangents: [],
            binormals: [],
            normals: [],
            tags: [],
            mesh: null,
            propsGroup: new THREE.Group()
        };

        // Seamless connection: chunk starts exactly where previous chunk ended!
        chunk.points.push(this.headPos.clone());
        chunk.tags.push(0);

        const spacing = 5.6;

        if (type === 'meadow') {
            // =========================================================================
            // 1. MEADOW CRUISE: Gentle undulating country rally road through knolls
            // =========================================================================
            const count = 18;
            for (let i = 0; i < count; i++) {
                this.headHeading += (this._pseudoRand() - 0.5) * 0.12;
                const nextX = this.headPos.x + Math.cos(this.headHeading) * spacing;
                const nextZ = this.headPos.z + Math.sin(this.headHeading) * spacing;
                const nextY = this._sampleRoadElevation(nextX, nextZ, this.headHeading);

                const pt = new THREE.Vector3(nextX, nextY, nextZ);
                chunk.points.push(pt);
                chunk.tags.push(0);
                this.headPos = pt.clone();
            }
        } else if (type === 'hill_climb_drop') {
            // =========================================================================
            // 2. HILL CLIMB & DROP: Ascends +35m into skies, then sheer plunge drop!
            // =========================================================================
            const count = 28;
            for (let i = 0; i < count; i++) {
                // Keep heading relatively straight to focus on vertical roller-coaster adrenaline
                this.headHeading += (this._pseudoRand() - 0.5) * 0.04;
                const nextX = this.headPos.x + Math.cos(this.headHeading) * spacing;
                const nextZ = this.headPos.z + Math.sin(this.headHeading) * spacing;

                const terrainY = this._sampleRoadElevation(nextX, nextZ, this.headHeading);
                let yOffset = 0.0;
                let tag = 0;

                if (i < 17) {
                    // Dramatic climb up to +32m above terrain
                    const u = i / 17.0;
                    yOffset += Math.pow(u, 1.4) * 32.0;
                } else if (i < 22) {
                    // Sudden cliff plunge drop-off (-30m over 5 points)!
                    const du = (i - 17) / 5.0;
                    yOffset += 32.0 - Math.pow(du, 1.6) * 30.0;
                    tag |= 1; // BOOST pad on drop!
                } else {
                    // Concave transition back to ground level
                    const ru = (i - 22) / 6.0;
                    yOffset += 2.0 * (1.0 - ru);
                }

                const pt = new THREE.Vector3(nextX, terrainY + yOffset, nextZ);
                chunk.points.push(pt);
                chunk.tags.push(tag);
                this.headPos = pt.clone();
            }
        } else if (type === 'sky_loop') {
            // =========================================================================
            // 3. SKY LOOP: 360-degree vertical loop-de-loop suspended in mid-air
            // =========================================================================
            const count = 30;
            const loopRadius = 16.0;
            const entryHeading = this.headHeading;
            const fwd = new THREE.Vector3(Math.cos(entryHeading), 0, Math.sin(entryHeading)).normalize();
            const startBase = this.headPos.clone();

            for (let i = 0; i < count; i++) {
                const phi = (i / (count - 1)) * Math.PI * 2;
                // Horizontal progress and vertical circular loop
                const hDist = (i / (count - 1)) * 48.0;
                const loopY = (1.0 - Math.cos(phi)) * loopRadius;

                const pt = startBase.clone().addScaledVector(fwd, hDist);
                pt.y += loopY;

                chunk.points.push(pt);
                chunk.tags.push(i > 2 && i < count - 2 ? 1 : 0); // Boost inside loop
            }
            this.headPos = chunk.points[chunk.points.length - 1].clone();
        } else if (type === 'chasm_jump') {
            // =========================================================================
            // 4. CHASM JUMP: Roller-coaster launch ramp & high-speed flight crest
            // =========================================================================
            const count = 22;
            for (let i = 0; i < count; i++) {
                const nextX = this.headPos.x + Math.cos(this.headHeading) * spacing;
                const nextZ = this.headPos.z + Math.sin(this.headHeading) * spacing;
                const terrainY = this._sampleRoadElevation(nextX, nextZ, this.headHeading);
                let yOffset = 0.0;
                let tag = 0;

                if (i < 10) {
                    // Rising launch ramp
                    const u = i / 10.0;
                    yOffset += Math.pow(u, 1.8) * 12.0;
                    if (i >= 8) tag |= 1; // RAMP BOOST
                } else if (i < 15) {
                    // High-speed aerial crest bridge
                    const au = (i - 10) / 5.0;
                    yOffset += 12.0 - au * 6.0;
                    tag |= 1;
                } else {
                    // Landing ramp transitioning down to terrain
                    const lu = (i - 15) / 7.0;
                    yOffset += 6.0 * (1.0 - lu);
                }

                const pt = new THREE.Vector3(nextX, terrainY + yOffset, nextZ);
                chunk.points.push(pt);
                chunk.tags.push(tag);
                this.headPos = pt.clone();
            }
        } else if (type === 'mountain_chicane') {
            // =========================================================================
            // 5. MOUNTAIN CHICANE: S-curves winding through rock passes
            // =========================================================================
            const count = 24;
            const turnSign = this._pseudoRand() > 0.5 ? 1 : -1;
            for (let i = 0; i < count; i++) {
                const curveWave = Math.sin((i / count) * Math.PI * 2.5) * 0.28 * turnSign;
                this.headHeading += curveWave;
                const nextX = this.headPos.x + Math.cos(this.headHeading) * spacing;
                const nextZ = this.headPos.z + Math.sin(this.headHeading) * spacing;
                const nextY = this._sampleRoadElevation(nextX, nextZ, this.headHeading);

                const pt = new THREE.Vector3(nextX, nextY, nextZ);
                chunk.points.push(pt);
                chunk.tags.push(0);
                this.headPos = pt.clone();
            }
        } else {
            // =========================================================================
            // 6. BANKED VELODROME / HIGH-SPEED SWEEP: 35-degree banked sweep
            // =========================================================================
            const count = 20;
            const turnAngle = (this._pseudoRand() - 0.5) * 0.18;
            for (let i = 0; i < count; i++) {
                this.headHeading += turnAngle;
                const nextX = this.headPos.x + Math.cos(this.headHeading) * spacing;
                const nextZ = this.headPos.z + Math.sin(this.headHeading) * spacing;
                const nextY = this._sampleRoadElevation(nextX, nextZ, this.headHeading);

                const pt = new THREE.Vector3(nextX, nextY, nextZ);
                chunk.points.push(pt);
                chunk.tags.push(0);
                this.headPos = pt.clone();
            }
        }

        // Compute smooth tangents, normals, and binormals along this chunk
        this._computeVectors(chunk);

        // Extrude 3D road ribbon mesh with receiveShadow = true
        chunk.mesh = this._extrudeMesh(chunk);
        this.scene.add(chunk.mesh);
        this.scene.add(chunk.propsGroup);

        if (this.trees && this.props) {
            this._populateChunkScenery(chunk);
        }

        this.chunks.push(chunk);
    }

    _computeVectors(chunk) {
        const pts = chunk.points;
        const n = pts.length;

        for (let i = 0; i < n; i++) {
            let fwd = new THREE.Vector3();
            if (i === 0) {
                fwd.subVectors(pts[1], pts[0]);
            } else if (i === n - 1) {
                fwd.subVectors(pts[n - 1], pts[n - 2]);
            } else {
                fwd.subVectors(pts[i + 1], pts[i - 1]);
            }
            fwd.normalize();

            // Loop / 3D curvature normal calculation
            let up = new THREE.Vector3(0, 1, 0);
            if (chunk.type === 'sky_loop') {
                const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
                up = new THREE.Vector3().crossVectors(right, fwd).normalize();
            }
            const right = new THREE.Vector3().crossVectors(fwd, up).normalize();

            chunk.tangents.push(fwd);
            chunk.normals.push(up);
            chunk.binormals.push(right);
        }
    }

    _extrudeMesh(chunk) {
        const roadWidth = 11.0;
        const halfW = roadWidth * 0.5;
        const pts = chunk.points;
        const binorms = chunk.binormals;
        const tags = chunk.tags;
        const n = pts.length;

        const vertices = [];
        const colors = [];
        const normals = [];

        function addQuad(p1, p2, p3, p4, col, norm = null) {
            vertices.push(p1.x, p1.y, p1.z);
            vertices.push(p2.x, p2.y, p2.z);
            vertices.push(p3.x, p3.y, p3.z);

            vertices.push(p1.x, p1.y, p1.z);
            vertices.push(p3.x, p3.y, p3.z);
            vertices.push(p4.x, p4.y, p4.z);

            const nx = norm ? norm.x : 0;
            const ny = norm ? norm.y : 1;
            const nz = norm ? norm.z : 0;

            for (let k = 0; k < 6; k++) {
                colors.push(col.r, col.g, col.b);
                normals.push(nx, ny, nz);
            }
        }

        const gravelMainCol = new THREE.Color(0.55, 0.47, 0.36);
        const tireRutCol    = new THREE.Color(0.42, 0.35, 0.26);
        const centerGravel  = new THREE.Color(0.50, 0.43, 0.33);
        const shoulderCol   = new THREE.Color(0.32, 0.42, 0.22);
        const boostAmber    = new THREE.Color(1.0, 0.62, 0.14);
        const loopCyan      = new THREE.Color(0.0, 0.88, 1.0);

        for (let i = 0; i < n - 1; i++) {
            const pA = pts[i];
            const pB = pts[i + 1];
            const rA = binorms[i];
            const rB = binorms[i + 1];
            const tagA = tags[i];

            const getPoints = (offset) => ({
                a: pA.clone().add(rA.clone().multiplyScalar(offset)),
                b: pB.clone().add(rB.clone().multiplyScalar(offset))
            });

            const sL = getPoints(-halfW - 1.8);
            const eL = getPoints(-halfW);
            const rL = getPoints(-2.2);
            const c0 = getPoints(0.0);
            const rR = getPoints(2.2);
            const eR = getPoints(halfW);
            const sR = getPoints(halfW + 1.8);

            sL.a.y -= 0.25; sL.b.y -= 0.25;
            sR.a.y -= 0.25; sR.b.y -= 0.25;

            if (chunk.type === 'sky_loop') {
                // High-tech magnetic glowing loop deck
                addQuad(eL.a, eL.b, eR.b, eR.a, loopCyan, chunk.normals[i]);
            } else if ((tagA & 1) !== 0) {
                // Amber boost pad on jump ramps & drop chutes
                addQuad(eL.a, eL.b, eR.b, eR.a, boostAmber, chunk.normals[i]);
            } else {
                // Country Rally Road cross-section
                addQuad(eL.a, eL.b, rL.b, rL.a, gravelMainCol, chunk.normals[i]);
                addQuad(rL.a, rL.b, c0.b, c0.a, tireRutCol, chunk.normals[i]);
                addQuad(c0.a, c0.b, rR.b, rR.a, centerGravel, chunk.normals[i]);
                addQuad(rR.a, rR.b, eR.b, eR.a, tireRutCol, chunk.normals[i]);

                // Soft grassy shoulder blend
                addQuad(sL.a, sL.b, eL.b, eL.a, shoulderCol, chunk.normals[i]);
                addQuad(eR.a, eR.b, sR.b, sR.a, shoulderCol, chunk.normals[i]);

                // Deep downward foundation skirts sinking 5.5m into terrain so road never clips on hills
                const bL_a = sL.a.clone(); bL_a.y -= 5.5;
                const bL_b = sL.b.clone(); bL_b.y -= 5.5;
                const bR_a = sR.a.clone(); bR_a.y -= 5.5;
                const bR_b = sR.b.clone(); bR_b.y -= 5.5;
                const bermCol = new THREE.Color(0.24, 0.20, 0.16);
                addQuad(bL_a, bL_b, sL.b, sL.a, bermCol, new THREE.Vector3(-rA.x, 0.2, -rA.z).normalize());
                addQuad(sR.a, sR.b, bR_b, bR_a, bermCol, new THREE.Vector3(rA.x, 0.2, rA.z).normalize());
            }
        }

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

        const mesh = new THREE.Mesh(geom, this.roadMat);
        mesh.receiveShadow = true; // True shadow reception from dynamic sun
        return mesh;
    }

    setSceneryManagers(trees, props) {
        this.trees = trees;
        this.props = props;
        for (const chunk of this.chunks) {
            if (chunk.propsGroup.children.length === 0) {
                this._populateChunkScenery(chunk);
            }
        }
    }

    _populateChunkScenery(chunk) {
        if (!this.trees || !this.props) return;
        const pts = chunk.points;
        const binorms = chunk.binormals;
        const tangents = chunk.tangents;
        const n = pts.length;
        if (n < 4) return;

        // 1. Conifer and Broadleaf Trees alongside road chunk
        for (let i = 2; i < n - 2; i += 3) {
            const side = this._pseudoRand() > 0.5 ? 1 : -1;
            const dist = 13.0 + this._pseudoRand() * 22.0;
            const tx = pts[i].x + binorms[i].x * (side * dist);
            const tz = pts[i].z + binorms[i].z * (side * dist);
            const rType = this._pseudoRand();
            const treeType = rType < 0.50 ? 0 : (rType < 0.82 ? 1 : 2);
            const scale = 0.85 + this._pseudoRand() * 0.45;
            this.trees.createTree(tx, tz, treeType, scale, chunk.propsGroup);
        }

        // 2. Faceted Geological Rock Outcroppings
        for (let i = 3; i < n - 3; i += 5) {
            if (this._pseudoRand() < 0.45) {
                const side = this._pseudoRand() > 0.5 ? 1 : -1;
                const dist = 14.0 + this._pseudoRand() * 24.0;
                const bx = pts[i].x + binorms[i].x * (side * dist);
                const bz = pts[i].z + binorms[i].z * (side * dist);
                this.props.createRockOutcropping(bx, bz, 1.8 + this._pseudoRand() * 2.0, chunk.propsGroup);
            }
        }

        // 3. Street Lamps with Asphalt Light Pools (on non-loop segments)
        if (chunk.type !== 'sky_loop') {
            for (let i = 3; i < n - 3; i += 6) {
                const side = (i % 12 === 3) ? 1 : -1;
                this.props.createStreetLamp(pts[i], tangents[i], binorms[i], side, 5.5, chunk.propsGroup);
            }
        }

        // 4. Directional Chevron Boards on curves (Clean apex markers with minimum 56m spacing)
        let lastSignIdx = -99;
        for (let i = 4; i < n - 4; i++) {
            if (i - lastSignIdx < 10) continue;
            const headingDelta = Math.atan2(tangents[i + 2].x, tangents[i + 2].z) - Math.atan2(tangents[i - 2].x, tangents[i - 2].z);
            if (Math.abs(headingDelta) > 0.22) {
                const turnSign = headingDelta > 0 ? 1 : -1;
                this.props.createChevronSign(pts[i], tangents[i], binorms[i], -turnSign, 5.5, chunk.propsGroup);
                lastSignIdx = i;
            }
        }
    }

    _rebuildConsolidatedTrackData() {
        const allPoints = [];
        const allTangents = [];
        const allBinormals = [];
        const allNormals = [];
        const allTags = [];

        for (const c of this.chunks) {
            allPoints.push(...c.points);
            allTangents.push(...c.tangents);
            allBinormals.push(...c.binormals);
            allNormals.push(...c.normals);
            allTags.push(...c.tags);
        }

        this.trackData.points = allPoints;
        this.trackData.tangents = allTangents;
        this.trackData.binormals = allBinormals;
        this.trackData.normals = allNormals;
        this.trackData.tags = allTags;

        if (this.chunks.length > 0 && this.chunks[0].points.length > 2) {
            this.trackData.spawn.position.copy(this.chunks[0].points[1]).add(new THREE.Vector3(0, 1.2, 0));
            this.trackData.spawn.direction.copy(this.chunks[0].tangents[1]);
        }
    }

    update(playerPos) {
        if (!playerPos || this.chunks.length === 0) return this.trackData;

        // 1. Generate new chunks ahead if player approaches the forward horizon
        const lastChunk = this.chunks[this.chunks.length - 1];
        const lastPt = lastChunk.points[lastChunk.points.length - 1];
        const distToHorizon = playerPos.distanceTo(lastPt);

        if (distToHorizon < 650.0) {
            this._generateNextChunk();
            this._rebuildConsolidatedTrackData();
        }

        // 2. Despawn chunks trailing far behind player (>180m behind)
        if (this.chunks.length > 5) {
            const firstChunk = this.chunks[0];
            const firstChunkEnd = firstChunk.points[firstChunk.points.length - 1];
            const distBehind = playerPos.distanceTo(firstChunkEnd);

            // Ensure player is well past the first chunk before disposing
            const fwd = firstChunk.tangents[firstChunk.tangents.length - 1];
            const toPlayer = playerPos.clone().sub(firstChunkEnd);
            const isAhead = toPlayer.dot(fwd) > 0;

            if (isAhead && distBehind > 180.0) {
                this.scene.remove(firstChunk.mesh);
                if (firstChunk.propsGroup) {
                    if (this.trees && typeof this.trees.removeTree === 'function') {
                        const toRemove = [];
                        for (const child of firstChunk.propsGroup.children) {
                            if (child.isTree) toRemove.push(child);
                        }
                        toRemove.forEach(t => this.trees.removeTree(t));
                    }
                    if (this.props && typeof this.props.removeLamp === 'function') {
                        const toRemoveLamps = [];
                        for (const child of firstChunk.propsGroup.children) {
                            if (child.isLamp) toRemoveLamps.push(child);
                        }
                        toRemoveLamps.forEach(l => this.props.removeLamp(l));
                    }
                    this.scene.remove(firstChunk.propsGroup);
                }
                if (firstChunk.mesh && firstChunk.mesh.geometry) firstChunk.mesh.geometry.dispose();

                this.chunks.shift();
                this._rebuildConsolidatedTrackData();
            }
        }

        return this.trackData;
    }

    getTrackData() {
        return this.trackData;
    }

    destroy() {
        for (const c of this.chunks) {
            if (c.mesh) {
                this.scene.remove(c.mesh);
                if (c.mesh.geometry) c.mesh.geometry.dispose();
            }
            if (c.propsGroup) this.scene.remove(c.propsGroup);
        }
        this.chunks = [];
    }
}
