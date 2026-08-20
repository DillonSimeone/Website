// STL Exporter — Compiled single-file binary STL compiler with flat print bed arrangement
import { context, params } from './state.js';
import { generateLightFrameGeometry } from './geometry/lightFrame.js';
import { generateHingeConnectorGeometry } from './geometry/hingeConnector.js';
import { generateWallPlateGeometry } from './geometry/wallPlate.js';
import { generateBoltGeometry, generateNutGeometry } from './geometry/boltNut.js';

function exportManifoldSTL(manifold, filename) {
    if (!manifold) return;
    const mesh = manifold.getMesh();
    const triCount = mesh.triVerts.length / 3;
    
    const buffer = new ArrayBuffer(84 + triCount * 50);
    const view = new DataView(buffer);
    
    // Header
    const headerStr = "Parametric Part - Antigravity CAD (2026)";
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

export function exportLightFrameSTL() {
    const geom = generateLightFrameGeometry();
    if (geom) {
        exportManifoldSTL(geom, "Modified_Light_Frame.stl");
        geom.delete();
    }
}

export function exportHingeConnectorSTL() {
    const geom = generateHingeConnectorGeometry();
    if (geom) {
        exportManifoldSTL(geom, "Hinge_Connector.stl");
        geom.delete();
    }
}

export function exportWallPlateSTL() {
    const geom = generateWallPlateGeometry();
    if (geom) {
        exportManifoldSTL(geom, "Wall_Plate.stl");
        geom.delete();
    }
}

export function exportBoltSTL() {
    const geom = generateBoltGeometry();
    if (geom) {
        exportManifoldSTL(geom, "Hinge_Pin_Bolt.stl");
        geom.delete();
    }
}

export function exportNutSTL() {
    const geom = generateNutGeometry();
    if (geom) {
        exportManifoldSTL(geom, "Hinge_Pin_Nut.stl");
        geom.delete();
    }
}

// Helper to center a geometry at (0,0,0), rotate, and place flat on Z=0 bed at target coordinates
function centerAndFlatten(geom, targetX, targetY, rotX = 0, rotY = 0, rotZ = 0) {
    if (!geom) return null;
    
    const mesh = geom.getMesh();
    let minX = 999999, maxX = -999999;
    let minY = 999999, maxY = -999999;
    let minZ = 999999, maxZ = -999999;
    
    const len = mesh.vertProperties.length;
    for (let i = 0; i < len; i += 3) {
        const x = mesh.vertProperties[i];
        const y = mesh.vertProperties[i + 1];
        const z = mesh.vertProperties[i + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    
    let centered = geom.translate([-cx, -cy, -cz]);
    
    let rotated = centered;
    if (rotX !== 0 || rotY !== 0 || rotZ !== 0) {
        rotated = centered.rotate([rotX, rotY, rotZ]);
        centered.delete();
    }
    
    const rMesh = rotated.getMesh();
    let rMinZ = 999999;
    const rLen = rMesh.vertProperties.length;
    for (let i = 2; i < rLen; i += 3) {
        if (rMesh.vertProperties[i] < rMinZ) rMinZ = rMesh.vertProperties[i];
    }
    
    let finalGeom = rotated.translate([targetX, targetY, -rMinZ]);
    rotated.delete();
    
    return finalGeom;
}

export function exportAllSTLs() {
    if (!context.rawStlGeometry) return;
    
    // 1. Determine original STL Z-min to align it flat on bed
    const rawGeom = context.rawStlGeometry;
    const rawPositions = rawGeom.attributes.position.array;
    const rawIndices = rawGeom.index ? rawGeom.index.array : null;
    const rawTriangles = rawIndices ? (rawIndices.length / 3) : (rawPositions.length / 9);
    
    let minZ = 999999;
    for (let i = 2; i < rawPositions.length; i += 3) {
        if (rawPositions[i] < minZ) minZ = rawPositions[i];
    }
    const frameDx = -85.0;
    const frameDy = 0.0;
    const frameDz = -minZ;
    
    // 2. Generate and layout all additional manifolds on the print bed
    const knuckleGeomRaw = generateLightFrameGeometry();
    let knuckleGeom = null;
    if (knuckleGeomRaw) {
        knuckleGeom = knuckleGeomRaw.translate([frameDx, frameDy, frameDz]);
        knuckleGeomRaw.delete();
    }
    
    // Hinge Connector: Lay flat on its side (rotate Y by 90) and center at (X=0, Y=0, Z=0)
    const connGeomRaw = generateHingeConnectorGeometry();
    let connGeom = centerAndFlatten(connGeomRaw, 0.0, 0.0, 0, 90, 0);
    if (connGeomRaw) connGeomRaw.delete();
    
    // Wall Plate: Lay flat on its back (rotate X by 90) and place at (X=85, Y=0, Z=0)
    const plateGeomRaw = generateWallPlateGeometry();
    let plateGeom = centerAndFlatten(plateGeomRaw, 85.0, 0.0, 90, 0, 0);
    if (plateGeomRaw) plateGeomRaw.delete();
    
    // Bolt: Stand vertically on its head (rotate Y by 90) and place at (X=-40, Y=70, Z=0)
    const boltGeomRaw = generateBoltGeometry();
    let boltGeom = centerAndFlatten(boltGeomRaw, -40.0, 70.0, 0, 90, 0);
    if (boltGeomRaw) boltGeomRaw.delete();
    
    // Nut: Lay flat on its face (rotate Y by 90) and place at (X=40, Y=70, Z=0)
    const nutGeomRaw = generateNutGeometry();
    let nutGeom = centerAndFlatten(nutGeomRaw, 40.0, 70.0, 0, 90, 0);
    if (nutGeomRaw) nutGeomRaw.delete();
    
    const knuckleMesh = knuckleGeom ? knuckleGeom.getMesh() : null;
    const connMesh = connGeom ? connGeom.getMesh() : null;
    const plateMesh = plateGeom ? plateGeom.getMesh() : null;
    const boltMesh = boltGeom ? boltGeom.getMesh() : null;
    const nutMesh = nutGeom ? nutGeom.getMesh() : null;
    
    // Calculate total triangles
    let totalTriangles = rawTriangles;
    if (knuckleMesh) totalTriangles += knuckleMesh.triVerts.length / 3;
    if (connMesh) totalTriangles += connMesh.triVerts.length / 3;
    if (plateMesh) totalTriangles += plateMesh.triVerts.length / 3;
    if (boltMesh) totalTriangles += boltMesh.triVerts.length / 3;
    if (nutMesh) totalTriangles += nutMesh.triVerts.length / 3;
    
    const buffer = new ArrayBuffer(84 + totalTriangles * 50);
    const view = new DataView(buffer);
    
    const headerStr = "Combined Plated Light Mount Assembly - Antigravity CAD (2026)";
    for (let i = 0; i < Math.min(80, headerStr.length); i++) {
        view.setUint8(i, headerStr.charCodeAt(i));
    }
    
    view.setUint32(80, totalTriangles, true);
    let offset = 84;
    
    // Helper to write a Manifold mesh into the buffer view
    const writeMesh = (mesh) => {
        if (!mesh) return;
        const triCount = mesh.triVerts.length / 3;
        const getVert = (idx) => [
            mesh.vertProperties[idx * 3],
            mesh.vertProperties[idx * 3 + 1],
            mesh.vertProperties[idx * 3 + 2]
        ];
        
        for (let i = 0; i < triCount; i++) {
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
    };
    
    // 1. Write original STL triangles translated to bed position
    if (rawIndices) {
        for (let i = 0; i < rawTriangles; i++) {
            const i0 = rawIndices[i * 3] * 3;
            const i1 = rawIndices[i * 3 + 1] * 3;
            const i2 = rawIndices[i * 3 + 2] * 3;
            
            view.setFloat32(offset, 0, true);
            view.setFloat32(offset + 4, 0, true);
            view.setFloat32(offset + 8, 0, true);
            
            view.setFloat32(offset + 12, rawPositions[i0] + frameDx, true);
            view.setFloat32(offset + 16, rawPositions[i0 + 1] + frameDy, true);
            view.setFloat32(offset + 20, rawPositions[i0 + 2] + frameDz, true);
            
            view.setFloat32(offset + 24, rawPositions[i1] + frameDx, true);
            view.setFloat32(offset + 28, rawPositions[i1 + 1] + frameDy, true);
            view.setFloat32(offset + 32, rawPositions[i1 + 2] + frameDz, true);
            
            view.setFloat32(offset + 36, rawPositions[i2] + frameDx, true);
            view.setFloat32(offset + 40, rawPositions[i2 + 1] + frameDy, true);
            view.setFloat32(offset + 44, rawPositions[i2 + 2] + frameDz, true);
            
            view.setUint16(offset + 48, 0, true);
            offset += 50;
        }
    } else {
        for (let i = 0; i < rawTriangles; i++) {
            const idx = i * 9;
            view.setFloat32(offset, 0, true);
            view.setFloat32(offset + 4, 0, true);
            view.setFloat32(offset + 8, 0, true);
            
            view.setFloat32(offset + 12, rawPositions[idx] + frameDx, true);
            view.setFloat32(offset + 16, rawPositions[idx + 1] + frameDy, true);
            view.setFloat32(offset + 20, rawPositions[idx + 2] + frameDz, true);
            
            view.setFloat32(offset + 24, rawPositions[idx + 3] + frameDx, true);
            view.setFloat32(offset + 28, rawPositions[idx + 4] + frameDy, true);
            view.setFloat32(offset + 32, rawPositions[idx + 5] + frameDz, true);
            
            view.setFloat32(offset + 36, rawPositions[idx + 6] + frameDx, true);
            view.setFloat32(offset + 40, rawPositions[idx + 7] + frameDy, true);
            view.setFloat32(offset + 44, rawPositions[idx + 8] + frameDz, true);
            
            view.setUint16(offset + 48, 0, true);
            offset += 50;
        }
    }
    
    // 2. Write other parts (already translated/rotated)
    writeMesh(knuckleMesh);
    writeMesh(connMesh);
    writeMesh(plateMesh);
    writeMesh(boltMesh);
    writeMesh(nutMesh);
    
    // Cleanup Manifolds
    if (knuckleGeom) knuckleGeom.delete();
    if (connGeom) connGeom.delete();
    if (plateGeom) plateGeom.delete();
    if (boltGeom) boltGeom.delete();
    if (nutGeom)  nutGeom.delete();
    
    // Trigger download
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = "Light_Mount_Assembly.stl";
    link.click();
}
