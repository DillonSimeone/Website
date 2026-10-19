// Binary and ASCII STL exporter module for 19-DeafDoorbellEnclosures (v2.0)
import { context, params } from './state.js';
import {
    buildMasterBase,
    buildMasterLid,
    buildFollowerBase,
    buildFollowerLid,
    buildFollowerGrid,
    buildFollowerStand,
    buildFullPlate
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

    const header = `DeafDoorbell - ${filename}`;
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
        case 'master_base':
            geom = buildMasterBase(M, params);
            filename = `Master_Enclosure_Base.stl`;
            break;
        case 'master_lid':
            geom = buildMasterLid(M, params);
            filename = `Master_Enclosure_Clamp_Lid.stl`;
            break;
        case 'follower_base':
            geom = buildFollowerBase(M, params);
            filename = `Follower_Enclosure_Base.stl`;
            break;
        case 'follower_lid':
            geom = buildFollowerLid(M, params);
            filename = `Follower_Enclosure_Clamp_Lid.stl`;
            break;
        case 'follower_grid':
            geom = buildFollowerGrid(M, params);
            filename = `Follower_Diffuser_Grid_8x8.stl`;
            break;
        case 'follower_stand':
            geom = buildFollowerStand(M, params);
            filename = `Follower_Desk_Stand.stl`;
            break;
        case 'all_plate':
            geom = buildFullPlate(M, params);
            filename = `DeafDoorbell_Complete_Print_Plate.stl`;
            break;
    }

    if (geom) {
        exportManifoldToBinarySTL(geom, filename);
        geom.delete();
    }
}
