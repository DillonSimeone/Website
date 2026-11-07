import * as THREE from 'three';
import { context } from '../state.js';

export function makeCSGCylinder(r, h, x, y, z) {
    const Manifold = context.Manifold;
    let cyl = Manifold.cylinder(h, r, r, 64, true);
    if (x !== 0 || y !== 0 || z !== 0) {
        let translated = cyl.translate([x, y, z]);
        cyl.delete();
        cyl = translated;
    }
    return cyl;
}

export function manifoldToThree(manifoldMesh) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(manifoldMesh.vertProperties, 3));
    geometry.setIndex(new THREE.Uint32BufferAttribute(manifoldMesh.triVerts, 1));
    geometry.computeVertexNormals();
    return geometry;
}
