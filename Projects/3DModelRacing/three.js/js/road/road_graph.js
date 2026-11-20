/**
 * three.js/js/road/road_graph.js — Infinite Multi-Directional Macro-Cell Road Network
 *
 * Generates an endless 360-degree road graph of crossroads, T-junctions, roundabouts,
 * grade-separated overpasses, and smooth C2 rally/ramp edges arriving from any direction.
 * Provides an O(1) 32m spatial hash for elevation, surface normals, overhang detection,
 * and AI/player navigation.
 */
import * as THREE from 'three';
import { getTerrainHeight, getTerrainNormal } from '../terrain.js';

export const CELL_SIZE = 220.0;
export const ROAD_HALF_WIDTH = 6.2; // Full 12.4m width across all roads and tall ramps
const BUCKET_SIZE = 32.0;
const BUCKET_PAD = 14.0;

function hash2D(ix, iz, seed, salt = 0) {
    let h = Math.imul(ix + 374761393, 668265263) ^ Math.imul(iz + 1274126177, 2246822519) ^ Math.imul(seed + salt * 997, 3266489917);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smootherstep(t) {
    const c = Math.max(0.0, Math.min(1.0, t));
    return c * c * c * (c * (c * 6.0 - 15.0) + 10.0);
}

function sampleTerrainClear(x, z, headingRad) {
    const perpX = -Math.sin(headingRad);
    const perpZ = Math.cos(headingRad);
    const hC = getTerrainHeight(x, z);
    const hL = getTerrainHeight(x + perpX * 8.0, z + perpZ * 8.0);
    const hR = getTerrainHeight(x - perpX * 8.0, z - perpZ * 8.0);
    return Math.max(hC, hL, hR) + 1.15;
}

export class RoadGraph {
    constructor(seed = 1) {
        this.seed = seed | 0;
        this.nodes = new Map();       // "gx,gz" -> node
        this.edges = new Map();       // edgeId -> edge
        this.buckets = new Map();     // "bx,bz" -> { segments: [], nodes: [] }
        this.activeCellBounds = null;
        this.version = 0;

        // Track current player center cell
        this.centerGx = 0;
        this.centerGz = 0;

        this._tmpNorm = new THREE.Vector3();
        this.ensureNeighborhood(0, 0);
    }

    _nodeKey(gx, gz) {
        return `${gx},${gz}`;
    }

    _edgeKey(aKey, bKey) {
        return aKey < bKey ? `${aKey}__${bKey}` : `${bKey}__${aKey}`;
    }

    _getOrCreateNode(gx, gz) {
        const key = this._nodeKey(gx, gz);
        if (this.nodes.has(key)) return this.nodes.get(key);

        let x, z, type;
        if (gx === 0 && gz === 0) {
            x = 0; z = 0; type = 'crossroads';
        } else if (gx === 0 && gz === -1) {
            x = 0; z = -CELL_SIZE; type = 'crossroads';
        } else {
            const h1 = hash2D(gx, gz, this.seed, 1);
            const h2 = hash2D(gx, gz, this.seed, 2);
            const h3 = hash2D(gx, gz, this.seed, 3);
            x = gx * CELL_SIZE + (h1 - 0.5) * 66.0;
            z = gz * CELL_SIZE + (h2 - 0.5) * 66.0;

            if (h3 < 0.22) type = 'roundabout';
            else if (h3 < 0.37) type = 'overpass';
            else if (h3 < 0.72) type = 'crossroads';
            else type = 't_junction';
        }

        // Sample surrounding footprint so plaza sits cleanly above terrain
        let maxH = getTerrainHeight(x, z);
        for (let a = 0; a < 4; a++) {
            const ang = (a / 4) * Math.PI * 2;
            const h = getTerrainHeight(x + Math.cos(ang) * 14.0, z + Math.sin(ang) * 14.0);
            if (h > maxH) maxH = h;
        }
        const baseY = maxH + 1.25;
        const plazaRadius = type === 'roundabout' ? 22.0 : (type === 'overpass' ? 12.0 : 14.5);

        const node = {
            key,
            gx,
            gz,
            x,
            y: baseY,
            z,
            upperY: type === 'overpass' ? baseY + 11.5 : baseY,
            type,
            plazaRadius,
            islandRadius: type === 'roundabout' ? 9.5 : 0.0,
            edges: new Set(),
            meshGroup: null
        };
        this.nodes.set(key, node);
        return node;
    }

    _shouldConnect(gx, gz, dir) {
        // Keep spawn corridor straight & well-connected
        if (gx === 0 && gz === 0 && (dir === 'N' || dir === 'E' || dir === 'W' || dir === 'S')) return true;
        if (gx === 0 && gz === -1 && dir === 'N') return true;

        const nodeA = this._getOrCreateNode(gx, gz);
        if (dir === 'NE') {
            // Selective diagonal links where neither endpoint is an overpass (avoids messy diagonal X-crossings)
            const nodeB = this._getOrCreateNode(gx + 1, gz - 1);
            if (nodeA.type === 'overpass' || nodeB.type === 'overpass') return false;
            if ((gx === 0 && gz === 0) || (gx === -1 && gz === 0)) return false;
            return hash2D(gx, gz, this.seed, 11) < 0.32;
        }

        // T-junction drops one deterministic cardinal edge
        if (nodeA.type === 't_junction') {
            const drop = Math.floor(hash2D(gx, gz, this.seed, 7) * 4);
            if (drop === 0 && dir === 'E') return false;
            if (drop === 1 && dir === 'N') return false;
        }
        return true;
    }

    _createEdgeIfMissing(nodeA, nodeB) {
        const id = this._edgeKey(nodeA.key, nodeB.key);
        if (this.edges.has(id)) return this.edges.get(id);

        const dx = nodeB.x - nodeA.x;
        const dz = nodeB.z - nodeA.z;
        const dist = Math.hypot(dx, dz);
        const chordAngle = Math.atan2(dz, dx);
        const isNS = Math.abs(dz) >= Math.abs(dx);

        // Elevation at endpoints (upper deck if connecting NS into an overpass)
        const startY = (nodeA.type === 'overpass' && isNS) ? nodeA.upperY : nodeA.y;
        const endY   = (nodeB.type === 'overpass' && isNS) ? nodeB.upperY : nodeB.y;

        const isSpawnEdge = (nodeA.gx === 0 && nodeA.gz === 0 && nodeB.gx === 0 && nodeB.gz === -1);
        const edgeHash = hash2D(nodeA.gx + nodeB.gx * 3, nodeA.gz + nodeB.gz * 5, this.seed, 23);
        const edgeHash2 = hash2D(nodeA.gx * 7, nodeB.gz * 11, this.seed, 31);

        let profile = 'meadow_rally';
        if (isSpawnEdge) {
            profile = 'meadow_rally';
        } else if (nodeA.type === 'overpass' || nodeB.type === 'overpass') {
            profile = 'overpass_link';
        } else if (edgeHash < 0.24) {
            profile = 'smooth_hill_ramp';
        } else if (edgeHash < 0.44) {
            profile = 'mountain_chicane';
        } else if (edgeHash < 0.62) {
            profile = 'banked_sweep';
        } else if (edgeHash < 0.78) {
            profile = 'elevated_causeway';
        } else {
            profile = 'boost_straight';
        }

        // Lateral curve amplitude (0 on spawn edge & overpass links so headings align cleanly)
        const perpX = -Math.sin(chordAngle);
        const perpZ = Math.cos(chordAngle);
        let latAmp = 0.0;
        let latMode = 0; // 0 = single arc, 1 = S-chicane
        if (!isSpawnEdge && profile !== 'overpass_link' && profile !== 'boost_straight') {
            latAmp = (edgeHash2 > 0.5 ? 1 : -1) * (12.0 + edgeHash * 16.0);
            latMode = profile === 'mountain_chicane' ? 1 : 0;
        }

        const segCount = Math.max(32, Math.round(dist / 4.8));
        const points = [];
        const tags = [];
        const banks = [];

        for (let i = 0; i <= segCount; i++) {
            const u = i / segCount;
            // Smooth C2 envelope anchored to 0 at both junction endpoints (within plaza fade)
            const s = smootherstep(u);
            const env = Math.sin(u * Math.PI);
            const env2 = env * env; // zero derivative at u=0 and u=1

            let lat = 0.0;
            if (latMode === 1) {
                lat = Math.sin(u * Math.PI * 2.0) * env * latAmp * 0.85;
            } else {
                lat = env2 * latAmp;
            }

            const px = nodeA.x + dx * u + perpX * lat;
            const pz = nodeA.z + dz * u + perpZ * lat;

            const groundClearY = sampleTerrainClear(px, pz, chordAngle);
            const endBlendY = THREE.MathUtils.lerp(startY, endY, s);

            // Distance from either junction plaza: keeps road strictly flush inside junction aprons
            const distA = Math.hypot(px - nodeA.x, pz - nodeA.z);
            const distB = Math.hypot(px - nodeB.x, pz - nodeB.z);
            const jBlendA = smootherstep((distA - nodeA.plazaRadius * 0.7) / 26.0);
            const jBlendB = smootherstep((distB - nodeB.plazaRadius * 0.7) / 26.0);
            const jWeight = jBlendA * jBlendB;

            let py = endBlendY;
            let tag = 0;
            let bank = 0;

            if (profile === 'overpass_link') {
                const hillFollow = Math.max(groundClearY, endBlendY);
                py = THREE.MathUtils.lerp(endBlendY, hillFollow, jWeight * 0.55);
            } else if (profile === 'smooth_hill_ramp') {
                // Smooth C2 roller-coaster crest +24m above terrain
                const crestBump = Math.pow(Math.sin(u * Math.PI), 2.0) * 24.0;
                const baseFollow = Math.max(groundClearY, endBlendY);
                py = THREE.MathUtils.lerp(endBlendY, baseFollow + crestBump, jWeight);
                if (u > 0.28 && u < 0.72) tag |= 1; // Boost strip over climb & crest
            } else if (profile === 'elevated_causeway') {
                const causewayH = Math.max(groundClearY, endBlendY) + 12.5 * env2;
                py = THREE.MathUtils.lerp(endBlendY, causewayH, jWeight);
            } else if (profile === 'boost_straight') {
                py = THREE.MathUtils.lerp(endBlendY, groundClearY, jWeight);
                if (u > 0.25 && u < 0.75) tag |= 1;
            } else if (profile === 'banked_sweep') {
                py = THREE.MathUtils.lerp(endBlendY, groundClearY, jWeight);
                bank = (latAmp >= 0 ? -1 : 1) * 0.26 * env2;
            } else {
                // meadow_rally / mountain_chicane
                py = THREE.MathUtils.lerp(endBlendY, groundClearY, jWeight);
            }

            // Never clip below local terrain unless cleanly blended at junction apron
            py = Math.max(py, groundClearY - 0.1);

            points.push(new THREE.Vector3(px, py, pz));
            tags.push(tag);
            banks.push(bank);
        }

        // Compute smooth 3D tangents, normals & binormals (C1 continuous)
        const n = points.length;
        const tangents = [];
        const binormals = [];
        const normals = [];
        const worldUp = new THREE.Vector3(0, 1, 0);

        for (let i = 0; i < n; i++) {
            const pPrev = points[Math.max(0, i - 1)];
            const pNext = points[Math.min(n - 1, i + 1)];
            const fwd = new THREE.Vector3().subVectors(pNext, pPrev).normalize();

            const right = new THREE.Vector3().crossVectors(fwd, worldUp).normalize();
            const up = new THREE.Vector3().crossVectors(right, fwd).normalize();

            if (Math.abs(banks[i]) > 0.001) {
                const q = new THREE.Quaternion().setFromAxisAngle(fwd, banks[i]);
                right.applyQuaternion(q).normalize();
                up.applyQuaternion(q).normalize();
            }

            tangents.push(fwd);
            binormals.push(right);
            normals.push(up);
        }

        const edge = {
            id,
            nodeAKey: nodeA.key,
            nodeBKey: nodeB.key,
            profile,
            points,
            tangents,
            binormals,
            normals,
            tags,
            halfWidth: ROAD_HALF_WIDTH,
            meshGroup: null,
            sceneryHandles: []
        };

        this.edges.set(id, edge);
        nodeA.edges.add(id);
        nodeB.edges.add(id);
        return edge;
    }

    ensureNeighborhood(cxGx, cxGz, radius = 2) {
        let changed = false;

        // 1. Create nodes and edges inside active Chebyshev window
        for (let gz = cxGz - radius; gz <= cxGz + radius; gz++) {
            for (let gx = cxGx - radius; gx <= cxGx + radius; gx++) {
                const node = this._getOrCreateNode(gx, gz);
                // Connect North (gx, gz-1)
                if (gz > cxGz - radius && this._shouldConnect(gx, gz, 'N')) {
                    const north = this._getOrCreateNode(gx, gz - 1);
                    if (!this.edges.has(this._edgeKey(node.key, north.key))) {
                        this._createEdgeIfMissing(node, north);
                        changed = true;
                    }
                }
                // Connect East (gx+1, gz)
                if (gx < cxGx + radius && this._shouldConnect(gx, gz, 'E')) {
                    const east = this._getOrCreateNode(gx + 1, gz);
                    if (!this.edges.has(this._edgeKey(node.key, east.key))) {
                        this._createEdgeIfMissing(node, east);
                        changed = true;
                    }
                }
                // Connect NE diagonal (gx+1, gz-1)
                if (gx < cxGx + radius && gz > cxGz - radius && this._shouldConnect(gx, gz, 'NE')) {
                    const ne = this._getOrCreateNode(gx + 1, gz - 1);
                    if (!this.edges.has(this._edgeKey(node.key, ne.key))) {
                        this._createEdgeIfMissing(node, ne);
                        changed = true;
                    }
                }
            }
        }

        if (changed) {
            this._rebuildSpatialHash();
            this.version++;
        }
        return changed;
    }

    retireDistant(cxGx, cxGz, retireRadius = 3, onRetireEdge = null, onRetireNode = null) {
        let changed = false;

        for (const [id, edge] of this.edges) {
            const nA = this.nodes.get(edge.nodeAKey);
            const nB = this.nodes.get(edge.nodeBKey);
            if (!nA || !nB) continue;
            const dA = Math.max(Math.abs(nA.gx - cxGx), Math.abs(nA.gz - cxGz));
            const dB = Math.max(Math.abs(nB.gx - cxGx), Math.abs(nB.gz - cxGz));
            if (dA > retireRadius || dB > retireRadius) {
                if (onRetireEdge) onRetireEdge(edge);
                nA.edges.delete(id);
                nB.edges.delete(id);
                this.edges.delete(id);
                changed = true;
            }
        }

        for (const [key, node] of this.nodes) {
            const d = Math.max(Math.abs(node.gx - cxGx), Math.abs(node.gz - cxGz));
            if (d > retireRadius && node.edges.size === 0) {
                if (onRetireNode) onRetireNode(node);
                this.nodes.delete(key);
                changed = true;
            }
        }

        if (changed) {
            this._rebuildSpatialHash();
            this.version++;
        }
        return changed;
    }

    _bucketKey(bx, bz) {
        return `${bx},${bz}`;
    }

    _insertIntoBuckets(minX, maxX, minZ, maxZ, kind, payload) {
        const bx0 = Math.floor((minX - BUCKET_PAD) / BUCKET_SIZE);
        const bx1 = Math.floor((maxX + BUCKET_PAD) / BUCKET_SIZE);
        const bz0 = Math.floor((minZ - BUCKET_PAD) / BUCKET_SIZE);
        const bz1 = Math.floor((maxZ + BUCKET_PAD) / BUCKET_SIZE);

        for (let bz = bz0; bz <= bz1; bz++) {
            for (let bx = bx0; bx <= bx1; bx++) {
                const k = this._bucketKey(bx, bz);
                let bucket = this.buckets.get(k);
                if (!bucket) {
                    bucket = { segments: [], nodes: [] };
                    this.buckets.set(k, bucket);
                }
                if (kind === 'seg') bucket.segments.push(payload);
                else bucket.nodes.push(payload);
            }
        }
    }

    _rebuildSpatialHash() {
        this.buckets.clear();

        for (const node of this.nodes.values()) {
            const r = node.plazaRadius;
            this._insertIntoBuckets(node.x - r, node.x + r, node.z - r, node.z + r, 'node', node);
        }

        for (const edge of this.edges.values()) {
            const pts = edge.points;
            for (let i = 0; i < pts.length - 1; i++) {
                const a = pts[i];
                const b = pts[i + 1];
                this._insertIntoBuckets(
                    Math.min(a.x, b.x), Math.max(a.x, b.x),
                    Math.min(a.z, b.z), Math.max(a.z, b.z),
                    'seg',
                    { edge, segIdx: i }
                );
            }
        }
    }

    /**
     * O(1) surface query at (x, z) using refY for overpass/underpass disambiguation.
     */
    sampleSurface(x, z, refY = null, out = {}) {
        const naturalTerrainY = getTerrainHeight(x, z);
        const bx = Math.floor(x / BUCKET_SIZE);
        const bz = Math.floor(z / BUCKET_SIZE);
        const bucket = this.buckets.get(this._bucketKey(bx, bz));

        let bestScore = Infinity;
        let best = null;
        let overheadY = Infinity;
        let isOverhead = false;

        if (bucket) {
            // 1. Check edge segments in O(1) local bucket
            for (let i = 0; i < bucket.segments.length; i++) {
                const { edge, segIdx } = bucket.segments[i];
                const pA = edge.points[segIdx];
                const pB = edge.points[segIdx + 1];
                const abX = pB.x - pA.x;
                const abZ = pB.z - pA.z;
                const lenSq = abX * abX + abZ * abZ;
                let t = 0;
                if (lenSq > 0.0001) {
                    t = Math.max(0, Math.min(1, ((x - pA.x) * abX + (z - pA.z) * abZ) / lenSq));
                }

                const cx = pA.x + abX * t;
                const cz = pA.z + abZ * t;
                const cy = pA.y + (pB.y - pA.y) * t;
                const dx = x - cx;
                const dz = z - cz;
                const distXZ = Math.hypot(dx, dz);

                if (distXZ > edge.halfWidth + 6.5) continue;

                // Overpass / Elevated deck disambiguation using reference Y
                if (refY !== null && cy > refY + 2.8 && cy > naturalTerrainY + 2.8) {
                    if (distXZ <= edge.halfWidth + 0.8 && cy < overheadY) {
                        overheadY = cy;
                        isOverhead = true;
                    }
                    continue;
                }

                // Prefer closest deck in XZ (with mild vertical affinity to current refY)
                const vPen = refY !== null ? Math.abs(cy - refY) * 0.25 : 0;
                const score = distXZ + vPen;
                if (score < bestScore) {
                    bestScore = score;
                    const rightA = edge.binormals[segIdx];
                    const rightB = edge.binormals[segIdx + 1];
                    const rx = rightA.x + (rightB.x - rightA.x) * t;
                    const ry = rightA.y + (rightB.y - rightA.y) * t;
                    const rz = rightA.z + (rightB.z - rightA.z) * t;
                    const rLen = Math.hypot(rx, ry, rz) || 1;
                    const signedLat = (dx * rx + dz * rz) / rLen;

                    const fwdA = edge.tangents[segIdx];
                    const fwdB = edge.tangents[segIdx + 1];
                    const normA = edge.normals[segIdx];
                    const normB = edge.normals[segIdx + 1];

                    best = {
                        kind: 'edge',
                        edge,
                        segIdx,
                        t,
                        roadY: cy,
                        distXZ,
                        signedLat,
                        halfWidth: edge.halfWidth,
                        tag: edge.tags[segIdx],
                        fwdX: fwdA.x + (fwdB.x - fwdA.x) * t,
                        fwdY: fwdA.y + (fwdB.y - fwdA.y) * t,
                        fwdZ: fwdA.z + (fwdB.z - fwdA.z) * t,
                        rightX: rx / rLen,
                        rightY: ry / rLen,
                        rightZ: rz / rLen,
                        normX: normA.x + (normB.x - normA.x) * t,
                        normY: normA.y + (normB.y - normA.y) * t,
                        normZ: normA.z + (normB.z - normA.z) * t
                    };
                }
            }

            // 2. Check junction plazas (smooth transition across multi-way intersections & roundabouts)
            for (let i = 0; i < bucket.nodes.length; i++) {
                const node = bucket.nodes[i];
                if (refY !== null && node.y > refY + 2.8) continue;
                if (best && Math.abs(best.roadY - node.y) > 3.5 &&
                    (refY === null || Math.abs(best.roadY - refY) < Math.abs(node.y - refY))) {
                    continue;
                }
                const dx = x - node.x;
                const dz = z - node.z;
                const distXZ = Math.hypot(dx, dz);
                if (distXZ <= node.plazaRadius + 1.5) {
                    if (node.type === 'roundabout' && distXZ < node.islandRadius - 0.5) {
                        // Raised center island
                        out.y = node.y + 0.55;
                        out.isOffroad = true;
                        out.isElevated = false;
                        out.isOverhead = isOverhead;
                        out.overheadY = overheadY;
                        out.lateralDist = 0;
                        out.halfWidth = ROAD_HALF_WIDTH;
                        out.tag = 0;
                        out.normal = this._tmpNorm.set(0, 1, 0).clone();
                        out.fwd = new THREE.Vector3(0, 0, -1);
                        out.right = new THREE.Vector3(1, 0, 0);
                        out.trackPt = new THREE.Vector3(x, out.y, z);
                        out.inJunction = true;
                        return out;
                    }
                    // Plaza apron dominates when inside junction radius and close to edge height
                    const onRoadEdge = best && best.distXZ <= best.halfWidth;
                    if (!onRoadEdge || distXZ <= node.plazaRadius * 0.85) {
                        out.y = node.y;
                        out.isOffroad = false;
                        out.isElevated = (node.y - naturalTerrainY) > 3.5;
                        out.isOverhead = isOverhead;
                        out.overheadY = overheadY;
                        out.lateralDist = 0;
                        out.halfWidth = node.plazaRadius;
                        out.tag = 0;
                        out.normal = new THREE.Vector3(0, 1, 0);
                        out.fwd = best ? new THREE.Vector3(best.fwdX, best.fwdY, best.fwdZ).normalize() : new THREE.Vector3(0, 0, -1);
                        out.right = best ? new THREE.Vector3(best.rightX, best.rightY, best.rightZ).normalize() : new THREE.Vector3(1, 0, 0);
                        out.trackPt = new THREE.Vector3(x, node.y, z);
                        out.inJunction = true;
                        return out;
                    }
                }
            }
        }

        if (best) {
            const clearance = best.roadY - naturalTerrainY;
            const isElevated = clearance > 3.5;

            if (best.distXZ <= best.halfWidth) {
                const fwd = new THREE.Vector3(best.fwdX, best.fwdY, best.fwdZ).normalize();
                const right = new THREE.Vector3(best.rightX, best.rightY, best.rightZ).normalize();
                const norm = new THREE.Vector3(best.normX, best.normY, best.normZ).normalize();
                if (norm.y < 0) norm.negate();

                out.y = best.roadY;
                out.isOffroad = false;
                out.isElevated = isElevated;
                out.isOverhead = isOverhead;
                out.overheadY = overheadY;
                out.lateralDist = best.signedLat;
                out.halfWidth = best.halfWidth;
                out.tag = best.tag;
                out.normal = norm;
                out.fwd = fwd;
                out.right = right;
                out.trackPt = new THREE.Vector3(x - best.rightX * best.signedLat, best.roadY, z - best.rightZ * best.signedLat);
                out.edgeId = best.edge.id;
                out.segIdx = best.segIdx;
                return out;
            }

            // Smooth ground-level shoulder blend
            if (!isElevated && best.distXZ <= best.halfWidth + 5.8) {
                const shT = 1.0 - (best.distXZ - best.halfWidth) / 5.8;
                const sm = shT * shT * (3.0 - 2.0 * shT);
                const tNorm = getTerrainNormal(x, z, 1.0, new THREE.Vector3());
                const rNorm = new THREE.Vector3(best.normX, best.normY, best.normZ).normalize();

                out.y = THREE.MathUtils.lerp(naturalTerrainY, best.roadY, sm);
                out.isOffroad = true;
                out.isElevated = false;
                out.isOverhead = isOverhead;
                out.overheadY = overheadY;
                out.lateralDist = best.signedLat;
                out.halfWidth = best.halfWidth;
                out.tag = 0;
                out.normal = tNorm.lerp(rNorm, sm).normalize();
                out.fwd = new THREE.Vector3(best.fwdX, best.fwdY, best.fwdZ).normalize();
                out.right = new THREE.Vector3(best.rightX, best.rightY, best.rightZ).normalize();
                out.trackPt = new THREE.Vector3(x - best.rightX * best.signedLat, best.roadY, z - best.rightZ * best.signedLat);
                return out;
            }
        }

        // Open rolling off-road terrain
        out.y = naturalTerrainY;
        out.isOffroad = true;
        out.isElevated = false;
        out.isOverhead = isOverhead;
        out.overheadY = overheadY;
        out.lateralDist = 0;
        out.halfWidth = ROAD_HALF_WIDTH;
        out.tag = 0;
        out.normal = getTerrainNormal(x, z, 1.0, new THREE.Vector3());
        out.fwd = new THREE.Vector3(0, 0, -1);
        out.right = new THREE.Vector3(1, 0, 0);
        out.trackPt = new THREE.Vector3(x, naturalTerrainY, z);
        return out;
    }

    getEdgeBetween(aKey, bKey) {
        return this.edges.get(this._edgeKey(aKey, bKey)) || null;
    }

    getOutgoingEdges(nodeKey, excludeEdgeId = null) {
        const node = this.nodes.get(nodeKey);
        if (!node) return [];
        const list = [];
        for (const eid of node.edges) {
            if (eid === excludeEdgeId && node.edges.size > 1) continue;
            const e = this.edges.get(eid);
            if (e) list.push(e);
        }
        return list;
    }

    getSpawnPoint() {
        const spawnEdge = this.edges.get(this._edgeKey('0,0', '0,-1'));
        if (spawnEdge && spawnEdge.points.length > 4) {
            const p = spawnEdge.points[4].clone();
            p.y += 1.0;
            return {
                position: p,
                direction: spawnEdge.tangents[4].clone()
            };
        }
        return {
            position: new THREE.Vector3(0, getTerrainHeight(0, 0) + 2.2, -16),
            direction: new THREE.Vector3(0, 0, -1)
        };
    }

    getAllActivePointsSampled(step = 2) {
        const pts = [];
        for (const edge of this.edges.values()) {
            for (let i = 0; i < edge.points.length; i += step) {
                pts.push(edge.points[i]);
            }
        }
        return pts;
    }
}
