// STL Exporter for 14-Hook
import { context } from './state.js';
import { generateHookGeometry, generateBarGeometry } from './geometry.js';

function exportManifoldSTL(manifold, filename) {
    if (!manifold) return;
    const mesh = manifold.getMesh();
    const triCount = mesh.triVerts.length / 3;
    
    const buffer = new ArrayBuffer(84 + triCount * 50);
    const view = new DataView(buffer);
    
    // Header
    const headerStr = "Parametric Hook Part - Antigravity CAD (2026)";
    for (let i = 0; i < Math.min(80, headerStr.length); i++) {
        view.setUint8(i, headerStr.charCodeAt(i));
    }
    
    // Number of triangles
    view.setUint32(80, triCount, true);
    
    let offset = 84;
    const getVert = (idx) => [
        mesh.vertProperties[idx * 3],
        mesh.vertProperties[idx * 3 + 1],
        mesh.vertProperties[idx * 3 + 2]
    ];
    
    for (let i = 0; i < triCount; i++) {
        const v0 = getVert(mesh.triVerts[i * 3]);
        const v1 = getVert(mesh.triVerts[i * 3 + 1]);
        const v2 = getVert(mesh.triVerts[i * 3 + 2]);
        
        // Normal placeholder
        view.setFloat32(offset, 0, true);
        view.setFloat32(offset + 4, 0, true);
        view.setFloat32(offset + 8, 0, true);
        
        view.setFloat32(offset + 12, v0[0], true);
        view.setFloat32(offset + 16, v0[1], true);
        view.setFloat32(offset + 20, v0[2], true);
        
        view.setFloat32(offset + 24, v1[0], true);
        view.setFloat32(offset + 28, v1[1], true);
        view.setFloat32(offset + 32, v1[2], true);
        
        view.setFloat32(offset + 36, v2[0], true);
        view.setFloat32(offset + 40, v2[1], true);
        view.setFloat32(offset + 44, v2[2], true);
        
        view.setUint16(offset + 48, 0, true);
        offset += 50;
    }
    
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

export function exportHookSTL() {
    const geom = generateHookGeometry();
    if (geom) {
        exportManifoldSTL(geom, "Wall_Hook.stl");
        geom.delete();
    }
}

export function exportBarSTL() {
    const geom = generateBarGeometry();
    if (geom) {
        exportManifoldSTL(geom, "Metal_Bar.stl");
        geom.delete();
    }
}
