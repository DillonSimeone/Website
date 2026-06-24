// Main orchestrator module for Sheet-to-Tube Cylinder Cap Configurator
import * as THREE from 'three';
import { context, params, visibilities, meshes, colors } from './state.js';
import { initViewport, animate } from './viewport.js';
import { initManifold } from './manifoldInit.js';
import { setupUIListeners, updateLeaderLines } from './ui.js';
import {
    generateCapGeometry,
    generateBracketGeometry,
    generateMotorHolderGeometry,
    generateRingGearGeometry,
    generatePinionGearGeometry,
    generateConnectorGeometry,
    manifoldToThree
} from './geometry.js';

// Rebuild the 3D Viewport representation
export function rebuild() {
    // Clear old meshes
    if (meshes.bottomCap) {
        context.mainGroup.remove(meshes.bottomCap);
        meshes.bottomCap.geometry.dispose();
        meshes.bottomCap = null;
    }
    if (meshes.topCap) {
        context.mainGroup.remove(meshes.topCap);
        meshes.topCap.geometry.dispose();
        meshes.topCap = null;
    }
    if (meshes.sheet) {
        context.mainGroup.remove(meshes.sheet);
        meshes.sheet.geometry.dispose();
        meshes.sheet = null;
    }
    if (meshes.motorHolder) {
        context.mainGroup.remove(meshes.motorHolder);
        meshes.motorHolder.geometry.dispose();
        meshes.motorHolder = null;
    }
    if (meshes.pinionGear) {
        context.mainGroup.remove(meshes.pinionGear);
        meshes.pinionGear.geometry.dispose();
        meshes.pinionGear = null;
    }
    if (meshes.pinionGear2) {
        context.mainGroup.remove(meshes.pinionGear2);
        meshes.pinionGear2.geometry.dispose();
        meshes.pinionGear2 = null;
    }
    if (meshes.ringGear) {
        context.mainGroup.remove(meshes.ringGear);
        meshes.ringGear.geometry.dispose();
        meshes.ringGear = null;
    }
    if (meshes.connector) {
        context.mainGroup.remove(meshes.connector);
        meshes.connector.geometry.dispose();
        meshes.connector = null;
    }

    if (!context.Manifold) return;

    const hasSlipRingBottom = params.slipRing === 'bottom' || params.slipRing === 'both';
    const hasSlipRingTop = params.slipRing === 'top' || params.slipRing === 'both';

    // 1. Perform Math calculations
    const w_in = params.sheetWidthInches;
    const h_in = params.sheetHeightInches;
    const t_mm = params.sheetThickness;

    // Wrapping dimension L in mm
    let L_mm, tubeHeight_mm;
    if (params.rollDirection === 'width') {
        L_mm = w_in * 25.4;
        tubeHeight_mm = h_in * 25.4;
    } else {
        L_mm = h_in * 25.4;
        tubeHeight_mm = w_in * 25.4;
    }

    // Dynamic roll button label updates
    const lblWidth = document.getElementById('label-rollWidth');
    if (lblWidth) lblWidth.innerText = `ROLL WIDTH (${w_in.toFixed(2)}")`;
    const lblHeight = document.getElementById('label-rollHeight');
    if (lblHeight) lblHeight.innerText = `ROLL HEIGHT (${h_in.toFixed(2)}")`;

    // Midline (neutral axis), Outer, Inner Diameters
    const D_mid = L_mm / Math.PI;
    const D_out = D_mid + t_mm;
    const D_in = D_mid - t_mm;

    // Cap design dimensions
    const c = params.tolerance;
    const T_cap = params.wallThick;
    const R_g_out = (D_out / 2) + c;
    const R_g_in = (D_in / 2) - c;
    const R_cap_out = R_g_out + T_cap;
    const R_cap_in = Math.max(0.1, R_g_in - T_cap);

    // Limit maximum center hole size to prevent self-intersection of cap
    const maxHoleDiam = Math.max(0, R_cap_in * 2 - 1.0);
    const holeSlider = document.getElementById('input-holeDiam');
    if (holeSlider) {
        holeSlider.max = Math.ceil(maxHoleDiam);
        if (params.holeDiam > maxHoleDiam) {
            params.holeDiam = Math.min(params.holeDiam, maxHoleDiam);
            const valEl = document.getElementById('val-holeDiam');
            if (valEl) valEl.innerText = params.holeDiam.toFixed(1);
            holeSlider.value = params.holeDiam;
        }
    }

    // 2. Update Spec sheets in UI
    document.getElementById('spec-circumference').innerText = `${L_mm.toFixed(2)} mm (${(L_mm / 25.4).toFixed(3)}")`;
    document.getElementById('spec-dmid').innerText = `${D_mid.toFixed(2)} mm (${(D_mid / 25.4).toFixed(3)}")`;
    document.getElementById('spec-dout').innerText = `${D_out.toFixed(2)} mm (${(D_out / 25.4).toFixed(3)}")`;
    document.getElementById('spec-din').innerText = `${D_in.toFixed(2)} mm (${(D_in / 25.4).toFixed(3)}")`;
    document.getElementById('spec-height').innerText = `${tubeHeight_mm.toFixed(2)} mm (${(tubeHeight_mm / 25.4).toFixed(3)}")`;
    document.getElementById('spec-cap-od').innerText = `${(R_cap_out * 2).toFixed(2)} mm`;

    // 3. Materials
    let bodyMat, lineColor;
    if (params.mode === 'rendered') {
        bodyMat = new THREE.MeshPhysicalMaterial({
            color: colors.cyanIce,
            emissive: 0x001a22,
            roughness: 0.1,
            metalness: 0.1,
            transmission: 0.75,
            thickness: T_cap,
            clearcoat: 1.0,
            clearcoatRoughness: 0.1,
            transparent: true,
            opacity: params.opacity / 100,
            side: THREE.DoubleSide
        });
        lineColor = 0xffffff;
    } else {
        bodyMat = new THREE.MeshBasicMaterial({
            color: colors.blueprintFace,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
        });
        lineColor = colors.blueprintLine;
    }

    // 4. Generate & Render Bottom Cap
    if (visibilities.bottomCap) {
        const bottomCapGeom = generateCapGeometry(D_in, D_out, hasSlipRingBottom, false);
        if (bottomCapGeom) {
            const bCapMesh = bottomCapGeom.getMesh();
            const bCapThreeGeom = manifoldToThree(bCapMesh);
            bottomCapGeom.delete();

            meshes.bottomCap = new THREE.Mesh(bCapThreeGeom, bodyMat);
            meshes.bottomCap.castShadow = true;
            meshes.bottomCap.receiveShadow = true;

            if (params.mode === 'blueprint') {
                const edges = new THREE.EdgesGeometry(bCapThreeGeom);
                const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: lineColor, linewidth: 1.5 }));
                meshes.bottomCap.add(lines);
            }
            context.mainGroup.add(meshes.bottomCap);
        }
    }

    // 5. Generate & Render Top Cap (translated to the top of the cylinder and flipped)
    if (visibilities.topCap) {
        const topCapGeom = generateCapGeometry(D_in, D_out, hasSlipRingTop, true);
        if (topCapGeom) {
            const tCapMesh = topCapGeom.getMesh();
            const tCapThreeGeom = manifoldToThree(tCapMesh);
            topCapGeom.delete();

            meshes.topCap = new THREE.Mesh(tCapThreeGeom, bodyMat);
            meshes.topCap.castShadow = true;
            meshes.topCap.receiveShadow = true;

            // Rotate 180 degrees around X-axis so it faces down
            meshes.topCap.rotation.x = Math.PI;
            // Translate Z to top position (Z-up in CAD coords)
            meshes.topCap.position.z = tubeHeight_mm + 2 * T_cap;

            if (params.mode === 'blueprint') {
                const edges = new THREE.EdgesGeometry(tCapThreeGeom);
                const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: lineColor, linewidth: 1.5 }));
                meshes.topCap.add(lines);
            }
            context.mainGroup.add(meshes.topCap);
        }
    }

    // 6. Generate & Render Rolled Sheet (Semi-transparent cyan Cylinder)
    if (visibilities.sheet) {
        // Tube geometry: outer cylinder + inner cylinder.
        // It starts at Z = T_cap and ends at Z = T_cap + tubeHeight_mm.
        const sheetGeom = new THREE.CylinderGeometry(D_out/2, D_out/2, tubeHeight_mm, 64, 1, true);
        sheetGeom.rotateX(Math.PI/2); // Align with Z-axis
        
        const sheetMaterial = new THREE.MeshPhysicalMaterial({
            color: colors.sheetBlue,
            roughness: 0.2,
            metalness: 0.1,
            transmission: 0.8,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });

        meshes.sheet = new THREE.Mesh(sheetGeom, sheetMaterial);
        // Translate along Z so it sits perfectly in the bottom cap groove
        meshes.sheet.position.z = T_cap + tubeHeight_mm / 2;

        if (params.mode === 'blueprint') {
            const edges = new THREE.EdgesGeometry(sheetGeom);
            const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: colors.limeAccent, linewidth: 1.0 }));
            meshes.sheet.add(lines);
        }

        context.mainGroup.add(meshes.sheet);
    }

    // Clear old brackets meshes from 3D scene
    for (let m of meshes.brackets) {
        context.mainGroup.remove(m);
        m.geometry.dispose();
    }
    meshes.brackets = [];

    // 7. Generate & Render Brackets (C-shaped side fasteners)
    if (visibilities.brackets && params.bracketCount > 0) {
        const bracketGeom = generateBracketGeometry(D_out, tubeHeight_mm);
        if (bracketGeom) {
            const bMesh = bracketGeom.getMesh();
            const bThreeGeom = manifoldToThree(bMesh);
            bracketGeom.delete();

            let bracketMat, bLineColor;
            if (params.mode === 'rendered') {
                bracketMat = new THREE.MeshPhysicalMaterial({
                    color: colors.limeAccent,
                    emissive: 0x1a2200,
                    roughness: 0.2,
                    metalness: 0.3,
                    transmission: 0.4,
                    thickness: 3.0,
                    transparent: true,
                    opacity: params.opacity / 100,
                    side: THREE.DoubleSide
                });
                bLineColor = 0xffffff;
            } else {
                bracketMat = new THREE.MeshBasicMaterial({
                    color: 0x121c01,
                    transparent: true,
                    opacity: 0.7,
                    side: THREE.DoubleSide
                });
                bLineColor = colors.limeAccent;
            }

            const count = params.bracketCount;
            const offsetAngle = params.ledCount > 0 ? (Math.PI / params.ledCount) : 0;

            for (let j = 0; j < count; j++) {
                const theta = (j * 2 * Math.PI) / count + offsetAngle;
                const mesh = new THREE.Mesh(bThreeGeom, bracketMat);
                mesh.castShadow = true;
                mesh.receiveShadow = true;

                // Rotate around Z axis to match cap tabs position
                mesh.rotation.z = theta;

                if (params.mode === 'blueprint') {
                    const edges = new THREE.EdgesGeometry(bThreeGeom);
                    const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: bLineColor, linewidth: 1.5 }));
                    mesh.add(lines);
                }

                context.mainGroup.add(mesh);
                meshes.brackets.push(mesh);
            }
        }
    }

    // 8. Generate & Render Gear Drive System (only when slip ring is active)
    const slipRingActive = params.slipRing !== 'none';
    if (slipRingActive && visibilities.motorHolder) {
        // 8a. Motor Holder (below bottom cap, flipped)
        const holderGeom = generateMotorHolderGeometry(D_in, D_out);
        if (holderGeom) {
            const hMesh = holderGeom.getMesh();
            const hThreeGeom = manifoldToThree(hMesh);
            holderGeom.delete();

            let holderMat;
            if (params.mode === 'rendered') {
                holderMat = new THREE.MeshPhysicalMaterial({
                    color: 0xff6600,
                    emissive: 0x220800,
                    roughness: 0.3,
                    metalness: 0.4,
                    transmission: 0.2,
                    thickness: 3.0,
                    transparent: true,
                    opacity: params.opacity / 100,
                    side: THREE.DoubleSide
                });
            } else {
                holderMat = new THREE.MeshBasicMaterial({
                    color: 0x1c0c01,
                    transparent: true,
                    opacity: 0.7,
                    side: THREE.DoubleSide
                });
            }

            meshes.motorHolder = new THREE.Mesh(hThreeGeom, holderMat);
            meshes.motorHolder.castShadow = true;
            meshes.motorHolder.receiveShadow = true;
            meshes.motorHolder.rotation.x = Math.PI;
            meshes.motorHolder.position.z = -9.0;

            if (params.mode === 'blueprint') {
                const edges = new THREE.EdgesGeometry(hThreeGeom);
                const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xff6600, linewidth: 1.5 }));
                meshes.motorHolder.add(lines);
            }
            context.mainGroup.add(meshes.motorHolder);
        }

        // 8b. Ring Gear (friction-fit around bottom cap, below cap lip)
        const ringGeom = generateRingGearGeometry(D_out);
        if (ringGeom) {
            const rMesh = ringGeom.getMesh();
            const rThreeGeom = manifoldToThree(rMesh);
            ringGeom.delete();

            let ringMat;
            if (params.mode === 'rendered') {
                ringMat = new THREE.MeshPhysicalMaterial({
                    color: 0xffcc00,
                    emissive: 0x221a00,
                    roughness: 0.25,
                    metalness: 0.5,
                    transparent: true,
                    opacity: params.opacity / 100,
                    side: THREE.DoubleSide
                });
            } else {
                ringMat = new THREE.MeshBasicMaterial({
                    color: 0x1c1800,
                    transparent: true,
                    opacity: 0.7,
                    side: THREE.DoubleSide
                });
            }

            meshes.ringGear = new THREE.Mesh(rThreeGeom, ringMat);
            meshes.ringGear.castShadow = true;
            meshes.ringGear.receiveShadow = true;
            meshes.ringGear.position.z = -3.0;

            if (params.mode === 'blueprint') {
                const edges = new THREE.EdgesGeometry(rThreeGeom);
                const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffcc00, linewidth: 1.5 }));
                meshes.ringGear.add(lines);
            }
            context.mainGroup.add(meshes.ringGear);
        }

        // 8c. Pinion Gear (on motor shaft, meshes with ring gear)
        const pinionGeom = generatePinionGearGeometry();
        if (pinionGeom) {
            const pMesh = pinionGeom.getMesh();
            const pThreeGeom = manifoldToThree(pMesh);
            pinionGeom.delete();

            let pinionMat;
            if (params.mode === 'rendered') {
                pinionMat = new THREE.MeshPhysicalMaterial({
                    color: 0xff00ff,
                    emissive: 0x220022,
                    roughness: 0.15,
                    metalness: 0.5,
                    transparent: true,
                    opacity: params.opacity / 100,
                    side: THREE.DoubleSide
                });
            } else {
                pinionMat = new THREE.MeshBasicMaterial({
                    color: 0x1c001c,
                    transparent: true,
                    opacity: 0.7,
                    side: THREE.DoubleSide
                });
            }

            meshes.pinionGear = new THREE.Mesh(pThreeGeom, pinionMat);
            meshes.pinionGear.castShadow = true;
            meshes.pinionGear.receiveShadow = true;

            meshes.pinionGear2 = new THREE.Mesh(pThreeGeom, pinionMat);
            meshes.pinionGear2.castShadow = true;
            meshes.pinionGear2.receiveShadow = true;

            // Calculate precise positioning based on gear parameters
            const ringInnerR = R_cap_out + 1.0;
            const ringBodyOuterR = ringInnerR + 6.0;
            const ringCenterR = ringBodyOuterR - 3.0;

            // Rotate pinions so their shafts align horizontally with the radial direction (X-axis)
            meshes.pinionGear.rotation.y = Math.PI / 2;
            meshes.pinionGear2.rotation.y = -Math.PI / 2;

            // Place pinions so they mesh with the bottom of the crown gear at ringCenterR and global Z = -13.0
            meshes.pinionGear.position.set(ringCenterR, 0, -13.0);
            meshes.pinionGear2.position.set(-ringCenterR, 0, -13.0);

            if (params.mode === 'blueprint') {
                const edges = new THREE.EdgesGeometry(pThreeGeom);
                const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xff00ff, linewidth: 1.5 }));
                meshes.pinionGear.add(lines);

                const lines2 = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xff00ff, linewidth: 1.5 }));
                meshes.pinionGear2.add(lines2);
            }
            context.mainGroup.add(meshes.pinionGear);
            context.mainGroup.add(meshes.pinionGear2);
        }

        // 8d. Standalone Connector Sleeve (Neon Green)
        if (hasSlipRingBottom) {
            const connectorGeom = generateConnectorGeometry(D_in, D_out);
            if (connectorGeom) {
                const cMesh = connectorGeom.getMesh();
                const cThreeGeom = manifoldToThree(cMesh);
                connectorGeom.delete();

                let connectorMat;
                if (params.mode === 'rendered') {
                    connectorMat = new THREE.MeshPhysicalMaterial({
                        color: colors.limeAccent,
                        emissive: 0x1a2200,
                        roughness: 0.2,
                        metalness: 0.3,
                        transmission: 0.4,
                        thickness: 3.0,
                        transparent: true,
                        opacity: params.opacity / 100,
                        side: THREE.DoubleSide
                    });
                } else {
                    connectorMat = new THREE.MeshBasicMaterial({
                        color: 0x121c01,
                        transparent: true,
                        opacity: 0.7,
                        side: THREE.DoubleSide
                    });
                }

                meshes.connector = new THREE.Mesh(cThreeGeom, connectorMat);
                meshes.connector.castShadow = true;
                meshes.connector.receiveShadow = true;
                meshes.connector.position.z = 0.0;

                if (params.mode === 'blueprint') {
                    const edges = new THREE.EdgesGeometry(cThreeGeom);
                    const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: colors.limeAccent, linewidth: 1.5 }));
                    meshes.connector.add(lines);
                }
                context.mainGroup.add(meshes.connector);
            }
        }
    }
}

// Bootstrap
function main() {
    initViewport(updateLeaderLines);
    setupUIListeners(rebuild);
    initManifold(rebuild, animate);
}

main();
