// Main orchestrator module for 18-PowerSupplyWallMount
import * as THREE from 'three';
import { context, params, visibilities, meshes, colors } from './state.js';
import { initViewport, animate } from './viewport.js';
import { initManifold } from './manifoldInit.js';
import { setupUIListeners, updateLeaderLines } from './ui.js';
import {
    generateBracketGeometry,
    manifoldToThree
} from './geometry.js';
import { createPSUThreeGroup } from './psuModel.js';

export function rebuild() {
    if (!context.mainGroup || !context.Manifold) return;

    // 1. Dispose old meshes
    if (meshes.bracket) {
        context.mainGroup.remove(meshes.bracket);
        meshes.bracket.geometry.dispose();
        meshes.bracket = null;
    }
    if (meshes.psu) {
        context.mainGroup.remove(meshes.psu);
        meshes.psu = null;
    }

    const isBlueprint = params.renderMode === 'blueprint';
    const matOpacity = params.opacity / 100;

    const getBracketMaterial = (hexColor) => {
        if (isBlueprint) {
            return new THREE.MeshBasicMaterial({
                color: hexColor,
                wireframe: true,
                transparent: matOpacity < 1,
                opacity: matOpacity
            });
        }
        return new THREE.MeshPhysicalMaterial({
            color: hexColor,
            metalness: 0.15,
            roughness: 0.25,
            clearcoat: 0.85,
            clearcoatRoughness: 0.1,
            transparent: true,
            opacity: matOpacity,
            side: THREE.DoubleSide
        });
    };

    // 2. Generate U-Bracket with Front Bridge
    if (visibilities.bracket) {
        const bracketGeom = generateBracketGeometry();
        if (bracketGeom) {
            const threeGeom = manifoldToThree(bracketGeom.getMesh());
            bracketGeom.delete();
            meshes.bracket = new THREE.Mesh(threeGeom, getBracketMaterial(colors.neonCyan));
            meshes.bracket.castShadow = true;
            meshes.bracket.receiveShadow = true;
            context.mainGroup.add(meshes.bracket);
        }
    }

    // 3. Generate PSU Mockup (visual fit reference)
    if (visibilities.psu) {
        meshes.psu = createPSUThreeGroup();
        context.mainGroup.add(meshes.psu);
    }

    updateLeaderLines();
}

document.addEventListener('DOMContentLoaded', () => {
    initViewport(updateLeaderLines);
    setupUIListeners(rebuild);
    initManifold(
        () => {
            rebuild();
        },
        animate
    );
});
