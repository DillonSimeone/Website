// Exporter module for Sheet-to-Tube Cylinder Cap Configurator
import { context, params } from './state.js';
import {
    generateCapGeometry,
    generateBracketGeometry,
    generateMotorHolderGeometry,
    generateRingGearGeometry,
    generatePinionGearGeometry,
    generateConnectorGeometry
} from './geometry.js';

// Generic helper to export a Manifold geometry as binary STL
export function exportManifoldSTL(manifoldGeom, filename) {
    const mesh = manifoldGeom.getMesh();
    manifoldGeom.delete();

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

// STL Export: Compile watertight binary STL for caps
export function exportSTL() {
    if (!context.Manifold) return;

    const w_in = params.sheetWidthInches;
    const h_in = params.sheetHeightInches;
    const t_mm = params.sheetThickness;

    let L_mm;
    if (params.rollDirection === 'width') {
        L_mm = w_in * 25.4;
    } else {
        L_mm = h_in * 25.4;
    }

    const D_mid = L_mm / Math.PI;
    const D_out = D_mid + t_mm;
    const D_in = D_mid - t_mm;

    // Helper to download single STL
    const downloadCap = (hasSlipRing, nameSuffix, isTop) => {
        const cap = generateCapGeometry(D_in, D_out, hasSlipRing, isTop);
        if (!cap) return;

        const mesh = cap.getMesh();
        cap.delete();

        const totalTriangles = mesh.triVerts.length / 3;
        const buffer = new ArrayBuffer(84 + totalTriangles * 50);
        const view = new DataView(buffer);

        const headerStr = `Cylinder Cap (${nameSuffix}) - Generated via Antigravity CAD (2026)`;
        for (let i = 0; i < Math.min(80, headerStr.length); i++) {
            view.setUint8(i, headerStr.charCodeAt(i));
        }

        view.setUint32(80, totalTriangles, true);

        let offset = 84;
        const getVert = (idx) => {
            return [
                mesh.vertProperties[idx * 3],
                mesh.vertProperties[idx * 3 + 1],
                mesh.vertProperties[idx * 3 + 2]
            ];
        };

        for (let i = 0; i < totalTriangles; i++) {
            const i0 = mesh.triVerts[i * 3];
            const i1 = mesh.triVerts[i * 3 + 1];
            const i2 = mesh.triVerts[i * 3 + 2];

            const v0 = getVert(i0);
            const v1 = getVert(i1);
            const v2 = getVert(i2);

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
        link.download = `cylinder_cap_${nameSuffix}_roll_${params.rollDirection}_w_${w_in.toFixed(2)}_h_${h_in.toFixed(2)}.stl`;
        link.click();
    };

    const hasSlipRingBottom = params.slipRing === 'bottom' || params.slipRing === 'both';
    const hasSlipRingTop = params.slipRing === 'top' || params.slipRing === 'both';

    if (params.slipRing === 'bottom' || params.slipRing === 'top' || params.bracketCount > 0) {
        // Caps are asymmetric, download both
        downloadCap(hasSlipRingBottom, "bottom_cap", false);
        setTimeout(() => {
            downloadCap(hasSlipRingTop, "top_cap", true);
        }, 300);
    } else {
        // Caps are symmetric (either both have slip ring or neither, and no brackets)
        downloadCap(hasSlipRingBottom, params.slipRing === 'both' ? "with_slipring" : "standard", false);
    }
}

// STL Export: Compile single C-shaped bracket
export function exportBracketSTL() {
    if (!context.Manifold) return;

    const w_in = params.sheetWidthInches;
    const h_in = params.sheetHeightInches;
    const t_mm = params.sheetThickness;
    const L_mm = params.rollDirection === 'width' ? w_in * 25.4 : h_in * 25.4;
    const tubeHeight_mm = params.rollDirection === 'width' ? h_in * 25.4 : w_in * 25.4;
    const D_mid = L_mm / Math.PI;
    const D_out = D_mid + t_mm;

    const bracket = generateBracketGeometry(D_out, tubeHeight_mm);
    if (!bracket) return;

    const mesh = bracket.getMesh();
    bracket.delete();

    const totalTriangles = mesh.triVerts.length / 3;
    const buffer = new ArrayBuffer(84 + totalTriangles * 50);
    const view = new DataView(buffer);

    const headerStr = "Cylinder Seam Bracket - Generated via Antigravity CAD (2026)";
    for (let i = 0; i < Math.min(80, headerStr.length); i++) {
        view.setUint8(i, headerStr.charCodeAt(i));
    }

    view.setUint32(80, totalTriangles, true);

    let offset = 84;
    const getVert = (idx) => {
        return [
            mesh.vertProperties[idx * 3],
            mesh.vertProperties[idx * 3 + 1],
            mesh.vertProperties[idx * 3 + 2]
        ];
    };

    for (let i = 0; i < totalTriangles; i++) {
        const i0 = mesh.triVerts[i * 3];
        const i1 = mesh.triVerts[i * 3 + 1];
        const i2 = mesh.triVerts[i * 3 + 2];

        const v0 = getVert(i0);
        const v1 = getVert(i1);
        const v2 = getVert(i2);

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
    link.download = `cylinder_seam_bracket_roll_${params.rollDirection}_w_${w_in.toFixed(2)}_h_${h_in.toFixed(2)}.stl`;
    link.click();
}

// STL Export: Motor Holder
export function exportMotorHolderSTL() {
    if (!context.Manifold) return;

    const L_mm = params.rollDirection === 'width' ? params.sheetWidthInches * 25.4 : params.sheetHeightInches * 25.4;
    const D_mid = L_mm / Math.PI;
    const D_out = D_mid + params.sheetThickness;
    const D_in = D_mid - params.sheetThickness;

    const holder = generateMotorHolderGeometry(D_in, D_out);
    if (!holder) return;

    exportManifoldSTL(holder, `motor_holder_type130.stl`);
}

// STL Export: Ring Gear
export function exportRingGearSTL() {
    if (!context.Manifold) return;

    const L_mm = params.rollDirection === 'width' ? params.sheetWidthInches * 25.4 : params.sheetHeightInches * 25.4;
    const D_mid = L_mm / Math.PI;
    const D_out = D_mid + params.sheetThickness;

    const ring = generateRingGearGeometry(D_out);
    if (!ring) return;

    exportManifoldSTL(ring, `ring_gear_d_${D_out.toFixed(0)}mm.stl`);
}

// STL Export: Pinion Gear
export function exportPinionGearSTL() {
    if (!context.Manifold) return;

    const pinion = generatePinionGearGeometry();
    if (!pinion) return;

    exportManifoldSTL(pinion, `pinion_gear_${params.motorWheelDiam.toFixed(0)}mm.stl`);
}

// STL Export: Connector Sleeve
export function exportConnectorSTL() {
    const L_mm = params.rollDirection === 'width' ? params.sheetWidthInches * 25.4 : params.sheetHeightInches * 25.4;
    const D_mid = L_mm / Math.PI;
    const D_out = D_mid + params.sheetThickness;
    const D_in = D_mid - params.sheetThickness;

    const connector = generateConnectorGeometry(D_in, D_out);
    if (!connector) return;

    exportManifoldSTL(connector, `connector_sleeve_13mm.stl`);
}

// STL Export: Export all active printable parts in a packed grid layout
export function exportAllSTL() {
    if (!context.Manifold) return;

    const w_in = params.sheetWidthInches;
    const h_in = params.sheetHeightInches;
    const t_mm = params.sheetThickness;

    let L_mm, tubeHeight_mm;
    if (params.rollDirection === 'width') {
        L_mm = w_in * 25.4;
        tubeHeight_mm = h_in * 25.4;
    } else {
        L_mm = h_in * 25.4;
        tubeHeight_mm = w_in * 25.4;
    }

    const D_mid = L_mm / Math.PI;
    const D_out = D_mid + t_mm;
    const D_in = D_mid - t_mm;

    const hasSlipRingBottom = params.slipRing === 'bottom' || params.slipRing === 'both';
    const hasSlipRingTop = params.slipRing === 'top' || params.slipRing === 'both';

    // Helper to lay a manifold flat on the Z=0 bed and center it in XY
    const layFlatAndGetDimensions = (manifoldGeom) => {
        const mesh = manifoldGeom.getMesh();
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        const numVerts = mesh.vertProperties.length / 3;
        for (let i = 0; i < numVerts; i++) {
            const x = mesh.vertProperties[i * 3];
            const y = mesh.vertProperties[i * 3 + 1];
            const z = mesh.vertProperties[i * 3 + 2];
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
        }

        const sizeX = maxX - minX;
        const sizeY = maxY - minY;
        const sizeZ = maxZ - minZ;

        const tx = -(minX + maxX) / 2;
        const ty = -(minY + maxY) / 2;
        const tz = -minZ;

        const positionedGeom = manifoldGeom.translate([tx, ty, tz]);
        manifoldGeom.delete();

        return {
            geom: positionedGeom,
            width: sizeX,
            height: sizeY,
            depth: sizeZ
        };
    };

    const itemsToProcess = [];

    const addGeometryItem = (geom, rotateY = 0) => {
        if (!geom) return;
        let orientedGeom = geom;
        if (rotateY !== 0) {
            orientedGeom = geom.rotate([0, rotateY, 0]);
            geom.delete();
        }
        const processed = layFlatAndGetDimensions(orientedGeom);
        itemsToProcess.push(processed);
    };

    // 1. Bottom Cap
    addGeometryItem(generateCapGeometry(D_in, D_out, hasSlipRingBottom, false));

    // 2. Top Cap
    addGeometryItem(generateCapGeometry(D_in, D_out, hasSlipRingTop, true));

    // 3. Brackets
    if (params.bracketCount > 0) {
        for (let i = 0; i < params.bracketCount; i++) {
            addGeometryItem(generateBracketGeometry(D_out, tubeHeight_mm), 90);
        }
    }

    // 4. Bottom Slip Ring Parts
    if (hasSlipRingBottom) {
        addGeometryItem(generateMotorHolderGeometry(D_in, D_out));
        addGeometryItem(generateRingGearGeometry(D_out));
        addGeometryItem(generatePinionGearGeometry());
        addGeometryItem(generatePinionGearGeometry());
        addGeometryItem(generateConnectorGeometry(D_in, D_out));
    }

    // 5. Top Slip Ring Parts
    if (hasSlipRingTop) {
        addGeometryItem(generateMotorHolderGeometry(D_in, D_out));
        addGeometryItem(generateRingGearGeometry(D_out));
        addGeometryItem(generatePinionGearGeometry());
        addGeometryItem(generatePinionGearGeometry());
        addGeometryItem(generateConnectorGeometry(D_in, D_out));
    }

    if (itemsToProcess.length === 0) return;

    // Pack items into a grid layout
    let currentX = 0;
    let currentY = 0;
    let maxRowHeightInCurrentRow = 0;
    const padding = 10.0;
    const maxRowWidth = 220.0; // typical printer bed width (e.g. 220mm)

    const packedGeoms = [];
    
    for (let item of itemsToProcess) {
        // If adding this item exceeds maxRowWidth, wrap to next row
        if (currentX + item.width > maxRowWidth && currentX > 0) {
            currentX = 0;
            currentY += maxRowHeightInCurrentRow + padding;
            maxRowHeightInCurrentRow = 0;
        }
        
        // Translate to layout position
        const tx = currentX + item.width / 2;
        const ty = currentY + item.height / 2;
        
        const translatedGeom = item.geom.translate([tx, ty, 0]);
        packedGeoms.push(translatedGeom);
        
        currentX += item.width + padding;
        if (item.height > maxRowHeightInCurrentRow) {
            maxRowHeightInCurrentRow = item.height;
        }
        item.geom.delete();
    }

    // Union all packed geometries into one single Manifold
    let finalManifold = packedGeoms[0];
    for (let i = 1; i < packedGeoms.length; i++) {
        let temp = finalManifold.add(packedGeoms[i]);
        finalManifold.delete();
        packedGeoms[i].delete();
        finalManifold = temp;
    }

    // Center the final merged STL around X=0, Y=0
    const finalMesh = finalManifold.getMesh();
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    const numVerts = finalMesh.vertProperties.length / 3;
    for (let i = 0; i < numVerts; i++) {
        const x = finalMesh.vertProperties[i * 3];
        const y = finalMesh.vertProperties[i * 3 + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    const finalTx = -(minX + maxX) / 2;
    const finalTy = -(minY + maxY) / 2;

    let centeredManifold = finalManifold.translate([finalTx, finalTy, 0]);
    finalManifold.delete();

    // Export centered manifold
    exportManifoldSTL(centeredManifold, `all_printable_parts_packed.stl`);
}
