/**
 * three.js/js/road/road_mask.js — O(1) GPU Texture Road Mask Generator
 *
 * Renders active multi-directional roads & junctions around the player onto an
 * offscreen 256x256 RGBA canvas (covering 440m x 440m):
 *   R channel = Ground-level road clearance (suppresses blades on road, feathers verges)
 *   G channel = Elevated bridge/overpass shadow zone (preserves shaded grass UNDER roads!)
 */
import * as THREE from 'three';
import { getTerrainHeight } from '../terrain.js';

export class RoadMaskGenerator {
    constructor(sizeMeters = 440.0, resolution = 256) {
        this.sizeMeters = sizeMeters;
        this.resolution = resolution;

        this.canvas = document.createElement('canvas');
        this.canvas.width = resolution;
        this.canvas.height = resolution;
        this.ctx = this.canvas.getContext('2d');

        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.magFilter = THREE.LinearFilter;
        this.texture.wrapS = THREE.ClampToEdgeWrapping;
        this.texture.wrapT = THREE.ClampToEdgeWrapping;
        this.texture.flipY = false; // Crucial: canvas top (py=0) maps cleanly to UV.y = 0!

        this.centerX = 0;
        this.centerZ = 0;
        this.lastVersion = -1;
        this.hasGenerated = false;
        this._gCoords = [];
        this._eCoords = [];
    }

    update(playerPos, roadGraph) {
        if (!playerPos || !roadGraph) return false;

        const dx = playerPos.x - this.centerX;
        const dz = playerPos.z - this.centerZ;
        const movedFar = (dx * dx + dz * dz) > 144.0; // > 12m displacement

        if (this.hasGenerated && !movedFar && this.lastVersion === roadGraph.version) {
            return false;
        }

        this.centerX = playerPos.x;
        this.centerZ = playerPos.z;
        this.lastVersion = roadGraph.version;
        this.hasGenerated = true;

        const ctx = this.ctx;
        const res = this.resolution;
        const halfSize = this.sizeMeters * 0.5;
        const pxPerMeter = res / this.sizeMeters;

        const originX = this.centerX - halfSize;
        const originZ = this.centerZ - halfSize;
        const minX = this.centerX - halfSize - 30;
        const maxX = this.centerX + halfSize + 30;
        const minZ = this.centerZ - halfSize - 30;
        const maxZ = this.centerZ + halfSize + 30;

        // Partition visible road segments once into ground vs elevated lists
        const gCoords = this._gCoords;
        const eCoords = this._eCoords;
        gCoords.length = 0;
        eCoords.length = 0;
        let sampleHalfW = 6.2;

        for (const edge of roadGraph.edges.values()) {
            sampleHalfW = edge.halfWidth || sampleHalfW;
            const pts = edge.points;
            for (let i = 0; i < pts.length - 1; i++) {
                const a = pts[i];
                const b = pts[i + 1];
                if (Math.max(a.x, b.x) < minX || Math.min(a.x, b.x) > maxX ||
                    Math.max(a.z, b.z) < minZ || Math.min(a.z, b.z) > maxZ) {
                    continue;
                }

                const midX = (a.x + b.x) * 0.5;
                const midZ = (a.z + b.z) * 0.5;
                const midY = (a.y + b.y) * 0.5;
                const terrainY = getTerrainHeight(midX, midZ);
                const ax = (a.x - originX) * pxPerMeter;
                const az = (a.z - originZ) * pxPerMeter;
                const bx = (b.x - originX) * pxPerMeter;
                const bz = (b.z - originZ) * pxPerMeter;

                if ((midY - terrainY) > 2.4) {
                    eCoords.push(ax, az, bx, bz);
                } else {
                    gCoords.push(ax, az, bx, bz);
                }
            }
        }

        // Clear to (0, 0, 0, 255) under source-over
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, res, res);

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // 1. Batched ground-level road shoulders under source-over (prevents cap overlap saturation)
        if (gCoords.length > 0) {
            ctx.strokeStyle = 'rgba(115, 0, 0, 1.0)';
            ctx.lineWidth = (sampleHalfW * 2.0 + 4.4) * pxPerMeter;
            ctx.beginPath();
            for (let i = 0; i < gCoords.length; i += 4) {
                ctx.moveTo(gCoords[i], gCoords[i + 1]);
                ctx.lineTo(gCoords[i + 2], gCoords[i + 3]);
            }
            ctx.stroke();

            // 2. Batched ground-level road cores under source-over
            ctx.strokeStyle = 'rgba(255, 0, 0, 1.0)';
            ctx.lineWidth = (sampleHalfW * 2.0) * pxPerMeter;
            ctx.beginPath();
            for (let i = 0; i < gCoords.length; i += 4) {
                ctx.moveTo(gCoords[i], gCoords[i + 1]);
                ctx.lineTo(gCoords[i + 2], gCoords[i + 3]);
            }
            ctx.stroke();
        }

        // 3. Switch to lighter for junction radial gradients & elevated bridge G-channel shadows
        ctx.globalCompositeOperation = 'lighter';

        for (const node of roadGraph.nodes.values()) {
            if (node.x < minX || node.x > maxX || node.z < minZ || node.z > maxZ) continue;
            const nx = (node.x - originX) * pxPerMeter;
            const nz = (node.z - originZ) * pxPerMeter;
            const rCore = node.plazaRadius * pxPerMeter;
            const rOuter = (node.plazaRadius + 2.4) * pxPerMeter;

            const grad = ctx.createRadialGradient(nx, nz, rCore * 0.85, nx, nz, rOuter);
            grad.addColorStop(0.0, 'rgba(255, 0, 0, 1.0)');
            grad.addColorStop(1.0, 'rgba(0, 0, 0, 1.0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(nx, nz, rOuter, 0, Math.PI * 2);
            ctx.fill();
        }

        // 4. Batched elevated bridge/ramp shadows into G channel (preserves grass under bridges!)
        if (eCoords.length > 0) {
            ctx.strokeStyle = 'rgba(0, 210, 0, 1.0)';
            ctx.lineWidth = (sampleHalfW * 2.0 + 3.0) * pxPerMeter;
            ctx.beginPath();
            for (let i = 0; i < eCoords.length; i += 4) {
                ctx.moveTo(eCoords[i], eCoords[i + 1]);
                ctx.lineTo(eCoords[i + 2], eCoords[i + 3]);
            }
            ctx.stroke();
        }

        ctx.globalCompositeOperation = 'source-over';
        this.texture.needsUpdate = true;
        return true;
    }

    destroy() {
        if (this.texture) this.texture.dispose();
    }
}
