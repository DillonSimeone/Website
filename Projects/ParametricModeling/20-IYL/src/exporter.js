// Binary STL Exporter module for 20-IYL (Pedestal with Retaining Lip + Drop-In Lid + Universal Sled)
import { context, params } from './state.js';
import { buildBasePedestal, buildTopLid, buildPedestal, buildSled } from './geometry.js';

export function exportManifoldToBinarySTL(manifoldGeom, filename) {
    if (!manifoldGeom) {
        console.error("No manifold geometry provided to export.");
        return;
    }
    const mesh = manifoldGeom.getMesh();
    const totalTriangles = mesh.triVerts.length / 3;
    const buffer = new ArrayBuffer(84 + totalTriangles * 50);
    const view = new DataView(buffer);

    const header = `20-IYL Pedestal Studio - ${filename}`;
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

        // Face Normal
        view.setFloat32(offset, 0, true);
        view.setFloat32(offset + 4, 0, true);
        view.setFloat32(offset + 8, 0, true);

        // Vertex 1
        view.setFloat32(offset + 12, v0[0], true);
        view.setFloat32(offset + 16, v0[1], true);
        view.setFloat32(offset + 20, v0[2], true);

        // Vertex 2
        view.setFloat32(offset + 24, v1[0], true);
        view.setFloat32(offset + 28, v1[1], true);
        view.setFloat32(offset + 32, v1[2], true);

        // Vertex 3
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

export function exportBaseSTL() {
    if (!context.Manifold) return;
    const baseManifold = buildBasePedestal(context.Manifold, params);
    const filename = `ILY_Base_Pedestal_${params.style}_${Math.round(params.height)}mm.stl`;
    exportManifoldToBinarySTL(baseManifold, filename);
}

export function exportLidSTL() {
    if (!context.Manifold) return;
    const lidManifold = buildTopLid(context.Manifold, params);
    const filename = `ILY_DropIn_Top_Lid_${params.style}.stl`;
    exportManifoldToBinarySTL(lidManifold, filename);
}

export function exportPedestalSTL() {
    if (!context.Manifold) return;
    const pedManifold = buildPedestal(context.Manifold, params);
    const filename = `ILY_Pedestal_Combined_${params.style}_${Math.round(params.height)}mm.stl`;
    exportManifoldToBinarySTL(pedManifold, filename);
}

export function exportSledSTL() {
    if (!context.Manifold) return;
    const sledManifold = buildSled(context.Manifold);
    const filename = `ILY_Universal_Electronics_Sled_ESP32C3.stl`;
    exportManifoldToBinarySTL(sledManifold, filename);
}

export function exportAssemblySTL() {
    if (!context.Manifold) return;
    const M = context.Manifold;
    const pedManifold = buildPedestal(M, params);
    const sledManifold = buildSled(M);
    const combined = pedManifold.add(sledManifold);
    const filename = `ILY_Pedestal_Complete_Assembly_${params.style}.stl`;
    exportManifoldToBinarySTL(combined, filename);
}
