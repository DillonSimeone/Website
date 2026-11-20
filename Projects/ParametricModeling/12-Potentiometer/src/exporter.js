// Exporter module for Parametric Potentiometer Box
import { generateEnclosureGeometry } from './geometry.js';

// Generic helper to export a Manifold geometry as binary STL
export function exportManifoldSTL(manifoldGeom, filename) {
    if (!manifoldGeom) {
        console.error("No geometry to export");
        return;
    }
    const mesh = manifoldGeom.getMesh();

    const totalTriangles = mesh.triVerts.length / 3;
    const buffer = new ArrayBuffer(84 + totalTriangles * 50);
    const view = new DataView(buffer);

    const headerStr = `${filename} - Generated via Antigravity CAD (2026)`;
    for (let i = 0; i < Math.min(80, headerStr.length); i++) {
        view.setUint8(i, headerStr.charCodeAt(i));
    }

    view.setUint32(80, totalTriangles, true);

    let offset = 84;
    const getVert = (idx) => [
        mesh.vertProperties[idx * 3],
        mesh.vertProperties[idx * 3 + 1],
        mesh.vertProperties[idx * 3 + 2]
    ];

    for (let i = 0; i < totalTriangles; i++) {
        const v0 = getVert(mesh.triVerts[i * 3]);
        const v1 = getVert(mesh.triVerts[i * 3 + 1]);
        const v2 = getVert(mesh.triVerts[i * 3 + 2]);

        // Normal vector placeholder (0, 0, 0)
        view.setFloat32(offset, 0, true);
        view.setFloat32(offset + 4, 0, true);
        view.setFloat32(offset + 8, 0, true);

        // Vertices
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
    
    // Clean up
    URL.revokeObjectURL(link.href);
}

// Triggers the base geometry generation (without exploded translation) and exports it
export function exportBaseSTL() {
    const geom = generateEnclosureGeometry();
    if (geom && geom.base) {
        // Base is at Z=0, export directly
        exportManifoldSTL(geom.base, 'potentiometer_box_base.stl');
        // Clean up remaining geometries
        if (geom.lid) geom.lid.delete();
    }
}

// Triggers the lid geometry generation (without exploded translation) and exports it
export function exportLidSTL() {
    // Generate with exploded = 0.0 temporary to ensure it is in the home position for printing
    const backupExploded = window.paramsExplodedBackup || 0;
    
    const geom = generateEnclosureGeometry();
    if (geom && geom.lid) {
        // Translate back to Z = 0 if exploded is active
        const geomMesh = geom.lid;
        exportManifoldSTL(geomMesh, 'potentiometer_box_lid.stl');
        if (geom.base) geom.base.delete();
    }
}
