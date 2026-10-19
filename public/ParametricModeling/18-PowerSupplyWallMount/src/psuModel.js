// PSU Phantom Mockup module for 18-PowerSupplyWallMount (ALITOVE S-300-5)
// Orientation: Inserted cable/terminal side facing UPWARD out of the open top.
import * as THREE from 'three';
import { context, params, colors } from './state.js';
import { makeCSGBox } from './geometry.js';

export function createPSUThreeGroup() {
    const group = new THREE.Group();

    const pw = params.psuWidth;
    const pd = params.psuDepth;
    const pl = params.psuLength;
    const bt = params.backplateThickness;
    const flT = params.floorThickness;

    const psuCenterY = bt + pd / 2;
    const psuCenterZ = flT + pl / 2;

    // Materials
    const chassisMat = new THREE.MeshPhysicalMaterial({
        color: colors.psuChassis,
        metalness: 0.85,
        roughness: 0.35,
        clearcoat: 0.3,
        transparent: true,
        opacity: 0.80
    });

    const fanInteriorMat = new THREE.MeshBasicMaterial({
        color: 0x0a1017
    });

    const fanHubMat = new THREE.MeshStandardMaterial({
        color: 0x1e2733,
        metalness: 0.5,
        roughness: 0.5
    });

    const ringMat = new THREE.MeshStandardMaterial({
        color: 0x3d4a5c,
        metalness: 0.8,
        roughness: 0.3
    });

    const terminalBlockMat = new THREE.MeshStandardMaterial({
        color: colors.terminalPlastic,
        roughness: 0.7
    });

    const terminalFlapMat = new THREE.MeshPhysicalMaterial({
        color: colors.terminalFlapYellow,
        transmission: 0.7,
        transparent: true,
        opacity: 0.75,
        roughness: 0.2
    });

    const screwMat = new THREE.MeshStandardMaterial({
        color: colors.terminalScrew,
        metalness: 0.9,
        roughness: 0.2
    });

    const wireMat = new THREE.MeshStandardMaterial({
        color: 0x00ff88,
        metalness: 0.2,
        roughness: 0.5
    });

    // 1. Main Sheet Metal Chassis Box (resting on the solid flat floor at Z = flT)
    const chassisGeom = new THREE.BoxGeometry(pw, pd, pl);
    const chassisMesh = new THREE.Mesh(chassisGeom, chassisMat);
    chassisMesh.position.set(0, psuCenterY, psuCenterZ);
    group.add(chassisMesh);

    // 2. Flush Cooling Fan Grille on Front Face
    const fanZ = flT + pl * 0.35;
    const fanRadius = 28.0;
    const fanFrontY = bt + pd;

    // Flush circular fan disc
    const cavityGeom = new THREE.CircleGeometry(fanRadius, 32);
    const cavityMesh = new THREE.Mesh(cavityGeom, fanInteriorMat);
    cavityMesh.position.set(0, fanFrontY + 0.1, fanZ);
    group.add(cavityMesh);

    // Center fan hub
    const hubGeom = new THREE.CircleGeometry(11.0, 24);
    const hubMesh = new THREE.Mesh(hubGeom, fanHubMat);
    hubMesh.position.set(0, fanFrontY + 0.2, fanZ);
    group.add(hubMesh);

    // Concentric wire grille rings
    for (let r of [16.0, 22.0, 27.5]) {
        const ringGeom = new THREE.RingGeometry(r - 0.7, r + 0.7, 32);
        const ringMesh = new THREE.Mesh(ringGeom, ringMat);
        ringMesh.position.set(0, fanFrontY + 0.25, fanZ);
        group.add(ringMesh);
    }

    // 3. Stamped Diagonal Airflow Louvers on Front Face
    for (let l = 0; l < 5; l++) {
        const lZ = flT + pl * 0.60 + l * 5.0;
        const louverGeom = new THREE.PlaneGeometry(pw * 0.42, 1.8);
        const louverMesh = new THREE.Mesh(louverGeom, fanInteriorMat);
        louverMesh.position.set(0, fanFrontY + 0.15, lZ);
        group.add(louverMesh);
    }

    // 4. 9-Position Terminal Strip at TOP FACE (Facing UPWARD)
    const termW = pw * 0.82;
    const termH = 22.0;
    const termD = 18.0;
    const termY = bt + pd - termD / 2;
    const termZ = flT + pl - termH / 2;

    const termBodyGeom = new THREE.BoxGeometry(termW, termD, termH);
    const termBodyMesh = new THREE.Mesh(termBodyGeom, terminalBlockMat);
    termBodyMesh.position.set(0, termY, termZ);
    group.add(termBodyMesh);

    // Yellow protective hinged cover flap (at top of terminal block)
    const flapGeom = new THREE.BoxGeometry(termW + 2.0, termD + 2.0, 2.0);
    const flapMesh = new THREE.Mesh(flapGeom, terminalFlapMat);
    flapMesh.position.set(0, termY, flT + pl + 1.0);
    group.add(flapMesh);

    // 9 Screw Terminals (Facing upward)
    const screwPitch = (termW - 14.0) / 8;
    for (let s = 0; s < 9; s++) {
        const sx = -termW / 2 + 7.0 + s * screwPitch;
        const sGeom = new THREE.CylinderGeometry(2.5, 2.5, 3.5, 16);
        const sMesh = new THREE.Mesh(sGeom, screwMat);
        sMesh.position.set(sx, termY, flT + pl);
        group.add(sMesh);

        // Indicative wire leads exiting upward from the terminal strip
        if (s === 0 || s === 1 || s === 3 || s === 6) {
            const wireGeom = new THREE.CylinderGeometry(1.5, 1.5, 30.0, 8);
            const wireMesh = new THREE.Mesh(wireGeom, wireMat);
            wireMesh.position.set(sx, termY, flT + pl + 15.0);
            group.add(wireMesh);
        }
    }

    return group;
}

export function generatePSUGeometry() {
    const Manifold = context.Manifold;
    if (!Manifold) return null;

    const pw = params.psuWidth;
    const pd = params.psuDepth;
    const pl = params.psuLength;
    const bt = params.backplateThickness;
    const flT = params.floorThickness;

    const psuCenterY = bt + pd / 2;
    const psuCenterZ = flT + pl / 2;

    let chassis = makeCSGBox(pw, pd, pl, 0, psuCenterY, psuCenterZ);
    const termW = pw * 0.82;
    const termH = 22.0;
    const termD = 18.0;
    const termY = bt + pd - termD / 2;
    let terminal = makeCSGBox(termW, termD, termH, 0, termY, flT + pl - termH / 2);

    let psu = chassis.add(terminal);
    chassis.delete();
    terminal.delete();

    return psu;
}
