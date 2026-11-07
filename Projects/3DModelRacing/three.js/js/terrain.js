/**
 * terrain.js — Shared Procedural Landscape Elevation
 * 
 * Provides an identical mathematical terrain height function in both JavaScript
 * and GLSL shader code for zero-discrepancy elevation across road generation,
 * vehicle suspension physics, tree placement, and GPU grass placement.
 */

export function getTerrainHeight(x, z) {
    // 1. Broad rolling swells (plains and valley waves)
    const swell = Math.sin(x * 0.007 + 0.5) * Math.cos(z * 0.007 + 0.3) * 11.0;
    // 2. Rolling hills and natural ridges
    const hill = Math.sin(x * 0.016 - z * 0.012) * 4.5 + Math.cos(x * 0.012 + z * 0.018) * 3.5;
    // 3. Subtle micro knolls
    const knoll = Math.sin(x * 0.038 + z * 0.032) * 1.2;
    return swell + hill + knoll;
}

export const GLSL_TERRAIN_HEIGHT = `
float getTerrainHeight(vec2 p) {
    float swell = sin(p.x * 0.007 + 0.5) * cos(p.y * 0.007 + 0.3) * 11.0;
    float hill = sin(p.x * 0.016 - p.y * 0.012) * 4.5 + cos(p.x * 0.012 + p.y * 0.018) * 3.5;
    float knoll = sin(p.x * 0.038 + p.y * 0.032) * 1.2;
    return swell + hill + knoll;
}
`;
