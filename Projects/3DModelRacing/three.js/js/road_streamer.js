/**
 * three.js/js/road_streamer.js — Multi-Directional Road Network & Batched Scenery Coordinator
 *
 * Coordinates RoadGraph (infinite 360-degree road network), RoadMeshBuilder (watertight
 * solid roads, box-girder ramps/bridges, plazas), RoadMaskGenerator (O(1) grass road mask),
 * and scenery placement into batched InstancedPropPools (trees, bushes, flowers, rocks,
 * street lamps, chevron signs) with cross-road clearance verification.
 */
import * as THREE from 'three';
import { CELL_SIZE, RoadGraph } from './road/road_graph.js';
import { RoadMeshBuilder } from './road/road_mesh.js';
import { RoadMaskGenerator } from './road/road_mask.js';

export class RoadStreamer {
    constructor(scene, mode = 'driving', seed = 1) {
        this.scene = scene;
        this.mode = mode;
        this.seed = seed | 0;

        this.graph = new RoadGraph(this.seed);
        this.meshBuilder = new RoadMeshBuilder();
        this.roadMask = new RoadMaskGenerator(440.0, 256);

        // Expose roadMat compatibility for visual mode tinting
        this.roadMat = this.meshBuilder.roadMat;

        this.trees = null;
        this.props = null;
        this.grass = null;
        this.rivalsManager = null;
        this.player = null;

        this._rngState = (this.seed * 1664525 + 1013904223) >>> 0;
        this._sampleTmp = {};

        // Consolidated trackData surface for compatibility with WorldView, HUD, Vehicle & Rivals
        this.trackData = {
            graph: this.graph,
            points: [],
            tangents: [],
            binormals: [],
            normals: [],
            tags: [],
            spawn: this.graph.getSpawnPoint(),
            sampleSurface: (x, z, refY, out) => this.graph.sampleSurface(x, z, refY, out)
        };

        this._syncMeshes(true);
        this._refreshTrackDataSummary();
    }

    _pseudoRand() {
        this._rngState = (Math.imul(this._rngState, 1664525) + 1013904223) >>> 0;
        return this._rngState / 4294967296;
    }

    setSceneryManagers(trees, props, grass = null) {
        this.trees = trees;
        this.props = props;
        if (grass) this.setGrassField(grass);

        // Populate scenery for any active edges/nodes not yet populated
        for (const node of this.graph.nodes.values()) {
            if (!node.sceneryPopulated) {
                this._populateNodeScenery(node, true);
            }
        }
        for (const edge of this.graph.edges.values()) {
            if (!edge.sceneryPopulated) {
                this._populateEdgeScenery(edge, true);
            }
        }
    }

    setGrassField(grass) {
        this.grass = grass;
        if (this.grass) {
            const centerPos = this.player?.position || this.trackData?.spawn?.position || { x: 0, y: 0, z: 0 };
            this.roadMask.update(centerPos, this.graph);
            this.grass.setRoadMask(
                this.roadMask.texture,
                this.roadMask.centerX,
                this.roadMask.centerZ,
                this.roadMask.sizeMeters,
                true
            );
        }
    }

    setRivalsManager(rivalsManager) {
        this.rivalsManager = rivalsManager;
    }

    setPlayer(player) {
        this.player = player;
    }

    setVisualMode(mode) {
        this.meshBuilder.setVisualMode(mode);
    }

    _syncMeshes(immediate = false) {
        for (const node of this.graph.nodes.values()) {
            if (!node.meshGroup) {
                node.meshGroup = this.meshBuilder.buildNodeMesh(node);
                this.scene.add(node.meshGroup);
            }
            if (!node.sceneryPopulated && this.trees && this.props) {
                this._populateNodeScenery(node, immediate);
            }
        }
        for (const edge of this.graph.edges.values()) {
            if (!edge.meshGroup) {
                edge.meshGroup = this.meshBuilder.buildEdgeMesh(edge);
                this.scene.add(edge.meshGroup);
            }
            if (!edge.sceneryPopulated && this.trees && this.props) {
                this._populateEdgeScenery(edge, immediate);
            }
        }
    }

    _isClearOfAllRoads(x, z, minClearance = 8.2) {
        const res = this.graph.sampleSurface(x, z, null, this._sampleTmp);
        if (!res.isOffroad) return false;
        // Also verify sampleSurface trackPt distance if near shoulder
        if (res.trackPt && Math.hypot(x - res.trackPt.x, z - res.trackPt.z) < minClearance) {
            return false;
        }
        return true;
    }

    _populateNodeScenery(node, immediate = false) {
        node.sceneryPopulated = true;
        node.sceneryHandles = node.sceneryHandles || [];
        if (!this.trees || !this.props) return;

        // Roundabout center island botanical centerpiece
        if (node.type === 'roundabout') {
            const centerTree = this.trees.createTree(node.x, node.z, 1, 1.05, null, immediate);
            if (centerTree) node.sceneryHandles.push(centerTree);
            for (let a = 0; a < 5; a++) {
                const ang = (a / 5) * Math.PI * 2;
                const fx = node.x + Math.cos(ang) * 4.5;
                const fz = node.z + Math.sin(ang) * 4.5;
                const fl = this.trees.createFlowers(fx, fz, 1.1, null, immediate);
                if (fl) node.sceneryHandles.push(fl);
            }
        }
    }

    _populateEdgeScenery(edge, immediate = false) {
        edge.sceneryPopulated = true;
        edge.sceneryHandles = edge.sceneryHandles || [];
        if (!this.trees || !this.props) return;

        const pts = edge.points;
        const binorms = edge.binormals;
        const tangents = edge.tangents;
        const n = pts.length;
        if (n < 6) return;

        // Skip endpoints inside junction plazas
        const startIdx = 4;
        const endIdx = n - 4;

        // 1. Roadside Verge: Bushes & Wildflower Patches (9m - 17m from road center)
        for (let i = startIdx; i < endIdx; i += 3) {
            const side = (i % 6 === startIdx % 6) ? 1 : -1;
            const dist = 9.0 + this._pseudoRand() * 8.0;
            const vx = pts[i].x + binorms[i].x * (side * dist);
            const vz = pts[i].z + binorms[i].z * (side * dist);
            if (!this._isClearOfAllRoads(vx, vz, 8.2)) continue;

            const rV = this._pseudoRand();
            let h = null;
            if (rV < 0.40) h = this.trees.createFlowers(vx, vz, 0.85 + this._pseudoRand() * 0.4, null, immediate);
            else if (rV < 0.75) h = this.trees.createFloweringBush(vx, vz, 0.9 + this._pseudoRand() * 0.45, null, immediate);
            else h = this.trees.createBush(vx, vz, 0.95 + this._pseudoRand() * 0.5, null, immediate);
            if (h) edge.sceneryHandles.push(h);
        }

        // 2. Near Roadside Trees & Granite Rocks (16m - 38m)
        for (let i = startIdx; i < endIdx; i += 5) {
            const side = this._pseudoRand() > 0.5 ? 1 : -1;
            const dist = 16.0 + this._pseudoRand() * 22.0;
            const tx = pts[i].x + binorms[i].x * (side * dist);
            const tz = pts[i].z + binorms[i].z * (side * dist);
            if (!this._isClearOfAllRoads(tx, tz, 9.5)) continue;

            const rType = this._pseudoRand();
            const treeType = rType < 0.48 ? 0 : (rType < 0.82 ? 1 : 2);
            const scale = 0.85 + this._pseudoRand() * 0.45;
            const th = this.trees.createTree(tx, tz, treeType, scale, null, immediate);
            if (th) edge.sceneryHandles.push(th);

            if (this._pseudoRand() < 0.40) {
                const rx = tx + (this._pseudoRand() - 0.5) * 11.0;
                const rz = tz + (this._pseudoRand() - 0.5) * 11.0;
                if (this._isClearOfAllRoads(rx, rz, 8.8)) {
                    const rh = this.props.createRockOutcropping(rx, rz, 1.5 + this._pseudoRand() * 1.7, null, immediate);
                    if (rh) edge.sceneryHandles.push(rh);
                }
            }
        }

        // 3. Meadow Groves across fields (38m - 105m off-road)
        for (let i = startIdx + 2; i < endIdx; i += 9) {
            for (const side of [-1, 1]) {
                if (this._pseudoRand() < 0.65) {
                    const dist = 38.0 + this._pseudoRand() * 68.0;
                    const gx = pts[i].x + binorms[i].x * (side * dist);
                    const gz = pts[i].z + binorms[i].z * (side * dist);
                    const groveCount = 1 + Math.floor(this._pseudoRand() * 2);
                    for (let g = 0; g < groveCount; g++) {
                        const ox = gx + (this._pseudoRand() - 0.5) * 15.0;
                        const oz = gz + (this._pseudoRand() - 0.5) * 15.0;
                        if (!this._isClearOfAllRoads(ox, oz, 10.5)) continue;
                        const tType = this._pseudoRand() < 0.6 ? 0 : (this._pseudoRand() < 0.85 ? 1 : 2);
                        const gh = this.trees.createTree(ox, oz, tType, 0.9 + this._pseudoRand() * 0.45, null, immediate);
                        if (gh) edge.sceneryHandles.push(gh);
                    }
                }
            }
        }

        // 4. Street Lamps along edge curbs (skip junctions)
        for (let i = startIdx + 2; i < endIdx - 1; i += 7) {
            const side = (i % 14 < 7) ? 1 : -1;
            const lh = this.props.createStreetLamp(pts[i], tangents[i], binorms[i], side, edge.halfWidth, null, immediate);
            if (lh) edge.sceneryHandles.push(lh);
        }

        // 5. Directional Chevron Boards on curved sections
        let lastSignIdx = -99;
        for (let i = startIdx + 2; i < endIdx - 2; i++) {
            if (i - lastSignIdx < 12) continue;
            const headingDelta = Math.atan2(tangents[i + 2].x, tangents[i + 2].z) - Math.atan2(tangents[i - 2].x, tangents[i - 2].z);
            if (Math.abs(headingDelta) > 0.22) {
                const turnSign = headingDelta > 0 ? 1 : -1;
                const sh = this.props.createChevronSign(pts[i], tangents[i], binorms[i], -turnSign, edge.halfWidth, null, immediate);
                if (sh) edge.sceneryHandles.push(sh);
                lastSignIdx = i;
            }
        }
    }

    _retireSceneryHandles(handles) {
        if (!handles) return;
        for (let i = 0; i < handles.length; i++) {
            const h = handles[i];
            if (!h) continue;
            if (h.isTree && this.trees) this.trees.removeTree(h);
            else if (h.isLamp && this.props) this.props.removeLamp(h);
            else if (h.isSign && this.props) this.props.removeSign(h);
            else if (h.isRock && this.props) this.props.removeRock(h);
        }
        handles.length = 0;
    }

    _refreshTrackDataSummary() {
        const spawnEdge = this.graph.edges.get('0,-1__0,0');
        if (spawnEdge) {
            this.trackData.points = spawnEdge.points;
            this.trackData.tangents = spawnEdge.tangents;
            this.trackData.binormals = spawnEdge.binormals;
            this.trackData.normals = spawnEdge.normals;
            this.trackData.tags = spawnEdge.tags;
        } else {
            const first = this.graph.edges.values().next().value;
            if (first) {
                this.trackData.points = first.points;
                this.trackData.tangents = first.tangents;
                this.trackData.binormals = first.binormals;
                this.trackData.normals = first.normals;
                this.trackData.tags = first.tags;
            }
        }
    }

    update(playerPos, _delta = 0.016) {
        if (!playerPos) return this.trackData;

        const gx = Math.round(playerPos.x / CELL_SIZE);
        const gz = Math.round(playerPos.z / CELL_SIZE);

        if (gx !== this.graph.centerGx || gz !== this.graph.centerGz) {
            this.graph.centerGx = gx;
            this.graph.centerGz = gz;

            const added = this.graph.ensureNeighborhood(gx, gz, 2);
            const retired = this.graph.retireDistant(
                gx,
                gz,
                3,
                (edge) => {
                    if (edge.meshGroup) {
                        this.scene.remove(edge.meshGroup);
                        this.meshBuilder.disposeMeshGroup(edge.meshGroup);
                        edge.meshGroup = null;
                    }
                    this._retireSceneryHandles(edge.sceneryHandles);
                },
                (node) => {
                    if (node.meshGroup) {
                        this.scene.remove(node.meshGroup);
                        this.meshBuilder.disposeMeshGroup(node.meshGroup);
                        node.meshGroup = null;
                    }
                    this._retireSceneryHandles(node.sceneryHandles);
                }
            );

            if (added) {
                this._syncMeshes(false);
            }
            if (added || retired) {
                this._refreshTrackDataSummary();
            }
        }

        // Update O(1) GPU road mask texture for grass clearance & under-bridge shade
        if (this.grass) {
            const updated = this.roadMask.update(playerPos, this.graph);
            if (updated) {
                this.grass.setRoadMask(
                    this.roadMask.texture,
                    this.roadMask.centerX,
                    this.roadMask.centerZ,
                    this.roadMask.sizeMeters,
                    true
                );
            }
        }

        return this.trackData;
    }

    getTrackData() {
        return this.trackData;
    }

    destroy() {
        for (const edge of this.graph.edges.values()) {
            if (edge.meshGroup) {
                this.scene.remove(edge.meshGroup);
                this.meshBuilder.disposeMeshGroup(edge.meshGroup);
            }
            this._retireSceneryHandles(edge.sceneryHandles);
        }
        for (const node of this.graph.nodes.values()) {
            if (node.meshGroup) {
                this.scene.remove(node.meshGroup);
                this.meshBuilder.disposeMeshGroup(node.meshGroup);
            }
            this._retireSceneryHandles(node.sceneryHandles);
        }
        this.roadMask.destroy();
    }
}
