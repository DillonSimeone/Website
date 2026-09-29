// track_gen.js — Country Dirt & Gravel Rally Road on Undulating Terrain
import * as THREE from 'three';
import { getTerrainHeight } from './terrain.js';

export const TrackGen = {
    generate(mode = 'arcade', seed = 1) {
        const numPoints = 145;
        const spacing = 6.4; // ~920m total course length
        const points = [];
        const tangents = [];
        const normals = [];
        const binormals = [];
        const tags = []; // 0=normal, 1=ramp, 2=lip, 4=finish

        let curPos = new THREE.Vector3(0, 0, 0);
        let curHeading = -Math.PI / 2; // Facing -Z (North)

        for (let i = 0; i < numPoints; i++) {
            const u = i / (numPoints - 1);
            let tag = 0;

            // Turn variation bounded within [-40 deg, +40 deg] around North
            let targetAngle = -Math.PI / 2;
            if (mode === 'arcade') {
                targetAngle += Math.sin(u * Math.PI * 4.2) * 0.55 + Math.cos(u * Math.PI * 2.1) * 0.25;
            } else {
                targetAngle += Math.sin(u * Math.PI * 5.0 + seed) * 0.65;
            }
            curHeading += (targetAngle - curHeading) * 0.18;

            const nextX = curPos.x + Math.cos(curHeading) * spacing;
            const nextZ = curPos.z + Math.sin(curHeading) * spacing;

            // Road follows the natural rolling hills and plains!
            const terrainY = getTerrainHeight(nextX, nextZ);
            let y = terrainY + 0.35; // Hugs rolling terrain with subtle roadbed elevation

            // Crest Jump Ramp around 60%
            if (u > 0.58 && u < 0.66) {
                const ru = (u - 0.58) / 0.08;
                y += Math.sin(ru * Math.PI) * 6.5;
                tag |= 1; // RAMP
            }

            // Final 16% is Celestial Ascent Star Ramp soaring into the cosmos
            if (u > 0.84) {
                const au = (u - 0.84) / 0.16;
                y += Math.pow(au, 1.8) * 44.0;
                tag |= 1; // RAMP
                if (u > 0.94) {
                    tag |= 2; // LIP
                }
            }

            if (i === numPoints - 1) {
                tag |= 4; // FINISH
            }

            const pt = new THREE.Vector3(nextX, y, nextZ);
            curPos = pt.clone();
            points.push(pt);
            tags.push(tag);
        }

        // Precompute shared vertex normals and binormals along spline (ZERO curve slits!)
        for (let i = 0; i < numPoints; i++) {
            let fwd = new THREE.Vector3();
            if (i === 0) {
                fwd.subVectors(points[1], points[0]);
            } else if (i === numPoints - 1) {
                fwd.subVectors(points[numPoints - 1], points[numPoints - 2]);
            } else {
                const d0 = points[i].clone().sub(points[i - 1]).normalize();
                const d1 = points[i + 1].clone().sub(points[i]).normalize();
                fwd.addVectors(d0, d1);
            }
            fwd.y = 0;
            if (fwd.lengthSq() < 0.0001) fwd.set(0, 0, -1);
            fwd.normalize();

            const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
            tangents.push(fwd);
            binormals.push(right);
            normals.push(new THREE.Vector3(0, 1, 0));
        }

        // Extrude country dirt & gravel ribbon mesh
        const trackMesh = this._extrudeTrackMesh(points, binormals, tags);

        // Checkpoints every 90 meters
        const checkpoints = [];
        let accDist = 0;
        let nextCp = 70;
        for (let i = 1; i < numPoints; i++) {
            accDist += points[i].distanceTo(points[i - 1]);
            if (accDist >= nextCp) {
                nextCp += 95;
                checkpoints.push(points[i].clone());
            }
        }

        return {
            points,
            tangents,
            binormals,
            tags,
            trackMesh,
            checkpoints,
            spawn: {
                position: points[1].clone().add(new THREE.Vector3(0, 1.2, 0)),
                direction: tangents[1].clone()
            },
            lip: points[Math.floor(numPoints * 0.95)].clone(),
            finish: points[numPoints - 1].clone()
        };
    },

    _extrudeTrackMesh(points, binormals, tags) {
        const roadWidth = 11.0;
        const halfW = roadWidth * 0.5;
        const n = points.length;

        const vertices = [];
        const colors = [];
        const normals = [];

        function addQuad(p1, p2, p3, p4, col) {
            vertices.push(p1.x, p1.y, p1.z);
            vertices.push(p2.x, p2.y, p2.z);
            vertices.push(p3.x, p3.y, p3.z);

            vertices.push(p1.x, p1.y, p1.z);
            vertices.push(p3.x, p3.y, p3.z);
            vertices.push(p4.x, p4.y, p4.z);

            for (let k = 0; k < 6; k++) {
                colors.push(col.r, col.g, col.b);
                normals.push(0, 1, 0);
            }
        }

        // Earthy Country Dirt & Gravel Palette
        const gravelMainCol = new THREE.Color(0.55, 0.47, 0.36);   // Crushed warm gravel
        const tireRutCol    = new THREE.Color(0.42, 0.35, 0.26);   // Packed darker earth ruts
        const centerGravel  = new THREE.Color(0.50, 0.43, 0.33);   // Center dirt crest
        const shoulderCol   = new THREE.Color(0.32, 0.42, 0.22);   // Mossy dirt shoulder blend
        const boostAmber    = new THREE.Color(1.0, 0.62, 0.14);    // Ancient amber boost runes
        const starAscent    = new THREE.Color(0.28, 0.88, 1.0);    // Celestial cyan star ramp

        for (let i = 0; i < n - 1; i++) {
            const pA = points[i];
            const pB = points[i + 1];
            const rA = binormals[i];
            const rB = binormals[i + 1];
            const tagA = tags[i];

            // Subdivided road cross-section for dual tire ruts and soft shoulders:
            // -Shoulder (-halfW - 1.8) -> Left Edge (-halfW) -> Left Rut (-2.2) -> Center (0) -> Right Rut (+2.2) -> Right Edge (+halfW) -> +Shoulder (+halfW + 1.8)
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

            // Slope outer shoulder slightly downward into the earth
            sL.a.y -= 0.25; sL.b.y -= 0.25;
            sR.a.y -= 0.25; sR.b.y -= 0.25;

            if ((tagA & 2) !== 0) {
                // Star Ascent Launch Runway
                addQuad(eL.a, eL.b, eR.b, eR.a, starAscent);
            } else if ((tagA & 1) !== 0) {
                // Amber Boost Ramp
                addQuad(eL.a, eL.b, eR.b, eR.a, boostAmber);
            } else {
                // Country Dirt & Gravel Road with packed tire tracks
                // 1. Left packed dirt rut
                addQuad(eL.a, eL.b, rL.b, rL.a, gravelMainCol);
                addQuad(rL.a, rL.b, c0.b, c0.a, tireRutCol);

                // 2. Right packed dirt rut
                addQuad(c0.a, c0.b, rR.b, rR.a, centerGravel);
                addQuad(rR.a, rR.b, eR.b, eR.a, tireRutCol);

                // 3. Soft Grassy Dirt Shoulders (Smooth transition into meadow grass)
                addQuad(sL.a, sL.b, eL.b, eL.a, shoulderCol);
                addQuad(eR.a, eR.b, sR.b, sR.a, shoulderCol);
            }
        }

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

        const mat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.88, // Natural matte gravel and dirt
            metalness: 0.04,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geom, mat);
        mesh.receiveShadow = false;
        return mesh;
    }
};
