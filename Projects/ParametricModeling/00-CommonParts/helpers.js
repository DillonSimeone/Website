// Reusable CAD Geometry Math Helpers
import * as THREE from 'three';

export function makeCylinder(M, r, h, facets = 32, center = true) {
    if (!M) return null;
    return M.cylinder(h, r, r, facets, center);
}

export function makeBox(M, w, d, h, center = true) {
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
