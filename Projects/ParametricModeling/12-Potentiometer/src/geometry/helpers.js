// CAD Geometry Math Helpers using Manifold WASM
import * as THREE from 'three';
import { context } from '../state.js';

export function makeCylinder(r, h, facets = 32, center = true) {
    const M = context.Manifold;
    if (!M) return null;
    return M.cylinder(h, r, r, facets, center);
}

export function makeBox(w, d, h, center = true) {
    const M = context.Manifold;
    if (!M) return null;
    return M.cube([w, d, h], center);
}

// Convert a Manifold mesh object to a Three.js BufferGeometry
export function manifoldToThree(manifoldMesh) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(manifoldMesh.vertProperties, 3));
    geometry.setIndex(new THREE.Uint32BufferAttribute(manifoldMesh.triVerts, 1));
    geometry.computeVertexNormals();
    return geometry;
}
