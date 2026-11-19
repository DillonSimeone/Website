/**
 * three.js/js/road/road_mesh.js — Watertight Solid 3D Roads, Box-Girder Bridges & Plazas
 *
 * Guarantees it is never possible to see the underside/bottom of any road:
 * - Ground-level segments extrude sloped shoulders + buried earthen embankment skirts down to terrain - 4.5m.
 * - Elevated segments (> 4.5m above terrain) extrude a closed 3D box-girder hull with
 *   raised side safety parapets (+0.85m), tapered side cheeks, closed bottom soffit face,
 *   end bulkheads, and grounded concrete support piers down into terrain - 4.5m.
 * - Junction & roundabout aprons feature matching solid aprons and stone center islands.
 */
import * as THREE from 'three';
import { getTerrainHeight } from '../terrain.js';

export class RoadMeshBuilder {
    constructor() {
        this.roadMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.86,
            metalness: 0.05,
            side: THREE.FrontSide
        });

        this.structureMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.72,
            metalness: 0.18,
            side: THREE.FrontSide
        });

        this.plazaMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.86,
            metalness: 0.05,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1
        });
    }

    setVisualMode(mode) {
        if (!mode || !mode.road) return;
        this.roadMat.color.set(mode.road.tintHex || '#ffffff');
        this.roadMat.emissive.set(mode.road.emissiveHex || '#000000');
        this.roadMat.emissiveIntensity = mode.road.emissiveIntensity || 0.0;

        this.plazaMat.color.copy(this.roadMat.color);
        this.plazaMat.emissive.copy(this.roadMat.emissive);
        this.plazaMat.emissiveIntensity = this.roadMat.emissiveIntensity;
    }

    _pushTri(verts, cols, norms, a, b, c, col, norm) {
        verts.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        for (let k = 0; k < 3; k++) {
            cols.push(col.r, col.g, col.b);
            norms.push(norm.x, norm.y, norm.z);
        }
    }

    /**
     * Pushes a quad (p1, p2, p3, p4) with CCW winding matching normal `n`.
     */
    _pushQuad(verts, cols, norms, p1, p2, p3, p4, col, norm = null) {
        // Auto-compute geometric normal if not supplied, ensuring CCW facing
        const e1 = new THREE.Vector3().subVectors(p4, p1);
        const e2 = new THREE.Vector3().subVectors(p2, p1);
        const faceNorm = new THREE.Vector3().crossVectors(e1, e2).normalize();
        const useNorm = norm || faceNorm;

        if (faceNorm.dot(useNorm) >= 0) {
            this._pushTri(verts, cols, norms, p1, p4, p2, col, useNorm);
            this._pushTri(verts, cols, norms, p4, p3, p2, col, useNorm);
        } else {
            this._pushTri(verts, cols, norms, p1, p2, p4, col, useNorm);
            this._pushTri(verts, cols, norms, p4, p2, p3, col, useNorm);
        }
    }

    _pushBoxPier(verts, cols, norms, cx, topY, bottomY, cz, halfSize, col) {
        const x0 = cx - halfSize, x1 = cx + halfSize;
        const z0 = cz - halfSize, z1 = cz + halfSize;
        const p00 = new THREE.Vector3(x0, topY, z0);
        const p10 = new THREE.Vector3(x1, topY, z0);
        const p11 = new THREE.Vector3(x1, topY, z1);
        const p01 = new THREE.Vector3(x0, topY, z1);
        const b00 = new THREE.Vector3(x0, bottomY, z0);
        const b10 = new THREE.Vector3(x1, bottomY, z0);
        const b11 = new THREE.Vector3(x1, bottomY, z1);
        const b01 = new THREE.Vector3(x0, bottomY, z1);

        this._pushQuad(verts, cols, norms, b00, p00, p10, b10, col, new THREE.Vector3(0, 0, -1));
        this._pushQuad(verts, cols, norms, b10, p10, p11, b11, col, new THREE.Vector3(1, 0, 0));
        this._pushQuad(verts, cols, norms, b11, p11, p01, b01, col, new THREE.Vector3(0, 0, 1));
        this._pushQuad(verts, cols, norms, b01, p01, p00, b00, col, new THREE.Vector3(-1, 0, 0));
    }

    buildEdgeMesh(edge) {
        const group = new THREE.Group();
        const pts = edge.points;
        const binorms = edge.binormals;
        const norms = edge.normals;
        const tags = edge.tags;
        const n = pts.length;
        const halfW = edge.halfWidth; // 6.2m

        const rVerts = [], rCols = [], rNorms = [];
        const sVerts = [], sCols = [], sNorms = [];

        const gravelMainCol = new THREE.Color(0.55, 0.47, 0.36);
        const tireRutCol    = new THREE.Color(0.42, 0.35, 0.26);
        const centerGravel  = new THREE.Color(0.50, 0.43, 0.33);
        const shoulderCol   = new THREE.Color(0.32, 0.44, 0.22);
        const bermCol       = new THREE.Color(0.24, 0.20, 0.15);
        const boostAmber    = new THREE.Color(1.0, 0.62, 0.14);
        const concreteDeck  = new THREE.Color(0.62, 0.65, 0.70);
        const concreteDark  = new THREE.Color(0.38, 0.42, 0.48);
        const railStripe    = new THREE.Color(0.86, 0.24, 0.22);
        const railWhite     = new THREE.Color(0.92, 0.94, 0.96);

        let pierDistAccum = 0.0;
        let prevElevated = false;

        for (let i = 0; i < n - 1; i++) {
            const pA = pts[i];
            const pB = pts[i + 1];
            const rA = binorms[i];
            const rB = binorms[i + 1];
            const uA = norms[i];
            const uB = norms[i + 1];
            const midUp = new THREE.Vector3().addVectors(uA, uB).normalize();
            const tagA = tags[i];

            const ptAt = (p, r, offset) => new THREE.Vector3(
                p.x + r.x * offset,
                p.y + r.y * offset,
                p.z + r.z * offset
            );

            const eL_a = ptAt(pA, rA, -halfW);
            const eL_b = ptAt(pB, rB, -halfW);
            const rL_a = ptAt(pA, rA, -2.4);
            const rL_b = ptAt(pB, rB, -2.4);
            const c0_a = pA.clone();
            const c0_b = pB.clone();
            const rR_a = ptAt(pA, rA, 2.4);
            const rR_b = ptAt(pB, rB, 2.4);
            const eR_a = ptAt(pA, rA, halfW);
            const eR_b = ptAt(pB, rB, halfW);

            // Top driving deck surface (always full 12.4m wide!)
            if ((tagA & 1) !== 0) {
                this._pushQuad(rVerts, rCols, rNorms, eL_a, eL_b, rL_b, rL_a, gravelMainCol, midUp);
                this._pushQuad(rVerts, rCols, rNorms, rL_a, rL_b, rR_b, rR_a, boostAmber, midUp);
                this._pushQuad(rVerts, rCols, rNorms, rR_a, rR_b, eR_b, eR_a, gravelMainCol, midUp);
            } else {
                this._pushQuad(rVerts, rCols, rNorms, eL_a, eL_b, rL_b, rL_a, gravelMainCol, midUp);
                this._pushQuad(rVerts, rCols, rNorms, rL_a, rL_b, c0_b, c0_a, tireRutCol, midUp);
                this._pushQuad(rVerts, rCols, rNorms, c0_a, c0_b, rR_b, rR_a, centerGravel, midUp);
                this._pushQuad(rVerts, rCols, rNorms, rR_a, rR_b, eR_b, eR_a, tireRutCol, midUp);
            }

            // Determine clearance above terrain
            const tCenter = getTerrainHeight((pA.x + pB.x) * 0.5, (pA.z + pB.z) * 0.5);
            const avgY = (pA.y + pB.y) * 0.5;
            const clearance = avgY - tCenter;
            const isElevated = clearance > 4.5;

            if (!isElevated) {
                // GROUND-LEVEL EMBANKMENT: sloped grassy shoulder + deep earth berm buried into terrain
                const sL_a = ptAt(pA, rA, -halfW - 2.0); sL_a.y -= 0.35;
                const sL_b = ptAt(pB, rB, -halfW - 2.0); sL_b.y -= 0.35;
                const sR_a = ptAt(pA, rA, halfW + 2.0);  sR_a.y -= 0.35;
                const sR_b = ptAt(pB, rB, halfW + 2.0);  sR_b.y -= 0.35;

                this._pushQuad(rVerts, rCols, rNorms, sL_a, sL_b, eL_b, eL_a, shoulderCol, midUp);
                this._pushQuad(rVerts, rCols, rNorms, eR_a, eR_b, sR_b, sR_a, shoulderCol, midUp);

                const bL_a = sL_a.clone(); bL_a.y = getTerrainHeight(bL_a.x, bL_a.z) - 4.5;
                const bL_b = sL_b.clone(); bL_b.y = getTerrainHeight(bL_b.x, bL_b.z) - 4.5;
                const bR_a = sR_a.clone(); bR_a.y = getTerrainHeight(bR_a.x, bR_a.z) - 4.5;
                const bR_b = sR_b.clone(); bR_b.y = getTerrainHeight(bR_b.x, bR_b.z) - 4.5;

                // Clamp bottom below top even on steep dips
                bL_a.y = Math.min(bL_a.y, sL_a.y - 2.5);
                bL_b.y = Math.min(bL_b.y, sL_b.y - 2.5);
                bR_a.y = Math.min(bR_a.y, sR_a.y - 2.5);
                bR_b.y = Math.min(bR_b.y, sR_b.y - 2.5);

                const nL = new THREE.Vector3(-rA.x, 0.25, -rA.z).normalize();
                const nR = new THREE.Vector3(rA.x, 0.25, rA.z).normalize();
                this._pushQuad(rVerts, rCols, rNorms, bL_a, bL_b, sL_b, sL_a, bermCol, nL);
                this._pushQuad(rVerts, rCols, rNorms, sR_a, sR_b, bR_b, bR_a, bermCol, nR);

                if (prevElevated) {
                    // Close off elevated girder bulkhead cleanly as it enters ground
                    const bulkL_a = ptAt(pA, rA, -halfW - 0.65);
                    const bulkR_a = ptAt(pA, rA, halfW + 0.65);
                    const botL_a  = ptAt(pA, rA, -halfW + 1.2); botL_a.y -= 1.65;
                    const botR_a  = ptAt(pA, rA, halfW - 1.2);  botR_a.y -= 1.65;
                    const fwdCap = new THREE.Vector3().subVectors(pB, pA).normalize();
                    this._pushQuad(sVerts, sCols, sNorms, botL_a, bulkL_a, bulkR_a, botR_a, concreteDark, fwdCap);
                }
                pierDistAccum = 0.0;
            } else {
                // ELEVATED BRIDGE / RAMP / CAUSEWAY: Closed 3D Box-Girder Hull + Side Safety Parapets + Piers
                const parapetCol = (i % 2 === 0) ? railStripe : railWhite;
                const wallH = 0.85;
                const girderDepth = 1.65;

                // Outer rim & raised side safety parapet walls
                const oL_a = ptAt(pA, rA, -halfW - 0.65);
                const oL_b = ptAt(pB, rB, -halfW - 0.65);
                const oR_a = ptAt(pA, rA, halfW + 0.65);
                const oR_b = ptAt(pB, rB, halfW + 0.65);

                const topInL_a  = eL_a.clone().addScaledVector(uA, wallH);
                const topInL_b  = eL_b.clone().addScaledVector(uB, wallH);
                const topOutL_a = oL_a.clone().addScaledVector(uA, wallH);
                const topOutL_b = oL_b.clone().addScaledVector(uB, wallH);

                const topInR_a  = eR_a.clone().addScaledVector(uA, wallH);
                const topInR_b  = eR_b.clone().addScaledVector(uB, wallH);
                const topOutR_a = oR_a.clone().addScaledVector(uA, wallH);
                const topOutR_b = oR_b.clone().addScaledVector(uB, wallH);

                // Left parapet (inner face, top cap, outer face)
                this._pushQuad(sVerts, sCols, sNorms, eL_a, eL_b, topInL_b, topInL_a, parapetCol, rA.clone());
                this._pushQuad(sVerts, sCols, sNorms, topOutL_a, topOutL_b, topInL_b, topInL_a, parapetCol, midUp);
                this._pushQuad(sVerts, sCols, sNorms, oL_a, oL_b, topOutL_b, topOutL_a, concreteDeck, rA.clone().negate());

                // Right parapet (inner face, top cap, outer face)
                this._pushQuad(sVerts, sCols, sNorms, topInR_a, topInR_b, eR_b, eR_a, parapetCol, rA.clone().negate());
                this._pushQuad(sVerts, sCols, sNorms, topInR_a, topInR_b, topOutR_b, topOutR_a, parapetCol, midUp);
                this._pushQuad(sVerts, sCols, sNorms, topOutR_a, topOutR_b, oR_b, oR_a, concreteDeck, rA.clone());

                // Tapered structural box-girder underside & closed soffit belly
                const botL_a = ptAt(pA, rA, -halfW + 1.2); botL_a.y -= girderDepth;
                const botL_b = ptAt(pB, rB, -halfW + 1.2); botL_b.y -= girderDepth;
                const botR_a = ptAt(pA, rA, halfW - 1.2);  botR_a.y -= girderDepth;
                const botR_b = ptAt(pB, rB, halfW - 1.2);  botR_b.y -= girderDepth;

                const downNorm = midUp.clone().negate();
                this._pushQuad(sVerts, sCols, sNorms, botL_a, botL_b, oL_b, oL_a, concreteDark, new THREE.Vector3(-rA.x, -0.6, -rA.z).normalize());
                this._pushQuad(sVerts, sCols, sNorms, oR_a, oR_b, botR_b, botR_a, concreteDark, new THREE.Vector3(rA.x, -0.6, rA.z).normalize());
                // Closed bottom soffit face (downward normal!)
                this._pushQuad(sVerts, sCols, sNorms, botR_a, botR_b, botL_b, botL_a, concreteDark, downNorm);

                if (!prevElevated) {
                    const backCap = new THREE.Vector3().subVectors(pA, pB).normalize();
                    this._pushQuad(sVerts, sCols, sNorms, botL_a, oL_a, oR_a, botR_a, concreteDark, backCap);
                }

                // Grounded Support Piers every ~22m
                pierDistAccum += pA.distanceTo(pB);
                if (pierDistAccum >= 22.0 && i < n - 3) {
                    pierDistAccum = 0.0;
                    const pierX = (pA.x + pB.x) * 0.5;
                    const pierZ = (pA.z + pB.z) * 0.5;
                    const pierTop = avgY - girderDepth + 0.15;
                    const pierBot = Math.min(pierTop - 2.0, getTerrainHeight(pierX, pierZ) - 4.5);
                    this._pushBoxPier(sVerts, sCols, sNorms, pierX, pierTop, pierBot, pierZ, 0.95, concreteDark);
                }
            }
            prevElevated = isElevated;
        }

        const rGeom = new THREE.BufferGeometry();
        rGeom.setAttribute('position', new THREE.Float32BufferAttribute(rVerts, 3));
        rGeom.setAttribute('color', new THREE.Float32BufferAttribute(rCols, 3));
        rGeom.setAttribute('normal', new THREE.Float32BufferAttribute(rNorms, 3));
        const roadMesh = new THREE.Mesh(rGeom, this.roadMat);
        roadMesh.receiveShadow = true;
        group.add(roadMesh);

        if (sVerts.length > 0) {
            const sGeom = new THREE.BufferGeometry();
            sGeom.setAttribute('position', new THREE.Float32BufferAttribute(sVerts, 3));
            sGeom.setAttribute('color', new THREE.Float32BufferAttribute(sCols, 3));
            sGeom.setAttribute('normal', new THREE.Float32BufferAttribute(sNorms, 3));
            const structMesh = new THREE.Mesh(sGeom, this.structureMat);
            structMesh.receiveShadow = true;
            structMesh.castShadow = true;
            group.add(structMesh);
        }

        return group;
    }

    buildNodeMesh(node) {
        const group = new THREE.Group();
        const verts = [];
        const cols = [];
        const norms = [];

        const plazaCol  = new THREE.Color(0.50, 0.43, 0.33);
        const curbCol   = new THREE.Color(0.75, 0.77, 0.80);
        const islandCol = new THREE.Color(0.24, 0.44, 0.18);
        const bermCol   = new THREE.Color(0.24, 0.20, 0.15);
        const up = new THREE.Vector3(0, 1, 0);

        const segs = node.type === 'roundabout' ? 28 : 16;
        const outerR = node.plazaRadius;
        const innerR = node.type === 'roundabout' ? node.islandRadius : 0.0;
        const skirtR = outerR + 1.8;

        for (let i = 0; i < segs; i++) {
            const a0 = (i / segs) * Math.PI * 2;
            const a1 = ((i + 1) / segs) * Math.PI * 2;
            const c0 = Math.cos(a0), s0 = Math.sin(a0);
            const c1 = Math.cos(a1), s1 = Math.sin(a1);

            const o0 = new THREE.Vector3(node.x + c0 * outerR, node.y, node.z + s0 * outerR);
            const o1 = new THREE.Vector3(node.x + c1 * outerR, node.y, node.z + s1 * outerR);

            if (innerR > 0.1) {
                // Roundabout annular deck + raised landscaped center island
                const i0 = new THREE.Vector3(node.x + c0 * innerR, node.y, node.z + s0 * innerR);
                const i1 = new THREE.Vector3(node.x + c1 * innerR, node.y, node.z + s1 * innerR);
                this._pushQuad(verts, cols, norms, i0, i1, o1, o0, plazaCol, up);

                const curb0 = new THREE.Vector3(node.x + c0 * innerR, node.y + 0.55, node.z + s0 * innerR);
                const curb1 = new THREE.Vector3(node.x + c1 * innerR, node.y + 0.55, node.z + s1 * innerR);
                const outN = new THREE.Vector3((c0 + c1) * 0.5, 0, (s0 + s1) * 0.5).normalize();
                this._pushQuad(verts, cols, norms, i0, curb0, curb1, i1, curbCol, outN);

                const ctr = new THREE.Vector3(node.x, node.y + 0.85, node.z);
                this._pushTri(verts, cols, norms, ctr, curb1, curb0, islandCol, up);
            } else {
                const ctr = new THREE.Vector3(node.x, node.y, node.z);
                this._pushTri(verts, cols, norms, ctr, o1, o0, plazaCol, up);
            }

            // Perimeter earthen skirt buried below terrain
            const sk0 = new THREE.Vector3(node.x + c0 * skirtR, node.y - 0.3, node.z + s0 * skirtR);
            const sk1 = new THREE.Vector3(node.x + c1 * skirtR, node.y - 0.3, node.z + s1 * skirtR);
            const bot0 = new THREE.Vector3(sk0.x, Math.min(sk0.y - 2.5, getTerrainHeight(sk0.x, sk0.z) - 4.5), sk0.z);
            const bot1 = new THREE.Vector3(sk1.x, Math.min(sk1.y - 2.5, getTerrainHeight(sk1.x, sk1.z) - 4.5), sk1.z);
            const pNorm = new THREE.Vector3((c0 + c1) * 0.5, 0.2, (s0 + s1) * 0.5).normalize();

            this._pushQuad(verts, cols, norms, o0, o1, sk1, sk0, islandCol, up);
            this._pushQuad(verts, cols, norms, sk0, sk1, bot1, bot0, bermCol, pNorm);
        }

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geom.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
        geom.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
        const mesh = new THREE.Mesh(geom, this.plazaMat);
        mesh.receiveShadow = true;
        group.add(mesh);
        return group;
    }

    disposeMeshGroup(group) {
        if (!group) return;
        group.traverse((child) => {
            if (child.isMesh && child.geometry) {
                child.geometry.dispose();
            }
        });
    }
}
