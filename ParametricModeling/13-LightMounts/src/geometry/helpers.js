// Geometry helpers for 13-LightMounts Configurator
import * as THREE from 'three';
import { context } from '../state.js';

export function makeCSGCylinder(r, h, x=0, y=0, z=0, rotX=0, rotY=0, rotZ=0) {
    const Manifold = context.Manifold;
    // Manifold cylinder is centered on Z axis by default
    let cyl = Manifold.cylinder(h, r, r, 32, true);
    
    // Apply rotations
    if (rotX !== 0 || rotY !== 0 || rotZ !== 0) {
        // Rotations are in degrees
        let rotated = cyl.rotate([rotX, rotY, rotZ]);
        cyl.delete();
        cyl = rotated;
    }
    
    // Apply translations
    if (x !== 0 || y !== 0 || z !== 0) {
        let translated = cyl.translate([x, y, z]);
        cyl.delete();
        cyl = translated;
    }
    return cyl;
}

export function makeCSGBox(w, d, h, x=0, y=0, z=0) {
    const Manifold = context.Manifold;
    // Manifold cube takes size as array [x, y, z] and boolean for centering
    let box = Manifold.cube([w, d, h], true);
    
    if (x !== 0 || y !== 0 || z !== 0) {
        let translated = box.translate([x, y, z]);
        box.delete();
        box = translated;
    }
    return box;
}

export function manifoldToThree(manifoldMesh) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(manifoldMesh.vertProperties, 3));
    geometry.setIndex(new THREE.Uint32BufferAttribute(manifoldMesh.triVerts, 1));
    geometry.computeVertexNormals();
    return geometry;
}

export function threeToManifold(geometry) {
    const Manifold = context.Manifold;
    if (!Manifold) return null;
    
    const posAttr = geometry.attributes.position;
    if (!posAttr) return null;
    
    const vertProperties = new Float32Array(posAttr.array);
    
    let triVerts;
    if (geometry.index) {
        triVerts = new Uint32Array(geometry.index.array);
    } else {
        const numVerts = posAttr.count;
        triVerts = new Uint32Array(numVerts);
        for (let i = 0; i < numVerts; i++) {
            triVerts[i] = i;
        }
    }
    
    const mesh = {
        vertProperties: vertProperties,
        triVerts: triVerts,
        numProp: 3
    };
    
    return new Manifold(mesh);
}
