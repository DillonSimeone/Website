// Binary STL exporter module for 21-HypercubeFrame (v2.0 Monocoque Zero-Overhang)
import { context, params } from './state.js';
import {
    buildHypercubeFrame,
    buildCornerStand,
    buildFullPrintPlate
} from './geometry.js';

export function exportManifoldToBinarySTL(manifoldGeom, filename) {
    if (!manifoldGeom) {
        console.error("No manifold geometry provided to export.");
        return;
    }
    const mesh = manifoldGeom.getMesh();
    const totalTriangles = mesh.triVerts.length / 3;
    const buffer = new ArrayBuffer(84 + totalTriangles * 50);
    const view = new DataView(buffer);

    const header = `21-HypercubeFrame v2.0 - ${filename}`;
    for (let i = 0; i < Math.min(80, header.length); i++) {
        view.setUint8(i, header.charCodeAt(i));
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
    URL.revokeObjectURL(link.href);
}

export function triggerExport(componentName) {
    const M = context.Manifold;
    if (!M) return;

    let geom = null;
    let filename = '';

    switch (componentName) {
        case 'cube_frame':
            geom = buildHypercubeFrame(M, params);
            filename = `Hypercube_64LED_ZeroOverhang_Frame_v2.stl`;
            break;
        case 'corner_stand':
            geom = buildCornerStand(M, params);
            filename = `Hypercube_Corner_Wire_Stand_v2.stl`;
            break;
        case 'all_plate':
            geom = buildFullPrintPlate(M, params);
            filename = `Hypercube_Complete_BambuA1_Plate_v2.stl`;
            break;
    }

    if (geom) {
        exportManifoldToBinarySTL(geom, filename);
        geom.delete();
    }
}
