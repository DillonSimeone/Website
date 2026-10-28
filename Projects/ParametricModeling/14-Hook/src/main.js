// Main orchestrator module for 14-Hook Configurator
import * as THREE from 'three';
import { context, params, visibilities, meshes, colors } from './state.js';
import { initViewport, animate } from './viewport.js';
import { initManifold } from './manifoldInit.js';
import { setupUIListeners, updateLeaderLines } from './ui.js';
import {
    generateHookGeometry,
    generateBarGeometry,
    manifoldToThree
} from './geometry.js';

// Rebuild the 3D representation
export function rebuild() {
    // Clear old meshes
    if (meshes.hook) {
        context.mainGroup.remove(meshes.hook);
        meshes.hook.geometry.dispose();
        meshes.hook = null;
    }
    if (meshes.bar) {
        context.mainGroup.remove(meshes.bar);
        meshes.bar.geometry.dispose();
        meshes.bar = null;
    }

    const isBlueprint = params.mode === 'blueprint';
    const matOpacity = params.opacity / 100;

    const getMaterial = (hexColor, wireframe = false) => {
        if (isBlueprint) {
            return new THREE.MeshBasicMaterial({
                color: hexColor,
                wireframe: wireframe || true,
                transparent: matOpacity < 1,
                opacity: matOpacity
            });
        } else {
            return new THREE.MeshPhysicalMaterial({
                color: hexColor,
                metalness: 0.1,
                roughness: 0.3,
                clearcoat: 0.8,
                transparent: true,
                opacity: matOpacity,
                side: THREE.DoubleSide
            });
        }
    };

    if (!context.Manifold) return;

    // 1. Build Wall Hook
    if (visibilities.hook) {
        const hookGeom = generateHookGeometry();
        if (hookGeom) {
            const threeGeom = manifoldToThree(hookGeom.getMesh());
            hookGeom.delete();
            meshes.hook = new THREE.Mesh(threeGeom, getMaterial(colors.pinkAccent));
            meshes.hook.castShadow = true;
            meshes.hook.receiveShadow = true;
            context.mainGroup.add(meshes.hook);
        }
    }

    // 2. Build Metal Bar (releasing assembly representation)
    if (visibilities.bar) {
        const barGeom = generateBarGeometry();
        if (barGeom) {
            const threeGeom = manifoldToThree(barGeom.getMesh());
            barGeom.delete();
            meshes.bar = new THREE.Mesh(threeGeom, getMaterial(colors.limeAccent, false));
            meshes.bar.castShadow = true;
            meshes.bar.receiveShadow = true;
            context.mainGroup.add(meshes.bar);
        }
    }

    updateLeaderLines();
}

// Initialize components
document.addEventListener('DOMContentLoaded', () => {
    initViewport(updateLeaderLines);
    setupUIListeners(rebuild);
    initManifold(
        () => {
            const status = document.getElementById('kernel-status');
            if (status) status.textContent = "ACTIVE";
            rebuild();
        },
        animate
    );
});
