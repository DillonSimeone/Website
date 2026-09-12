// Central orchestrator module for Potentiometer Configurator
import * as THREE from 'three';
import { params, visibilities, meshes, context, colors } from './state.js';
import { initViewport, animate } from './viewport.js';
import { initManifold } from './manifoldInit.js';
import { setupUIListeners } from './ui.js';
import {
    generateEnclosureGeometry,
    generatePotentiometerGeometry,
    generateSynthKnobGeometry,
    generateOLEDGeometry,
    generateESP32C3Geometry,
    generate18650HolderGeometry,
    generateTP4056Geometry,
    generateSwitchGeometry,
    manifoldToThree
} from './geometry.js';

// Materials definitions
let baseMat, lidMat, metalMat, knobMat, pcbMat, screenMat, batteryMat, terminalMat, switchBodyMat, switchRockerMat;

function initMaterials() {
    baseMat = new THREE.MeshPhysicalMaterial({
        color: colors.baseColor,
        roughness: 0.6,
        metalness: 0.4,
        clearcoat: 0.3
    });

    lidMat = new THREE.MeshPhysicalMaterial({
        color: colors.lidColor,
        roughness: 0.4,
        metalness: 0.2,
        transmission: 0.4, // glassmorphic look
        opacity: 0.85,
        transparent: true,
        thickness: 2.0,
        clearcoat: 0.8
    });

    metalMat = new THREE.MeshStandardMaterial({
        color: colors.potMetal,
        roughness: 0.25,
        metalness: 0.9
    });

    terminalMat = new THREE.MeshStandardMaterial({
        color: colors.potTerminals,
        roughness: 0.3,
        metalness: 0.8
    });

    knobMat = new THREE.MeshPhysicalMaterial({
        color: colors.neonPink,
        roughness: 0.3,
        metalness: 0.1,
        emissive: colors.neonPink,
        emissiveIntensity: 0.2,
        clearcoat: 0.5
    });

    pcbMat = new THREE.MeshStandardMaterial({
        color: colors.pcbGreen,
        roughness: 0.5,
        metalness: 0.1
    });

    screenMat = new THREE.MeshPhysicalMaterial({
        color: colors.oledScreen,
        roughness: 0.1,
        metalness: 0.9,
        clearcoat: 1.0
    });

    batteryMat = new THREE.MeshStandardMaterial({
        color: colors.batteryBlack,
        roughness: 0.8,
        metalness: 0.0
    });

    switchBodyMat = new THREE.MeshStandardMaterial({
        color: colors.switchBody,
        roughness: 0.5,
        metalness: 0.1
    });

    switchRockerMat = new THREE.MeshPhysicalMaterial({
        color: colors.switchRocker,
        roughness: 0.3,
        metalness: 0.1,
        clearcoat: 0.5
    });
}

// Clear all existing 3D objects in a group
function clearGroup(group) {
    if (!group) return;
    while (group.children.length > 0) {
        const obj = group.children[0];
        group.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
    }
}

// Memory-safe mesh clean up
function cleanOldMeshes() {
    if (meshes.base) {
        context.mainGroup.remove(meshes.base);
        meshes.base.geometry.dispose();
        meshes.base = null;
    }
    if (meshes.lid) {
        context.mainGroup.remove(meshes.lid);
        meshes.lid.geometry.dispose();
        meshes.lid = null;
    }
    meshes.pots.forEach(mesh => {
        context.mainGroup.remove(mesh);
        mesh.geometry.dispose();
    });
    meshes.pots = [];

    meshes.knobs.forEach(mesh => {
        context.mainGroup.remove(mesh);
        mesh.geometry.dispose();
    });
    meshes.knobs = [];

    if (meshes.electronics.esp32) {
        context.mainGroup.remove(meshes.electronics.esp32);
        meshes.electronics.esp32.geometry.dispose();
        meshes.electronics.esp32 = null;
    }
    if (meshes.electronics.batteryHolder) {
        context.mainGroup.remove(meshes.electronics.batteryHolder);
        meshes.electronics.batteryHolder.geometry.dispose();
        meshes.electronics.batteryHolder = null;
    }
    if (meshes.electronics.charger) {
        context.mainGroup.remove(meshes.electronics.charger);
        meshes.electronics.charger.geometry.dispose();
        meshes.electronics.charger = null;
    }
    if (meshes.electronics.oled) {
        context.mainGroup.remove(meshes.electronics.oled);
        meshes.electronics.oled.geometry.dispose();
        meshes.electronics.oled = null;
    }
    if (meshes.electronics.toggleSwitch) {
        context.mainGroup.remove(meshes.electronics.toggleSwitch);
        meshes.electronics.toggleSwitch.geometry.dispose();
        meshes.electronics.toggleSwitch = null;
    }
}

export function rebuild() {
    const M = context.Manifold;
    if (!M) return;

    cleanOldMeshes();

    // 1. Generate Enclosure Geometries
    const boxGeoms = generateEnclosureGeometry();
    if (!boxGeoms) return;

    // Build Base Mesh
    if (params.showBase && boxGeoms.base) {
        const baseMeshObj = boxGeoms.base.getMesh();
        const baseGeom = manifoldToThree(baseMeshObj);
        meshes.base = new THREE.Mesh(baseGeom, baseMat);
        meshes.base.castShadow = true;
        meshes.base.receiveShadow = true;
        context.mainGroup.add(meshes.base);
    }

    // Build Lid Mesh
    if (params.showLid && boxGeoms.lid) {
        const lidMeshObj = boxGeoms.lid.getMesh();
        const lidGeom = manifoldToThree(lidMeshObj);
        meshes.lid = new THREE.Mesh(lidGeom, lidMat);
        meshes.lid.castShadow = true;
        meshes.lid.receiveShadow = true;
        context.mainGroup.add(meshes.lid);
    }

    // Clean up WASM references from box generation
    if (boxGeoms.base) boxGeoms.base.delete();
    if (boxGeoms.lid) boxGeoms.lid.delete();

    // 2. Generate Potentiometers & Synth Knobs
    const pitch = params.pitch;
    const rows = params.rows;
    const cols = params.cols;
    const gridW = (cols - 1) * pitch;
    const gridL = (rows - 1) * pitch;
    const pad = params.padding;
    const L_int = Math.max(gridL + pad + 50.0, 85.0);
    const py_top = L_int / 2 - 47.0;

    if (params.showPots || params.showKnobs) {
        const potSolid = generatePotentiometerGeometry(M, params.shaftLength, params.shaftStyle);
        let potGeom = null;
        if (potSolid) {
            potGeom = manifoldToThree(potSolid.getMesh());
            potSolid.delete();
        }

        const knobSolid = generateSynthKnobGeometry(M, params.shaftStyle);
        let knobGeom = null;
        if (knobSolid) {
            knobGeom = manifoldToThree(knobSolid.getMesh());
            knobSolid.delete();
        }

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const px = c * pitch - gridW / 2;
                const py = py_top - (rows - 1 - r) * pitch;
                const pz = boxGeoms.height + params.exploded; // Sits on top of the lid

                // Render Potentiometer
                if (params.showPots && potGeom) {
                    const potMesh = new THREE.Mesh(potGeom, metalMat);
                    potMesh.position.set(px, py, pz);
                    context.mainGroup.add(potMesh);
                    meshes.pots.push(potMesh);
                }

                // Render Synth Knob
                if (params.showKnobs && knobGeom) {
                    const knobMesh = new THREE.Mesh(knobGeom, knobMat);
                    knobMesh.position.set(px, py, pz);
                    context.mainGroup.add(knobMesh);
                    meshes.knobs.push(knobMesh);
                }
            }
        }
    }

    // 3. Generate Electronics inside the base and on top
    if (params.showElectronics) {
        // ESP32 C3 (Inside Base Cradle)
        const esp32Solid = generateESP32C3Geometry(M);
        if (esp32Solid) {
            const esp32Geom = manifoldToThree(esp32Solid.getMesh());
            esp32Solid.delete();

            meshes.electronics.esp32 = new THREE.Mesh(esp32Geom, pcbMat);
            meshes.electronics.esp32.position.set(boxGeoms.esp32Pos[0], boxGeoms.esp32Pos[1], boxGeoms.esp32Pos[2]);
            // Rotate 180 degrees so USB port points South (-Y)
            meshes.electronics.esp32.rotation.z = Math.PI;
            context.mainGroup.add(meshes.electronics.esp32);
        }

        // 18650 Battery Holder (Inside Base Cradle)
        const batterySolid = generate18650HolderGeometry(M);
        if (batterySolid) {
            const batteryGeom = manifoldToThree(batterySolid.getMesh());
            batterySolid.delete();

            meshes.electronics.batteryHolder = new THREE.Mesh(batteryGeom, batteryMat);
            meshes.electronics.batteryHolder.position.set(boxGeoms.batteryPos[0], boxGeoms.batteryPos[1], boxGeoms.batteryPos[2]);
            // Rotate 90 degrees horizontally along back wall
            meshes.electronics.batteryHolder.rotation.z = Math.PI / 2;
            context.mainGroup.add(meshes.electronics.batteryHolder);
        }

        // TP4056 Lipo Charger (Inside Base Side Slot)
        const chargerSolid = generateTP4056Geometry(M);
        if (chargerSolid) {
            const chargerGeom = manifoldToThree(chargerSolid.getMesh());
            chargerSolid.delete();

            meshes.electronics.charger = new THREE.Mesh(chargerGeom, pcbMat);
            meshes.electronics.charger.position.set(boxGeoms.chargerPos[0], boxGeoms.chargerPos[1], boxGeoms.chargerPos[2]);
            // Rotate 180 degrees so USB port points South (-Y)
            meshes.electronics.charger.rotation.z = Math.PI;
            context.mainGroup.add(meshes.electronics.charger);
        }

        // SSD1306 OLED Screen (Mounted in Lid Cutout)
        const oledSolid = generateOLEDGeometry(M, params.oledWidth, params.oledHeight, params.oledHolePitchX, params.oledHolePitchY);
        if (oledSolid) {
            const oledGeom = manifoldToThree(oledSolid.getMesh());
            oledSolid.delete();

            meshes.electronics.oled = new THREE.Mesh(oledGeom, screenMat);
            // Move up with the lid in exploded view
            meshes.electronics.oled.position.set(boxGeoms.oledPos[0], boxGeoms.oledPos[1], boxGeoms.oledPos[2] + params.exploded);
            context.mainGroup.add(meshes.electronics.oled);
        }

        // Rocker Switch (Mounted in Lid Cutout next to OLED)
        const switchSolid = generateSwitchGeometry(M);
        if (switchSolid) {
            const switchGeom = manifoldToThree(switchSolid.getMesh());
            switchSolid.delete();

            // Render switch body with black switchBodyMat
            meshes.electronics.toggleSwitch = new THREE.Mesh(switchGeom, switchBodyMat);
            meshes.electronics.toggleSwitch.position.set(boxGeoms.switchPos[0], boxGeoms.switchPos[1], boxGeoms.switchPos[2] + params.exploded);
            context.mainGroup.add(meshes.electronics.toggleSwitch);
        }
    }
}

// Main initialization function
async function init() {
    initMaterials();
    initViewport(() => {
        // frame update logic if needed
    });
    
    setupUIListeners(rebuild);
    await initManifold(rebuild, animate);
}

// Start app on load
window.addEventListener('DOMContentLoaded', init);
