// Main orchestrator for HAXEL Dense Electronics Enclosure
import * as THREE from 'three';
import { context, params, visibilities, meshes, colors } from './state.js';
import { initViewport, animate } from './viewport.js';
import { initManifold } from './manifoldInit.js';
import { setupUIListeners, setRebuildCallback, setCurrentModels, updateSpecs } from './ui.js';
import {
    computeLayout,
    generateShell,
    generateLid,
    generateSled,
    generateMotorClamp,
    generateComponentGhost,
    manifoldToThree
} from './geometry.js';

// Active Manifold model references (for cleanup + export)
let activeModels = {
    shell: null,
    lid: null,
    sled: null,
    motorClamp: null,
    components: {}
};

/** Create a Three.js mesh from a Manifold model */
function toMesh(model, color, opacity = 1.0, xray = false) {
    const geometry = manifoldToThree(model);
    const mat = new THREE.MeshPhysicalMaterial({
        color,
        metalness: xray ? 0.1 : 0.3,
        roughness: xray ? 0.9 : 0.5,
        transparent: opacity < 1.0,
        opacity,
        side: THREE.DoubleSide,
        wireframe: xray
    });
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

/** Dispose and remove a mesh from the scene */
function clearMesh(key) {
    if (meshes[key]) {
        context.mainGroup.remove(meshes[key]);
        meshes[key].geometry.dispose();
        meshes[key].material.dispose();
        meshes[key] = null;
    }
}

/** Main rebuild function — regenerates all geometry */
export function rebuild() {
    if (!context.Manifold) return;
    const t0 = performance.now();

    // Clean up old meshes
    const allMeshKeys = [
        'shellBottom', 'lid', 'sled', 'motorClamp',
        'motor', 'esp32', 'l298n', 'tp4056', 'battery'
    ];
    allMeshKeys.forEach(clearMesh);

    // Clean up old Manifold models
    if (activeModels.shell) { activeModels.shell.delete(); activeModels.shell = null; }
    if (activeModels.lid) { activeModels.lid.delete(); activeModels.lid = null; }
    if (activeModels.sled) { activeModels.sled.delete(); activeModels.sled = null; }
    if (activeModels.motorClamp) { activeModels.motorClamp.delete(); activeModels.motorClamp = null; }
    for (const key of Object.keys(activeModels.components)) {
        activeModels.components[key].delete();
    }
    activeModels.components = {};

    try {
        const layout = computeLayout();
        const xray = params.mode === 'xray';
        const opacity = params.opacity / 100;
        const exp = params.explode / 100;

        // ─── Shell ───────────────────────────────────────────────────────────
        activeModels.shell = generateShell(layout);
        if (visibilities.shell) {
            const shellOpacity = xray ? 0.15 : opacity * 0.5;
            meshes.shellBottom = toMesh(activeModels.shell, colors.shell, shellOpacity, xray);
            // Raise shell above grid
            meshes.shellBottom.position.set(0, 0, layout.shellH / 2);
            context.mainGroup.add(meshes.shellBottom);
        }

        // ─── Lid ─────────────────────────────────────────────────────────────
        activeModels.lid = generateLid(layout);
        if (visibilities.lid) {
            meshes.lid = toMesh(activeModels.lid, colors.lid, xray ? 0.2 : opacity * 0.6, xray);
            const lidZ = layout.shellH / 2 + layout.shellH / 2 - params.wallThick / 2;
            meshes.lid.position.set(0, 0, lidZ + exp * 30);
            context.mainGroup.add(meshes.lid);
        }

        // ─── Sled ────────────────────────────────────────────────────────────
        activeModels.sled = generateSled(layout);
        if (visibilities.sled) {
            meshes.sled = toMesh(activeModels.sled, colors.sled, xray ? 0.3 : opacity * 0.8, xray);
            const sledZ = layout.shellH / 2 + params.wallThick / 2;
            meshes.sled.position.set(0, exp * -50, sledZ);
            context.mainGroup.add(meshes.sled);
        }

        // ─── Motor Clamp ─────────────────────────────────────────────────────
        activeModels.motorClamp = generateMotorClamp(layout);
        if (visibilities.motorClamp) {
            meshes.motorClamp = toMesh(activeModels.motorClamp, colors.motorClamp, xray ? 0.4 : 0.9, xray);
            const sledZ = layout.shellH / 2 + params.wallThick / 2;
            meshes.motorClamp.position.set(0, exp * -50, sledZ + exp * 20);
            context.mainGroup.add(meshes.motorClamp);
        }

        // ─── Component Ghosts ────────────────────────────────────────────────
        if (visibilities.components) {
            const compTypes = ['motor', 'esp32', 'l298n', 'tp4056', 'battery'];
            const compColors = {
                motor: colors.motor,
                esp32: colors.esp32,
                l298n: colors.l298n,
                tp4056: colors.tp4056,
                battery: colors.battery
            };

            for (const type of compTypes) {
                const model = generateComponentGhost(type, layout);
                if (model) {
                    activeModels.components[type] = model;
                    meshes[type] = toMesh(model, compColors[type], 0.6, false);
                    const sledZ = layout.shellH / 2 + params.wallThick / 2;
                    meshes[type].position.set(0, exp * -50, sledZ);
                    // Slight emissive glow for component identification
                    meshes[type].material.emissive = new THREE.Color(compColors[type]);
                    meshes[type].material.emissiveIntensity = 0.15;
                    context.mainGroup.add(meshes[type]);
                }
            }
        }

        // Update specs panel
        updateSpecs(layout);

        // Update export references
        setCurrentModels(activeModels);

        const dt = (performance.now() - t0).toFixed(1);
        const badge = document.getElementById('perf-badge');
        if (badge) badge.textContent = `MANIFOLD WASM • ${dt}ms`;

    } catch (e) {
        console.error('HAXEL rebuild error:', e);
    }
}

// ─── Initialization ──────────────────────────────────────────────────────────

initViewport(() => {
    // Per-frame callback (if needed)
});

setRebuildCallback(rebuild);
setupUIListeners();
initManifold(rebuild, animate);
