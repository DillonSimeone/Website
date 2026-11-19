/**
 * shared/terrain.js — Shared Procedural Landscape Elevation & Raycast Grounding
 *
 * Provides identical mathematical terrain elevation in JavaScript and GLSL
 * across the racing engine, road generation, physics, trees, and GPU grass,
 * plus terrain raycasting helpers for camera/object grounding.
 */
import * as THREE from 'three';

const _rayOrigin = new THREE.Vector3();
const _rayDown = new THREE.Vector3(0, -1, 0);

/**
 * Deterministic terrain offset for a given numeric seed.
 * Seed 0 keeps the canonical origin (0, 0) used by default tracks and tests.
 */
export function getTerrainOffsetForSeed(seed = 0) {
    if (!seed) return { x: 0, z: 0 };
    const x = Math.sin(seed * 12.9898) * 1800.0;
    const z = Math.cos(seed * 78.233) * 1800.0;
    return { x, z };
}

/**
 * Shared procedural terrain height function.
 * Matches GLSL_TERRAIN_HEIGHT exactly.
 */
export function getTerrainHeight(x, z, relief = 1.0, offsetX = 0.0, offsetZ = 0.0) {
    const px = x + offsetX;
    const pz = z + offsetZ;
    const swell = Math.sin(px * 0.007 + 0.5) * Math.cos(pz * 0.007 + 0.3) * 11.0;
    const hill = Math.sin(px * 0.016 - pz * 0.012) * 4.5 + Math.cos(px * 0.012 + pz * 0.018) * 3.5;
    const knoll = Math.sin(px * 0.038 + pz * 0.032) * 1.2;
    return (swell + hill + knoll) * relief;
}

/**
 * Finite-difference terrain surface normal at (x, z).
 */
export function getTerrainNormal(x, z, relief = 1.0, target = new THREE.Vector3(), offsetX = 0.0, offsetZ = 0.0) {
    const eps = 0.8;
    const hL = getTerrainHeight(x - eps, z, relief, offsetX, offsetZ);
    const hR = getTerrainHeight(x + eps, z, relief, offsetX, offsetZ);
    const hD = getTerrainHeight(x, z - eps, relief, offsetX, offsetZ);
    const hU = getTerrainHeight(x, z + eps, relief, offsetX, offsetZ);
    return target.set(-(hR - hL) / (2.0 * eps), 1.0, -(hU - hD) / (2.0 * eps)).normalize();
}

/**
 * Builds a deterministic height function bound to a seed and relief scale.
 */
export function createProceduralHeightFn(seed = 0, relief = 1.0) {
    const { x: offsetX, z: offsetZ } = getTerrainOffsetForSeed(seed);
    const fn = (x, z) => getTerrainHeight(x, z, relief, offsetX, offsetZ);
    fn.seed = seed;
    fn.relief = relief;
    fn.offsetX = offsetX;
    fn.offsetZ = offsetZ;
    return fn;
}

/**
 * Raycasts straight down from (x, maxSkyY, z) onto terrainMesh to guarantee
 * above-ground heights even when terrain geometry is randomized or sculpted.
 */
export function raycastGroundHeight(
    raycaster,
    terrainMesh,
    x,
    z,
    fallbackRelief = 1.0,
    maxSkyY = 600.0,
    offsetX = 0.0,
    offsetZ = 0.0
) {
    if (raycaster && terrainMesh) {
        _rayOrigin.set(x, maxSkyY, z);
        raycaster.set(_rayOrigin, _rayDown);
        const hits = raycaster.intersectObject(terrainMesh, false);
        if (hits && hits.length > 0) {
            return { hit: true, y: hits[0].point.y, point: hits[0].point };
        }
    }
    return {
        hit: false,
        y: getTerrainHeight(x, z, fallbackRelief, offsetX, offsetZ),
        point: null
    };
}

export const GLSL_TERRAIN_HEIGHT = `
float getTerrainHeight(vec2 p) {
    float swell = sin(p.x * 0.007 + 0.5) * cos(p.y * 0.007 + 0.3) * 11.0;
    float hill = sin(p.x * 0.016 - p.y * 0.012) * 4.5 + cos(p.x * 0.012 + p.y * 0.018) * 3.5;
    float knoll = sin(p.x * 0.038 + p.y * 0.032) * 1.2;
    return swell + hill + knoll;
}
`;
