/**
 * geometry_generator.js
 * Generates 3D printable meshes from 21 hand landmarks.
 * Printable Skin is a single watertight capsule field.
 * Solid, Winding Ribbons, and Crystalline stay as secondary styles.
 * Supports direct physical millimeter scaling for 3D slicing.
 */

import { MarchingCubes } from './marching_cubes.js';

export const FINGER_CONNECTIONS = [
    [0, 1, 2, 3, 4],     // Thumb
    [0, 5, 6, 7, 8],     // Index
    [5, 9, 10, 11, 12],  // Middle
    [9, 13, 14, 15, 16], // Ring
    [13, 17, 18, 19, 20] // Pinky
];

export const PALM_CONNECTIONS = [
    [0, 5], [5, 9], [9, 13], [13, 17], [17, 0]
];

export const ALL_SKELETON_CONNECTIONS = [...FINGER_CONNECTIONS, ...PALM_CONNECTIONS];

/**
 * Creates a merged BufferGeometry for the hand with real-world millimeter scaling.
 * @param {Array<{x: number, y: number, z: number}>} landmarks - 21 3D points
 * @param {Object} modelSettings - Custom styling and generation parameters
 * @returns {THREE.BufferGeometry|null}
 */
export function createHandGeometry(landmarks, modelSettings) {
    const THREE = window.THREE;
    if (!landmarks || landmarks.length < 21) return null;

    // Wrist-relative pose. X/Y are mirrored so the hand stands upright.
    const wrist = landmarks[0];
    const relative = landmarks.map(l => ({
        x: -((l.x || 0) - (wrist.x || 0)),
        y: -((l.y || 0) - (wrist.y || 0)),
        z: ((l.z || 0) - (wrist.z || 0))
    }));

    // Scale from the longest finger, so a curled middle finger
    // cannot enlarge the fingers that are actually extended.
    const targetHeightMM = modelSettings.targetHeightMM || 150;
    const arc = longestFingerArc(relative) || 1;
    const finalScale = targetHeightMM / arc;
    const mmMultiplier = finalScale * (Math.hypot(relative[9].x, relative[9].y, relative[9].z) || arc);

    const vertices = relative.map(p => new THREE.Vector3(
        p.x * finalScale,
        p.y * finalScale,
        p.z * finalScale
    ));

    let geometries = [];

    switch (modelSettings.fingerStyle) {
        case 'solid':
            geometries = generateSolidGeometry(vertices, landmarks, modelSettings, mmMultiplier);
            break;
        case 'ribbon':
            geometries = generateRibbonGeometry(vertices, modelSettings, mmMultiplier);
            break;
        case 'crystalline':
            geometries = generateCrystallineGeometry(vertices, modelSettings, mmMultiplier);
            break;
        case 'skin':
        case 'metaball':
            geometries = generateSkinGeometry(vertices, modelSettings, mmMultiplier);
            break;
        default:
            geometries = generateSolidGeometry(vertices, landmarks, modelSettings, mmMultiplier);
    }

    const skinned = modelSettings.fingerStyle === 'skin' || modelSettings.fingerStyle === 'metaball';
    if (modelSettings.addWristBase && !skinned) {
        geometries.push(...generateWristAndBaseGeometry(vertices, modelSettings, mmMultiplier));
    }

    if (!geometries || geometries.length === 0) return null;

    try {
        const compatibleGeometries = geometries
            .filter(g => g && g.attributes?.position?.count > 0)
            .map(g => g.index ? g.toNonIndexed() : g);

        if (compatibleGeometries.length === 0) return null;

        // If only 1 geometry (e.g. standalone watertight metaball), return it directly without merging
        if (compatibleGeometries.length === 1) {
            const single = compatibleGeometries[0];
            single.computeVertexNormals();
            single.computeBoundingBox();
            const bbox = single.boundingBox;
            const center = new THREE.Vector3();
            bbox.getCenter(center);
            single.translate(-center.x, -bbox.min.y, -center.z);
            return single;
        }

        const bgu = window.THREE?.BufferGeometryUtils || THREE.BufferGeometryUtils;
        if (!bgu || typeof bgu.mergeBufferGeometries !== 'function') {
            console.error('BufferGeometryUtils.mergeBufferGeometries not found.');
            return compatibleGeometries[0] || null;
        }

        const merged = bgu.mergeBufferGeometries(compatibleGeometries);
        if (merged) {
            merged.computeVertexNormals();
            // Center geometry at origin for clean printing placement
            merged.computeBoundingBox();
            const bbox = merged.boundingBox;
            const center = new THREE.Vector3();
            bbox.getCenter(center);
            merged.translate(-center.x, -bbox.min.y, -center.z);
        }
        return merged;
    } catch (e) {
        console.error('Failed to merge hand geometries:', e);
        return null;
    }
}

export function generateSolidGeometry(vertices, landmarks, settings, mmMultiplier) {
    const THREE = window.THREE;
    const geometries = [];
    const fingerRadius = (settings.fingerThickness || 0.1) * mmMultiplier * 0.12;

    // Palm Construction
    if (settings.palmStyle === 'triangles') {
        const uniqueIndices = [0, 1, 5, 9, 13, 17];
        const palmUniqueVertices = uniqueIndices.map(i => vertices[i]);
        const indexMap = new Map(uniqueIndices.map((val, i) => [val, i]));
        const palmFaces = [
            indexMap.get(0), indexMap.get(1), indexMap.get(5),
            indexMap.get(0), indexMap.get(5), indexMap.get(9),
            indexMap.get(0), indexMap.get(9), indexMap.get(13),
            indexMap.get(0), indexMap.get(13), indexMap.get(17),
            indexMap.get(0), indexMap.get(17), indexMap.get(1)
        ];
        const palmGeometry = new THREE.BufferGeometry();
        palmGeometry.setAttribute('position', new THREE.Float32BufferAttribute(palmUniqueVertices.flatMap(v => [v.x, v.y, v.z]), 3));
        palmGeometry.setIndex(palmFaces);
        palmGeometry.computeVertexNormals();
        geometries.push(palmGeometry);
    } else {
        // Palm Cylinders
        const palmAndSupportConnections = [...PALM_CONNECTIONS, [9, 0], [13, 0]];
        palmAndSupportConnections.forEach(conn => {
            geometries.push(createCylinderBetweenPoints(vertices[conn[0]], vertices[conn[1]], fingerRadius));
        });
    }

    // Finger Segments
    FINGER_CONNECTIONS.forEach(finger => {
        for (let j = 0; j < finger.length - 1; j++) {
            geometries.push(createCylinderBetweenPoints(vertices[finger[j]], vertices[finger[j + 1]], fingerRadius));
        }
    });

    // Articulated Joints
    if (settings.showJoints && settings.jointSize > 0) {
        const jointRadius = (settings.jointSize || 0.1) * mmMultiplier * 0.14;
        vertices.forEach(v => {
            const sphere = new THREE.SphereGeometry(jointRadius, 16, 16);
            sphere.translate(v.x, v.y, v.z);
            sphere.deleteAttribute('uv');
            geometries.push(sphere);
        });
    }

    return geometries;
}

export function generateRibbonGeometry(vertices, settings, mmMultiplier) {
    const THREE = window.THREE;
    const ribbonGeometries = [];
    const baseCylRadius = (settings.cylinderRadius || 0.015) * mmMultiplier;
    const baseThickness = Math.max(0.8, (settings.ribbonThickness || 0.005) * mmMultiplier * 1.5);
    const strandCount = Math.max(1, settings.strandCount || 3);
    const twistSpeed = settings.twistSpeed || 4;
    const smoothness = settings.smoothness || 20;

    ALL_SKELETON_CONNECTIONS.forEach(path => {
        for (let s = 0; s < strandCount; s++) {
            const randomThickness = baseThickness * (1 - settings.widthVariation + (Math.random() * settings.widthVariation * 2));
            const randomStartAngle = (s / strandCount) * Math.PI * 2;
            const strandPoints = [];

            for (let j = 0; j < path.length - 1; j++) {
                const p1 = vertices[path[j]];
                const p2 = vertices[path[j + 1]];
                const axis = new THREE.Vector3().subVectors(p2, p1);
                const length = axis.length();
                if (length < 0.001) continue;
                axis.normalize();

                let perp = new THREE.Vector3(0, 1, 0);
                if (Math.abs(axis.y) > 0.99) perp.set(1, 0, 0);
                perp.cross(axis).normalize();

                const segmentSteps = Math.max(6, Math.ceil(smoothness));
                for (let i = 0; i <= segmentSteps; i++) {
                    const t = i / segmentSteps;
                    const axisPoint = p1.clone().lerp(p2, t);
                    const angle = (t * twistSpeed * Math.PI * 2) + randomStartAngle + (j * 0.5);
                    const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
                    const radialVec = perp.clone().applyQuaternion(q).multiplyScalar(baseCylRadius);
                    strandPoints.push(axisPoint.clone().add(radialVec));
                }
            }

            if (strandPoints.length < 2) continue;
            const ribbonCurve = new THREE.CatmullRomCurve3(strandPoints);
            const tubeGeom = new THREE.TubeGeometry(ribbonCurve, Math.max(12, smoothness * path.length), randomThickness, 8, false);
            tubeGeom.deleteAttribute('uv');
            ribbonGeometries.push(tubeGeom);
        }
    });

    return ribbonGeometries;
}

export function generateCrystallineGeometry(vertices, settings, mmMultiplier) {
    const THREE = window.THREE;
    const crystalGeometries = [];
    const density = settings.crystalDensity || 2;
    const baseSize = (settings.crystalSize || 0.02) * mmMultiplier * 1.5;
    const baseSharpness = settings.crystalSharpness || 2.0;

    ALL_SKELETON_CONNECTIONS.forEach(path => {
        const p1 = vertices[path[0]];
        const p2 = vertices[path[Math.floor(path.length / 2)]];
        const p3 = vertices[path[path.length - 1]];
        const normal = new THREE.Vector3().subVectors(p2, p1).cross(new THREE.Vector3().subVectors(p3, p1)).normalize();
        if (normal.lengthSq() < 0.001) normal.set(0, 0, 1);

        for (let j = 0; j < path.length - 1; j++) {
            const start = vertices[path[j]];
            const end = vertices[path[j + 1]];

            for (let i = 1; i <= density; i++) {
                const t = i / (density + 1);
                const point = start.clone().lerp(end, t);
                const size = baseSize * (1 - settings.crystalSizeVariation + (Math.random() * settings.crystalSizeVariation * 2));
                const sharpness = baseSharpness * (1 - settings.crystalSharpnessVariation + (Math.random() * settings.crystalSharpnessVariation * 2));
                const height = size * sharpness;

                const cone = new THREE.ConeGeometry(size, height, 6);
                cone.translate(0, height / 2, 0);
                cone.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));

                const randomAxis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
                const chaosAngle = (Math.random() - 0.5) * Math.PI * (settings.crystalChaos || 0.25);
                const coneDirection = normal.clone().applyAxisAngle(randomAxis, chaosAngle).normalize();

                const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), coneDirection);
                cone.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q).setPosition(point));
                cone.deleteAttribute('uv');
                crystalGeometries.push(cone);
            }
        }
    });

    return crystalGeometries;
}

const SKIN_FINGERS = [
    { joints: [1, 2, 3, 4], base: 0.066, tip: 0.040 },
    { joints: [5, 6, 7, 8], base: 0.053, tip: 0.033 },
    { joints: [9, 10, 11, 12], base: 0.055, tip: 0.034 },
    { joints: [13, 14, 15, 16], base: 0.050, tip: 0.031 },
    { joints: [17, 18, 19, 20], base: 0.043, tip: 0.027 }
];

const FINGER_CHAINS = [
    [0, 1, 2, 3, 4],
    [0, 5, 6, 7, 8],
    [0, 9, 10, 11, 12],
    [0, 13, 14, 15, 16],
    [0, 17, 18, 19, 20]
];

export function longestFingerArc(points) {
    let arc = 0;
    for (let i = 0; i < FINGER_CHAINS.length; i++) {
        arc = Math.max(arc, polylineLength(points, FINGER_CHAINS[i]));
    }
    return arc;
}

export function polylineLength(points, indices) {
    let len = 0;
    for (let i = 0; i < indices.length - 1; i++) {
        const a = points[indices[i]];
        const b = points[indices[i + 1]];
        len += Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
    }
    return len;
}

export function skinJointRadius(finger, jointIndex, handLength, flesh) {
    const t = jointIndex / (finger.joints.length - 1);
    return (finger.base + (finger.tip - finger.base) * t) * handLength * flesh;
}

function vsub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vdot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

function vlen(a) {
    return Math.hypot(a.x, a.y, a.z);
}

function vscale(a, s) {
    return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function vnorm(a) {
    const l = vlen(a);
    if (l < 1e-8) return { x: 0, y: 0, z: 1 };
    return vscale(a, 1 / l);
}

function vcross(a, b) {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x
    };
}

function vadd(target, dir, amount) {
    target.x += dir.x * amount;
    target.y += dir.y * amount;
    target.z += dir.z * amount;
}

function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

function fingerFade(segIndex, t, jointCount) {
    const ft = (segIndex + t) / (jointCount - 1);
    return smoothstep(0.12, 0.5, ft);
}

function closestSegments(a0, a1, b0, b1) {
    const ux = a1.x - a0.x, uy = a1.y - a0.y, uz = a1.z - a0.z;
    const vx = b1.x - b0.x, vy = b1.y - b0.y, vz = b1.z - b0.z;
    const wx = a0.x - b0.x, wy = a0.y - b0.y, wz = a0.z - b0.z;
    const a = ux * ux + uy * uy + uz * uz;
    const b = ux * vx + uy * vy + uz * vz;
    const c = vx * vx + vy * vy + vz * vz;
    const d = ux * wx + uy * wy + uz * wz;
    const e = vx * wx + vy * wy + vz * wz;
    const D = a * c - b * b;
    let sN;
    let sD = D;
    let tN;
    let tD = D;

    if (D < 1e-8) {
        sN = 0;
        sD = 1;
        tN = e;
        tD = c;
    } else {
        sN = b * e - c * d;
        tN = a * e - b * d;
        if (sN < 0) {
            sN = 0;
            tN = e;
            tD = c;
        } else if (sN > sD) {
            sN = sD;
            tN = e + b;
            tD = c;
        }
    }

    if (tN < 0) {
        tN = 0;
        if (-d < 0) sN = 0;
        else if (-d > a) sN = sD;
        else { sN = -d; sD = a; }
    } else if (tN > tD) {
        tN = tD;
        if ((-d + b) < 0) sN = 0;
        else if ((-d + b) > a) sN = sD;
        else { sN = -d + b; sD = a; }
    }

    const sc = Math.abs(sN) < 1e-8 ? 0 : sN / (sD || 1);
    const tc = Math.abs(tN) < 1e-8 ? 0 : tN / (tD || 1);
    return {
        sc: Math.max(0, Math.min(1, sc)),
        tc: Math.max(0, Math.min(1, tc))
    };
}

function separateFingerPass(vertices, palmNormal, handLength, flesh) {
    for (let f = 0; f < SKIN_FINGERS.length - 1; f++) {
        const fingerA = SKIN_FINGERS[f];
        const fingerB = SKIN_FINGERS[f + 1];
        const jointsA = fingerA.joints;
        const jointsB = fingerB.joints;

        for (let segA = 0; segA < jointsA.length - 1; segA++) {
            for (let segB = 0; segB < jointsB.length - 1; segB++) {
                const a0 = vertices[jointsA[segA]];
                const a1 = vertices[jointsA[segA + 1]];
                const b0 = vertices[jointsB[segB]];
                const b1 = vertices[jointsB[segB + 1]];
                if (Math.hypot(a1.x - a0.x, a1.y - a0.y, a1.z - a0.z) < 0.5) continue;
                if (Math.hypot(b1.x - b0.x, b1.y - b0.y, b1.z - b0.z) < 0.5) continue;

                const { sc, tc } = closestSegments(a0, a1, b0, b1);
                const pA = {
                    x: a0.x + (a1.x - a0.x) * sc,
                    y: a0.y + (a1.y - a0.y) * sc,
                    z: a0.z + (a1.z - a0.z) * sc
                };
                const pB = {
                    x: b0.x + (b1.x - b0.x) * tc,
                    y: b0.y + (b1.y - b0.y) * tc,
                    z: b0.z + (b1.z - b0.z) * tc
                };
                const rA = skinJointRadius(fingerA, segA, handLength, flesh) * (1 - sc)
                    + skinJointRadius(fingerA, segA + 1, handLength, flesh) * sc;
                const rB = skinJointRadius(fingerB, segB, handLength, flesh) * (1 - tc)
                    + skinJointRadius(fingerB, segB + 1, handLength, flesh) * tc;
                const dist = Math.hypot(pA.x - pB.x, pA.y - pB.y, pA.z - pB.z);
                const overlap = rA + rB - dist;
                if (overlap <= 0) continue;

                const fade = Math.min(
                    fingerFade(segA, sc, jointsA.length),
                    fingerFade(segB, tc, jointsB.length)
                );
                if (fade <= 0) continue;

                let delta = vsub(pA, pB);
                const along = vdot(delta, palmNormal);
                let lateral = {
                    x: delta.x - palmNormal.x * along,
                    y: delta.y - palmNormal.y * along,
                    z: delta.z - palmNormal.z * along
                };
                if (vlen(lateral) < 1e-4) {
                    lateral = vcross(palmNormal, vnorm(vsub(a1, a0)));
                }
                lateral = vnorm(lateral);
                const mag = overlap * fade * 0.65;

                if (segA !== 0) vadd(a0, lateral, mag * 0.5 * (1 - sc));
                vadd(a1, lateral, mag * 0.5 * sc);
                if (segB !== 0) vadd(b0, lateral, -mag * 0.5 * (1 - tc));
                vadd(b1, lateral, -mag * 0.5 * tc);
            }
        }
    }
}

function pointInPoly(u, v, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const yi = poly[i].v;
        const yj = poly[j].v;
        const xi = poly[i].u;
        const xj = poly[j].u;
        const intersect = ((yi > v) !== (yj > v))
            && (u < (xj - xi) * (v - yi) / ((yj - yi) || 1e-9) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function projectToPalm(point, origin, tangent, bitangent, normal) {
    const d = vsub(point, origin);
    return { u: vdot(d, tangent), v: vdot(d, bitangent), h: vdot(d, normal) };
}

function pushFingersOutOfPalm(vertices, origin, tangent, bitangent, normal, poly, handLength, flesh) {
    const palmHalf = 0.083 * handLength * flesh;
    for (let f = 0; f < SKIN_FINGERS.length; f++) {
        const finger = SKIN_FINGERS[f];
        const joints = finger.joints;
        const mcp = vertices[joints[0]];
        const tip = vertices[joints[joints.length - 1]];
        const approach = vdot(vsub(tip, mcp), normal);
        let sign = 1;
        if (Math.abs(approach) > 1) {
            sign = approach < 0 ? -1 : 1;
        } else {
            let farthest = 0;
            for (let j = 1; j < joints.length; j++) {
                const h = vdot(vsub(vertices[joints[j]], origin), normal);
                if (Math.abs(h) > Math.abs(farthest)) farthest = h;
            }
            if (Math.abs(farthest) > 1) sign = farthest < 0 ? -1 : 1;
        }

        for (let j = 1; j < joints.length; j++) {
            const vertex = vertices[joints[j]];
            const proj = projectToPalm(vertex, origin, tangent, bitangent, normal);
            if (!pointInPoly(proj.u, proj.v, poly)) continue;
            const radius = skinJointRadius(finger, j, handLength, flesh);
            const goal = sign * (palmHalf + radius);
            if (proj.h * sign < Math.abs(goal)) {
                vadd(vertex, normal, goal - proj.h);
            }
        }
    }
}

/**
 * Move overlapping finger centerlines apart in the palm plane, and lift
 * curled joints that would otherwise pass through the palm volume.
 * Knuckles stay put so the palm remains one solid.
 */
export function relaxFingerContacts(vertices, handLength, fleshScale) {
    const flesh = fleshScale || 1;
    const origin = { x: vertices[0].x, y: vertices[0].y, z: vertices[0].z };
    const indexM = { x: vertices[5].x, y: vertices[5].y, z: vertices[5].z };
    const pinkyM = { x: vertices[17].x, y: vertices[17].y, z: vertices[17].z };
    const middleM = { x: vertices[9].x, y: vertices[9].y, z: vertices[9].z };
    const rawNormal = vcross(vsub(indexM, origin), vsub(pinkyM, origin));
    const normal = vlen(rawNormal) < 1e-4 ? { x: 0, y: 0, z: 1 } : vnorm(rawNormal);
    let tangent = vsub(middleM, origin);
    const tn = vdot(tangent, normal);
    tangent = vnorm({
        x: tangent.x - normal.x * tn,
        y: tangent.y - normal.y * tn,
        z: tangent.z - normal.z * tn
    });
    const bitangent = vnorm(vcross(normal, tangent));
    const poly = [0, 5, 9, 13, 17].map(i => projectToPalm(vertices[i], origin, tangent, bitangent, normal));

    for (let iter = 0; iter < 3; iter++) {
        separateFingerPass(vertices, normal, handLength, flesh);
    }
    pushFingersOutOfPalm(vertices, origin, tangent, bitangent, normal, poly, handLength, flesh);
    for (let iter = 0; iter < 2; iter++) {
        separateFingerPass(vertices, normal, handLength, flesh);
    }
}

function fitMcGrid(mc) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    const include = (x, y, z, r) => {
        minX = Math.min(minX, x - r);
        minY = Math.min(minY, y - r);
        minZ = Math.min(minZ, z - r);
        maxX = Math.max(maxX, x + r);
        maxY = Math.max(maxY, y + r);
        maxZ = Math.max(maxZ, z + r);
    };
    for (const c of mc.capsules) {
        include(c.ax, c.ay, c.az, c.r1);
        include(c.bx, c.by, c.bz, c.r2);
    }
    for (const b of mc.boxes) {
        include(b.cx, b.cy, b.cz, Math.hypot(b.hx, b.hy, b.hz));
    }
    for (const c of mc.cylinders) {
        include(c.cx, c.cy, c.cz, Math.hypot(c.radius, c.halfHeight));
    }
    for (const h of mc.boundsHints || []) {
        if (h.minX != null) {
            minX = Math.min(minX, h.minX);
            minY = Math.min(minY, h.minY);
            minZ = Math.min(minZ, h.minZ);
            maxX = Math.max(maxX, h.maxX);
            maxY = Math.max(maxY, h.maxY);
            maxZ = Math.max(maxZ, h.maxZ);
        } else {
            include(h.x, h.y, h.z, h.r);
        }
    }
    const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
    const pad = (span / mc.resolution) * 2.5 + 1;
    minX -= pad; minY -= pad; minZ -= pad;
    maxX += pad; maxY += pad; maxZ += pad;
    mc.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    mc.scale.set(Math.max(maxX - minX, 1), Math.max(maxY - minY, 1), Math.max(maxZ - minZ, 1));
}

function addSkinCapsules(mc, vertices, handLength, flesh) {
    const palmR = 0.083 * handLength * flesh;
    const knuckleR = 0.060 * handLength * flesh;
    const palmCenter = { x: 0, y: 0, z: 0 };
    const mcpIds = [5, 9, 13, 17];
    mcpIds.forEach(id => {
        palmCenter.x += vertices[id].x;
        palmCenter.y += vertices[id].y;
        palmCenter.z += vertices[id].z;
    });
    palmCenter.x /= mcpIds.length;
    palmCenter.y /= mcpIds.length;
    palmCenter.z /= mcpIds.length;

    mc.addCapsule(vertices[0], palmCenter, palmR, palmR);
    mcpIds.forEach(id => {
        mc.addCapsule(vertices[0], vertices[id], palmR * 0.92, knuckleR);
    });
    mc.addCapsule(vertices[0], vertices[1], palmR * 0.95, knuckleR);
    [[5, 9], [9, 13], [13, 17]].forEach(([a, b]) => {
        mc.addCapsule(vertices[a], vertices[b], knuckleR * 0.85, knuckleR * 0.85);
    });
    mc.addCapsule(vertices[1], vertices[5], knuckleR * 0.7, knuckleR * 0.7);

    SKIN_FINGERS.forEach(finger => {
        for (let j = 0; j < finger.joints.length - 1; j++) {
            const r0 = skinJointRadius(finger, j, handLength, flesh);
            const r1 = skinJointRadius(finger, j + 1, handLength, flesh);
            mc.addCapsule(vertices[finger.joints[j]], vertices[finger.joints[j + 1]], r0, r1);
        }
    });
}

function addWristBaseToField(mc, vertices, settings, mmMultiplier) {
    const THREE = window.THREE;
    const wristDir = new THREE.Vector3().subVectors(vertices[0], vertices[9]);
    if (wristDir.lengthSq() < 1e-6) wristDir.set(0, -1, 0);
    wristDir.normalize();

    const wristLength = (settings.wristLength || 0.2) * mmMultiplier;
    const wristEnd = vertices[0].clone().add(wristDir.clone().multiplyScalar(wristLength));
    const wristRadius = Math.max(8, vertices[5].distanceTo(vertices[17]) * 0.28);
    mc.addCapsule(vertices[0], wristEnd, wristRadius, wristRadius * 0.92);

    const baseWidth = (settings.baseWidth || 0.5) * mmMultiplier * 1.5;
    const baseHeight = (settings.baseHeight || 0.05) * mmMultiplier * 0.8;
    const basePosition = wristEnd.clone().add(wristDir.clone().multiplyScalar(baseHeight / 2));
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), wristDir);
    if (settings.baseShape === 'box') {
        mc.addBox(basePosition, q, baseWidth / 2, baseHeight / 2, baseWidth / 2);
    } else {
        mc.addCylinder(basePosition, q, baseWidth / 2, baseHeight / 2);
    }
}

export function generateSkinGeometry(vertices, settings, mmMultiplier) {
    const handLength = Math.max(
        longestFingerArc(vertices),
        (settings.targetHeightMM || 150) * 0.45
    );
    const flesh = Math.max(0.5, Math.min(1.8, settings.metaballSize ?? settings.fleshScale ?? 1));
    relaxFingerContacts(vertices, handLength, flesh);

    const exportRes = Math.max(24, Math.min(80, settings.metaballResolution || 64));
    const resolution = settings.skinQuality === 'export' ? exportRes : Math.min(40, exportRes);
    const mc = new MarchingCubes(resolution);
    mc.isolation = 0;
    addSkinCapsules(mc, vertices, handLength, flesh);
    const pedestal = layoutPrintPedestal(vertices, handLength);
    mc.boundsHints = pedestal.hints;
    mc.afterField = () => {
        const chamfer = Math.max(12, Math.min(18, handLength * 0.1));
        mc.applySupportSlopes(pedestal.cone.y0, chamfer);
        mc.paintCone(pedestal.cone);
    };
    fitMcGrid(mc);
    const geometry = mc.generateBufferGeometry();
    return geometry && geometry.attributes?.position?.count > 0 ? [geometry] : [];
}

function layoutPrintPedestal(vertices, handLength) {
    const wrist = vertices[0];
    const palmSpan = Math.hypot(vertices[5].x - vertices[17].x, vertices[5].z - vertices[17].z);
    const topRadius = Math.max(palmSpan * 0.55, handLength * 0.2, 16);
    const height = Math.max(14, handLength * 0.1);
    const bottomRadius = topRadius + height * 0.8;
    const top = wrist.y - Math.max(4, handLength * 0.025);
    const bottom = top - height;
    const cx = wrist.x;
    const cz = wrist.z;
    const margin = 5;
    return {
        hints: [{
            minX: cx - bottomRadius - margin,
            maxX: cx + bottomRadius + margin,
            minY: bottom - margin,
            maxY: top + margin,
            minZ: cz - bottomRadius - margin,
            maxZ: cz + bottomRadius + margin
        }],
        cone: {
            cx, cz,
            y0: bottom,
            y1: top,
            r0: bottomRadius,
            r1: Math.max(12, topRadius * 0.82)
        }
    };
}

export function generateWristAndBaseGeometry(vertices, settings, mmMultiplier) {
    const THREE = window.THREE;
    const wristGeometries = [];

    const wristDir = new THREE.Vector3().subVectors(vertices[0], vertices[9]).normalize();
    const wristLength = (settings.wristLength || 0.2) * mmMultiplier;
    const wristStart = vertices[0].clone();
    const wristEnd = wristStart.clone().add(wristDir.clone().multiplyScalar(wristLength));
    const wristRadius = Math.max(5, vertices[5].distanceTo(vertices[17]) * 0.35);

    wristGeometries.push(createCylinderBetweenPoints(wristStart, wristEnd, wristRadius));

    const baseWidth = (settings.baseWidth || 0.5) * mmMultiplier * 1.5;
    const baseHeight = (settings.baseHeight || 0.05) * mmMultiplier * 0.8;
    let baseGeom;

    if (settings.baseShape === 'box') {
        baseGeom = new THREE.BoxGeometry(baseWidth, baseHeight, baseWidth);
    } else {
        baseGeom = new THREE.CylinderGeometry(baseWidth / 2, baseWidth / 2, baseHeight, 32);
    }

    const basePosition = wristEnd.clone().add(wristDir.clone().multiplyScalar(baseHeight / 2));
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), wristDir);
    baseGeom.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q).setPosition(basePosition));
    baseGeom.deleteAttribute('uv');
    wristGeometries.push(baseGeom);

    return wristGeometries;
}

export function createCylinderBetweenPoints(p1, p2, radius) {
    const THREE = window.THREE;
    const length = p1.distanceTo(p2);
    if (length < 0.001) return new THREE.BufferGeometry();

    const cyl = new THREE.CylinderGeometry(radius, radius, length, 14);
    const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    cyl.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q).setPosition(mid));
    cyl.deleteAttribute('uv');
    return cyl;
}
