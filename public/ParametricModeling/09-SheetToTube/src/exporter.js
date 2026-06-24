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
    if (!context.Manifold) return;

    const L_mm = params.rollDirection === 'width' ? params.sheetWidthInches * 25.4 : params.sheetHeightInches * 25.4;
    const D_mid = L_mm / Math.PI;
    const D_out = D_mid + params.sheetThickness;
    const D_in = D_mid - params.sheetThickness;

    const connector = generateConnectorGeometry(D_in, D_out);
    if (!connector) return;

    exportManifoldSTL(connector, `connector_sleeve_13mm.stl`);
}
